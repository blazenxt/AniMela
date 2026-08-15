import { NextRequest } from "next/server";
import { animeSearch } from "@/lib/anime-meta";
import { ok, fail, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/** GET /api/v1/anime/search?q=...&page=1 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") || "";
  const page = Math.max(1, Number(sp.get("page") || "1") || 1);

  if (!q.trim()) return fail(400, "Missing required param: q");

  try {
    const data = await animeSearch(q, page);
    return ok(
      { page: data.page, has_next_page: data.hasNextPage, results: data.results },
      { q }
    );
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
