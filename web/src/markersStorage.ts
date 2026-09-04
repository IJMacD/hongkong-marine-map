import { emptyMarkersState, type ChartMarker, type MarkerSet, type MarkersState } from "./markersTypes";

const STORAGE_KEY = "hk-marine-markers";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseMarker(value: unknown): ChartMarker | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id) return null;
  if (typeof row.name !== "string") return null;
  if (!isFiniteNumber(row.lat) || !isFiniteNumber(row.lng)) return null;
  return { id: row.id, name: row.name, lat: row.lat, lng: row.lng };
}

function parseSet(value: unknown, markerIds: Set<string>): MarkerSet | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id) return null;
  if (typeof row.name !== "string") return null;
  if (!Array.isArray(row.markerIds)) return null;
  const ids = row.markerIds.filter((id): id is string => typeof id === "string" && markerIds.has(id));
  return { id: row.id, name: row.name, markerIds: ids };
}

function uniqueStrings(values: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" || !allowed.has(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function loadMarkersState(): MarkersState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyMarkersState();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyMarkersState();
    const row = parsed as Record<string, unknown>;
    const markers = Array.isArray(row.markers)
      ? row.markers.map(parseMarker).filter((marker): marker is ChartMarker => marker !== null)
      : [];
    const markerIds = new Set(markers.map((marker) => marker.id));
    const sets = Array.isArray(row.sets)
      ? row.sets.map((value) => parseSet(value, markerIds)).filter((set): set is MarkerSet => set !== null)
      : [];
    const setIds = new Set(sets.map((set) => set.id));
    return {
      version: 1,
      markers,
      sets,
      loadedMarkerIds: uniqueStrings(row.loadedMarkerIds, markerIds),
      loadedSetIds: uniqueStrings(row.loadedSetIds, setIds),
    };
  } catch {
    return emptyMarkersState();
  }
}

export function saveMarkersState(state: MarkersState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, version: 1 }));
  } catch (err) {
    console.error(err);
  }
}
