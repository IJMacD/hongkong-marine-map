import { randomBytes } from "node:crypto";

export const SHARE_TTL_MS = 30 * 60 * 1000;
export const SHARE_CODE_LENGTH = 4;
export const SHARE_MAX_BYTES = 256 * 1024;
export const SHARE_MAX_ENTRIES = 200;
export const SHARE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type Entry = {
  json: string;
  expiresAt: number;
};

const shares = new Map<string, Entry>();
const rateHits = new Map<string, number[]>();

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function purgeShares(now: number): void {
  for (const [code, entry] of shares) {
    if (entry.expiresAt <= now) shares.delete(code);
  }
}

function randomCode(): string {
  const bytes = randomBytes(SHARE_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < SHARE_CODE_LENGTH; i++) {
    code += SHARE_ALPHABET[bytes[i]! % SHARE_ALPHABET.length];
  }
  return code;
}

export function normalizeShareCode(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== SHARE_CODE_LENGTH) return null;
  for (const ch of cleaned) {
    if (!SHARE_ALPHABET.includes(ch)) return null;
  }
  return cleaned;
}

export function allowShareRate(ip: string, max: number, windowMs: number, now = Date.now()): boolean {
  const key = `${ip}:${max}:${windowMs}`;
  const recent = (rateHits.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= max) {
    rateHits.set(key, recent);
    return false;
  }
  recent.push(now);
  rateHits.set(key, recent);
  return true;
}

export function isMarkersSharePayload(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if ("version" in row && row.version !== 1) return false;
  if (!Array.isArray(row.markers)) return false;
  for (const item of row.markers) {
    if (!item || typeof item !== "object") return false;
    const marker = item as Record<string, unknown>;
    if (typeof marker.id !== "string" || !marker.id) return false;
    if (typeof marker.name !== "string") return false;
    if (!isFiniteNumber(marker.lat) || !isFiniteNumber(marker.lng)) return false;
  }
  if (row.sets === undefined) return true;
  if (!Array.isArray(row.sets)) return false;
  for (const item of row.sets) {
    if (!item || typeof item !== "object") return false;
    const set = item as Record<string, unknown>;
    if (typeof set.id !== "string" || !set.id) return false;
    if (typeof set.name !== "string") return false;
    if (!Array.isArray(set.markerIds) || set.markerIds.some((id) => typeof id !== "string")) return false;
  }
  return true;
}

export function createShare(json: string, now = Date.now()): { code: string; expiresAt: number } | null {
  purgeShares(now);
  if (shares.size >= SHARE_MAX_ENTRIES) return null;
  let code = randomCode();
  for (let attempt = 0; attempt < 8 && shares.has(code); attempt++) code = randomCode();
  if (shares.has(code)) return null;
  const expiresAt = now + SHARE_TTL_MS;
  shares.set(code, { json, expiresAt });
  return { code, expiresAt };
}

export function getShare(code: string, now = Date.now()): string | null {
  purgeShares(now);
  return shares.get(code)?.json ?? null;
}
