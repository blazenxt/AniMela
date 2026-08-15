import { tmdb } from "@/lib/server-api";
import { ok, fail, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const data = await tmdb<any>(`/movie/${id}/credits`);
    return ok({ cast: data.cast || [], crew: data.crew || [] });
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
