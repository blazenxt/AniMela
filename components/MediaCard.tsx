"use client";

import Link from "next/link";
import { itemTitle, itemType, itemYear, MediaItem } from "@/lib/types";
import { poster } from "@/lib/images";

export default function MediaCard({ item }: { item: MediaItem }) {
  const type = itemType(item);
  const href = type === "movie" ? `/movie/${item.id}` : `/tv/${item.id}`;
  const year = itemYear(item);
  const rating = item.vote_average;

  return (
    <Link href={href} className="group relative block w-40 shrink-0 snap-start">
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={poster(item.poster_path)}
          alt={itemTitle(item)}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />

        <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
          {type}
        </span>

        {typeof rating === "number" && rating > 0 && (
          <span className="absolute right-2 top-2 rounded bg-yellow-400/90 px-1.5 py-0.5 text-[11px] font-bold text-black">
            ★ {rating.toFixed(1)}
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 translate-y-2 p-2 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
          <span className="block w-full rounded-lg bg-purple-600 py-1.5 text-center text-xs font-bold text-white">
            ▶ Play
          </span>
        </div>
      </div>

      <h3 className="mt-2 truncate text-sm font-medium text-zinc-200">{itemTitle(item)}</h3>
      {year && <p className="text-xs text-zinc-500">{year}</p>}
    </Link>
  );
}
