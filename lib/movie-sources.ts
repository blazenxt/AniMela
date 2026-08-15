/**
 * Desi/Hindi movie sources — provider abstraction with ordered fallback.
 *
 * These are Hindi-dubbed / Bollywood / regional **download** sites (not stream
 * APIs). They expose title, poster, metadata and download links (Google Drive /
 * GDToT behind link shorteners) — no clean HLS stream, so AniMela surfaces them
 * as "watch/download" links rather than feeding the HTML5 player.
 *
 * Provider order is configurable via `MOVIE_PROVIDER_ORDER` (comma-separated,
 * default "sevenhitmovies"). Server-side only.
 */

export interface HindiMovieItem {
  provider: string;
  id: string; // provider-native id (e.g. WordPress post id)
  title: string;
  slug?: string;
  link: string; // original post URL
  image?: string;
  date?: string;
}

export interface HindiMovieLink {
  label: string; // e.g. "1080p [1.81GB]"
  url: string; // shortener → Google Drive / GDToT
}

export interface HindiMovieDetail {
  provider: string;
  id: string;
  title: string;
  slug?: string;
  link: string;
  image?: string;
  date?: string;
  year?: string;
  rating?: string; // IMDB e.g. "6.6"
  plot?: string;
  links: HindiMovieLink[];
}

export interface MovieSourceProvider {
  id: string;
  search(query: string, page?: number): Promise<HindiMovieItem[]>;
  recent(page?: number): Promise<HindiMovieItem[]>;
  detail(id: string): Promise<HindiMovieDetail | null>;
}

import { SevenHitMoviesProvider } from "./providers/sevenhitmovies";

const PROVIDERS: Record<string, MovieSourceProvider> = {
  sevenhitmovies: SevenHitMoviesProvider,
};

const ORDER = (process.env.MOVIE_PROVIDER_ORDER || "sevenhitmovies")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const FAIL_COOLDOWN_MS = 60_000;
const cooldown = new Map<string, { until: number; lastError: string }>();

function providerList(): MovieSourceProvider[] {
  const seen = new Set<string>();
  const out: MovieSourceProvider[] = [];
  for (const id of [...ORDER, ...Object.keys(PROVIDERS)]) {
    if (seen.has(id) || !PROVIDERS[id]) continue;
    seen.add(id);
    out.push(PROVIDERS[id]);
  }
  return out;
}

function healthy(p: MovieSourceProvider): boolean {
  const entry = cooldown.get(p.id);
  if (!entry || Date.now() > entry.until) return true;
  return false;
}

async function attempt<T>(
  p: MovieSourceProvider,
  fn: () => Promise<T | null>
): Promise<T | null> {
  try {
    const result = await fn();
    if (result) {
      cooldown.delete(p.id);
      return result;
    }
    cooldown.set(p.id, { until: Date.now() + FAIL_COOLDOWN_MS, lastError: "no result" });
    return null;
  } catch (e) {
    cooldown.set(p.id, {
      until: Date.now() + FAIL_COOLDOWN_MS,
      lastError: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export async function searchMovies(query: string, page = 1): Promise<HindiMovieItem[]> {
  const out: HindiMovieItem[] = [];
  for (const p of providerList()) {
    if (!healthy(p)) continue;
    const results = await attempt(p, () => p.search(query, page));
    if (results?.length) out.push(...results);
  }
  return out;
}

export async function recentMovies(page = 1): Promise<HindiMovieItem[]> {
  const out: HindiMovieItem[] = [];
  for (const p of providerList()) {
    if (!healthy(p)) continue;
    const results = await attempt(p, () => p.recent(page));
    if (results?.length) out.push(...results);
  }
  return out;
}

export async function movieDetail(
  provider: string,
  id: string
): Promise<HindiMovieDetail | null> {
  const p = PROVIDERS[provider];
  if (!p) return null;
  return attempt(p, () => p.detail(id));
}
