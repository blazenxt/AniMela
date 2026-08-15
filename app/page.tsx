"use client";

import { useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useLibrary } from "@/lib/library";
import MediaRow from "@/components/MediaRow";
import Loading from "@/components/Loading";
import { MediaItem, itemTitle } from "@/lib/types";
import { backdrop, poster } from "@/lib/images";
import { PlayIcon, SparklesIcon } from "@/components/Icons";

export default function Home() {
  const movies = useApi(() => api.trendingMovies(1), []);
  const series = useApi(() => api.trendingTv(1), []);
  const anime = useApi(() => api.search("anime", 1), []);
  const { watchlist, continueWatching } = useLibrary();

  const hero: MediaItem | undefined = useMemo(() => {
    const list = (movies.data?.results || []) as MediaItem[];
    return list.find((m) => m.backdrop_path) || list[0];
  }, [movies.data]);

  const animeItems = useMemo(
    () =>
      ((anime.data?.results || []) as MediaItem[])
        .filter((m) => m.media_type !== "person")
        .slice(0, 20),
    [anime.data]
  );

  const heroType = hero?.media_type || (hero?.title ? "movie" : "tv");

  return (
    <div>
      {hero && (
        <div className="relative h-[68vh] min-h-[420px] w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={backdrop(hero.backdrop_path, "w1280")}
            alt=""
            decoding="async"
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07070c] via-[#07070c]/55 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#07070c]/90 via-transparent to-transparent" />

          <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-end px-4 pb-16 sm:px-6">
            <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur">
              <SparklesIcon className="h-3.5 w-3.5 text-amber-400" />
              Featured
            </span>
            <h1 className="break-words text-4xl font-black text-white drop-shadow-lg sm:text-6xl">
              {itemTitle(hero)}
            </h1>
            {hero.overview && (
              <p className="mt-4 line-clamp-3 max-w-2xl text-zinc-200">{hero.overview}</p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={heroType === "tv" ? `/tv/${hero.id}` : `/movie/${hero.id}`}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 px-6 py-3 font-bold text-white shadow-lg shadow-purple-900/40 transition hover:opacity-90"
              >
                <PlayIcon className="h-5 w-5" />
                Watch now
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {movies.loading && series.loading && anime.loading && <Loading />}
        {movies.error && <p className="mb-4 text-sm text-red-400">{movies.error}</p>}

        {continueWatching.length > 0 && (
          <section className="mb-10">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-rose-500" />
              <h2 className="text-xl font-bold text-white">Continue Watching</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
              {continueWatching.map((c) => {
                const href =
                  c.type === "movie"
                    ? `/movie/${c.id}`
                    : `/tv/${c.id}?s=${c.season || 1}&e=${c.episode || 1}`;
                return (
                  <Link key={c.id} href={href} className="group block w-40 shrink-0 snap-start">
                    <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={poster(c.poster_path)}
                        alt={c.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                        <div className="h-full w-1/3 bg-purple-500" />
                      </div>
                    </div>
                    <h3 className="mt-2 truncate text-sm font-medium text-zinc-200">{c.title}</h3>
                    <p className="text-xs text-zinc-500">
                      {c.type === "tv" && c.season ? `S${c.season} E${c.episode ?? 1}` : "Movie"}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {watchlist.length > 0 && (
          <section className="mb-10">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-purple-500" />
              <h2 className="text-xl font-bold text-white">My List</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
              {watchlist.map((w) => {
                const href = w.type === "movie" ? `/movie/${w.id}` : `/tv/${w.id}`;
                return (
                  <Link key={w.id} href={href} className="group block w-40 shrink-0 snap-start">
                    <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={poster(w.poster_path)}
                        alt={w.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    </div>
                    <h3 className="mt-2 truncate text-sm font-medium text-zinc-200">{w.title}</h3>
                    <p className="text-xs capitalize text-zinc-500">{w.type}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <MediaRow title="Trending Movies" items={movies.data?.results || []} accent="bg-fuchsia-500" />
        <MediaRow title="Trending Series" items={series.data?.results || []} accent="bg-indigo-500" />
        <MediaRow title="Popular Anime" items={animeItems} accent="bg-rose-500" />
      </div>
    </div>
  );
}
