# Hong Kong Marine Chart Map

Full-page [Leaflet](https://leafletjs.com/) viewer for Hong Kong Marine Department raster charts. Historical snapshots are served **from MBTiles in place** (SQLite) — they are not extracted to PNG pyramids.

## Layout

- `web/` — Vite + React + Leaflet
- `server/` — Hono tile server (`better-sqlite3`)
- `chart/` — standalone Helm chart

The weekly archive job lives in [`hongkong-marine-tiles`](https://github.com/IJMacD/hongkong-marine-tiles). This app mounts the directory that job writes MBTiles into (`mbtilesDir` in Helm values).

## Local development

```bash
npm install
mkdir -p mbtiles
# copy one or more *.mbtiles into ./mbtiles
npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:8080 (`/versions.json`, `/tiles/{id}/{z}/{x}/{y}.png`)

Or run the production image:

```bash
MBTILES_DIR=./mbtiles docker compose up --build
```

Then open http://localhost:8080

## API

| Path | Notes |
| --- | --- |
| `GET /versions.json` | Newest-first snapshot list (`max-age=60`) |
| `GET /tiles/{id}/tiles.json` | TileJSON 2.1, `scheme: xyz` |
| `GET /tiles/latest/...` | Alias of the newest file |
| `GET /tiles/{id}/{z}/{x}/{y}.png` | TMS Y-flip inside SQLite; immutable cache |

`id` is the MBTiles filename stem. Capture date comes from the filename (`20211020000000-2021-11`, `20250826_1756190350`). Chart edition comes from the filename when present, otherwise from metadata `name` if it looks like `2026-3`. Placeholders such as `MB_Tiles` are ignored. TileJSON attribution is always Hong Kong Marine Department — the MBTiles `attribution` field is only a MapTiler Engine credit.

The server watches `MBTILES_DIR` and rescans every 60s, so a new archive dropped by the existing job shows up without a restart.

## Deploy

1. Build/push the image named in `chart/values.yaml` (`repository.image`).
2. Point DNS at the cluster; Cloudflare in front if you use the included Traefik middleware.
3. Copy the overlay and fill in hostname plus the hostPath where MBTiles live:

```bash
cp chart/values.prod.yaml.example chart/values.prod.yaml
helm upgrade --install marine ./chart -n <namespace> -f chart/values.prod.yaml
```

`chart/values.yaml` is generic. `chart/values.prod.yaml` is gitignored. Local k3d: `-f chart/values.dev.yaml`.

Env:

- `MBTILES_DIR` (default `./mbtiles`)
- `PORT` (default `8080`)
- `PUBLIC_BASE_URL` (optional; otherwise taken from `X-Forwarded-*` / Host)
- `WEB_DIST` (SPA files; default `web/dist`)
