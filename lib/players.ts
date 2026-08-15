/**
 * Playback URL builders.
 *
 * Videasy (https://player.videasy.to) is an embeddable player that accepts a
 * TMDB id directly:
 *   - TV / anime series : /tv/{tmdbId}/{season}/{episode}
 *   - movies / anime movies : /movie/{tmdbId}
 *
 * VidFast (https://vidfast.vc) is an alternative movie embed.
 */

export function videasyMovie(id: number | string): string {
  return `https://player.videasy.to/movie/${id}`;
}

export function videasyTv(id: number | string, season: number, episode: number): string {
  return `https://player.videasy.to/tv/${id}/${season}/${episode}`;
}

export function vidfastMovie(id: number | string): string {
  return `https://vidfast.vc/movie/${id}?autoPlay=true`;
}
