import { tmdb } from "@/lib/server-api";
import { ok, fail, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const tmdbKind = kind === "movies" ? "movie" : kind === "tv" ? "tv" : null;
  if (!tmdbKind) return fail(400, `Invalid kind "${kind}" — use "movies" or "tv"`);

  try {
    const data = await tmdb<any>(`/genre/${tmdbKind}/list`);
    return ok(data.genres || []);
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
