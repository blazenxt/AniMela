import { animeDetail } from "@/lib/anime-meta";
import { listEpisodes } from "@/lib/anime-stream";
import { ok, fail, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/v1/anime/{anilistId}/episodes — episode list resolved from providers. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || !/^\d+$/.test(id)) {
    return fail(400, "Invalid id — must be a numeric AniList id");
  }

  try {
    // Build a provider ref from AniList metadata (cached) so providers can
    // locate the anime by title even without a shared id scheme.
    const detail = await animeDetail(id);
    if (!detail) return fail(404, "Anime not found");

    const eps = await listEpisodes({
      anilistId: detail.id,
      malId: detail.malId ?? undefined,
      title: detail.title,
      year: detail.seasonYear ?? undefined,
      format: detail.format ?? undefined,
    });

    if (!eps || !eps.length) {
      return ok({ available: false, episodes: [] });
    }
    return ok({ available: true, episodes: eps });
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
