/**
 * Anime stream resolver — provider abstraction with ordered fallback.
 *
 * Mirrors the architecture used by Tatakai ("Toko" providers) and the wider
 * anime-scraper ecosystem: every source implements one `StreamProvider`
 * contract; a dead provider is skipped (health cooldown) without touching the
 * UI, and the resolver returns the first playable result.
 *
 * Provider order is configurable via `ANIME_PROVIDER_ORDER` (comma-separated,
 * default "hianime,consumet"). Server-side only — client goes through
 * `/api/v1/anime/{id}/episodes` and `/api/v1/anime/{id}/stream`.
 */

export interface AnimeEpisode {
  id: string; // provider episode id (used to resolve the stream)
  number: number; // 1-based episode number
  title?: string;
  image?: string;
  isFiller?: boolean;
}

export interface EpisodeSource {
  url: string; // .m3u8 (HLS) or .mp4
  quality: string; // "1080p" | "720p" | "default" | "backup"
  isM3U8: boolean;
}

export interface StreamResult {
  provider: string;
  server: string;
  subOrDub: "sub" | "dub";
  sources: EpisodeSource[];
  subtitles: { url: string; lang: string }[];
  /** Referer/Origin required by some CDNs — forwarded to the player's HLS loader. */
  headers?: Record<string, string>;
}

/** Minimal reference used to locate an anime across providers. */
export interface AnimeRef {
  anilistId?: number;
  malId?: number;
  title: string;
  year?: number;
  format?: string;
}

export interface StreamProvider {
  id: string;
  searchAnime(query: string): Promise<AnimeRef[]>;
  listEpisodes(ref: AnimeRef): Promise<AnimeEpisode[] | null>;
  resolveEpisode(ref: AnimeRef, episode: number, dub: boolean): Promise<StreamResult | null>;
}

import { HiAnimeProvider } from "./providers/hianime";
import { ConsumetProvider } from "./providers/consumet";

const PROVIDERS: Record<string, StreamProvider> = {
  hianime: HiAnimeProvider,
  consumet: ConsumetProvider,
};

const ORDER = (process.env.ANIME_PROVIDER_ORDER || "hianime,consumet")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const FAIL_COOLDOWN_MS = 60_000; // skip a failing provider for 1 min

/** provider id → timestamp until which it is skipped */
const cooldown = new Map<string, number>();

function providerList(): StreamProvider[] {
  // configured order first, then any remaining known providers, deduped
  const seen = new Set<string>();
  const out: StreamProvider[] = [];
  for (const id of [...ORDER, ...Object.keys(PROVIDERS)]) {
    if (seen.has(id) || !PROVIDERS[id]) continue;
    seen.add(id);
    out.push(PROVIDERS[id]);
  }
  return out;
}

function healthy(p: StreamProvider): boolean {
  const until = cooldown.get(p.id) || 0;
  return Date.now() > until;
}

async function attempt<T>(p: StreamProvider, fn: () => Promise<T | null>): Promise<T | null> {
  try {
    const result = await fn();
    if (result) {
      cooldown.delete(p.id);
      return result;
    }
    cooldown.set(p.id, Date.now() + FAIL_COOLDOWN_MS);
    return null;
  } catch {
    cooldown.set(p.id, Date.now() + FAIL_COOLDOWN_MS);
    return null;
  }
}

/** Resolve the episode list, trying providers in order until one succeeds. */
export async function listEpisodes(ref: AnimeRef): Promise<AnimeEpisode[] | null> {
  for (const p of providerList()) {
    if (!healthy(p)) continue;
    const eps = await attempt(p, () => p.listEpisodes(ref));
    if (eps && eps.length) return eps;
  }
  return null;
}

/** Resolve a playable stream for a single episode, with fallback. */
export async function resolveEpisode(
  ref: AnimeRef,
  episode: number,
  dub = false
): Promise<StreamResult | null> {
  for (const p of providerList()) {
    if (!healthy(p)) continue;
    const result = await attempt(p, () => p.resolveEpisode(ref, episode, dub));
    if (result && result.sources.length) return result;
  }
  return null;
}

/** Free-text search across providers (first provider that returns results). */
export async function searchAnime(query: string): Promise<AnimeRef[]> {
  for (const p of providerList()) {
    if (!healthy(p)) continue;
    const results = await attempt(p, () => p.searchAnime(query));
    if (results && results.length) return results;
  }
  return [];
}
