import { animeDetail } from "@/lib/anime-meta";
import { resolveEpisode } from "@/lib/anime-stream";
import { encryptUrl } from "@/lib/obfuscate";
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

    // Obfuscate every external URL before it leaves the API: the client only
    // ever sees opaque tokens, never the real source hosts.
    const sources = (result.sources || []).map((s) => ({
      ...s,
      url: encryptUrl(s.url),
    }));
    const subtitles = (result.subtitles || []).map((t) => ({
      ...t,
      url: encryptUrl(t.url),
    }));
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(result.headers || {})) {
      headers[k] = /url|referer|origin/i.test(k) ? encryptUrl(v) : v;
    }

    return ok({
      available: true,
      ...result,
      sources,
      subtitles,
      headers,
      embedUrl: result.embedUrl ? encryptUrl(result.embedUrl) : undefined,
      errors,
    });
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
