import { NextRequest } from "next/server";
import { searchMovies } from "@/lib/movie-sources";
import { ok, fail, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/** GET /api/v1/hindi/search?q=...&page=1 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") || "";
  const page = Math.max(1, Number(sp.get("page") || "1") || 1);

  if (!q.trim()) return fail(400, "Missing required param: q");

  try {
    const results = await searchMovies(q, page);
    return ok({ results }, { q, page });
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
