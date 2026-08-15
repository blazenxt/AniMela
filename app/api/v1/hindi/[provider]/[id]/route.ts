import { movieDetail } from "@/lib/movie-sources";
import { ok, fail, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/** GET /api/v1/hindi/{provider}/{id} — movie detail + download links. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string; id: string }> }
) {
  const { provider, id } = await params;
  if (!provider || !id) return fail(400, "provider and id are required");

  try {
    const data = await movieDetail(provider, id);
    if (!data) return fail(404, "Movie not found");
    return ok(data);
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
