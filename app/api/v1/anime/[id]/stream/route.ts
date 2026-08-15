import { animeDetail } from "@/lib/anime-meta";
import { resolveEpisode } from "@/lib/anime-stream";
import { ok, fail, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/v1/anime/{anilistId}/stream?ep={n}&dub={0|1}
 *
 * Resolves a playable HLS stream for one episode, trying providers in order
 * (HiAnime → Consumet) and returning the first success.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || !/^\d+$/.test(id)) {
    return fail(400, "Invalid id — must be a numeric AniList id");
  }

  const sp = new URL(req.url).searchParams;
  const ep = Number(sp.get("ep"));
  const dub = (sp.get("dub") || "0") === "1";

  if (!Number.isInteger(ep) || ep < 1) {
    return fail(400, "Missing/invalid param: ep (1-based episode number)");
  }

  try {
    const detail = await animeDetail(id);
    if (!detail) return fail(404, "Anime not found");

    const { result, errors } = await resolveEpisode(
      {
        anilistId: detail.id,
        malId: detail.malId ?? undefined,
        title: detail.title,
        year: detail.seasonYear ?? undefined,
        format: detail.format ?? undefined,
      },
      ep,
      dub
    );

    if (!result) {
      return ok({ available: false, reason: "No playable source found", errors });
    }
    return ok({ available: true, ...result, errors });
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
