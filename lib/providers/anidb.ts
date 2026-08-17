/**
 * AniDB provider — direct m3u8 with multiple qualities, no IP binding.
 *
 * Backed by https://anidb.app (the source used by the famous, actively
 * maintained `ani-cli` tool). It exposes clean JSON endpoints and direct HLS
 * master playlists with per-quality variants — unlike flixcloud, the streams
 * are NOT IP-bound, so they play straight through our server.
 *
 * Pipeline (reverse-engineered from ani-cli v5):
 *   GET /browse?q={query}                        → search (HTML cards)
 *   GET /api/frontend/anime/{id}/episodes        → { episodes: [{id, number}] }
 *   GET /api/frontend/episode/{id}/languages     → { languages: [{code, embed_url}] }
 *   GET {embed_url}                              → player HTML with `file: '…m3u8'`
 *   GET {master.m3u8}                            → EXT-X-STREAM-INF quality variants
 *
 * Language codes: "jpn" = Japanese (sub), "eng" = English (dub).
 */

import { AnimeEpisode, AnimeRef, StreamProvider, StreamResult } from "../anime-stream";

const BASE = (process.env.ANIDB_BASE || "https://anidb.app").replace(/\/+$/, "");
const TIMEOUT_MS = 15000;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function getText(path: string): Promise<string> {
  const url = /^https?:\/\//.test(path) ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`anidb ${res.status}`);
  return res.text();
}

async function getJson<T = any>(path: string): Promise<T> {
  const url = /^https?:\/\//.test(path) ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json, */*" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`anidb ${res.status}`);
  return (await res.json()) as T;
}

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

interface AnidbAnime {
  id: string; // "one-piece-3880" (slug + numeric)
  numericId: string; // "3880"
  title: string;
}

/**
 * Parse search results from the browse page HTML.
 *
 * Each result is an `<a href="…/anime/{slug-id}" title="{title}">…</a>` block
 * (the title may live in the anchor's `title` attr or the nested img's `alt`).
 * We split on `<a` boundaries (like ani-cli) so nested attrs are captured.
 */
function parseSearch(html: string): AnidbAnime[] {
  const blocks = html.split(/<a\b/i).slice(1);
  const out: AnidbAnime[] = [];
  for (const block of blocks) {
    const href = block.match(/href="[^"]*\/anime\/([a-z0-9-]+-\d+)"/i)?.[1];
    if (!href) continue;
    // title is on the anchor; fall back to nested img alt
    const title =
      block.match(/title="([^"]+)"/)?.[1] || block.match(/alt="([^"]+)"/)?.[1] || "";
    const numericId = href.match(/(\d+)$/)?.[1] || href;
    const clean = title.replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    if (clean && !out.some((r) => r.id === href)) out.push({ id: href, numericId, title: clean });
  }
  return out;
}

// in-memory title → anime cache
const cache = new Map<string, AnidbAnime>();

/** Search + resolve a title to an AniDB anime id (cached). */
async function resolveAnimeId(ref: AnimeRef): Promise<AnidbAnime | null> {
  const key = `${norm(ref.title)}::${ref.year || ""}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const html = await getText(`/browse?q=${encodeURIComponent(ref.title)}`);
  const results = parseSearch(html);
  if (!results.length) return null;

  const target = norm(ref.title);
  let best = results.find((r) => norm(r.title) === target);
  if (!best) best = results.find((r) => norm(r.title).includes(target));
  if (!best && ref.year) best = results.find((r) => r.title.includes(String(ref.year)));
  if (!best) best = results[0];

  cache.set(key, best);
  return best;
}

/** Resolve a quality label from a resolution height. */
function qualityLabel(h: number): string {
  if (h >= 2160) return "4K";
  if (h >= 1080) return "1080p";
  if (h >= 720) return "720p";
  if (h >= 480) return "480p";
  if (h >= 360) return "360p";
  if (h >= 240) return "240p";
  return `${h}p`;
}

/** Parse an HLS master playlist into quality→URL pairs (best first). */
function parseMaster(playlist: string, baseUrl: string): { quality: string; url: string }[] {
  const lines = playlist.split("\n");
  const out: { quality: string; url: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const info = lines[i].match(/RESOLUTION=\d+x(\d+)/i);
    if (info) {
      const uri = lines[i + 1]?.trim();
      if (uri && !uri.startsWith("#")) {
        const abs = new URL(uri, baseUrl).toString();
        const quality = qualityLabel(Number(info[1]));
        if (!out.some((o) => o.quality === quality)) out.push({ quality, url: abs });
      }
    }
  }
  return out.sort((a, b) => {
    const rank = (q: string) => Number(q.replace(/[^\d]/g, "")) || 0;
    return rank(b.quality) - rank(a.quality);
  });
}

export const AniDBProvider: StreamProvider = {
  id: "anidb",

  async searchAnime(query: string): Promise<AnimeRef[]> {
    const html = await getText(`/browse?q=${encodeURIComponent(query)}`);
    return parseSearch(html).slice(0, 20).map((r) => ({ title: r.title }));
  },

  async listEpisodes(ref: AnimeRef): Promise<AnimeEpisode[] | null> {
    const anime = await resolveAnimeId(ref);
    if (!anime) return null;
    const d = await getJson<any>(`/api/frontend/anime/${anime.numericId}/episodes`);
    const eps: AnimeEpisode[] = (d?.episodes || []).map((e: any) => ({
      id: String(e.id),
      number: e.number,
      isFiller: !!e.filler,
    }));
    return eps.length ? eps : null;
  },

  async resolveEpisode(
    ref: AnimeRef,
    episode: number,
    dub: boolean
  ): Promise<StreamResult | null> {
    const anime = await resolveAnimeId(ref);
    if (!anime) return null;

    // get the episode's numeric id
    const d = await getJson<any>(`/api/frontend/anime/${anime.numericId}/episodes`);
    const ep = (d?.episodes || []).find((e: any) => e.number === episode);
    if (!ep?.id) return null;

    // languages → embed urls (jpn=sub, eng=dub)
    const lang = await getJson<any>(`/api/frontend/episode/${ep.id}/languages`);
    const langs: any[] = lang?.languages || [];
    const wanted = dub ? ["eng", "jpn"] : ["jpn", "eng"];
    const pick = wanted.map((code) => langs.find((l) => l.code === code)).find(Boolean);
    if (!pick?.embed_url) return null;

    // embed page → extract `file: '…m3u8'` (master playlist)
    const embedToken = pick.embed_url.split("/").pop() || "";
    const embed = await getText(`/embed/${encodeURIComponent(embedToken)}`);
    const master = embed.match(/file:\s*['"]([^'"]+)['"]/)?.[1];
    if (!master) return null;

    // master playlist → quality variants (resolve relative against embed page URL)
    const masterUrl = /^https?:\/\//.test(master) ? master : new URL(master, `${BASE}/embed/${embedToken}`).toString();
    const playlist = await getText(masterUrl);
    const qualities = parseMaster(playlist, masterUrl);

    // If no per-quality variants parsed, the master itself is the source.
    const sources = qualities.length
      ? qualities.map((q) => ({ url: q.url, quality: q.quality, isM3U8: true }))
      : [{ url: masterUrl, quality: "default", isM3U8: true }];

    return {
      provider: "anidb",
      server: "AniDB",
      subOrDub: pick.code === "eng" ? "dub" : "sub",
      sources,
      subtitles: [],
      headers: {},
    };
  },
};
