/**
 * HiAnime provider — backed by the maintained `aniwatch` npm package.
 *
 * `aniwatch` (https://github.com/ghoshRitesh12/aniwatch) scrapes hianime.to /
 * hianimez.to directly and handles the fragile parts for us — endpoint churn,
 * HTML parsing, and the AES decryption of the `sources` payload. We depend on a
 * maintained package instead of hand-rolling the scraper (which broke the
 * moment HiAnime rotated its endpoints/encryption), so fixes flow in via
 * dependency bumps rather than code edits here.
 *
 * Methods used:
 *   searchSuggestions(q)  → { suggestions: [{ id (slug), name, jname }] }
 *   getEpisodes(slug)     → { episodes: [{ episodeId, number, title, isFiller }] }
 *   getEpisodeSources(episodeId, server, category) → { sources, subtitles, headers }
 */

import { HiAnime } from "aniwatch";
import { AnimeEpisode, AnimeRef, StreamProvider, StreamResult } from "../anime-stream";

const scraper = new HiAnime.Scraper();

const SERVERS = ["hd-1", "hd-2", "megacloud", "streamsb", "streamtape"] as const;

// slug cache so list→resolve doesn't re-search
const slugCache = new Map<string, string>();

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

async function resolveSlug(ref: AnimeRef): Promise<string | null> {
  const cacheKey = `${ref.title}::${ref.year || ""}`;
  const cached = slugCache.get(cacheKey);
  if (cached) return cached;

  const d = await scraper.searchSuggestions(ref.title);
  const suggestions = d?.suggestions || [];
  if (!suggestions.length) return null;

  const target = norm(ref.title);
  const match =
    suggestions.find((s) => norm(s.name || "") === target || norm(s.jname || "") === target) ||
    suggestions[0];

  if (match?.id) slugCache.set(cacheKey, match.id);
  return match?.id || null;
}

export const HiAnimeProvider: StreamProvider = {
  id: "hianime",

  async searchAnime(query: string): Promise<AnimeRef[]> {
    const d = await scraper.searchSuggestions(query);
    return (d?.suggestions || []).map((s: any) => ({
      title: s.name || s.jname || "",
    }));
  },

  async listEpisodes(ref: AnimeRef): Promise<AnimeEpisode[] | null> {
    const slug = await resolveSlug(ref);
    if (!slug) return null;
    const d = await scraper.getEpisodes(slug);
    const eps: AnimeEpisode[] = (d?.episodes || []).map((e: any) => ({
      id: e.episodeId,
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
    const slug = await resolveSlug(ref);
    if (!slug) return null;

    const d = await scraper.getEpisodes(slug);
    const ep = d?.episodes?.find((e: any) => e.number === episode) || d?.episodes?.[episode - 1];
    if (!ep?.episodeId) return null;

    // prefer requested audio, fall back to the other; try servers in order
    const categories: ("sub" | "dub")[] = dub ? ["dub", "sub"] : ["sub", "dub"];
    for (const category of categories) {
      for (const server of SERVERS) {
        try {
          const src: any = await scraper.getEpisodeSources(ep.episodeId, server, category);
          const sources: StreamResult["sources"] = (src?.sources || [])
            .map((s: any) => ({
              url: s.url,
              quality: s.quality || "default",
              isM3U8: s.isM3U8 !== false,
            }))
            .filter((s: any) => s.url);

          if (sources.length) {
            return {
              provider: "hianime",
              server,
              subOrDub: category,
              sources,
              subtitles: (src?.subtitles || []).map((t: any) => ({
                url: t.url,
                lang: t.lang || "sub",
              })),
              headers: src?.headers || { Referer: "https://hianime.to/" },
            };
          }
        } catch {
          // try next server / category
        }
      }
    }

    return null;
  },
};
