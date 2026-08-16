import { animeDetail } from "@/lib/anime-meta";
import { listAnimelokServers, listAnimelokLanguages } from "@/lib/providers/animelok";
import { ok, fail, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/v1/anime/{anilistId}/servers?ep={n}
 *
 * Returns every server (HD-1/HD-2, sub/dub) + available audio languages for an
 * episode, so the watch page can build a full Animelok-style player selector.
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
  if (!Number.isInteger(ep) || ep < 1) {
    return fail(400, "Missing/invalid param: ep (1-based episode number)");
  }

  try {
    const detail = await animeDetail(id);
    if (!detail) return fail(404, "Anime not found");

    const ref = {
      anilistId: detail.id,
      malId: detail.malId ?? undefined,
      title: detail.title,
      year: detail.seasonYear ?? undefined,
      format: detail.format ?? undefined,
    };

    const [servers, languages] = await Promise.all([
      listAnimelokServers(detail.id, ep),
      listAnimelokLanguages(ref),
    ]);

    return ok({ available: servers.length > 0, servers, languages });
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
