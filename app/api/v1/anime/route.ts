import { NextRequest } from "next/server";
import { animeList, animeSearch, animeGenres } from "@/lib/anime-meta";
import { ok, fail, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/anime
 *   ?type=series|movies   (default series)
 *   ?sort=popularity|rating|trending   (default popularity)
 *   ?page=1
 *   ?q=...                (optional — free-text search)
 *   ?genre=Action         (optional)
 *
 * Returns real anime metadata from AniList (Jikan fallback), replacing the
 * old TMDB "Animation + Japan" genre filter.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = (sp.get("type") || "series").toLowerCase();
  const sort = (sp.get("sort") || "popularity").toLowerCase();
  const q = sp.get("q") || "";
  const genre = sp.get("genre") || "";
  const page = Math.max(1, Number(sp.get("page") || "1") || 1);

  if (!["series", "movies"].includes(type)) {
    return fail(400, `Invalid type "${type}" — use "series" or "movies"`);
  }
  if (!["popularity", "rating", "trending"].includes(sort)) {
    return fail(400, `Invalid sort "${sort}" — use "popularity", "rating" or "trending"`);
  }

  try {
    if (q) {
      const data = await animeSearch(q, page);
      return ok(
        { page: data.page, has_next_page: data.hasNextPage, results: data.results },
        { type, sort, q }
      );
    }
    const data = await animeList({
      format: type as "series" | "movies",
      sort: sort as "popularity" | "rating" | "trending",
      genre: genre || undefined,
      page,
    });
    return ok(
      { page: data.page, has_next_page: data.hasNextPage, results: data.results },
      { type, sort }
    );
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
