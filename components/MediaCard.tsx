"use client";

import Link from "next/link";
import { itemTitle, itemType, itemYear, MediaItem } from "@/lib/types";
import { poster } from "@/lib/images";
import { withSlug } from "@/lib/slug";
import { useLibrary, Kind } from "@/lib/library";
import { HeartIcon, PlayIcon, StarIcon } from "@/components/Icons";

export default function MediaCard({ item, className = "" }: { item: MediaItem; className?: string }) {
  const type = itemType(item);
  const kind: Kind = type === "movie" ? "movie" : "tv";
  const href = type === "movie" ? `/movie/${withSlug(item.id, item.title)}` : `/tv/${withSlug(item.id, item.name)}`;
  const year = itemYear(item);
  const rating = item.vote_average;
  const title = itemTitle(item);

  const { isWatched, toggleWatch } = useLibrary();
  const watched = isWatched(item.id);

  return (
    <div className={`group relative ${className}`}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-ink-800 ring-1 ring-white/10 transition duration-300 group-hover:ring-violet-500/40">
        <Link href={href} className="absolute inset-0 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={poster(item.poster_path)}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
          />
          {/* hover overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />

          {/* type badge */}
          <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
            {type}
          </span>

          {/* rating badge */}
          {typeof rating === "number" && rating > 0 && (
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-amber-300 backdrop-blur">
              <StarIcon className="h-3 w-3" />
              {rating.toFixed(1)}
            </span>
          )}

          {/* hover play button */}
          <div className="absolute inset-x-0 bottom-0 translate-y-3 p-2 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <span className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-fuchsia-500 to-violet-600 py-2 text-xs font-bold text-white shadow-lg shadow-violet-900/40">
              <PlayIcon className="h-3.5 w-3.5" />
              Play
            </span>
          </div>
        </Link>

        {/* watchlist heart */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWatch({ id: item.id, type: kind, title, poster_path: item.poster_path });
          }}
          aria-label={watched ? "Remove from My List" : "Add to My List"}
          title={watched ? "Remove from My List" : "Add to My List"}
          className={`absolute bottom-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full backdrop-blur transition ${
            watched ? "bg-rose-500 text-white" : "bg-black/60 text-white hover:bg-black/80"
          }`}
        >
          <HeartIcon filled={watched} className="h-4 w-4" />
        </button>
      </div>

      <Link href={href} className="mt-2 block">
        <h3 className="truncate text-sm font-semibold text-zinc-100 transition group-hover:text-white">
          {title}
        </h3>
        {year && <p className="text-xs text-zinc-500">{year}</p>}
      </Link>
    </div>
  );
}
