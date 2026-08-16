import type { Metadata } from "next";
import { tmdb } from "@/lib/server-api";
import { parseIdFromSlug } from "@/lib/slug";
import { poster } from "@/lib/images";
import MovieDetail from "@/components/MovieDetail";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const id = parseIdFromSlug(slug);
  let title = "Movie — AniMela";
  let description = "Watch movies in HD on AniMela.";
  let image: string | undefined;

  try {
    const data = await tmdb<any>(`/movie/${id}`);
    if (data) {
      title = `${data.title} — AniMela`;
      description = data.overview?.slice(0, 200) || description;
      image = data.poster_path ? poster(data.poster_path, "w500") : data.backdrop_path ? poster(data.backdrop_path, "w780") : undefined;
    }
  } catch {
    /* fallback */
  }

  return {
    title,
    description,
    openGraph: { title, description, type: "video.movie", images: image ? [{ url: image }] : [] },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : [] },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const id = parseIdFromSlug(slug);
  return <MovieDetail id={id} />;
}
