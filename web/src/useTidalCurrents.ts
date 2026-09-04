import { useEffect, useState } from "react";

const TIDES_URL = "https://passage.ijmacd.com/tides/data/static_geojson.php?mode=S&time=";
const HKT = "Asia/Hong_Kong";
const CACHE_LIMIT = 96;
const FETCH_DEBOUNCE_MS = 150;

export const SLOT_STEP_MINUTES = 15;
export const SLOT_MAX_MINUTES = 23 * 60 + 45;

export type TidalVector = {
  lat: number;
  lon: number;
  magnitude: number;
  direction: number;
};

export type TidalSlot = {
  date: string;
  minutes: number;
};

type HydroFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: { knot?: string; deg?: string };
};

type HydroCollection = {
  features?: HydroFeature[];
};

const cache = new Map<string, TidalVector[]>();

const hktPartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: HKT,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const labelFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: HKT,
  day: "numeric",
  month: "short",
  year: "numeric",
});

function hktParts(date: Date): Record<string, string> {
  return Object.fromEntries(hktPartsFormatter.formatToParts(date).map((part) => [part.type, part.value]));
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function clampSlotMinutes(minutes: number): number {
  const stepped = Math.floor(minutes / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
  return Math.max(0, Math.min(SLOT_MAX_MINUTES, stepped));
}

export function nowTidalSlot(now = new Date()): TidalSlot {
  const parts = hktParts(now);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: clampSlotMinutes(hour * 60 + minute),
  };
}

export function formatHydroTime(slot: TidalSlot): string {
  const hours = Math.floor(slot.minutes / 60);
  const minutes = slot.minutes % 60;
  return `${slot.date.replaceAll("-", "")}${pad2(hours)}${pad2(minutes)}00`;
}

export function formatTidalLabel(slot: TidalSlot): string {
  const hours = Math.floor(slot.minutes / 60);
  const minutes = slot.minutes % 60;
  const dateLabel = labelFormatter.format(new Date(`${slot.date}T12:00:00+08:00`));
  return `${dateLabel} · ${pad2(hours)}:${pad2(minutes)} HKT`;
}

function cacheGet(key: string): TidalVector[] | undefined {
  const value = cache.get(key);
  if (!value) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function cacheSet(key: string, value: TidalVector[]): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function parseVectors(json: HydroCollection): TidalVector[] {
  if (!Array.isArray(json.features)) return [];
  return json.features.flatMap((feature) => {
    const coords = feature.geometry?.coordinates;
    const knot = feature.properties?.knot;
    const deg = feature.properties?.deg;
    if (!coords || knot == null || deg == null) return [];
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    const magnitude = Number(knot);
    const direction = Number(deg);
    if (![lon, lat, magnitude, direction].every(Number.isFinite)) return [];
    return [{ lat, lon, magnitude, direction }];
  });
}

export function useTidalCurrents(enabled: boolean, slot: TidalSlot): {
  vectors: TidalVector[];
  loading: boolean;
  error: string | null;
} {
  const [stale, setStale] = useState<TidalVector[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = enabled ? formatHydroTime(slot) : "";
  const cached = key ? cache.get(key) : undefined;
  const vectors = enabled ? (cached ?? stale) : [];
  const loading = Boolean(enabled && key && !cached && fetching);

  useEffect(() => {
    if (!enabled || !key) {
      setStale([]);
      setFetching(false);
      setError(null);
      return;
    }

    const hit = cacheGet(key);
    if (hit) {
      setStale(hit);
      setFetching(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setFetching(true);
      setError(null);
      fetch(`${TIDES_URL}${key}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`tidal streams ${res.status}`);
          return res.json() as Promise<HydroCollection>;
        })
        .then((json) => {
          const next = parseVectors(json);
          cacheSet(key, next);
          setStale(next);
          setError(null);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          const message = err instanceof Error ? err.message : "Could not load tidal streams";
          setError(message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setFetching(false);
        });
    }, FETCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      setFetching(false);
    };
  }, [enabled, key]);

  return { vectors, loading, error };
}
