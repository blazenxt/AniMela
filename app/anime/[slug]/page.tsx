import type { Metadata } from "next";
import { animeDetail } from "@/lib/anime-meta";
import { stripHtml } from "@/lib/anilist";
import { parseIdFromSlug, withSlug } from "@/lib/slug";
import AnimeDetail from "@/components/AnimeDetail";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const id = parseIdFromSlug(slug);
  let title = "Anime — AniMela";
  let description = "Watch anime in HD on AniMela.";
  let image: string | undefined;

  try {
    const data = await animeDetail(id);
    if (data) {
      title = `${data.title} — AniMela`;
      description = stripHtml(data.description).slice(0, 200) || "Watch anime in HD on AniMela.";
      image = data.coverImage || data.bannerImage || undefined;
    }
  } catch {
    /* metadata fallback */
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: image ? [{ url: image, width: 1200, height: 630 }] : [],
    },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : [] },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const id = parseIdFromSlug(slug);
  return <AnimeDetail id={id} />;
}
