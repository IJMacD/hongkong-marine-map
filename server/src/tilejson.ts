import type { OpenedTileset } from "./catalog.js";

export function toTileJSON(tileset: OpenedTileset, baseUrl: string) {
  const { version } = tileset;
  const [w, s, e, n] = version.bounds;
  return {
    tilejson: "2.1.0",
    name: version.name,
    description: "Marine charts for Hong Kong and Macau",
    version: version.id,
    attribution: version.attribution,
    scheme: "xyz",
    tiles: [`${baseUrl}/tiles/${version.id}/{z}/{x}/{y}.png`],
    minzoom: version.minzoom,
    maxzoom: version.maxzoom,
    bounds: version.bounds,
    center: [(w + e) / 2, (s + n) / 2, Math.min(11, version.maxzoom)],
  };
}
