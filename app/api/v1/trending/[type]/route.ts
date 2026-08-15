import { NextRequest } from "next/server";
import { tmdb } from "@/lib/server-api";
import { ok, fail, options, normalize } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const VALID = ["movies", "tv", "all"] as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || "1") || 1);

  if (!VALID.includes(type as any)) {
    return fail(400, `Invalid type "${type}" — use one of: ${VALID.join(", ")}`);
  }

  const kind = type === "movies" ? "movie" : type;
  try {
    const data = await tmdb<any>(`/trending/${kind}/week?page=${page}`);
    return ok(
      { page: data.page, total_pages: data.total_pages, total_results: data.total_results, results: (data.results || []).map(normalize) },
      { page, type: kind }
    );
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
