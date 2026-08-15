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

export default function Player(props: PlayerProps) {
  const { kind, tmdbId, title, year, season, episode, imdbId, fallbacks } = props;

  // Start on the embed immediately so playback is never blocked by a spinner,
  // then upgrade to the direct HD player in the background if it resolves.
  const [mode, setMode] = useState<"embed" | "direct">("embed");
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
      const res = await fetch(`/api/source?${q.toString()}`, { signal: AbortSignal.timeout(12000) });
      const data = await res.json();
      if (res.ok && data?.sources?.length && !manualEmbed) {
        setSources(data.sources);
        setProvider(data.provider || "");
        setMode("direct");
      }
    } catch {
      // stay on embed
    }
  }, [kind, tmdbId, title, year, season, episode, imdbId, manualEmbed]);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    loadDirect();
  }, [loadDirect]);

  // New title / episode → reset and try direct again (background).
  useEffect(() => {
    attempted.current = false;
    setMode(manualEmbed ? "embed" : "embed");
    setSources([]);
    setProvider("");
    loadDirect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbId, title, season, episode]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {mode === "direct" && sources.length > 0 ? (
          <>
            <span className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
              HD player{provider ? ` · ${provider}` : ""}
            </span>
            <button
              onClick={() => setManualEmbed(true)}
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
        {mode === "direct" && sources.length > 0 && !manualEmbed ? (
          <CustomPlayer sources={sources} />
        ) : (
          <iframe
            key={fallbacks[embedIndex]?.src}
            src={fallbacks[embedIndex]?.src}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            // Block popups & top-navigation so tapping the embed can't open
            // ads or redirect the page away.
            sandbox="allow-scripts allow-same-origin allow-presentation allow-fullscreen"
            className="absolute inset-0 h-full w-full border-0"
            title="Stream player"
          />
        )}
      </div>
    </div>
  );
}
