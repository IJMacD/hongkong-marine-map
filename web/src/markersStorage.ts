import { emptyMarkersState, type ChartMarker, type MarkerSet, type MarkersState } from "./markersTypes";

const STORAGE_KEY = "hk-marine-markers";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseMarker(value: unknown): ChartMarker | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id) return null;
  if (typeof row.name !== "string") return null;
  if (!isFiniteNumber(row.lat) || !isFiniteNumber(row.lng)) return null;
  return { id: row.id, name: row.name, lat: row.lat, lng: row.lng };
}

export function parseSet(value: unknown, markerIds: Set<string>): MarkerSet | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id) return null;
  if (typeof row.name !== "string") return null;
  if (!Array.isArray(row.markerIds)) return null;
  const ids = row.markerIds.filter((id): id is string => typeof id === "string" && markerIds.has(id));
  return { id: row.id, name: row.name, markerIds: ids };
}

export function uniqueStrings(values: unknown, allowed: Set<string>): string[] {
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

export type ParseMarkersOptions = {
  missingLoaded?: "none" | "all";
};

export function parseMarkersDocument(raw: unknown, options?: ParseMarkersOptions): MarkersState | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if ("version" in row && row.version !== 1) return null;
  if (!Array.isArray(row.markers)) return null;

  const markers: ChartMarker[] = [];
  const seenMarkers = new Set<string>();
  for (const value of row.markers) {
    const marker = parseMarker(value);
    if (!marker || seenMarkers.has(marker.id)) continue;
    seenMarkers.add(marker.id);
    markers.push(marker);
  }
  const markerIds = new Set(markers.map((marker) => marker.id));

  const sets: MarkerSet[] = [];
  const seenSets = new Set<string>();
  const setRows = Array.isArray(row.sets) ? row.sets : row.sets === undefined ? [] : null;
  if (setRows === null) return null;
  for (const value of setRows) {
    const set = parseSet(value, markerIds);
    if (!set || seenSets.has(set.id)) continue;
    seenSets.add(set.id);
    sets.push(set);
  }
  const setIds = new Set(sets.map((set) => set.id));
  const defaultAll = options?.missingLoaded === "all";

  return {
    version: 1,
    markers,
    sets,
    loadedMarkerIds:
      row.loadedMarkerIds === undefined && defaultAll
        ? markers.map((marker) => marker.id)
        : uniqueStrings(row.loadedMarkerIds, markerIds),
    loadedSetIds:
      row.loadedSetIds === undefined && defaultAll
        ? sets.map((set) => set.id)
        : uniqueStrings(row.loadedSetIds, setIds),
  };
}

export function loadMarkersState(): MarkersState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyMarkersState();
    return parseMarkersDocument(JSON.parse(raw) as unknown, { missingLoaded: "none" }) ?? emptyMarkersState();
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
