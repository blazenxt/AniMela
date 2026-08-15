"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CustomPlayer, { Source } from "./CustomPlayer";
import { PlayIcon } from "./Icons";

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

export default function Player(props: PlayerProps) {
  const { kind, tmdbId, title, year, season, episode, imdbId, fallbacks } = props;

  // The embed fires an ad/redirect on the FIRST tap inside the iframe.
  // We avoid that by showing our own "click to play" overlay first — the
  // user's first tap hits OUR button, and only then do we mount the iframe.
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<"embed" | "direct">("embed");
  const [sources, setSources] = useState<Source[]>([]);
  const [provider, setProvider] = useState<string>("");
  const [embedIndex, setEmbedIndex] = useState(0);
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
      const res = await fetch(`/api/source?${q.toString()}`, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();
      if (res.ok && data?.sources?.length) {
        setSources(data.sources);
        setProvider(data.provider || "");
        setMode("direct");
        setStarted(true); // direct player starts immediately, no overlay needed
      }
    } catch {
      // stay on embed
    }
  }, [kind, tmdbId, title, year, season, episode, imdbId]);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    loadDirect();
  }, [loadDirect]);

  // New title / episode → reset.
  useEffect(() => {
    attempted.current = false;
    setMode("embed");
    setSources([]);
    setProvider("");
    setStarted(false);
    loadDirect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbId, title, season, episode]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {mode === "direct" && sources.length > 0 && started ? (
          <>
            <span className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
              HD player{provider ? ` · ${provider}` : ""}
            </span>
            <button
              onClick={() => {
                setMode("embed");
                setStarted(false);
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-400 transition hover:text-white"
            >
              Switch to embed
            </button>
          </>
        ) : (
          fallbacks.map((f, i) => (
            <button
              key={f.label}
              onClick={() => setEmbedIndex(i)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                i === embedIndex ? "bg-purple-600 text-white" : "bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
            >
              {f.label}
            </button>
          ))
        )}
      </div>

      <div
        className="relative w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10"
        style={{ aspectRatio: "16 / 9" }}
      >
        {mode === "direct" && sources.length > 0 && started ? (
          <CustomPlayer sources={sources} />
        ) : started ? (
          // clean embed (no sandbox — Videasy refuses to run inside a sandbox)
          <iframe
            key={fallbacks[embedIndex]?.src}
            src={fallbacks[embedIndex]?.src}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
            title="Stream player"
          />
        ) : (
          // click-to-play overlay (our own button, before the embed mounts)
          <button
            onClick={() => setStarted(true)}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-purple-600/90 shadow-lg shadow-purple-900/50 transition hover:scale-105">
              <PlayIcon className="h-8 w-8 text-white" />
            </span>
            <span className="text-sm font-semibold text-zinc-200">Click to play</span>
          </button>
        )}
      </div>
    </div>
  );
}
