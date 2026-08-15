import { NextRequest } from "next/server";
import { tmdb } from "@/lib/server-api";
import { ok, fail, options, normalize } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || "1") || 1);
  try {
    const data = await tmdb<any>(`/tv/${id}/similar?page=${page}`);
    return ok({ ...data, results: (data.results || []).map(normalize) });
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
