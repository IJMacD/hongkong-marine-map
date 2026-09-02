import { watch, type FSWatcher } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import Database from "better-sqlite3";
import { formatLabel, parseEdition, parseFilename } from "./parseFilename.js";
import type { VersionInfo } from "./types.js";

export type OpenedTileset = {
  version: VersionInfo;
  db: Database.Database;
  path: string;
  mtimeMs: number;
  size: number;
  format: string;
};

const DEFAULT_BOUNDS: [number, number, number, number] = [
  113.516109, 22.068157, 114.502779, 22.568333,
];
const CHART_NAME = "Hong Kong Marine";
const CHART_ATTRIBUTION = "Hong Kong Marine Department";

function parseBounds(raw: string | undefined): [number, number, number, number] {
  if (!raw) return DEFAULT_BOUNDS;
  const parts = raw.split(",").map((v) => Number(v.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return DEFAULT_BOUNDS;
  }
  return [parts[0], parts[1], parts[2], parts[3]];
}

function readMetadata(db: Database.Database): Record<string, string> {
  const rows = db.prepare("SELECT name, value FROM metadata").all() as {
    name: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((row) => [row.name, row.value]));
}

function openTileset(filePath: string, size: number, mtimeMs: number): OpenedTileset {
  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  const meta = readMetadata(db);
  const id = basename(filePath, ".mbtiles");
  const parsed = parseFilename(id);
  const edition = parsed.edition ?? parseEdition(meta.name);
  const minzoom = Number(meta.minzoom ?? 8);
  const maxzoom = Number(meta.maxzoom ?? 16);
  const bounds = parseBounds(meta.bounds);
  const version: VersionInfo = {
    id,
    capturedAt: parsed.capturedAt,
    edition,
    label: formatLabel(parsed.capturedAt, edition),
    bytes: size,
    tilejson: `/tiles/${id}/tiles.json`,
    minzoom: Number.isFinite(minzoom) ? minzoom : 8,
    maxzoom: Number.isFinite(maxzoom) ? maxzoom : 16,
    bounds,
    // MBTiles attribution is MapTiler Engine; credit the chart source instead.
    attribution: CHART_ATTRIBUTION,
    name: CHART_NAME,
  };
  return {
    version,
    db,
    path: filePath,
    mtimeMs,
    size,
    format: (meta.format || "png").toLowerCase(),
  };
}

export class TileCatalog {
  private readonly dir: string;
  private readonly tilesets = new Map<string, OpenedTileset>();
  private watcher: FSWatcher | undefined;
  private pollTimer: NodeJS.Timeout | undefined;
  private debounceTimer: NodeJS.Timeout | undefined;
  private scanning = false;

  constructor(dir: string) {
    this.dir = dir;
  }

  async start(): Promise<void> {
    await this.scan();
    try {
      this.watcher = watch(this.dir, () => this.scheduleScan());
      this.watcher.on("error", (err) => {
        console.warn("mbtiles watch error", err);
      });
    } catch (err) {
      console.warn("mbtiles watch unavailable", err);
    }
    this.pollTimer = setInterval(() => {
      void this.scan();
    }, 60_000);
    this.pollTimer.unref();
  }

  stop(): void {
    this.watcher?.close();
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    for (const tileset of this.tilesets.values()) {
      tileset.db.close();
    }
    this.tilesets.clear();
  }

  list(): VersionInfo[] {
    return [...this.tilesets.values()]
      .map((t) => t.version)
      .sort((a, b) => {
        const byDate = b.capturedAt.localeCompare(a.capturedAt);
        return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
      });
  }

  resolveId(id: string): string | undefined {
    if (id === "latest") {
      return this.list()[0]?.id;
    }
    return this.tilesets.has(id) ? id : undefined;
  }

  get(id: string): OpenedTileset | undefined {
    const resolved = this.resolveId(id);
    return resolved ? this.tilesets.get(resolved) : undefined;
  }

  getTile(id: string, z: number, x: number, y: number): Buffer | undefined {
    const tileset = this.get(id);
    if (!tileset) return undefined;
    const tileRow = (1 << z) - 1 - y;
    const row = tileset.db
      .prepare(
        "SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?",
      )
      .get(z, x, tileRow) as { tile_data: Buffer } | undefined;
    return row?.tile_data;
  }

  private scheduleScan(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      void this.scan();
    }, 500);
  }

  private async scan(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const names = await readdir(this.dir);
      const mbtiles = names.filter((name) => name.endsWith(".mbtiles"));
      const seen = new Set<string>();

      for (const name of mbtiles) {
        const filePath = join(this.dir, name);
        const id = basename(name, ".mbtiles");
        seen.add(id);
        let info;
        try {
          info = await stat(filePath);
        } catch {
          continue;
        }
        const existing = this.tilesets.get(id);
        if (
          existing &&
          existing.mtimeMs === info.mtimeMs &&
          existing.size === info.size
        ) {
          continue;
        }
        try {
          const opened = openTileset(filePath, info.size, info.mtimeMs);
          existing?.db.close();
          this.tilesets.set(id, opened);
          console.log(`indexed ${id} (${opened.version.label})`);
        } catch (err) {
          console.warn(`failed to open ${filePath}`, err);
        }
      }

      for (const [id, tileset] of this.tilesets) {
        if (!seen.has(id)) {
          tileset.db.close();
          this.tilesets.delete(id);
          console.log(`removed ${id}`);
        }
      }
    } catch (err) {
      console.warn("mbtiles scan failed", err);
    } finally {
      this.scanning = false;
    }
  }
}
