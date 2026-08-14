"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useLibrary } from "@/lib/library";
import Player, { PlayerSource } from "@/components/Player";
import Loading from "@/components/Loading";
import ErrorState from "@/components/ErrorState";
import SeasonEpisodes from "@/components/SeasonEpisodes";
import CastList from "@/components/CastList";
import SimilarRow from "@/components/SimilarRow";
import { backdrop, poster } from "@/lib/images";
import { videasyTv } from "@/lib/players";

export default function TvPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, loading, error, retry } = useApi(() => api.tv(id), [id]);
  const { isWatched, toggleWatch, recordContinue } = useLibrary();

  const seasons = data?.seasons || [];
  const realSeasons = seasons.filter((s: any) => s.season_number > 0);
  const defaultSeason = realSeasons[0]?.season_number || 1;

  const [season, setSeason] = useState<number>(defaultSeason);
  const [episode, setEpisode] = useState<number>(1);

  // initialize from ?s=&e= deep link (client-side only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const s = Number(p.get("s"));
    const e = Number(p.get("e"));
    if (s > 0) setSeason(s);
    if (e > 0) setEpisode(e);
  }, []);

  useEffect(() => {
    if (data?.name) document.title = `${data.name} — AniMela`;
  }, [data]);

  const select = (s: number, e: number) => {
    setSeason(s);
    setEpisode(e);
    router.replace(`/tv/${id}?s=${s}&e=${e}`, { scroll: false });
  };

  // remember where the user left off
  useEffect(() => {
    if (!data?.id) return;
    recordContinue({
      id: data.id,
      type: "tv",
      title: data.name,
      poster_path: data.poster_path,
      season,
      episode,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, season, episode, recordContinue]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Series not found."} onRetry={retry} />;

  const sources: PlayerSource[] = [
    { label: "Videasy", src: videasyTv(id, season, episode) },
  ];

  const year = data.first_air_date ? data.first_air_date.slice(0, 4) : "";
  const genres: string[] = (data.genres || []).map((g: any) => g.name);
  const rating = typeof data.vote_average === "number" ? data.vote_average : null;
  const watched = isWatched(data.id);

  return (
    <div>
      <div className="relative h-[40vh] min-h-[240px] w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={backdrop(data.backdrop_path, "original")}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07070c] to-[#07070c]/30" />
      </div>

      <div className="relative z-10 mx-auto -mt-24 max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={poster(data.poster_path, "w500")}
            alt={data.name}
            className="w-40 rounded-2xl shadow-2xl ring-1 ring-white/10 sm:w-56"
          />
          <div className="flex-1 pt-4 sm:pt-12">
            <h1 className="text-3xl font-black text-white sm:text-5xl">{data.name}</h1>
            {data.tagline && <p className="mt-1 text-zinc-400 italic">“{data.tagline}”</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-400">
              {year && <span>{year}</span>}
              <span>
                • {data.number_of_seasons ?? realSeasons.length} season
                {data.number_of_seasons !== 1 ? "s" : ""}
              </span>
              {data.number_of_episodes && <span>• {data.number_of_episodes} eps</span>}
              {rating !== null && <span>• ★ {rating.toFixed(1)}</span>}
            </div>
            {genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
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
                  type: "tv",
                  title: data.name,
                  poster_path: data.poster_path,
                })
              }
              className={`mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                watched ? "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40" : "bg-white/10 text-white hover:bg-white/15"
              }`}
            >
              <span>{watched ? "♥" : "♡"}</span> {watched ? "In My List" : "Add to My List"}
            </button>
          </div>
        </div>

        <div className="mt-8 space-y-8">
          <div>
            <Player sources={sources} />
          </div>

          {data.overview && (
            <div>
              <h2 className="mb-2 text-lg font-bold text-white">Overview</h2>
              <p className="max-w-3xl leading-relaxed text-zinc-300">{data.overview}</p>
            </div>
          )}

          <div>
            <h2 className="mb-4 text-lg font-bold text-white">Episodes</h2>
            <SeasonEpisodes
              tvId={Number(id)}
              seasons={realSeasons}
              currentSeason={season}
              currentEpisode={episode}
              onSelect={select}
            />
          </div>

          <CastList kind="tv" id={data.id} />

          <SimilarRow kind="tv" id={data.id} />
        </div>
      </div>
    </div>
  );
}
