"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, AnimeEpisode } from "@/lib/api";
import { PlayIcon, StarIcon } from "./Icons";

interface Server {
  name: string;
  type: "sub" | "dub";
  embedUrl: string;
}

interface Language {
  code: string;
  label: string;
  episodes?: number | null;
}

/**
 * Animelok-style dedicated watch experience:
 *   - full-width player (flixcloud embed → plays on the user's IP)
 *   - server selector (HD-1 / HD-2 × sub / dub)
 *   - audio-language selector (regional dubs)
 *   - episode grid with prev / next
 */
export default function AnimeWatch({
  anilistId,
  title,
  score,
}: {
  anilistId: number | string;
  title: string;
  score?: string | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const [episodes, setEpisodes] = useState<AnimeEpisode[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [episode, setEpisode] = useState<number>(Number(sp.get("ep")) || 1);
  const [server, setServer] = useState<Server | null>(null);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingServer, setLoadingServer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── episode range pagination (Animelok style: "EPS: 1-100") ──────────────
  const RANGE = 100;
  const totalEpisodes = episodes.length;
  const rangeCount = Math.max(1, Math.ceil(totalEpisodes / RANGE));

  // current range (0-based) derived from the selected episode
  const rangeIndex = Math.min(rangeCount - 1, Math.floor((episode - 1) / RANGE));
  const rangeStart = rangeIndex * RANGE + 1;
  const rangeEnd = Math.min(totalEpisodes, rangeStart + RANGE - 1);
  const visibleEpisodes = episodes.slice(rangeStart - 1, rangeEnd);

  // load episodes once
  useEffect(() => {
    let active = true;
    api
      .animeEpisodes(anilistId)
      .then((d) => active && setEpisodes(d.episodes || []))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [anilistId]);

  // load servers + languages per episode
  const loadServers = useCallback(
    async (ep: number) => {
      setLoading(true);
      setError(null);
      setStarted(false);
      try {
        const d = await api.animeServers(anilistId, ep);
        setServers(d.servers || []);
        setLanguages(d.languages || []);
        setServer(d.servers?.[0] || null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load servers");
        setServers([]);
        setServer(null);
      } finally {
        setLoading(false);
      }
    },
    [anilistId]
  );

  useEffect(() => {
    loadServers(episode);
    router.replace(`/anime/${anilistId}/watch?ep=${episode}`, { scroll: false });
  }, [episode, loadServers, anilistId, router]);

  const pickServer = (s: Server) => {
    setServer(s);
    setStarted(false);
  };

  const gotoEpisode = (n: number) => {
    if (n < 1 || n > totalEpisodes) return;
    setEpisode(n);
  };

  const epIndex = episodes.findIndex((e) => e.number === episode);
  const prevEp = episodes[epIndex - 1];
  const nextEp = episodes[epIndex + 1];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* breadcrumb */}
      <div className="mb-4 flex items-center gap-3 text-sm">
        <Link href={`/anime/${anilistId}`} className="text-zinc-400 transition hover:text-white">
          ← {title}
        </Link>
        <span className="text-zinc-600">/</span>
        <span className="font-semibold text-white">Episode {episode}</span>
        {score && (
          <span className="ml-auto inline-flex items-center gap-1 text-amber-300">
            <StarIcon className="h-3.5 w-3.5" /> {score}
          </span>
        )}
      </div>

      {/* player */}
      <div
        className="relative w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10"
        style={{ aspectRatio: "16 / 9" }}
      >
        {server ? (
          started ? (
            <iframe
              key={`${server.embedUrl}:${episode}`}
              src={server.embedUrl}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
              title={`${title} — Episode ${episode}`}
            />
          ) : (
            <button
              onClick={() => setStarted(true)}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3"
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-purple-600/90 shadow-lg shadow-purple-900/50 transition hover:scale-105">
                <PlayIcon className="h-10 w-10 text-white" />
              </span>
              <span className="font-semibold text-zinc-100">
                Play Episode {episode}
                {server ? ` · ${server.name} ${server.type.toUpperCase()}` : ""}
              </span>
            </button>
          )
        ) : loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div>
              <p className="font-semibold text-zinc-200">Streaming temporarily unavailable</p>
              <p className="mt-1 text-sm text-zinc-500">{error || "No server for this episode."}</p>
            </div>
          </div>
        )}
      </div>

      {/* now playing + audio hint */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-lg bg-purple-600/20 px-3 py-1 font-semibold text-purple-300">
          Now playing · Episode {episode}
        </span>
        <span className="text-zinc-500">If a source fails, switch server below.</span>
      </div>

      {/* audio-language hint — the actual switch is the player's own 🎧 button */}
      <div className="mt-4 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
        <div className="flex items-center gap-2">
          <span className="text-base">🎧</span>
          <span className="text-sm font-semibold text-zinc-200">
            To switch audio / language, tap the headphones (🎧) button inside the player
          </span>
        </div>
        {languages.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {languages.map((l) => (
              <span
                key={l.code}
                className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-zinc-400 ring-1 ring-white/10"
              >
                {l.label}
                {l.episodes != null && <span className="ml-1 opacity-60">({l.episodes} eps)</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* server selector */}
      {servers.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">Servers</h3>
          <div className="flex flex-wrap gap-2">
            {servers.map((s) => {
              const key = `${s.name}-${s.type}`;
              const active = server?.name === s.name && server?.type === s.type;
              return (
                <button
                  key={key}
                  onClick={() => pickServer(s)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    active
                      ? "bg-white/15 text-white ring-1 ring-white/30"
                      : "bg-white/5 text-zinc-300 ring-1 ring-white/10 hover:bg-white/10"
                  }`}
                >
                  {s.name} · {s.type.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* prev / next */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() => prevEp && gotoEpisode(prevEp.number)}
          disabled={!prevEp}
          className="rounded-xl bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 ring-1 ring-white/10 transition hover:bg-white/10 disabled:opacity-40"
        >
          ← Prev
        </button>
        <button
          onClick={() => nextEp && gotoEpisode(nextEp.number)}
          disabled={!nextEp}
          className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:opacity-40"
        >
          Next →
        </button>
        {loadingServer && <span className="text-xs text-zinc-500">Loading servers…</span>}
      </div>

      {/* episode list (Animelok-style ranged selector) */}
      {episodes.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">List of episodes</h3>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              EPS:
              <select
                value={rangeIndex}
                onChange={(e) => gotoEpisode(Number(e.target.value) * RANGE + 1)}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {Array.from({ length: rangeCount }).map((_, i) => {
                  const s = i * RANGE + 1;
                  const e = Math.min(totalEpisodes, s + RANGE - 1);
                  return (
                    <option key={i} value={i} className="bg-zinc-900">
                      {s}-{e}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10">
            {visibleEpisodes.map((ep) => (
              <button
                key={ep.id}
                onClick={() => gotoEpisode(ep.number)}
                className={`rounded-lg px-2 py-2 text-sm font-semibold transition ${
                  ep.number === episode
                    ? "bg-purple-600 text-white"
                    : "bg-white/5 text-zinc-300 ring-1 ring-white/10 hover:bg-white/10"
                }`}
              >
                {ep.number}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
