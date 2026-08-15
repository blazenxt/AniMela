"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CustomPlayer, { Source } from "./CustomPlayer";

export interface FallbackSource {
  label: string;
  src: string;
}

export interface PlayerProps {
  kind: "movie" | "tv";
  tmdbId: number | string;
  title: string;
  year?: string;
  season?: number;
  episode?: number;
  imdbId?: string;
  fallbacks: FallbackSource[];
}

type Mode = "loading" | "direct" | "embed" | "error";

export default function Player(props: PlayerProps) {
  const { kind, tmdbId, title, year, season, episode, imdbId, fallbacks } = props;

  const [mode, setMode] = useState<Mode>("loading");
  const [sources, setSources] = useState<Source[]>([]);
  const [provider, setProvider] = useState<string>("");
  const [embedIndex, setEmbedIndex] = useState(0);
  const [manualEmbed, setManualEmbed] = useState(false);
  const attempted = useRef(false);

  const loadDirect = useCallback(async () => {
    const q = new URLSearchParams();
    q.set("tmdbId", String(tmdbId));
    q.set("mediaType", kind);
    q.set("title", title);
    if (year) q.set("year", year);
    if (kind === "tv") {
      q.set("seasonId", String(season || 1));
      q.set("episodeId", String(episode || 1));
    }
    if (imdbId) q.set("imdbId", imdbId);

    try {
      const res = await fetch(`/api/source?${q.toString()}`, { signal: AbortSignal.timeout(45000) });
      const data = await res.json();
      if (res.ok && data?.sources?.length) {
        setSources(data.sources);
        setProvider(data.provider || "");
        setMode("direct");
        return;
      }
      setMode("embed");
    } catch {
      setMode("embed");
    }
  }, [kind, tmdbId, title, year, season, episode, imdbId]);

  useEffect(() => {
    if (attempted.current || manualEmbed) return;
    attempted.current = true;
    loadDirect();
  }, [loadDirect, manualEmbed]);

  // Reset when a new episode/title loads (same component instance re-used)
  useEffect(() => {
    attempted.current = false;
    if (!manualEmbed) {
      setMode("loading");
      setSources([]);
      setProvider("");
      loadDirect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbId, title, season, episode]);

  return (
    <div>
      {/* mode toggle */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {mode === "direct" && sources.length > 0 && (
          <span className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
            HD stream{provider ? ` · ${provider}` : ""}
          </span>
        )}
        {(mode === "embed" || manualEmbed) && fallbacks.map((f, i) => (
          <button
            key={f.label}
            onClick={() => {
              setManualEmbed(true);
              setEmbedIndex(i);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              i === embedIndex && manualEmbed ? "bg-purple-600 text-white" : "bg-white/5 text-zinc-300 hover:bg-white/10"
            }`}
          >
            {f.label}
          </button>
        ))}
        {mode === "direct" && sources.length > 0 && fallbacks.length > 0 && (
          <button
            onClick={() => setManualEmbed(true)}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-400 transition hover:text-white"
          >
            Switch to embed
          </button>
        )}
        {manualEmbed && (
          <button
            onClick={() => {
              setManualEmbed(false);
              setMode("loading");
              attempted.current = false;
              loadDirect();
            }}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-400 transition hover:text-white"
          >
            Use HD player
          </button>
        )}
      </div>

      <div
        className="relative w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10"
        style={{ aspectRatio: "16 / 9" }}
      >
        {mode === "loading" && !manualEmbed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500/30 border-t-purple-500" />
            <span className="text-sm">Finding the best stream…</span>
          </div>
        )}

        {mode === "direct" && !manualEmbed && sources.length > 0 && (
          <CustomPlayer sources={sources} />
        )}

        {(manualEmbed || mode === "embed") && fallbacks.length > 0 && (
          <iframe
            key={fallbacks[embedIndex]?.src}
            src={fallbacks[embedIndex]?.src}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
            title="Stream player"
          />
        )}
      </div>
    </div>
  );
}
