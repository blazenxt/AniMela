/**
 * AnimePahe provider — independent fallback via `@consumet/extensions`.
 *
 * AnimePahe (animepahe.ru) has been stable for years and is scraped locally by
 * the `@consumet/extensions` library (no hosted API — it runs here, server-side
 * on Railway, which has clean egress). This gives AniMela a genuinely
 * independent second source when HiAnime is down/rotated.
 *
 * Flow:
 *   search(title)            → { results: [{ id (session), title, image }] }
 *   fetchAnimeInfo(session)  → { episodes: [{ id: "session/epSession", number, title }] }
 *   fetchEpisodeSources(id)  → { sources: [{ url, quality, isM3U8 }], subtitles, headers }
 */

import { ANIME } from "@consumet/extensions";
import { AnimeEpisode, AnimeRef, StreamProvider, StreamResult } from "../anime-stream";

const pahe = new ANIME.AnimePahe();

const slugCache = new Map<string, string>();
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** `title` can be a string or `{ romaji, english, native }` object. */
function titleOf(t: any): string {
  if (typeof t === "string") return t;
  return t?.romaji || t?.english || t?.native || "";
}

async function resolveSession(ref: AnimeRef): Promise<string | null> {
  const cacheKey = `${ref.title}::${ref.year || ""}`;
  const cached = slugCache.get(cacheKey);
  if (cached) return cached;

  const d = await pahe.search(ref.title);
  const results: any[] = d?.results || [];
  if (!results.length) return null;

  const target = norm(ref.title);
  const match =
    results.find((r) => norm(titleOf(r.title)) === target) ||
    (ref.year
      ? results.find((r) => String(r.releaseDate || "").startsWith(String(ref.year)))
      : null) ||
    results[0];

  if (match?.id) slugCache.set(cacheKey, match.id);
  return match?.id || null;
}

export const AnimePaheProvider: StreamProvider = {
  id: "animepahe",

  async searchAnime(query: string): Promise<AnimeRef[]> {
    const d = await pahe.search(query);
    return (d?.results || []).map((r: any) => ({
      title: titleOf(r.title),
      year: r.releaseDate ? Number(String(r.releaseDate).slice(0, 4)) : undefined,
    }));
  },

  async listEpisodes(ref: AnimeRef): Promise<AnimeEpisode[] | null> {
    const session = await resolveSession(ref);
    if (!session) return null;
    const info = await pahe.fetchAnimeInfo(session);
    const eps: AnimeEpisode[] = (info?.episodes || []).map((e: any) => ({
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
    // AnimePahe is sub-first; dub is rarely available, so ignore the flag.
    const session = await resolveSession(ref);
    if (!session) return null;

    const info = await pahe.fetchAnimeInfo(session);
    const ep = info?.episodes?.find((e: any) => e.number === episode) || info?.episodes?.[episode - 1];
    if (!ep?.id) return null;

    try {
      const src: any = await pahe.fetchEpisodeSources(ep.id);
      const sources: StreamResult["sources"] = (src?.sources || [])
        .map((s: any) => ({
          url: s.url,
          quality: s.quality || "default",
          isM3U8: s.isM3U8 !== false,
        }))
        .filter((s: any) => s.url);

      if (!sources.length) return null;
      return {
        provider: "animepahe",
        server: "animepahe",
        subOrDub: "sub",
        sources,
        subtitles: (src?.subtitles || []).map((t: any) => ({
          url: t.url,
          lang: t.lang || "sub",
        })),
        headers: src?.headers || {},
      };
    } catch {
      return null;
    }
  },
};
