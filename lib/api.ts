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
 *
 * The client first tries a direct fetch (works when the upstream sends CORS
 * headers). If that fails (CORS / network), it retries through our own
 * same-origin proxy route at /api/proxy, which adds Access-Control-Allow-Origin.
 */

const BASE = (process.env.NEXT_PUBLIC_CINEZO_BASE || "https://cinezo.net").replace(/\/+$/, "");

async function request(url: string): Promise<any> {
  // 1) Direct fetch.
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (res.ok) return await res.json();
    // fall through to proxy for non-ok (some 403s may be recoverable)
  } catch {
    // CORS or network error — fall through to proxy.
  }

  // 2) Same-origin proxy (avoids CORS entirely).
  const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { cache: "no-store" });
  if (!res.ok) {
    const host = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return "the API";
      }
    })();
    throw new Error(`Could not reach ${host} (status ${res.status}). It may be blocking this network — try from a residential connection or set NEXT_PUBLIC_CINEZO_BASE.`);
  }
  return await res.json();
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
