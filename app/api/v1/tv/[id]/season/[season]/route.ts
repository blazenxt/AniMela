import { tmdb } from "@/lib/server-api";
import { ok, fail, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; season: string }> }
) {
  const { id, season } = await params;
  try {
    const data = await tmdb<any>(`/tv/${id}/season/${season}`);
    return ok({ season_number: data.season_number, name: data.name, air_date: data.air_date, episodes: data.episodes || [] });
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
