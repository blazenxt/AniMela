"use client";

import Link from "next/link";
import { AnimeItem, formatLabel } from "@/lib/anilist";
import { PLACEHOLDER } from "@/lib/images";
import { StarIcon } from "@/components/Icons";

/** Poster card for AniList-backed anime items (links to /anime/{anilistId}). */
export default function AnimeCard({ item, className = "" }: { item: AnimeItem; className?: string }) {
  const score = item.averageScore != null ? (item.averageScore / 10).toFixed(1) : null;
  const cover = item.coverImage || PLACEHOLDER;
  const sub = item.nativeTitle && item.nativeTitle !== item.title ? item.nativeTitle : item.englishTitle;

  return (
    <div className={`group relative ${className}`}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-ink-800 ring-1 ring-white/10 transition duration-300 group-hover:ring-violet-500/40">
        <Link href={`/anime/${item.id}`} className="absolute inset-0 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />

          {/* format badge */}
          <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
            {formatLabel(item.format)}
          </span>

          {/* score badge */}
          {score && (
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-amber-300 backdrop-blur">
              <StarIcon className="h-3 w-3" />
              {score}
            </span>
          )}
        </Link>
      </div>

      <Link href={`/anime/${item.id}`} className="mt-2 block">
        <h3 className="truncate text-sm font-semibold text-zinc-100 transition group-hover:text-white">
          {item.title}
        </h3>
        <p className="truncate text-xs text-zinc-500">
          {[sub, item.seasonYear ? String(item.seasonYear) : null].filter(Boolean).join(" · ") || "\u00A0"}
        </p>
      </Link>
    </div>
  );
}
