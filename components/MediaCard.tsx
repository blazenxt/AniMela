"use client";

import Link from "next/link";
import { itemTitle, itemType, itemYear, MediaItem } from "@/lib/types";
import { poster } from "@/lib/images";
import { useLibrary, Kind } from "@/lib/library";

export default function MediaCard({ item }: { item: MediaItem }) {
  const type = itemType(item);
  const kind: Kind = type === "movie" ? "movie" : "tv";
  const href = type === "movie" ? `/movie/${item.id}` : `/tv/${item.id}`;
  const year = itemYear(item);
  const rating = item.vote_average;
  const title = itemTitle(item);

  const { isWatched, toggleWatch } = useLibrary();
  const watched = isWatched(item.id);

  return (
    <div className="group relative w-40 shrink-0 snap-start">
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
        <Link href={href} className="absolute inset-0 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={poster(item.poster_path)}
            alt={title}
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
        </Link>

        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWatch({ id: item.id, type: kind, title, poster_path: item.poster_path });
          }}
          aria-label={watched ? "Remove from My List" : "Add to My List"}
          title={watched ? "Remove from My List" : "Add to My List"}
          className="absolute bottom-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 backdrop-blur transition hover:bg-black/80"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 transition ${watched ? "fill-rose-500 stroke-rose-500" : "fill-none stroke-white"}`}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
        </button>
      </div>

      <Link href={href}>
        <h3 className="mt-2 truncate text-sm font-medium text-zinc-200">{title}</h3>
        {year && <p className="text-xs text-zinc-500">{year}</p>}
      </Link>
    </div>
  );
}
