import type { Metadata } from "next";
import { Suspense } from "react";
import { animeDetail } from "@/lib/anime-meta";
import { parseIdFromSlug } from "@/lib/slug";
import AnimeWatchClient from "@/components/AnimeWatchClient";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const id = parseIdFromSlug(slug);
  let title = "Watch Anime — AniMela";
  try {
    const data = await animeDetail(id);
    if (data) title = `Watch ${data.title} — AniMela`;
  } catch {
    /* fallback */
  }
  return { title, openGraph: { title, type: "video.other" } };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const id = parseIdFromSlug(slug);
  return (
    <Suspense fallback={<div className="py-20 text-center text-zinc-500">Loading…</div>}>
      <AnimeWatchClient id={id} />
    </Suspense>
  );
}
