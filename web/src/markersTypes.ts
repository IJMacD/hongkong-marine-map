export type ChartMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export type MarkerSet = {
  id: string;
  name: string;
  markerIds: string[];
};

export type MarkersState = {
  version: 1;
  markers: ChartMarker[];
  sets: MarkerSet[];
  loadedMarkerIds: string[];
  loadedSetIds: string[];
};

export const SET_LINE_COLORS = ["#7eb8da", "#e0b07a", "#8fd4a8", "#d48fd0", "#e07a7a"] as const;

export function setLineColor(index: number): string {
  return SET_LINE_COLORS[index % SET_LINE_COLORS.length];
}

export function emptyMarkersState(): MarkersState {
  return {
    version: 1,
    markers: [],
    sets: [],
    loadedMarkerIds: [],
    loadedSetIds: [],
  };
}

export function nextIndexedName(items: { name: string }[], prefix: string): string {
  const used = new Set(items.map((item) => item.name));
  let n = items.length + 1;
  while (used.has(`${prefix} ${n}`)) n += 1;
  return `${prefix} ${n}`;
}
