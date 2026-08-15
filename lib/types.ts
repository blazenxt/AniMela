export type MediaType = "movie" | "tv" | "person";

export interface MediaItem {
  id: number;
  media_type?: MediaType;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
  popularity?: number;
  adult?: boolean;
}

export function itemTitle(m: MediaItem): string {
  return m.title || m.name || m.original_title || m.original_name || "Untitled";
}

export function itemYear(m: MediaItem): string {
  const d = m.release_date || m.first_air_date;
  return d ? d.slice(0, 4) : "";
}

export function itemType(m: MediaItem): MediaType {
  if (m.media_type === "movie" || m.media_type === "tv" || m.media_type === "person") {
    return m.media_type;
  }
  return m.title || m.release_date ? "movie" : "tv";
}

export function isWatchable(m: MediaItem): boolean {
  return itemType(m) !== "person";
}
