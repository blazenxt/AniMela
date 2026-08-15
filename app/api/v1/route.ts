import { ok, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const ENDPOINTS = [
  { method: "GET", path: "/api/v1/trending/movies", desc: "Trending movies (week)", params: "page" },
  { method: "GET", path: "/api/v1/trending/tv", desc: "Trending TV series (week)", params: "page" },
  { method: "GET", path: "/api/v1/trending/all", desc: "Trending movies + TV + people", params: "page" },
  { method: "GET", path: "/api/v1/search", desc: "Multi-search", params: "q, page" },
  { method: "GET", path: "/api/v1/movie/{id}", desc: "Movie details" },
  { method: "GET", path: "/api/v1/tv/{id}", desc: "Series details" },
  { method: "GET", path: "/api/v1/tv/{id}/season/{n}", desc: "Season episodes" },
  { method: "GET", path: "/api/v1/genres/movies", desc: "Movie genres" },
  { method: "GET", path: "/api/v1/genres/tv", desc: "TV genres" },
  { method: "GET", path: "/api/v1/anime", desc: "Anime browse (AniList)", params: "type, sort, genre, page, q" },
  { method: "GET", path: "/api/v1/anime/search", desc: "Anime search (AniList)", params: "q, page" },
  { method: "GET", path: "/api/v1/anime/genres", desc: "Anime genre list" },
  { method: "GET", path: "/api/v1/anime/{id}", desc: "Anime details (AniList)" },
  { method: "GET", path: "/api/v1/anime/{id}/episodes", desc: "Episode list (stream providers)" },
  { method: "GET", path: "/api/v1/anime/{id}/stream", desc: "Resolve episode stream", params: "ep, dub" },
  { method: "GET", path: "/api/v1/movie/{id}/similar", desc: "Similar movies", params: "page" },
  { method: "GET", path: "/api/v1/tv/{id}/similar", desc: "Similar series", params: "page" },
  { method: "GET", path: "/api/v1/movie/{id}/credits", desc: "Movie cast & crew" },
  { method: "GET", path: "/api/v1/tv/{id}/credits", desc: "Series cast & crew" },
];

export async function GET() {
  return ok({
    name: "AniMela API",
    version: "v1",
    base: "/api/v1",
    endpoints: ENDPOINTS,
  });
}

export { options as OPTIONS };
