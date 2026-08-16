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

import type { AnimeItem } from "./anilist";

const BASE = (process.env.NEXT_PUBLIC_CINEZO_BASE || "https://cinezo.org").replace(/\/+$/, "");

const DIRECT_TIMEOUT_MS = 4000;
const PROXY_TIMEOUT_MS = 12000;
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

  // 1) Same-origin proxy FIRST — reliable egress on Railway, no CORS, no
  //    Cloudflare blocks that hit residential mobile networks.
  try {
    const { ok, data } = await fetchJson(
      `/api/proxy?url=${encodeURIComponent(url)}`,
      PROXY_TIMEOUT_MS
    );
    if (ok) {
      setCached(url, data);
      return data;
    }
  } catch {
    // proxy down / timeout — fall through to direct
  }

  // 2) Direct fetch fallback (fast when the user's network reaches Cinezo).
  try {
    const { ok, data } = await fetchJson(url, DIRECT_TIMEOUT_MS);
    if (ok) {
      setCached(url, data);
      return data;
    }
  } catch {
    // also failed — report below
  }

  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "the API";
    }
  })();
  throw new Error(
    `Could not reach ${host}. This is usually temporary — tap retry, or check your connection.`
  );
}

export type Kind = "movie" | "tv";

export interface Genre {
  id: number;
  name: string;
}

/** Fetch our own public /api/v1 endpoints and unwrap the { ok, data } envelope. */
async function fetchV1<T = any>(path: string): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const json = await res.json();
  if (!json?.ok) throw new Error(json?.error || "Request failed");
  return json.data as T;
}

/** Result shape returned by AniList-backed anime endpoints. */
export interface AnimePage {
  page: number;
  has_next_page: boolean;
  results: AnimeItem[];
}

/** Lightweight episode shape (mirrors lib/anime-stream.ts, client-safe). */
export interface AnimeEpisode {
  id: string;
  number: number;
  title?: string;
  image?: string;
  isFiller?: boolean;
}

/** Lightweight stream source shape (client-safe). */
export interface AnimeStreamSource {
  url: string;
  quality: string;
  isM3U8: boolean;
}

/** Desi/Hindi movie item (from download-oriented providers). */
export interface HindiMovieItem {
  provider: string;
  id: string;
  title: string;
  slug?: string;
  link: string;
  image?: string;
  date?: string;
}

/** Desi/Hindi movie detail + download links. */
export interface HindiMovieDetail {
  provider: string;
  id: string;
  title: string;
  slug?: string;
  link: string;
  image?: string;
  date?: string;
  year?: string;
  rating?: string;
  plot?: string;
  links: { label: string; url: string }[];
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
  // NOTE: cinezo's `/similar` returns a popularity-sorted list (unrelated
  // titles), while `/recommendations` returns actually-relevant movies — so we
  // use recommendations for the "More like this" row.
  similar: (kind: Kind, id: number | string, page = 1) =>
    request(`${BASE}/api/tmdb/${kind}/${id}/recommendations?page=${page}`),
  credits: (kind: Kind, id: number | string) => request(`${BASE}/api/tmdb/${kind}/${id}/credits`),
  topRatedTv: (page = 1) => request(`${BASE}/api/tmdb/tv/top_rated?page=${page}`),
  topRatedMovies: (page = 1) => request(`${BASE}/api/tmdb/movie/top_rated?page=${page}`),

  // ── Anime (AniList-backed) ─────────────────────────────────────────────
  // Replaces the old TMDB "Animation + Japan" filter with real anime metadata.
  animeBrowse: (opts: {
    type?: "series" | "movies";
    sort?: "popularity" | "rating" | "trending";
    genre?: string;
    page?: number;
  } = {}): Promise<AnimePage> => {
    const p = new URLSearchParams();
    p.set("type", opts.type || "series");
    p.set("sort", opts.sort || "popularity");
    p.set("page", String(opts.page || 1));
    if (opts.genre) p.set("genre", opts.genre);
    return fetchV1<AnimePage>(`/anime?${p.toString()}`);
  },
  animeSearch: (query: string, page = 1): Promise<AnimePage> =>
    fetchV1<AnimePage>(`/anime/search?q=${encodeURIComponent(query)}&page=${page}`),
  animeDetail: (id: number | string): Promise<AnimeItem> =>
    fetchV1<AnimeItem>(`/anime/${id}`),
  animeGenres: (): Promise<{ genres: string[] }> => fetchV1(`/anime/genres`),
  animeEpisodes: (id: number | string): Promise<{ available: boolean; episodes: AnimeEpisode[] }> =>
    fetchV1(`/anime/${id}/episodes`),
  animeStream: (
    id: number | string,
    episode: number,
    dub = false
  ): Promise<{ available: boolean; sources?: AnimeStreamSource[]; subtitles?: { url: string; lang: string }[]; headers?: Record<string, string> } & Record<string, unknown>> =>
    fetchV1(`/anime/${id}/stream?ep=${episode}&dub=${dub ? 1 : 0}`),

  // ── Hindi / Desi movies (download-oriented providers) ─────────────────
  hindiSearch: (query: string, page = 1): Promise<{ results: HindiMovieItem[] }> =>
    fetchV1(`/hindi/search?q=${encodeURIComponent(query)}&page=${page}`),
  hindiRecent: (page = 1): Promise<{ results: HindiMovieItem[] }> =>
    fetchV1(`/hindi/recent?page=${page}`),
  hindiDetail: (provider: string, id: string): Promise<HindiMovieDetail> =>
    fetchV1(`/hindi/${provider}/${id}`),
  unshorten: (
    url: string
  ): Promise<{ ok: boolean; originalUrl: string; resolvedUrl?: string; host?: string; method: "adfly" | "gplinks" | "droplink" | "gdtot" | "sharer" | "appdrive" | "redirect" | "embedded" | "manual"; note?: string; chain?: string[]; dead?: boolean }> =>
    fetchV1(`/unshorten?url=${encodeURIComponent(url)}`),
};
