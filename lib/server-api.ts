/**
 * Server-side metadata fetcher for the public API routes.
 *
 * Unlike lib/api.ts (which runs in the browser and goes through our own
 * /api/proxy), this module runs inside API route handlers on the server, so it
 * fetches Cinezo (TMDB proxy) directly with proper timeouts + caching.
 */

const BASE = (process.env.NEXT_PUBLIC_CINEZO_BASE || "https://cinezo.org").replace(/\/+$/, "");

const TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 500;

interface CacheEntry {
  value: unknown;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

function getCached(key: string): unknown | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires > Date.now()) return hit.value;
  cache.delete(key);
  return undefined;
}

function setCached(key: string, value: unknown) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

export async function tmdb<T = any>(path: string): Promise<T> {
  const url = `${BASE}/api/tmdb${path}`;
  const cached = getCached(url);
  if (cached !== undefined) return cached as T;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Upstream metadata request failed (${res.status})`);
  }

  const data = (await res.json()) as T;
  setCached(url, data);
  return data;
}
