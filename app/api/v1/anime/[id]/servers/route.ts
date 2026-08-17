import { animeDetail } from "@/lib/anime-meta";
import { listAnimelokServers, listAnimelokLanguages } from "@/lib/providers/animelok";
import { resolveEpisode } from "@/lib/anime-stream";
import { encryptUrl } from "@/lib/obfuscate";
import { ok, fail, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/v1/anime/{anilistId}/servers?ep={n}
 *
 * Returns:
 *   - `servers`: iframe-embed servers (Animelok/flixcloud) + a "Direct" entry
 *     with quality variants when the AniDB direct stream resolves (→ CustomPlayer
 *     with the quality selector).
 *   - `languages`: available audio languages.
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

    const [animelokServers, languages, directResolution] = await Promise.all([
      listAnimelokServers(detail.id, ep),
      listAnimelokLanguages(ref),
      resolveEpisode(ref, ep, false),
    ]);

    // Build the server list: direct stream (qualities) first, then iframe embeds.
    const servers: any[] = [];

    if (directResolution?.result?.sources?.length) {
      const r = directResolution.result;
      const referer = r.headers?.Referer || "";
      servers.push({
        name: `${r.provider} (Direct)`,
        type: "multi" as const,
        token: "",
        audioTracks: ["Japanese", "English"],
        qualities: r.sources.map((s) => ({
          quality: s.quality,
          token: encryptUrl(s.url),
        })),
        referer: referer ? encryptUrl(referer) : undefined,
      });
    }

    for (const s of animelokServers) {
      servers.push(s);
    }

    return ok({ available: servers.length > 0, servers, languages });
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
