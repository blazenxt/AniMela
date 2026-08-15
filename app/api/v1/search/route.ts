import { NextRequest } from "next/server";
import { tmdb } from "@/lib/server-api";
import { ok, fail, options, normalize } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || "1") || 1);

  if (!q) return fail(400, "Missing required query param: q");

  try {
    const data = await tmdb<any>(`/search/multi?query=${encodeURIComponent(q)}&page=${page}`);
    return ok(
      {
        page: data.page,
        total_pages: data.total_pages,
        total_results: data.total_results,
        results: (data.results || [])
          .filter((r: any) => r.media_type !== "person")
          .map(normalize),
      },
      { query: q, page }
    );
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
