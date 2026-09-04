import { parseMarkersDocument, uniqueStrings } from "./markersStorage";
import type { ChartMarker, MarkerSet, MarkersState } from "./markersTypes";

export const TRANSFER_FILENAME = "hk-marine-markers.json";

export type ImportSummary = {
  addedMarkers: number;
  updatedMarkers: number;
  addedSets: number;
  updatedSets: number;
};

function markerChanged(current: ChartMarker, incoming: ChartMarker): boolean {
  return current.name !== incoming.name || current.lat !== incoming.lat || current.lng !== incoming.lng;
}

function setChanged(current: MarkerSet, incoming: MarkerSet): boolean {
  if (current.name !== incoming.name || current.markerIds.length !== incoming.markerIds.length) return true;
  return current.markerIds.some((id, index) => id !== incoming.markerIds[index]);
}

function mergeById<T extends { id: string }>(
  current: T[],
  incoming: T[],
  changed: (current: T, incoming: T) => boolean,
): { items: T[]; added: number; updated: number } {
  const byId = new Map(current.map((item) => [item.id, item]));
  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      added += 1;
    } else if (changed(existing, item)) {
      byId.set(item.id, item);
      updated += 1;
    }
  }
  const items: T[] = [];
  const used = new Set<string>();
  for (const item of current) {
    items.push(byId.get(item.id) ?? item);
    used.add(item.id);
  }
  for (const item of incoming) {
    if (used.has(item.id)) continue;
    items.push(item);
    used.add(item.id);
  }
  return { items, added, updated };
}

export function serializeMarkersState(state: MarkersState): string {
  return `${JSON.stringify(
    {
      version: 1,
      markers: state.markers,
      sets: state.sets,
      loadedMarkerIds: state.loadedMarkerIds,
      loadedSetIds: state.loadedSetIds,
    },
    null,
    2,
  )}\n`;
}

export function parseMarkersTransferText(text: string): MarkersState | null {
  try {
    return parseMarkersDocument(JSON.parse(text) as unknown, { missingLoaded: "all" });
  } catch {
    return null;
  }
}

export function visibleMarkersState(state: MarkersState): MarkersState {
  const loadedSets = new Set(state.loadedSetIds);
  const loadedMarkers = new Set(state.loadedMarkerIds);
  const sets = state.sets.filter((set) => loadedSets.has(set.id));
  const fromSets = new Set<string>();
  for (const set of sets) {
    for (const id of set.markerIds) fromSets.add(id);
  }
  const markers = state.markers.filter((marker) => loadedMarkers.has(marker.id) || fromSets.has(marker.id));
  const markerIds = new Set(markers.map((marker) => marker.id));
  const setIds = new Set(sets.map((set) => set.id));
  return {
    version: 1,
    markers,
    sets,
    loadedMarkerIds: uniqueStrings(state.loadedMarkerIds, markerIds),
    loadedSetIds: uniqueStrings(state.loadedSetIds, setIds),
  };
}

export const SHARE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SHARE_CODE_LENGTH = 4;

export function normalizeShareCode(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== SHARE_CODE_LENGTH) return null;
  for (const ch of cleaned) {
    if (!SHARE_ALPHABET.includes(ch)) return null;
  }
  return cleaned;
}

export function filterShareCodeInput(raw: string): string {
  let out = "";
  for (const ch of raw.toUpperCase()) {
    if (SHARE_ALPHABET.includes(ch)) out += ch;
    if (out.length === SHARE_CODE_LENGTH) break;
  }
  return out;
}

export class ShareRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShareRequestError";
  }
}

function shareErrorForStatus(status: number, action: "create" | "fetch"): ShareRequestError {
  if (status === 413) return new ShareRequestError("Library is too large to share as a code.");
  if (status === 429) return new ShareRequestError("Too many share requests. Try again in a few minutes.");
  if (status === 404) return new ShareRequestError("No share found for that code.");
  if (action === "create") return new ShareRequestError("Could not create a share code.");
  return new ShareRequestError("Could not load that share code.");
}

export async function createShareCode(state: MarkersState): Promise<{ code: string; expiresIn: number }> {
  let res: Response;
  try {
    res = await fetch("/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 1,
        markers: state.markers,
        sets: state.sets,
        loadedMarkerIds: state.loadedMarkerIds,
        loadedSetIds: state.loadedSetIds,
      }),
    });
  } catch {
    throw new ShareRequestError("Could not create a share code.");
  }
  if (!res.ok) throw shareErrorForStatus(res.status, "create");
  const data = (await res.json()) as { code?: unknown; expiresIn?: unknown };
  const code = typeof data.code === "string" ? normalizeShareCode(data.code) : null;
  const expiresIn = typeof data.expiresIn === "number" && Number.isFinite(data.expiresIn) ? data.expiresIn : 0;
  if (!code) throw new ShareRequestError("Could not create a share code.");
  return { code, expiresIn };
}

export async function fetchShareCode(code: string): Promise<MarkersState> {
  const normalized = normalizeShareCode(code);
  if (!normalized) throw new ShareRequestError("Enter a 4-character share code.");
  let res: Response;
  try {
    res = await fetch(`/shares/${encodeURIComponent(normalized)}`);
  } catch {
    throw new ShareRequestError("Could not load that share code.");
  }
  if (!res.ok) throw shareErrorForStatus(res.status, "fetch");
  const parsed = parseMarkersDocument(await res.json(), { missingLoaded: "all" });
  if (!parsed) throw new ShareRequestError("Not a markers file.");
  return parsed;
}

export function mergeMarkersState(
  current: MarkersState,
  incoming: MarkersState,
): { state: MarkersState; summary: ImportSummary } {
  const markers = mergeById(current.markers, incoming.markers, markerChanged);
  const sets = mergeById(current.sets, incoming.sets, setChanged);
  const markerIds = new Set(markers.items.map((marker) => marker.id));
  const setIds = new Set(sets.items.map((set) => set.id));
  return {
    state: {
      version: 1,
      markers: markers.items,
      sets: sets.items,
      loadedMarkerIds: uniqueStrings([...current.loadedMarkerIds, ...incoming.loadedMarkerIds], markerIds),
      loadedSetIds: uniqueStrings([...current.loadedSetIds, ...incoming.loadedSetIds], setIds),
    },
    summary: {
      addedMarkers: markers.added,
      updatedMarkers: markers.updated,
      addedSets: sets.added,
      updatedSets: sets.updated,
    },
  };
}

export function replaceMarkersState(incoming: MarkersState): { state: MarkersState; summary: ImportSummary } {
  return {
    state: { ...incoming, version: 1 },
    summary: {
      addedMarkers: incoming.markers.length,
      updatedMarkers: 0,
      addedSets: incoming.sets.length,
      updatedSets: 0,
    },
  };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function formatImportSummary(summary: ImportSummary): string {
  const parts: string[] = [];
  if (summary.addedMarkers) parts.push(`Added ${plural(summary.addedMarkers, "marker", "markers")}`);
  if (summary.updatedMarkers) {
    parts.push(parts.length ? `updated ${summary.updatedMarkers}` : `Updated ${plural(summary.updatedMarkers, "marker", "markers")}`);
  }
  if (summary.addedSets) {
    parts.push(parts.length ? `added ${plural(summary.addedSets, "set", "sets")}` : `Added ${plural(summary.addedSets, "set", "sets")}`);
  }
  if (summary.updatedSets) {
    parts.push(
      parts.length ? `updated ${plural(summary.updatedSets, "set", "sets")}` : `Updated ${plural(summary.updatedSets, "set", "sets")}`,
    );
  }
  if (parts.length === 0) return "Nothing new to import.";
  return `${parts[0]}${parts.slice(1).map((part) => `, ${part}`).join("")}.`;
}

export function formatReplaceSummary(summary: ImportSummary): string {
  if (!summary.addedMarkers && !summary.addedSets) return "Library replaced with an empty file.";
  const markers = summary.addedMarkers ? plural(summary.addedMarkers, "marker", "markers") : null;
  const sets = summary.addedSets ? plural(summary.addedSets, "set", "sets") : null;
  if (markers && sets) return `Replaced library with ${markers} and ${sets}.`;
  return `Replaced library with ${markers ?? sets}.`;
}

function transferFile(state: MarkersState): File {
  return new File([serializeMarkersState(state)], TRANSFER_FILENAME, { type: "application/json" });
}

function canShareFile(file: File): boolean {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof navigator.share !== "function" || typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function shareOrDownloadMarkers(state: MarkersState): Promise<void> {
  const file = transferFile(state);
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: "Markers" });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  downloadFile(file);
}
