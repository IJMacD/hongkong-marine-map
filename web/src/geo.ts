export type LatLng = {
  lat: number;
  lng: number;
};

const EARTH_RADIUS_M = 6_371_008.8;
const METERS_PER_NAUTICAL_MILE = 1852;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function distanceNmi(from: LatLng, to: LatLng): number {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δφ = toRad(to.lat - from.lat);
  const Δλ = toRad(to.lng - from.lng);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (EARTH_RADIUS_M * c) / METERS_PER_NAUTICAL_MILE;
}

export function bearingTrue(from: LatLng, to: LatLng): number {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lng - from.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function formatBearing(deg: number): string {
  const rounded = ((Math.round(deg) % 360) + 360) % 360;
  return `${String(rounded).padStart(3, "0")}°T`;
}

export function formatRangeNmi(nmi: number): string {
  if (!Number.isFinite(nmi)) return "—";
  return `${nmi.toFixed(2)} nmi`;
}

export function formatLatLng(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}°${ns}  ${Math.abs(lng).toFixed(5)}°${ew}`;
}

export function formatCoord(value: number): string {
  return value.toFixed(5);
}

export function parseCoord(raw: string, kind: "lat" | "lng"): number | null {
  const trimmed = raw.trim().replace(/°/g, " ").replace(/\s+/g, " ");
  if (!trimmed) return null;
  const hemi = trimmed.match(/[NSEW]$/i)?.[0]?.toUpperCase();
  const body = (hemi ? trimmed.slice(0, -1) : trimmed).trim();
  const value = Number(body);
  if (!Number.isFinite(value)) return null;

  let coord = value;
  if (hemi) {
    if (kind === "lat") {
      if (hemi === "N") coord = Math.abs(value);
      else if (hemi === "S") coord = -Math.abs(value);
      else return null;
    } else if (hemi === "E") coord = Math.abs(value);
    else if (hemi === "W") coord = -Math.abs(value);
    else return null;
  }

  if (kind === "lat" && (coord < -90 || coord > 90)) return null;
  if (kind === "lng" && (coord < -180 || coord > 180)) return null;
  return coord;
}
