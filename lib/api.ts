/**
 * Cinezo TMDB proxy client.
 *
 * Cinezo (https://cinezo.net, redirects to cinezo.org) exposes a read-only
 * TMDB mirror:
 *   /api/tmdb/trending/movie/week?page=1
 *   /api/tmdb/trending/tv/week?page=1
 *   /api/tmdb/search/multi?query=...&page=1
 *   /api/tmdb/movie/{id}
 *   /api/tmdb/tv/{id}
 *   /api/tmdb/tv/{id}/season/{n}
 *   ... (genres, discover, similar, credits)
 *
 * Performance notes:
 *   - We hit `cinezo.org` directly (skips the cinezo.net -> cinezo.org redirect).
 *   - Every request has a hard timeout (AbortSignal.timeout) so a stalled
 *     connection fails FAST instead of hanging the page for minutes.
 *   - Responses are cached in-memory for 5 minutes (TTL) so back/forward
 *     navigation is instant instead of re-fetching.
 *   - The client tries a direct fetch first (no extra hop when the user's
 *     network reaches Cinezo). On any failure/timeout it retries through our
 *     same-origin proxy at /api/proxy (Railway has fast, non-blocked egress).
 */

const BASE = (process.env.NEXT_PUBLIC_CINEZO_BASE || "https://cinezo.org").replace(/\/+$/, "");

const DIRECT_TIMEOUT_MS = 8000;
const PROXY_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX = 300;

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

async function fetchJson(url: string, timeoutMs: number): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return { ok: false, data: null };
  const data = await res.json();
  return { ok: true, data };
}

async function request(url: string): Promise<any> {
  const cached = getCached(url);
  if (cached !== undefined) return cached;

  // 1) Direct fetch (fast path, no extra hop).
  try {
    const { ok, data } = await fetchJson(url, DIRECT_TIMEOUT_MS);
    if (ok) {
      setCached(url, data);
      return data;
    }
  } catch {
    // timeout / CORS / network — fall through to the proxy
  }

  // 2) Same-origin proxy (no CORS; reliable egress on Railway).
  try {
    const { ok, data } = await fetchJson(
      `/api/proxy?url=${encodeURIComponent(url)}`,
      PROXY_TIMEOUT_MS
    );
    if (ok) {
      setCached(url, data);
      return data;
    }
    throw new Error(`proxy returned non-ok for ${url}`);
  } catch (e) {
    const host = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return "the API";
      }
    })();
    throw new Error(
      `Could not reach ${host}. It may be blocking this network — try again or set NEXT_PUBLIC_CINEZO_BASE.`
    );
  }
}

export type Kind = "movie" | "tv";

export interface Genre {
  id: number;
  name: string;
}

export const api = {
  trendingMovies: (page = 1) => request(`${BASE}/api/tmdb/trending/movie/week?page=${page}`),
  trendingTv: (page = 1) => request(`${BASE}/api/tmdb/trending/tv/week?page=${page}`),
  trendingAll: (page = 1) => request(`${BASE}/api/tmdb/trending/all/week?page=${page}`),
  search: (query: string, page = 1) =>
    request(`${BASE}/api/tmdb/search/multi?query=${encodeURIComponent(query)}&page=${page}`),
  movie: (id: number | string) => request(`${BASE}/api/tmdb/movie/${id}`),
  tv: (id: number | string) => request(`${BASE}/api/tmdb/tv/${id}`),
  season: (id: number | string, season: number) => request(`${BASE}/api/tmdb/tv/${id}/season/${season}`),
  genreList: (kind: Kind) => request(`${BASE}/api/tmdb/genre/${kind}/list`),
  discover: (kind: Kind, genreId: number | string, page = 1) =>
    request(`${BASE}/api/tmdb/discover/${kind}?with_genres=${genreId}&page=${page}`),
  similar: (kind: Kind, id: number | string, page = 1) =>
    request(`${BASE}/api/tmdb/${kind}/${id}/similar?page=${page}`),
  credits: (kind: Kind, id: number | string) => request(`${BASE}/api/tmdb/${kind}/${id}/credits`),
};
