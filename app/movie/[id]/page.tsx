"use client";

import { use, useEffect } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useLibrary } from "@/lib/library";
import Player, { PlayerSource } from "@/components/Player";
import Loading from "@/components/Loading";
import ErrorState from "@/components/ErrorState";
import CastList from "@/components/CastList";
import SimilarRow from "@/components/SimilarRow";
import { backdrop, poster } from "@/lib/images";
import { videasyMovie, vidfastMovie } from "@/lib/players";
import { ExternalLinkIcon, HeartIcon, StarIcon } from "@/components/Icons";

export default function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, retry } = useApi(() => api.movie(id), [id]);
  const { isWatched, toggleWatch, recordContinue } = useLibrary();

  useEffect(() => {
    if (data?.title) document.title = `${data.title} — AniMela`;
  }, [data]);

  useEffect(() => {
    if (!data?.id) return;
    recordContinue({
      id: data.id,
      type: "movie",
      title: data.title,
      poster_path: data.poster_path,
    });
  }, [data, recordContinue]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Movie not found."} onRetry={retry} />;

  const sources: PlayerSource[] = [
    { label: "Server 1", src: videasyMovie(id) },
    { label: "Server 2", src: vidfastMovie(id) },
  ];

  const watched = isWatched(data.id);

  const year = data.release_date ? data.release_date.slice(0, 4) : "";
  const genres: string[] = (data.genres || []).map((g: any) => g.name);
  const rating = typeof data.vote_average === "number" ? data.vote_average : null;

  return (
    <div>
      <div className="relative h-[40vh] min-h-[240px] w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={backdrop(data.backdrop_path, "w1280")}
          alt=""
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07070c] to-[#07070c]/30" />
      </div>

      <div className="relative z-10 mx-auto -mt-20 max-w-7xl px-4 sm:-mt-24 sm:px-6">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-end sm:gap-6 sm:text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={poster(data.poster_path, "w500")}
            alt={data.title}
            className="w-36 shrink-0 rounded-2xl shadow-2xl ring-1 ring-white/10 sm:w-56"
          />
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="break-words text-2xl font-black text-white sm:text-5xl">{data.title}</h1>
            {data.tagline && <p className="mt-1 text-zinc-400 italic">“{data.tagline}”</p>}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-zinc-400 sm:justify-start">
              {year && <span>{year}</span>}
              {data.runtime && <span>• {data.runtime} min</span>}
              {rating !== null && (
                <span className="inline-flex items-center gap-1">
                  • <StarIcon className="h-3.5 w-3.5 text-yellow-400" /> {rating.toFixed(1)}
                </span>
              )}
              {data.status && <span>• {data.status}</span>}
            </div>
            {genres.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                {genres.map((g) => (
                  <span key={g} className="rounded-full bg-white/10 px-2 py-1 text-xs text-zinc-300">
                    {g}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() =>
                toggleWatch({
                  id: data.id,
                  type: "movie",
                  title: data.title,
                  poster_path: data.poster_path,
                })
              }
              className={`mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                watched ? "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40" : "bg-white/10 text-white hover:bg-white/15"
              }`}
            >
              <HeartIcon filled={watched} className="h-4 w-4" />
              {watched ? "In My List" : "Add to My List"}
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
          <div>
            <Player sources={sources} />
            {data.overview && (
              <div className="mt-6">
                <h2 className="mb-2 text-lg font-bold text-white">Overview</h2>
                <p className="leading-relaxed text-zinc-300">{data.overview}</p>
              </div>
            )}
            <div className="mt-8">
              <CastList kind="movie" id={data.id} />
            </div>
          </div>

          <aside className="space-y-4 text-sm text-zinc-400">
            <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
              <h3 className="mb-2 font-bold text-white">Details</h3>
              <dl className="space-y-2">
                <Row label="Release" value={data.release_date || "—"} />
                <Row label="Runtime" value={data.runtime ? `${data.runtime} min` : "—"} />
                <Row label="Language" value={data.original_language?.toUpperCase() || "—"} />
                <Row label="Status" value={data.status || "—"} />
                <Row
                  label="Budget"
                  value={data.budget ? `$${data.budget.toLocaleString()}` : "—"}
                />
                <Row
                  label="Revenue"
                  value={data.revenue ? `$${data.revenue.toLocaleString()}` : "—"}
                />
              </dl>
            </div>
            {data.imdb_id && (
              <a
                href={`https://www.imdb.com/title/${data.imdb_id}/`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-xl bg-yellow-400/10 p-4 font-semibold text-yellow-300 ring-1 ring-yellow-400/20 transition hover:bg-yellow-400/20"
              >
                IMDb
                <ExternalLinkIcon className="h-4 w-4" />
              </a>
            )}
          </aside>
        </div>

        <div className="mt-10">
          <SimilarRow kind="movie" id={data.id} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-words text-right text-zinc-300">{value}</dd>
    </div>
  );
}
