"use client";

import { useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import MediaRow from "@/components/MediaRow";
import Loading from "@/components/Loading";
import { MediaItem, itemTitle } from "@/lib/types";
import { backdrop } from "@/lib/images";

export default function Home() {
  const movies = useApi(() => api.trendingMovies(1), []);
  const series = useApi(() => api.trendingTv(1), []);
  const anime = useApi(() => api.search("anime", 1), []);

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
            src={backdrop(hero.backdrop_path, "original")}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07070c] via-[#07070c]/55 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#07070c]/90 via-transparent to-transparent" />

          <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-end px-4 pb-16 sm:px-6">
            <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur">
              ★ Featured
            </span>
            <h1 className="text-4xl font-black text-white drop-shadow-lg sm:text-6xl">
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
                ▶ Watch now
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {movies.loading && series.loading && anime.loading && <Loading />}
        {movies.error && <p className="mb-4 text-sm text-red-400">{movies.error}</p>}

        <MediaRow title="Trending Movies" items={movies.data?.results || []} accent="bg-fuchsia-500" />
        <MediaRow title="Trending Series" items={series.data?.results || []} accent="bg-indigo-500" />
        <MediaRow title="Popular Anime" items={animeItems} accent="bg-rose-500" />
      </div>
    </div>
  );
}
