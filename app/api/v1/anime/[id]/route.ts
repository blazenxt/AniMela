import { animeDetail } from "@/lib/anime-meta";
import { ok, fail, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/** GET /api/v1/anime/{anilistId} — full anime detail. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || !/^\d+$/.test(id)) {
    return fail(400, "Invalid id — must be a numeric AniList id");
  }

  try {
    const data = await animeDetail(id);
    if (!data) return fail(404, "Anime not found");
    return ok(data);
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
