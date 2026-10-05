import { distanceNmi } from "./geo";

export type TrackPoint = {
  lat: number;
  lng: number;
  /** Epoch milliseconds. */
  time?: number;
  ele?: number;
};

export type Track = {
  id: string;
  name: string;
  /** Original file name. */
  source: string;
  importedAt: number;
  /** One entry per GPX trkseg; segments are never joined to each other. */
  segments: TrackPoint[][];
};

export type TrackBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type TrackStats = {
  distanceNmi: number;
  start: number | null;
  end: number | null;
  points: number;
};

export const TRACK_COLORS = ["#ff8a3d", "#4fd1c5", "#f6e05e", "#f687b3", "#9f7aea", "#68d391"] as const;

export function trackColor(index: number): string {
  return TRACK_COLORS[index % TRACK_COLORS.length];
}

export function trackStats(track: Track): TrackStats {
  let distance = 0;
  let start: number | null = null;
  let end: number | null = null;
  let points = 0;
  for (const segment of track.segments) {
    for (let i = 0; i < segment.length; i += 1) {
      const point = segment[i];
      points += 1;
      if (i > 0) distance += distanceNmi(segment[i - 1], point);
      if (point.time != null) {
        if (start == null || point.time < start) start = point.time;
        if (end == null || point.time > end) end = point.time;
      }
    }
  }
  return { distanceNmi: distance, start, end, points };
}

export function trackBounds(track: Track): TrackBounds | null {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const segment of track.segments) {
    for (const point of segment) {
      if (point.lat < south) south = point.lat;
      if (point.lat > north) north = point.lat;
      if (point.lng < west) west = point.lng;
      if (point.lng > east) east = point.lng;
    }
  }
  if (!Number.isFinite(south)) return null;
  return { south, west, north, east };
}

export function formatTrackDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 48) return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours === 0 ? `${days}d` : `${days}d ${remHours}h`;
}

export function formatTrackSummary(stats: TrackStats): string {
  const parts = [`${stats.distanceNmi.toFixed(1)} nmi`];
  if (stats.start != null) {
    parts.push(
      new Date(stats.start).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
    );
    if (stats.end != null && stats.end > stats.start) parts.push(formatTrackDuration(stats.end - stats.start));
  }
  return parts.join(" · ");
}
