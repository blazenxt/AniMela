/**
 * Server-side anime metadata fetcher (AniList primary, Jikan fallback).
 *
 * This module runs inside API route handlers (Node runtime), so it talks to
 * AniList's GraphQL endpoint and Jikan v4 directly with proper timeouts and
 * an in-memory TTL cache — mirroring the pattern in `lib/server-api.ts`.
 *
 * Do NOT import this module into client components; it uses server-side fetch
 * and caching. Client code goes through `lib/api.ts` → `/api/v1/anime/*`.
 */

import {
  ANIME_GENRES,
  AnimeItem,
  AnimeSort,
  detailQuery,
  listQuery,
  mapMedia,
  PageResult,
} from "./anilist";

const ANILIST_URL = (process.env.ANILIST_BASE || "https://graphql.anilist.co").replace(/\/+$/, "");
const JIKAN_BASE = (process.env.JIKAN_BASE || "https://api.jikan.moe/v4").replace(/\/+$/, "");

const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
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

/** POST a GraphQL query to AniList and unwrap `data`. */
async function anilist<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const key = `anilist:${query}:${JSON.stringify(variables)}`;
  const cached = getCached(key);
  if (cached !== undefined) return cached as T;

  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`AniList upstream error (${res.status})`);

  const json = await res.json();
  if (json?.errors?.length) {
    throw new Error(`AniList error: ${json.errors[0].message || "unknown"}`);
  }

  const data = json.data as T;
  setCached(key, data);
  return data;
}

/** Simple GET with cache, used for Jikan. */
async function jikan<T>(path: string): Promise<T> {
  const url = `${JIKAN_BASE}${path}`;
  const cached = getCached(`jikan:${url}`);
  if (cached !== undefined) return cached as T;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Jikan upstream error (${res.status})`);
  const data = (await res.json()) as T;
  setCached(`jikan:${url}`, data);
  return data;
}

/** Map a Jikan v4 `anime` result → our `AnimeItem` shape. */
function mapJikan(a: any): AnimeItem | null {
  if (!a) return null;
  return {
    id: a.mal_id,
    malId: a.mal_id,
    title: a.title_english || a.title || a.title_japanese || "Untitled",
    englishTitle: a.title_english ?? null,
    nativeTitle: a.title_japanese ?? null,
    description: a.synopsis ?? null,
    coverImage: a.images?.jpg?.large_image_url || a.images?.webp?.large_image_url || null,
    bannerImage: a.images?.jpg?.large_image_url || null,
    format: null, // Jikan's type string doesn't map 1:1 to AniList enum; leave null
    episodes: a.episodes ?? null,
    duration: typeof a.duration === "string" ? parseDuration(a.duration) : a.duration ?? null,
    averageScore: a.score != null ? Math.round(a.score * 10) : null, // /10 → /100
    popularity: a.members ?? null,
    status: null,
    season: null,
    seasonYear: a.year ?? null,
    genres: (a.genres || []).map((g: any) => g?.name).filter(Boolean),
    studios: (a.studios || []).map((s: any) => s?.name).filter(Boolean),
    isAdult: a.rating?.includes("Rx") ?? false,
  };
}

function parseDuration(d: string): number | null {
  const m = d.match(/(\d+)\s*min/i);
  return m ? Number(m[1]) : null;
}

export interface AnimeListOptions {
  format?: "series" | "movies";
  sort?: AnimeSort;
  genre?: string;
  page?: number;
}

/**
 * Paginated anime browse (AniList primary, Jikan fallback).
 * Jikan fallback only supports "top/anime" + genre, so we map a best-effort
 * equivalent and note the limitation.
 */
export async function animeList(opts: AnimeListOptions = {}): Promise<PageResult> {
  const page = Math.max(1, opts.page || 1);
  try {
    const { query, variables } = listQuery(opts);
    const data = await anilist<any>(query, variables);
    const p = data?.Page;
    return {
      page,
      hasNextPage: !!p?.pageInfo?.hasNextPage,
      results: (p?.media || []).map(mapMedia).filter(Boolean) as AnimeItem[],
    };
  } catch {
    // Fallback: Jikan "top anime" (score) or search — no per-format filter,
    // but keeps the section alive if AniList is unreachable.
    const genreParam = opts.genre ? `&genres=${encodeURIComponent(opts.genre)}` : "";
    const data = await jikan<any>(`/top/anime?page=${page}${genreParam}&sfw=true`);
    return {
      page,
      hasNextPage: !!data?.pagination?.has_next_page,
      results: (data?.data || []).map(mapJikan).filter(Boolean) as AnimeItem[],
    };
  }
}

/** Free-text anime search (AniList primary, Jikan fallback). */
export async function animeSearch(query: string, page = 1): Promise<PageResult> {
  const q = query.trim();
  if (!q) return { page: 1, hasNextPage: false, results: [] };

  try {
    const { query: gql, variables } = listQuery({ search: q, page });
    const data = await anilist<any>(gql, variables);
    const p = data?.Page;
    return {
      page,
      hasNextPage: !!p?.pageInfo?.hasNextPage,
      results: (p?.media || []).map(mapMedia).filter(Boolean) as AnimeItem[],
    };
  } catch {
    const data = await jikan<any>(`/anime?q=${encodeURIComponent(q)}&page=${page}&sfw=true`);
    return {
      page,
      hasNextPage: !!data?.pagination?.has_next_page,
      results: (data?.data || []).map(mapJikan).filter(Boolean) as AnimeItem[],
    };
  }
}

/** Single anime by AniList id (AniList only — Jikan keys off MAL ids). */
export async function animeDetail(id: number | string): Promise<AnimeItem | null> {
  const { query, variables } = detailQuery(id);
  const data = await anilist<any>(query, variables);
  return mapMedia(data?.Media);
}

/** Curated genre list (static — see `ANIME_GENRES` in lib/anilist.ts). */
export function animeGenres(): string[] {
  // Re-exported here so API routes have a single server entry point.
  return [...ANIME_GENRES];
}
