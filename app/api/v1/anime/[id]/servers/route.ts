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
  const isDebug = sp.get("debug") === "1";

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

    // debug: find ALL server providers + their API endpoints
    if (isDebug) {
      const BASE = (process.env.ANIMELOK_BASE || "https://animelok.live").replace(/\/+$/, "");
      const ua = { "User-Agent": "Mozilla/5.0 Chrome/126.0" };
      const searchHtml = await (await fetch(
        `${BASE}/search?keyword=${encodeURIComponent(detail.title)}`,
        { headers: ua, signal: AbortSignal.timeout(15000) }
      )).text();
      const hexId = searchHtml.match(/href="\/anime\/([a-f0-9]{6,})"/i)?.[1] || "";
      const watchHtml = await (await fetch(
        `${BASE}/watch/${hexId}?ep=${ep}`,
        { headers: ua, signal: AbortSignal.timeout(15000) }
      )).text();

      const chunks = [...watchHtml.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]);
      const results: string[] = [];
      const apiSet = new Set<string>();
      for (const c of chunks) {
        try {
          const js = await (await fetch(`${BASE}${c}`, { headers: ua, signal: AbortSignal.timeout(15000) })).text();
          for (const m of js.matchAll(/\/api\/[a-zA-Z0-9_\-\/]{2,40}/g)) apiSet.add(m[0]);
          // find context around server keywords
          for (const kw of ["AniStream", "VidMaster", "AniPlay", "Abyess", "abyss", "anistream", "vidmaster", "aniplay"]) {
            let idx = js.indexOf(kw);
            while (idx !== -1 && results.length < 60) {
              const ctx = js.slice(Math.max(0, idx - 80), idx + 160).replace(/\s+/g, " ");
              results.push(`[${kw}] …${ctx}…`);
              idx = js.indexOf(kw, idx + 1);
            }
          }
        } catch { /* skip */ }
      }
      return ok({
        hexId,
        chunkCount: chunks.length,
        apis: [...apiSet].sort(),
        ctx: results.slice(0, 60),
      });
    }

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
