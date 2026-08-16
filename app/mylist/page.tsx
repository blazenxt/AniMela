"use client";

import Link from "next/link";
import { useLibrary, WatchItem, ContinueItem } from "@/lib/library";
import { poster } from "@/lib/images";
import { withSlug } from "@/lib/slug";
import { HeartIcon, XIcon } from "@/components/Icons";

function WatchCard({ item }: { item: WatchItem }) {
  const href = item.type === "movie" ? `/movie/${withSlug(item.id, item.title)}` : `/tv/${withSlug(item.id, item.title)}`;
  return (
    <Link href={href} className="group block w-40 shrink-0 snap-start">
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={poster(item.poster_path)}
          alt={item.title}
          className="h-full w-full object-cover transition group-hover:scale-105"
        />
      </div>
      <h3 className="mt-2 truncate text-sm font-medium text-zinc-200">{item.title}</h3>
      <p className="text-xs capitalize text-zinc-500">{item.type}</p>
    </Link>
  );
}

function ContinueCard({ item, onRemove }: { item: ContinueItem; onRemove: (id: number) => void }) {
  const href =
    item.type === "movie"
      ? `/movie/${withSlug(item.id, item.title)}`
      : `/tv/${withSlug(item.id, item.title)}?s=${item.season || 1}&e=${item.episode || 1}`;
  return (
    <div className="group relative block w-40 shrink-0 snap-start">
      <Link href={href} className="block">
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={poster(item.poster_path)}
            alt={item.title}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
            <div className="h-full w-1/3 bg-purple-500" />
          </div>
        </div>
        <h3 className="mt-2 truncate text-sm font-medium text-zinc-200">{item.title}</h3>
        <p className="text-xs text-zinc-500">
          {item.type === "tv" && item.season ? `S${item.season} E${item.episode ?? 1}` : "Movie"}
        </p>
      </Link>
      <button
        onClick={() => onRemove(item.id)}
        aria-label="Remove from continue watching"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-zinc-300 opacity-0 backdrop-blur transition hover:text-white group-hover:opacity-100"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function MyListPage() {
  const { watchlist, continueWatching, removeContinue, clearContinue } = useLibrary();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 font-display text-3xl font-bold text-white">My List</h1>

      <section className="mb-12">
        <div className="mb-4 flex items-center gap-2">
          <span className="h-5 w-1 rounded-full bg-rose-500" />
          <h2 className="text-xl font-bold text-white">Continue Watching</h2>
          {continueWatching.length > 0 && (
            <button
              onClick={clearContinue}
              className="ml-auto text-sm text-zinc-500 transition hover:text-zinc-300"
            >
              Clear all
            </button>
          )}
        </div>
        {continueWatching.length === 0 ? (
          <p className="py-6 text-zinc-500">Nothing yet — start watching something and it will show up here.</p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
            {continueWatching.map((c) => (
              <ContinueCard key={c.id} item={c} onRemove={removeContinue} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <span className="h-5 w-1 rounded-full bg-purple-500" />
          <h2 className="text-xl font-bold text-white">Watchlist</h2>
        </div>
        {watchlist.length === 0 ? (
          <p className="flex items-center gap-2 py-6 text-zinc-500">
            Your watchlist is empty. Tap the
            <HeartIcon className="h-4 w-4 text-rose-400" />
            on any title to save it here.
          </p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
            {watchlist.map((w) => (
              <WatchCard key={w.id} item={w} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
