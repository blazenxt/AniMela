import { NextRequest } from "next/server";
import { tmdb } from "@/lib/server-api";
import { ok, fail, options, normalize } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = (sp.get("type") || "series").toLowerCase(); // series | movies
  const sort = (sp.get("sort") || "popularity").toLowerCase(); // popularity | rating
  const page = Math.max(1, Number(sp.get("page") || "1") || 1);

  if (!["series", "movies"].includes(type)) {
    return fail(400, `Invalid type "${type}" — use "series" or "movies"`);
  }
  if (!["popularity", "rating"].includes(sort)) {
    return fail(400, `Invalid sort "${sort}" — use "popularity" or "rating"`);
  }

  const kind = type === "series" ? "tv" : "movie";
  const sortBy = sort === "rating" ? "vote_average.desc" : "popularity.desc";

  try {
    const data = await tmdb<any>(
      `/discover/${kind}?with_genres=16&with_origin_country=JP&sort_by=${sortBy}&include_adult=false&page=${page}`
    );
    return ok(
      { page: data.page, total_pages: data.total_pages, results: (data.results || []).map(normalize) },
      { type: kind, sort }
    );
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
