import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { TileCatalog } from "./catalog.js";
import { toTileJSON } from "./tilejson.js";

const PORT = Number(process.env.PORT || 8080);
const MBTILES_DIR = resolve(process.env.MBTILES_DIR || "./mbtiles");
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;
const here = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = resolve(process.env.WEB_DIST || join(here, "../../web/dist"));

function requestBaseUrl(c: { req: { url: string; header: (name: string) => string | undefined } }): string {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL.replace(/\/$/, "");
  const url = new URL(c.req.url);
  const proto = c.req.header("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = c.req.header("x-forwarded-host") || c.req.header("host") || url.host;
  return `${proto}://${host}`;
}

async function main() {
  if (!existsSync(MBTILES_DIR)) {
    await mkdir(MBTILES_DIR, { recursive: true });
    console.warn(`MBTILES_DIR created (empty): ${MBTILES_DIR}`);
  }

  const catalog = new TileCatalog(MBTILES_DIR);
  await catalog.start();
  console.log(`serving ${catalog.list().length} mbtiles from ${MBTILES_DIR}`);

  const app = new Hono();

  app.get("/healthz", (c) => c.json({ ok: true, versions: catalog.list().length }));

  app.get("/versions.json", (c) => {
    c.header("Cache-Control", "public, max-age=60");
    return c.json(catalog.list());
  });

  app.get("/tiles/:id/tiles.json", (c) => {
    const tileset = catalog.get(c.req.param("id"));
    if (!tileset) return c.json({ error: "unknown version" }, 404);
    c.header("Cache-Control", "public, max-age=60");
    return c.json(toTileJSON(tileset, requestBaseUrl(c)));
  });

  app.get("/tiles/:id/:z/:x/:y", (c) => {
    const id = c.req.param("id");
    const z = Number(c.req.param("z"));
    const x = Number(c.req.param("x"));
    const y = Number(c.req.param("y").replace(/\.png$/i, ""));
    if (![z, x, y].every(Number.isInteger)) {
      return c.json({ error: "invalid tile coordinates" }, 400);
    }
    const tileset = catalog.get(id);
    if (!tileset) return c.json({ error: "unknown version" }, 404);
    const tile = catalog.getTile(id, z, x, y);
    if (!tile) return new Response(null, { status: 204 });
    const contentType = tileset.format === "jpg" || tileset.format === "jpeg"
      ? "image/jpeg"
      : "image/png";
    return new Response(new Uint8Array(tile), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  });

  if (existsSync(WEB_DIST)) {
    app.use(
      "/*",
      serveStatic({
        root: WEB_DIST,
        rewriteRequestPath: (path) => path,
      }),
    );
    app.get("*", async (c) => {
      const { readFile } = await import("node:fs/promises");
      const html = await readFile(join(WEB_DIST, "index.html"), "utf8");
      c.header("Cache-Control", "no-cache");
      return c.html(html);
    });
  }

  const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`listening on http://localhost:${info.port}`);
  });

  const shutdown = () => {
    catalog.stop();
    server.close();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
