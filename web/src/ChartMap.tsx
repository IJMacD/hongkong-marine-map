import { useEffect, useRef, useState, type MutableRefObject } from "react";
import L from "leaflet";
import { HistoryControl } from "./HistoryControl";
import { LocateControl, type LocateState } from "./LocateControl";
import { PlaceMarkerControl } from "./PlaceMarkerControl";
import type { ChartMarker } from "./markersTypes";
import type { TileJSON, VersionInfo } from "./types";
import { readLocation, writeLocation } from "./urlState";
import type { UserPosition } from "./userLocation";

export type SetRoute = {
  id: string;
  color: string;
  latlngs: [number, number][];
};

export type FocusToken = {
  id: string;
  nonce: number;
};

type Props = {
  version: VersionInfo | undefined;
  markers: ChartMarker[];
  selectedId: string | null;
  placeMode: boolean;
  setRoutes: SetRoute[];
  focusToken: FocusToken | null;
  locateRequestRef: MutableRefObject<(() => void) | null>;
  onPlace: (lat: number, lng: number) => void;
  onSelect: (id: string | null) => void;
  onPlaceModeChange: (active: boolean) => void;
  onUserPosition: (position: UserPosition | null) => void;
  onLocateState: (state: LocateState) => void;
  historyOpen: boolean;
  onHistoryToggle: () => void;
};

const OVERZOOM = 2;
const MARKER_HTML =
  '<div class="chart-marker-pin"></div><div class="chart-marker-dot"></div>';

function markerIcon(selected: boolean): L.DivIcon {
  return L.divIcon({
    className: `chart-marker-icon${selected ? " is-selected" : ""}`,
    html: MARKER_HTML,
    iconSize: [28, 36],
    iconAnchor: [14, 34],
  });
}

export function ChartMap({
  version,
  markers,
  selectedId,
  placeMode,
  setRoutes,
  focusToken,
  locateRequestRef,
  onPlace,
  onSelect,
  onPlaceModeChange,
  onUserPosition,
  onLocateState,
  historyOpen,
  onHistoryToggle,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.TileLayer | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);
  const lineGroupRef = useRef<L.LayerGroup | null>(null);
  const placeControlRef = useRef<PlaceMarkerControl | null>(null);
  const historyControlRef = useRef<HistoryControl | null>(null);
  const versionIdRef = useRef(version?.id ?? "latest");
  const skipMapClickRef = useRef(false);
  const [mapEpoch, setMapEpoch] = useState(0);
  const callbacksRef = useRef({
    onPlace,
    onSelect,
    onPlaceModeChange,
    onUserPosition,
    onLocateState,
    onHistoryToggle,
    placeMode,
    selectedId,
  });

  versionIdRef.current = version?.id ?? "latest";
  callbacksRef.current = {
    onPlace,
    onSelect,
    onPlaceModeChange,
    onUserPosition,
    onLocateState,
    onHistoryToggle,
    placeMode,
    selectedId,
  };

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
    const placeControl = new PlaceMarkerControl({
      onToggle: () => {
        const next = !callbacksRef.current.placeMode;
        callbacksRef.current.onPlaceModeChange(next);
      },
    });
    placeControl.addTo(map);
    placeControlRef.current = placeControl;
    const historyControl = new HistoryControl({
      onToggle: () => callbacksRef.current.onHistoryToggle(),
    });
    historyControl.addTo(map);
    historyControlRef.current = historyControl;

    lineGroupRef.current = L.layerGroup().addTo(map);
    markerGroupRef.current = L.layerGroup().addTo(map);

    const persist = () => {
      const centre = map.getCenter();
      writeLocation(versionIdRef.current, map.getZoom(), centre.lat, centre.lng);
    };
    map.on("moveend", persist);
    map.on("zoomend", persist);

    map.on("click", (event: L.LeafletMouseEvent) => {
      if (skipMapClickRef.current) {
        skipMapClickRef.current = false;
        return;
      }
      const cb = callbacksRef.current;
      if (cb.placeMode) {
        cb.onPlace(event.latlng.lat, event.latlng.lng);
        return;
      }
      cb.onSelect(null);
    });

    const onUserPos = ((event: L.LeafletEvent) => {
      callbacksRef.current.onUserPosition((event as L.LeafletEvent & { position: UserPosition }).position);
    }) as L.LeafletEventHandlerFn;
    const onUserPosEnd = () => callbacksRef.current.onUserPosition(null);
    const onLocateStateEvent = ((event: L.LeafletEvent) => {
      callbacksRef.current.onLocateState((event as L.LeafletEvent & { state: LocateState }).state);
    }) as L.LeafletEventHandlerFn;
    map.on("userposition", onUserPos);
    map.on("userpositionend", onUserPosEnd);
    map.on("locatestate", onLocateStateEvent);

    locateRequestRef.current = () => map.fire("requestlocate");

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const cb = callbacksRef.current;
      if (cb.placeMode) {
        cb.onPlaceModeChange(false);
        return;
      }
      if (cb.selectedId) cb.onSelect(null);
    };
    window.addEventListener("keydown", onKey);

    mapRef.current = map;
    setMapEpoch((n) => n + 1);

    return () => {
      window.removeEventListener("keydown", onKey);
      locateRequestRef.current = null;
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markerGroupRef.current = null;
      lineGroupRef.current = null;
      placeControlRef.current = null;
      historyControlRef.current = null;
    };
  }, [locateRequestRef]);

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
  }, [version, mapEpoch]);

  useEffect(() => {
    placeControlRef.current?.setActive(placeMode);
    mapRef.current?.getContainer().classList.toggle("is-placing", placeMode);
  }, [placeMode, mapEpoch]);

  useEffect(() => {
    historyControlRef.current?.setActive(historyOpen);
  }, [historyOpen, mapEpoch]);

  useEffect(() => {
    const group = markerGroupRef.current;
    if (!group) return;
    group.clearLayers();
    for (const marker of markers) {
      const selected = marker.id === selectedId;
      const pin = L.marker([marker.lat, marker.lng], {
        icon: markerIcon(selected),
        title: marker.name,
        zIndexOffset: selected ? 500 : 0,
      });
      pin.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        skipMapClickRef.current = true;
        callbacksRef.current.onSelect(marker.id);
      });
      pin.addTo(group);
    }
  }, [markers, selectedId, mapEpoch]);

  useEffect(() => {
    const group = lineGroupRef.current;
    if (!group) return;
    group.clearLayers();
    for (const route of setRoutes) {
      if (route.latlngs.length < 2) continue;
      L.polyline(route.latlngs, {
        color: route.color,
        weight: 2,
        opacity: 0.85,
        interactive: false,
      }).addTo(group);
    }
  }, [setRoutes, mapEpoch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusToken) return;
    const marker = markers.find((item) => item.id === focusToken.id);
    if (!marker) return;
    map.panTo([marker.lat, marker.lng]);
  }, [focusToken, markers, mapEpoch]);

  return <div ref={containerRef} className="map" />;
}
