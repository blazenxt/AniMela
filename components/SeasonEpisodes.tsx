"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { poster } from "@/lib/images";

export interface SeasonInfo {
  season_number: number;
  episode_count: number;
  name: string;
}

export interface EpisodeInfo {
  episode_number: number;
  name: string;
  still_path?: string | null;
  overview?: string;
  air_date?: string;
}

export default function SeasonEpisodes({
  tvId,
  seasons,
  currentSeason,
  currentEpisode,
  onSelect,
}: {
  tvId: number;
  seasons: SeasonInfo[];
  currentSeason: number;
  currentEpisode: number;
  onSelect: (season: number, episode: number) => void;
}) {
  const realSeasons = (seasons || []).filter((s) => s.season_number > 0);
  const [season, setSeason] = useState<number>(currentSeason || realSeasons[0]?.season_number || 1);
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setEpisodes([]);
    api
      .season(tvId, season)
      .then((d) => active && setEpisodes(d.episodes || []))
      .catch(() => active && setEpisodes([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [tvId, season]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="text-sm font-semibold text-zinc-300">Season</label>
        <select
          value={season}
          onChange={(e) => setSeason(Number(e.target.value))}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {realSeasons.map((s) => (
            <option key={s.season_number} value={s.season_number} className="bg-zinc-900">
              {s.name || `Season ${s.season_number}`} ({s.episode_count} eps)
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-8 text-sm text-zinc-500">Loading episodes…</div>
      ) : episodes.length === 0 ? (
        <div className="py-8 text-sm text-zinc-500">No episodes available for this season.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {episodes.map((ep) => {
            const active = season === currentSeason && ep.episode_number === currentEpisode;
            return (
              <button
                key={ep.episode_number}
                onClick={() => onSelect(season, ep.episode_number)}
                className={`overflow-hidden rounded-xl text-left ring-1 transition ${
                  active ? "ring-2 ring-purple-500" : "ring-white/10 hover:ring-white/30"
                }`}
              >
                <div className="aspect-video bg-white/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={poster(ep.still_path, "w500")}
                    alt={ep.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="bg-white/5 p-2">
                  <p className="truncate text-xs font-semibold text-zinc-200">
                    E{ep.episode_number} · {ep.name}
                  </p>
                  {ep.air_date && <p className="text-[11px] text-zinc-500">{ep.air_date}</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
