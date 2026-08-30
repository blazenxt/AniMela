import { animeGenres } from "@/lib/anime-meta";
import { ok, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/** GET /api/v1/anime/genres — curated anime genre list. */
export async function GET() {
  return ok({ genres: animeGenres() });
}

export { options as OPTIONS };
