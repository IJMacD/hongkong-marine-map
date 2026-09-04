import { useEffect, useRef } from "react";
import L from "leaflet";
import { LocateControl } from "./LocateControl";
import type { TileJSON, VersionInfo } from "./types";
import { readLocation, writeLocation } from "./urlState";

type Props = {
  version: VersionInfo | undefined;
};

const OVERZOOM = 2;

export function ChartMap({ version }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.TileLayer | null>(null);
  const versionIdRef = useRef(version?.id ?? "latest");

  versionIdRef.current = version?.id ?? "latest";

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const initial = readLocation();
    const map = L.map(el, {
      center: [initial.lat, initial.lng],
      zoom: initial.zoom,
      zoomControl: true,
      maxBoundsViscosity: 1,
    });
    L.control.scale({ imperial: false }).addTo(map);
    new LocateControl().addTo(map);

    const persist = () => {
      const centre = map.getCenter();
      writeLocation(versionIdRef.current, map.getZoom(), centre.lat, centre.lng);
    };
    map.on("moveend", persist);
    map.on("zoomend", persist);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !version) return;

    let cancelled = false;
    fetch(version.tilejson)
      .then((res) => {
        if (!res.ok) throw new Error(`TileJSON ${res.status}`);
        return res.json() as Promise<TileJSON>;
      })
      .then((tilejson) => {
        if (cancelled || !mapRef.current) return;
        const [west, south, east, north] = tilejson.bounds;
        const bounds = L.latLngBounds([south, west], [north, east]);
        map.setMaxBounds(bounds.pad(0.05));
        map.setMinZoom(tilejson.minzoom);
        const maxZoom = tilejson.maxzoom + OVERZOOM;
        map.setMaxZoom(maxZoom);
        if (map.getZoom() < tilejson.minzoom) map.setZoom(tilejson.minzoom);
        if (map.getZoom() > maxZoom) map.setZoom(maxZoom);
        if (!bounds.pad(0.2).contains(map.getCenter())) {
          map.fitBounds(bounds, { animate: false });
        }

        const next = L.tileLayer(tilejson.tiles[0], {
          minZoom: tilejson.minzoom,
          maxZoom,
          maxNativeZoom: tilejson.maxzoom,
          attribution: tilejson.attribution,
          bounds,
          detectRetina: false,
        });
        next.addTo(map);
        layerRef.current?.remove();
        layerRef.current = next;
        const centre = map.getCenter();
        writeLocation(version.id, map.getZoom(), centre.lat, centre.lng);
      })
      .catch((err) => console.error(err));

    return () => {
      cancelled = true;
    };
  }, [version]);

  return <div ref={containerRef} className="map" />;
}
