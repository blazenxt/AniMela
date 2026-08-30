import { NextResponse } from "next/server";

/**
 * Small helpers to keep every API route consistent:
 *   - JSON responses with same-origin CORS (the API is consumed by the app
 *     itself; third-party browser access is not needed)
 *   - uniform error shape
 *   - uniform success shape
 *
 * Note: CORS only governs *browser* cross-origin requests. Server-side
 * scrapers ignore it entirely — it is not an anti-scraping mechanism.
 */

const CORS = {
  // No `Access-Control-Allow-Origin` is set: browsers then block cross-origin
  // reads by default, while same-origin requests (our own app) are unaffected.
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return NextResponse.json({ ok: true, data, ...(meta ? { meta } : {}) }, { headers: CORS });
}

export function fail(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: CORS });
}

export function options() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Normalize a TMDB search result into the MediaItem shape the site uses. */
export function normalize(item: any) {
  if (!item) return null;
  const type = item.media_type || (item.title || item.release_date ? "movie" : "tv");
  return {
    id: item.id,
    type,
    title: item.title || item.name || item.original_title || item.original_name || null,
    overview: item.overview || null,
    poster_path: item.poster_path || null,
    backdrop_path: item.backdrop_path || null,
    release_date: item.release_date || item.first_air_date || null,
    vote_average: item.vote_average ?? null,
    genre_ids: item.genre_ids || [],
    popularity: item.popularity ?? null,
  };
}
