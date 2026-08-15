"use client";

import Link from "next/link";
import { HindiMovieItem } from "@/lib/api";
import { PLACEHOLDER } from "@/lib/images";

export default function HindiMovieCard({ item, className = "" }: { item: HindiMovieItem; className?: string }) {
  const year = item.title.match(/\((\d{4})\)/)?.[1];
  const title = item.title.replace(/\s*\(\d{4}\).*$/, "").replace(/\s*(1080p|720p|480p|BluRay|HDRip|WebRip|HD).*$/i, "");

  return (
    <div className={`group relative ${className}`}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-ink-800 ring-1 ring-white/10 transition duration-300 group-hover:ring-violet-500/40">
        <Link href={`/hindi/${item.provider}/${item.id}`} className="absolute inset-0 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.image || PLACEHOLDER}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
          {year && (
            <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">
              {year}
            </span>
          )}
        </Link>
      </div>

      <Link href={`/hindi/${item.provider}/${item.id}`} className="mt-2 block">
        <h3 className="line-clamp-2 text-sm font-semibold text-zinc-100 transition group-hover:text-white">
          {title}
        </h3>
      </Link>
    </div>
  );
}
