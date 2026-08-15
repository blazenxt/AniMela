/**
 * Consumet provider — a hosted anime meta/scraper API.
 *
 * Consumet (https://github.com/consumet/api.consumet.org) aggregates multiple
 * anime sites (zoro = hianime, gogoanime, animepahe, …) behind one REST API and
 * does the fragile scraping + stream decryption server-side. This makes it the
 * most reliable fallback in our provider chain — we just consume clean JSON.
 *
 * Endpoints (documented, stable):
 *   GET /anime/zoro/{query}                → search results [{ id, title, image }]
 *   GET /anime/zoro/episodes?id={id}       → episode list [{ id, number, title }]
 *   GET /anime/zoro/watch?episodeId={id}   → { sources, subtitles, headers }
 *   GET /meta/anilist/info/{anilistId}     → AniList-id → episodes (compound ids)
 *
 * Note: a public instance can rate-limit; set `CONSUMET_BASE` to a mirror if
 * `api.consumet.org` is unavailable.
 */

import { AnimeEpisode, AnimeRef, StreamProvider, StreamResult } from "../anime-stream";

const BASE = (process.env.CONSUMET_BASE || "https://api.consumet.org").replace(/\/+$/, "");
const TIMEOUT_MS = 12000;

async function get<T = any>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`consumet ${res.status}`);
  return (await res.json()) as T;
}

/** Resolve a zoro (hianime) id from an anime title via search. */
async function resolveZoroId(ref: AnimeRef): Promise<string | null> {
  const d = await get<any>(`/anime/zoro/${encodeURIComponent(ref.title)}`);
  const results: any[] = d?.results || [];
  if (!results.length) return null;

  // Prefer a result whose title matches closely (ignoring case / separators).
  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const target = norm(ref.title);
  const match =
    results.find((r) => norm(r.title) === target) ||
    (ref.year
      ? results.find((r) => String(r.releaseDate || "").startsWith(String(ref.year)))
      : null) ||
    results[0];

  return match?.id || null;
}

function mapSources(d: any): StreamResult["sources"] {
  return (d?.sources || [])
    .map((s: any) => ({
      url: s.url,
      quality: s.quality || "default",
      isM3U8: s.isM3U8 !== false,
    }))
    .filter((s: any) => s.url);
}

export const ConsumetProvider: StreamProvider = {
  id: "consumet",

  async searchAnime(query: string): Promise<AnimeRef[]> {
    const d = await get<any>(`/anime/zoro/${encodeURIComponent(query)}`);
    return (d?.results || []).map((r: any) => ({
      title: r.title,
      year: r.releaseDate ? Number(String(r.releaseDate).slice(0, 4)) : undefined,
    }));
  },

  async listEpisodes(ref: AnimeRef): Promise<AnimeEpisode[] | null> {
    // Path A — AniList id → meta info (accurate title match, no search ambiguity).
    if (ref.anilistId) {
      const d = await get<any>(`/meta/anilist/info/${ref.anilistId}`);
      const eps: AnimeEpisode[] = (d?.episodes || []).map((e: any) => ({
        id: e.id, // compound "zoro$<epId>$<image>" — usable in /watch
        number: e.number,
        title: e.title || undefined,
        image: e.image || undefined,
      }));
      if (eps.length) return eps;
    }

    // Path B — search by title → zoro id → episodes.
    const zoroId = await resolveZoroId(ref);
    if (!zoroId) return null;
    const d = await get<any>(`/anime/zoro/episodes?id=${encodeURIComponent(zoroId)}`);
    const eps: AnimeEpisode[] = (d?.episodes || []).map((e: any) => ({
      id: e.id,
      number: e.number,
      title: e.title || undefined,
      isFiller: !!e.isFiller,
    }));
    return eps.length ? eps : null;
  },

  async resolveEpisode(
    ref: AnimeRef,
    episode: number,
    dub: boolean
  ): Promise<StreamResult | null> {
    const eps = await this.listEpisodes(ref);
    const ep = eps?.find((e) => e.number === episode);
    if (!ep) return null;

    const dubParam = dub ? "&dub=true" : "";
    try {
      const d = await get<any>(
        `/anime/zoro/watch?episodeId=${encodeURIComponent(ep.id)}${dubParam}`
      );
      const sources = mapSources(d);
      if (!sources.length) return null;
      return {
        provider: "consumet",
        server: "Consumet",
        subOrDub: dub ? "dub" : "sub",
        sources,
        subtitles: d?.subtitles || [],
        headers: d?.headers,
      };
    } catch {
      return null;
    }
  },
};
