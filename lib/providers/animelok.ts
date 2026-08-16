/**
 * Animelok provider — a LIVE, working anime stream source (2026).
 *
 * animelok.live (rebrand of Animerulz / Hiddenleaf) is an Indian-focused anime
 * site streaming in Japanese + English + regional dubs (Hindi, Telugu, Tamil,
 * Malayalam, Bengali, Kannada). Critically, its watch page server-side renders
 * the direct HLS (.m3u8) URL into the HTML — so we can extract streams with a
 * plain fetch, no JS execution and no captcha.
 *
 * Endpoints (all server-side rendered, no JSON API):
 *   GET /search?keyword={q}        → anime cards with /anime/{hexId} links
 *   GET /anime/{hexId}             → metadata (title, year, episode counts)
 *   GET /watch/{hexId}?ep={n}      → player page with embedded m3u8 URL
 *
 * The m3u8 URL is signed (JWT `token` param, ~6h expiry), so we resolve at
 * play time and cache the result only briefly.
 */

import { AnimeEpisode, AnimeRef, StreamProvider, StreamResult } from "../anime-stream";

const BASE = (process.env.ANIMELOK_BASE || "https://animelok.live").replace(/\/+$/, "");
const TIMEOUT_MS = 15000;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function getHtml(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`animelok ${res.status}`);
  return res.text();
}

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolved anime identity: hex id + known episode count. */
interface Resolved {
  id: string;
  episodes: number | null;
}

// in-memory title → resolved-id cache (anime ids are stable)
const cache = new Map<string, Resolved>();

/** Find the hex id (and episode count) for an anime by searching its title. */
async function resolveAnime(ref: AnimeRef): Promise<Resolved | null> {
  const key = `${norm(ref.title)}::${ref.year || ""}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const html = await getHtml(`/search?keyword=${encodeURIComponent(ref.title)}`);

  // Each result card is an <a href="/anime/{hexId}">…</a>. Capture id + inner.
  const cards: { id: string; text: string }[] = [];
  const re = /href="\/anime\/([a-f0-9]{6,})"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    const text = stripHtml(m[2]);
    if (!cards.some((c) => c.id === id)) cards.push({ id, text });
  }
  if (!cards.length) return null;

  const target = norm(ref.title);

  // 1) exact normalized-title match
  let best = cards.find((c) => norm(c.text.split(/\d+\s*EPS/i)[0]) === target);
  // 2) title appears as a substring of the card text
  if (!best) best = cards.find((c) => norm(c.text).includes(target));
  // 3) year match
  if (!best && ref.year) {
    best = cards.find((c) => c.text.includes(String(ref.year)));
  }
  // 4) first result (search relevance)
  if (!best) best = cards[0];

  const epMatch = best.text.match(/(\d+)\s*EPS/i);
  const resolved: Resolved = { id: best.id, episodes: epMatch ? Number(epMatch[1]) : null };
  cache.set(key, resolved);
  return resolved;
}

/** Extract the signed m3u8 URL from a watch page. */
function extractM3u8(html: string): string | null {
  const m = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
  return m ? m[0].replace(/&amp;/g, "&") : null;
}

export const AnimelokProvider: StreamProvider = {
  id: "animelok",

  async searchAnime(query: string): Promise<AnimeRef[]> {
    const html = await getHtml(`/search?keyword=${encodeURIComponent(query)}`);
    const out: AnimeRef[] = [];
    const re = /href="\/anime\/([a-f0-9]{6,})"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const text = stripHtml(m[2]);
      const title = text.split(/\d+\s*EPS/i)[0].trim();
      const year = text.match(/\b(19|20)\d{2}\b/)?.[0];
      if (title) out.push({ title, year: year ? Number(year) : undefined });
    }
    return out.slice(0, 20);
  },

  async listEpisodes(ref: AnimeRef): Promise<AnimeEpisode[] | null> {
    const resolved = await resolveAnime(ref);
    if (!resolved || !resolved.episodes || resolved.episodes < 1) return null;

    // Build the episode list 1..N. For very long series this is large but
    // matches how the site presents episodes (all numbers clickable).
    const count = Math.min(resolved.episodes, 2000);
    const eps: AnimeEpisode[] = [];
    for (let n = 1; n <= count; n++) {
      eps.push({ id: `${resolved.id}:${n}`, number: n });
    }
    return eps;
  },

  async resolveEpisode(
    ref: AnimeRef,
    episode: number,
    _dub: boolean
  ): Promise<StreamResult | null> {
    const resolved = await resolveAnime(ref);
    if (!resolved) return null;

    try {
      const html = await getHtml(`/watch/${resolved.id}?ep=${episode}`);
      const m3u8 = extractM3u8(html);
      if (!m3u8) return null;

      return {
        provider: "animelok",
        server: "Animelok",
        // Animelok's default is Japanese sub; dubs are selectable in its player.
        // We resolve the default stream and let the user's player play it.
        subOrDub: "sub",
        sources: [{ url: m3u8, quality: "default", isM3U8: true }],
        subtitles: [],
        headers: { Referer: `${BASE}/` },
      };
    } catch {
      return null;
    }
  },
};
