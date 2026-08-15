/**
 * SevenHitMovies provider — WordPress REST API (no HTML scraping needed).
 *
 * 7hitmovies.net is a WordPress site, so its public REST API gives clean JSON:
 *   GET /wp-json/wp/v2/posts?search={q}&page={p}&_embed     → posts
 *   GET /wp-json/wp/v2/posts/{id}?_embed                    → single post
 *
 * Each post is a movie/web-series page whose content.rendered HTML contains the
 * download links (Google Drive / GDToT behind a shortener like mobilejsr.com).
 * This provider extracts those links and light metadata (year, IMDB, plot).
 *
 * Configurable via `SEVENHITMOVIES_BASE` (default https://7hitmovies.net) —
 * these sites rotate domains frequently.
 */

import { HindiMovieDetail, HindiMovieItem, HindiMovieLink, MovieSourceProvider } from "../movie-sources";

const BASE = (process.env.SEVENHITMOVIES_BASE || "https://7hitmovies.net").replace(/\/+$/, "");
const TIMEOUT_MS = 10000;

async function getJson<T = any>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`sevenhitmovies ${res.status}`);
  return (await res.json()) as T;
}

function featuredImage(post: any): string | undefined {
  const media = post?._embedded?.["wp:featuredmedia"];
  return media?.[0]?.source_url || undefined;
}

/** Strip HTML + decode entities, collapse whitespace. */
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract external download links (label + href) from content HTML. */
function extractLinks(html: string): HindiMovieLink[] {
  const links: HindiMovieLink[] = [];
  const re = /<a\s[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    const label = htmlToText(m[2]).replace(/\s+/g, " ").trim();
    if (!label) continue;
    // skip in-site navigation + obvious noise
    if (url.includes("7hitmovies.net") || url.includes("7hit.org")) continue;
    if (/^(Previous|Next|Home|Skip|Top|Read more)/i.test(label)) continue;
    links.push({ label, url });
  }
  return links;
}

function mapItem(provider: string, post: any): HindiMovieItem {
  return {
    provider,
    id: String(post.id),
    title: htmlToText(post.title?.rendered || ""),
    slug: post.slug || undefined,
    link: post.link || `${BASE}/${post.slug || post.id}`,
    image: featuredImage(post),
    date: post.date || undefined,
  };
}

export const SevenHitMoviesProvider: MovieSourceProvider = {
  id: "sevenhitmovies",

  async search(query: string, page = 1): Promise<HindiMovieItem[]> {
    const d = await getJson<any[]>(
      `/wp-json/wp/v2/posts?search=${encodeURIComponent(query)}&per_page=20&page=${page}&_embed`
    );
    return (d || []).map((p) => mapItem("sevenhitmovies", p));
  },

  async recent(page = 1): Promise<HindiMovieItem[]> {
    const d = await getJson<any[]>(
      `/wp-json/wp/v2/posts?per_page=20&page=${page}&_embed`
    );
    return (d || []).map((p) => mapItem("sevenhitmovies", p));
  },

  async detail(id: string): Promise<HindiMovieDetail | null> {
    const post = await getJson<any>(`/wp-json/wp/v2/posts/${id}?_embed`);
    if (!post?.id) return null;

    const contentHtml = post.content?.rendered || "";
    const text = htmlToText(contentHtml);

    const year = (post.title?.rendered || "").match(/\((\d{4})\)/)?.[1];
    const rating = text.match(/(\d+(?:\.\d+)?)\s*\/\s*10/)?.[1];
    const plot = text.match(/Plot\s*:\s*([\s\S]*?)(?:Screenshots|Download Links|$)/i)?.[1];

    return {
      provider: "sevenhitmovies",
      id: String(post.id),
      title: htmlToText(post.title?.rendered || ""),
      slug: post.slug || undefined,
      link: post.link || `${BASE}/${post.slug || post.id}`,
      image: featuredImage(post),
      date: post.date || undefined,
      year,
      rating,
      plot: plot ? htmlToText(plot).slice(0, 800) || undefined : undefined,
      links: extractLinks(contentHtml),
    };
  },
};
