import { newId } from "./ids";
import type { ChartMarker, MarkerSet, MarkersState } from "./markersTypes";
import type { Track, TrackPoint } from "./tracksTypes";

export type GpxImport = {
  tracks: Track[];
  markers: MarkersState;
  waypointCount: number;
  routeCount: number;
};

function children(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === name);
}

function descendants(parent: Element | Document, name: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS("*", name));
}

function childText(parent: Element, name: string): string | null {
  const text = children(parent, name)[0]?.textContent?.trim();
  return text ? text : null;
}

function readLatLng(el: Element): { lat: number; lng: number } | null {
  const latRaw = el.getAttribute("lat");
  const lngRaw = el.getAttribute("lon");
  if (latRaw == null || lngRaw == null) return null;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function readTrackPoint(el: Element): TrackPoint | null {
  const pos = readLatLng(el);
  if (!pos) return null;
  const point: TrackPoint = pos;
  const timeRaw = childText(el, "time");
  if (timeRaw) {
    const time = Date.parse(timeRaw);
    if (Number.isFinite(time)) point.time = time;
  }
  const eleRaw = childText(el, "ele");
  if (eleRaw) {
    const ele = Number(eleRaw);
    if (Number.isFinite(ele)) point.ele = ele;
  }
  return point;
}

function baseName(fileName: string): string {
  const trimmed = fileName.replace(/\.[^.]+$/, "").trim();
  return trimmed || "Track";
}

export function parseGpx(text: string, fileName: string): GpxImport | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, "application/xml");
  } catch {
    return null;
  }
  const root = doc.documentElement;
  if (!root || root.localName !== "gpx" || descendants(doc, "parsererror").length > 0) return null;

  const fileTitle = baseName(fileName);
  const importedAt = Date.now();

  const trkEls = children(root, "trk");
  const tracks: Track[] = [];
  trkEls.forEach((trk, index) => {
    const segments: TrackPoint[][] = [];
    for (const seg of children(trk, "trkseg")) {
      const points: TrackPoint[] = [];
      for (const pt of children(seg, "trkpt")) {
        const point = readTrackPoint(pt);
        if (point) points.push(point);
      }
      if (points.length >= 2) segments.push(points);
    }
    if (segments.length === 0) return;
    const name = childText(trk, "name") ?? (trkEls.length > 1 ? `${fileTitle} ${index + 1}` : fileTitle);
    tracks.push({ id: newId(), name, source: fileName, importedAt, segments });
  });

  const markers: ChartMarker[] = [];
  const loadedMarkerIds: string[] = [];
  let waypointCount = 0;
  for (const wpt of children(root, "wpt")) {
    const pos = readLatLng(wpt);
    if (!pos) continue;
    waypointCount += 1;
    const marker: ChartMarker = {
      id: newId(),
      name: childText(wpt, "name") ?? `Waypoint ${waypointCount}`,
      ...pos,
    };
    markers.push(marker);
    loadedMarkerIds.push(marker.id);
  }

  const sets: MarkerSet[] = [];
  children(root, "rte").forEach((rte, index) => {
    const markerIds: string[] = [];
    children(rte, "rtept").forEach((rtept, pointIndex) => {
      const pos = readLatLng(rtept);
      if (!pos) return;
      const marker: ChartMarker = {
        id: newId(),
        name: childText(rtept, "name") ?? `Route point ${pointIndex + 1}`,
        ...pos,
      };
      markers.push(marker);
      markerIds.push(marker.id);
    });
    if (markerIds.length === 0) return;
    const routeName = (childText(rte, "name") ?? `Route ${index + 1}`).replace(/\//g, "-");
    sets.push({ id: newId(), name: `${fileTitle.replace(/\//g, "-")}/${routeName}`, markerIds });
  });

  if (tracks.length === 0 && markers.length === 0) return null;

  return {
    tracks,
    markers: {
      version: 1,
      markers,
      sets,
      loadedMarkerIds,
      loadedSetIds: sets.map((set) => set.id),
    },
    waypointCount,
    routeCount: sets.length,
  };
}

export function isGpxDocument(text: string): boolean {
  try {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    return doc.documentElement?.localName === "gpx" && descendants(doc, "parsererror").length === 0;
  } catch {
    return false;
  }
}
