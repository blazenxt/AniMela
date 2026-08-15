/**
 * AnimePahe provider — via `@consumet/extensions`, with a configurable domain.
 *
 * ⚠️ 2026 reality (documented in Anivexa-API and community trackers): the free
 * anime ecosystem collapsed — HiAnime and AnimeKai shut down permanently
 * (ACE legal action), the public Consumet API was retired, and AnimePahe is
 * behind a Cloudflare challenge from datacenter IPs. This provider remains as
 * the most viable *subbed* source, but its base domain must be configurable
 * because AnimePahe rotates between official mirrors.
 *
 * Official AnimePahe domains (per the site itself):
 *   animepahe.si · animepahe.com · animepahe.org
 *
 * Configure via `ANIMEPAHE_BASE` (default `https://animepahe.com`), and pick
 * whichever mirror currently resolves from your host. The scrape itself is
 * done locally by `@consumet/extensions` (no hosted API), so it runs on
 * Railway's clean egress — but Cloudflare may still challenge the request.
 */

import { ANIME } from "@consumet/extensions";
import { AnimeEpisode, AnimeRef, StreamProvider, StreamResult } from "../anime-stream";

const BASE = (process.env.ANIMEPAHE_BASE || "https://animepahe.com").replace(/\/+$/, "");

class ConfigurableAnimePahe extends ANIME.AnimePahe {
  constructor() {
    super();
    this.baseUrl = BASE;
  }
}

const pahe = new ConfigurableAnimePahe();

const sessionCache = new Map<string, string>();
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function titleOf(t: any): string {
  if (typeof t === "string") return t;
  return t?.romaji || t?.english || t?.native || "";
}

async function resolveSession(ref: AnimeRef): Promise<string | null> {
  const cacheKey = `${ref.title}::${ref.year || ""}`;
  const cached = sessionCache.get(cacheKey);
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

  if (match?.id) sessionCache.set(cacheKey, match.id);
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
    _dub: boolean
  ): Promise<StreamResult | null> {
    // AnimePahe is sub-only; dub is effectively unavailable.
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
