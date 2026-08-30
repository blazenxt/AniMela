import { NextRequest } from "next/server";
import { recentMovies } from "@/lib/movie-sources";
import { ok, fail, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/** GET /api/v1/hindi/recent?page=1 */
export async function GET(req: NextRequest) {
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || "1") || 1);

  try {
    const results = await recentMovies(page);
    return ok({ results }, { page });
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
