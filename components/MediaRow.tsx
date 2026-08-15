"use client";

import { MediaItem } from "@/lib/types";
import MediaCard from "./MediaCard";

export default function MediaRow({
  title,
  items,
  accent = "bg-violet-500",
  viewAllHref,
}: {
  title: string;
  items: MediaItem[];
  accent?: string;
  viewAllHref?: string;
}) {
  if (!items?.length) return null;

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center gap-3">
        <span className={`h-6 w-1 rounded-full ${accent}`} />
        <h2 className="font-display text-xl font-bold text-white">{title}</h2>
        {viewAllHref && (
          <a href={viewAllHref} className="ml-auto text-sm text-zinc-500 transition hover:text-white">
            View all →
          </a>
        )}
      </div>
      <div className="flex snap-x gap-4 overflow-x-auto pb-2 no-scrollbar">
        {items.map((it) => (
          <MediaCard key={it.id} item={it} className="w-40 shrink-0 snap-start" />
        ))}
      </div>
    </section>
  );
}
