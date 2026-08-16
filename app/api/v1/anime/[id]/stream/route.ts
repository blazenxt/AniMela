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

    // debug: resolve hexId then dump the watch page HTML (to inspect m3u8 placement)
    if (sp.get("debug") === "1") {
      const BASE = (process.env.ANIMELOK_BASE || "https://animelok.live").replace(/\/+$/, "");
      const ua = { "User-Agent": "Mozilla/5.0 Chrome/126.0" };
      const searchHtml = await (await fetch(
        `${BASE}/search?keyword=${encodeURIComponent(detail.title)}`,
        { headers: ua, signal: AbortSignal.timeout(15000) }
      )).text();
      const idMatch = searchHtml.match(/href="\/anime\/([a-f0-9]{6,})"/i);
      const hexId = idMatch?.[1] || null;
      let watchInfo: any = null;
      if (hexId) {
        const watchHtml = await (await fetch(
          `${BASE}/watch/${hexId}?ep=${ep}`,
          { headers: ua, signal: AbortSignal.timeout(15000) }
        )).text();
        watchInfo = {
          hexId,
          len: watchHtml.length,
          flixcloud: (watchHtml.match(/flixcloud[^"'\s\\]*/gi) || []).slice(0, 5),
          embedLinks: (watchHtml.match(/https?:\/\/[^"'\s\\]*flixcloud[^"'\s\\]*/gi) || []).slice(0, 5),
          eLinks: (watchHtml.match(/flixcloud\.cc\/e\/[^"'\s\\]*/gi) || []).slice(0, 5),
          apiHints: (watchHtml.match(/["']\/api\/[a-zA-Z0-9_\/-]+["']/g) || []).slice(0, 10),
          dataLink: (watchHtml.match(/dataLink[^,}]{0,120}/gi) || []).slice(0, 3),
        };
      }
      return ok({ title: detail.title, hexId, watch: watchInfo });
    }

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
