/**
 * AniList GraphQL — shared types, query builders and result mappers.
 *
 * AniList (https://anilist.co) is a free anime/manga database with a public
 * GraphQL API (no key for read-only queries). We use it as the **identity and
 * metadata spine** for AniMela's anime section, replacing the old TMDB
 * "Animation + Japan" filter hack (which had no Japanese titles, studios,
 * MAL score, airing status or proper episode counts).
 *
 * This file is pure/declarative (no fetch, no cache) so it can be imported
 * from both server route handlers and the client without pulling in Node-only
 * APIs. Actual network + caching lives in `lib/anime-meta.ts` (server only).
 */

export type AnimeFormat =
  | "TV"
  | "TV_SHORT"
  | "MOVIE"
  | "SPECIAL"
  | "OVA"
  | "ONA"
  | "MUSIC";

export type AnimeStatus =
  | "FINISHED"
  | "RELEASING"
  | "NOT_YET_RELEASED"
  | "CANCELLED"
  | "HIATUS";

export type AnimeSort = "trending" | "popularity" | "rating";

export interface AnimeItem {
  id: number; // AniList media id
  malId?: number | null;
  title: string; // romaji (canonical display title)
  englishTitle?: string | null;
  nativeTitle?: string | null;
  description?: string | null; // HTML — strip before rendering
  coverImage?: string | null; // full URL (AniList CDN)
  bannerImage?: string | null; // full URL
  format?: AnimeFormat | null;
  episodes?: number | null;
  duration?: number | null; // minutes per episode
  averageScore?: number | null; // 0–100 (MAL-style)
  popularity?: number | null;
  status?: AnimeStatus | null;
  season?: string | null; // WINTER / SPRING / SUMMER / FALL
  seasonYear?: number | null;
  genres?: string[];
  studios?: string[];
  isAdult?: boolean;
}

/** Sort mappings — AniList's `MediaSort` enum values. */
export const SORT_TO_MEDIA_SORT: Record<AnimeSort, string[]> = {
  trending: ["TRENDING_DESC", "POPULARITY_DESC"],
  popularity: ["POPULARITY_DESC"],
  rating: ["SCORE_DESC"],
};

/** Formats we treat as "series" (everything episodic that isn't a movie). */
export const SERIES_FORMATS: AnimeFormat[] = [
  "TV",
  "TV_SHORT",
  "ONA",
  "OVA",
  "SPECIAL",
];

/** A curated, stable genre list we expose to the UI (AniList string genres). */
export const ANIME_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Ecchi",
  "Fantasy",
  "Horror",
  "Mahou Shoujo",
  "Mecha",
  "Music",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
];

const MEDIA_LIST_FRAGMENT = /* GraphQL */ `
  id
  idMal
  title {
    romaji
    english
    native
  }
  coverImage {
    extraLarge
    large
  }
  bannerImage
  format
  episodes
  duration
  averageScore
  popularity
  status
  season
  seasonYear
  genres
  studios(isMain: true) {
    nodes {
      name
    }
  }
  isAdult
`;

const MEDIA_DETAIL_FRAGMENT = /* GraphQL */ `
  id
  idMal
  title {
    romaji
    english
    native
  }
  description(asHtml: true)
  coverImage {
    extraLarge
    large
  }
  bannerImage
  format
  episodes
  duration
  averageScore
  popularity
  status
  season
  seasonYear
  genres
  studios(isMain: true) {
    nodes {
      name
    }
  }
  isAdult
`;

export interface PageInfo {
  hasNextPage: boolean;
  currentPage: number;
  lastPage: number;
  total: number;
  perPage: number;
}

export interface PageResult {
  page: number;
  hasNextPage: boolean;
  results: AnimeItem[];
}

/** Query: paginated list (browse by format / sort / genre, or free search). */
export function listQuery(
  opts: {
    search?: string;
    format?: "series" | "movies";
    sort?: AnimeSort;
    genre?: string;
    page?: number;
  } = {}
) {
  const formats = opts.format
    ? opts.format === "movies"
      ? ["MOVIE"]
      : SERIES_FORMATS
    : undefined;

  return {
    query: /* GraphQL */ `
      query ($page: Int, $search: String, $sort: [MediaSort], $genre: String, $formats: [MediaFormat]) {
        Page(page: $page, perPage: 20) {
          pageInfo { hasNextPage currentPage lastPage total perPage }
          media(search: $search, type: ANIME, sort: $sort, genre: $genre, format_in: $formats, isAdult: false) {
            ${MEDIA_LIST_FRAGMENT}
          }
        }
      }
    `,
    variables: {
      page: opts.page ?? 1,
      search: opts.search || undefined,
      sort: SORT_TO_MEDIA_SORT[opts.sort ?? "popularity"],
      genre: opts.genre || undefined,
      formats,
    },
  };
}

/** Query: single media by AniList id. */
export function detailQuery(id: number | string) {
  return {
    query: /* GraphQL */ `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          ${MEDIA_DETAIL_FRAGMENT}
        }
      }
    `,
    variables: { id: Number(id) },
  };
}

/** Map an AniList `media` node → our `AnimeItem` shape. */
export function mapMedia(m: any): AnimeItem | null {
  if (!m) return null;
  return {
    id: m.id,
    malId: m.idMal ?? null,
    title: m.title?.romaji || m.title?.english || m.title?.native || "Untitled",
    englishTitle: m.title?.english ?? null,
    nativeTitle: m.title?.native ?? null,
    description: m.description ?? null,
    coverImage: m.coverImage?.extraLarge || m.coverImage?.large || null,
    bannerImage: m.bannerImage ?? null,
    format: m.format ?? null,
    episodes: m.episodes ?? null,
    duration: m.duration ?? null,
    averageScore: m.averageScore ?? null,
    popularity: m.popularity ?? null,
    status: m.status ?? null,
    season: m.season ?? null,
    seasonYear: m.seasonYear ?? null,
    genres: Array.isArray(m.genres) ? m.genres : [],
    studios: (m.studios?.nodes || []).map((s: any) => s?.name).filter(Boolean),
    isAdult: !!m.isAdult,
  };
}

/** Strip HTML tags / entities from AniList's HTML synopsis. */
export function stripHtml(html?: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Human-friendly format label (e.g. "TV" → "TV Series"). */
export function formatLabel(format?: AnimeFormat | null): string {
  switch (format) {
    case "TV":
      return "TV Series";
    case "TV_SHORT":
      return "TV Short";
    case "MOVIE":
      return "Movie";
    case "SPECIAL":
      return "Special";
    case "OVA":
      return "OVA";
    case "ONA":
      return "ONA";
    case "MUSIC":
      return "Music";
    default:
      return "Anime";
  }
}

/** Human-friendly status label. */
export function statusLabel(status?: AnimeStatus | null): string {
  switch (status) {
    case "FINISHED":
      return "Finished";
    case "RELEASING":
      return "Currently Airing";
    case "NOT_YET_RELEASED":
      return "Upcoming";
    case "CANCELLED":
      return "Cancelled";
    case "HIATUS":
      return "On Hiatus";
    default:
      return "";
  }
}
