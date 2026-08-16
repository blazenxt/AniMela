"use client";

import { useCallback, useEffect, useState } from "react";
import { api, AnimeEpisode } from "@/lib/api";
import CustomPlayer, { Source } from "./CustomPlayer";

interface State {
  episodes: AnimeEpisode[];
  available: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * Anime episode player: loads the episode list from `/api/v1/anime/{id}/episodes`,
 * lets the user pick an episode + Sub/Dub, then resolves a direct HLS stream via
 * `/api/v1/anime/{id}/stream` and hands it to CustomPlayer.
 */
export default function AnimePlayer({ anilistId, title }: { anilistId: number | string; title: string }) {
  const [state, setState] = useState<State>({ episodes: [], available: false, loading: true, error: null });
  const [dub, setDub] = useState(false);
  const [episode, setEpisode] = useState<AnimeEpisode | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [subtitles, setSubtitles] = useState<{ url: string; lang: string }[]>([]);
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState("");
  const [loadingStream, setLoadingStream] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .animeEpisodes(anilistId)
      .then((d) => active && setState({ episodes: d.episodes || [], available: !!d.available, loading: false, error: null }))
      .catch((e: unknown) =>
        active && setState({ episodes: [], available: false, loading: false, error: e instanceof Error ? e.message : "Failed to load episodes" })
      );
    return () => {
      active = false;
    };
  }, [anilistId]);

  const play = useCallback(
    async (ep: AnimeEpisode, useDub: boolean) => {
      setEpisode(ep);
      setSources([]);
      setStreamError(null);
      setLoadingStream(true);
      try {
        const d = await api.animeStream(anilistId, ep.number, useDub);
        if (d.available && d.sources?.length) {
          const referer = (d.headers as Record<string, string> | undefined)?.Referer || "";
          // IP-bound / Cloudflare-protected sources (flixcloud via Animelok) must
          // go through our same-origin HLS proxy so the browser never hits the
          // protected host directly.
          const proxied = d.sources.map((s) => ({
            quality: s.quality,
            url: referer
              ? `/api/hls?url=${encodeURIComponent(s.url)}&referer=${encodeURIComponent(referer)}`
              : s.url,
          }));
          setSources(proxied);
          setSubtitles(d.subtitles || []);
          setHeaders({});
          setProvider((d.provider as string) || "");
        } else {
          setStreamError("No playable source found for this episode.");
        }
      } catch (e: unknown) {
        setStreamError(e instanceof Error ? e.message : "Failed to load stream");
      } finally {
        setLoadingStream(false);
      }
    },
    [anilistId]
  );

  // re-resolve when the dub toggle changes while an episode is selected
  useEffect(() => {
    if (episode) play(episode, dub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dub]);

  if (state.loading) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-black ring-1 ring-white/10">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* player area */}
      <div className="relative w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10" style={{ aspectRatio: "16 / 9" }}>
        {sources.length > 0 ? (
          <div className="absolute inset-0">
            <CustomPlayer sources={sources} headers={headers} subtitles={subtitles} />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
            {loadingStream ? (
              <>
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                <p className="text-sm text-zinc-400">Resolving stream…</p>
              </>
            ) : state.error ? (
              <>
                <p className="font-semibold text-zinc-200">Couldn’t load episodes</p>
                <p className="text-sm text-zinc-500">{state.error}</p>
              </>
            ) : !state.available ? (
              <>
                <p className="font-semibold text-zinc-200">Streaming temporarily unavailable</p>
                <p className="max-w-md text-sm text-zinc-500">
                  No working source is available for this title right now. You can still browse
                  details, studios and ratings above, or watch it on AniList / MyAnimeList.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-zinc-200">
                  {streamError || (episode ? "No source available" : `Select an episode to watch ${title}`)}
                </p>
                <p className="text-sm text-zinc-500">
                  {streamError
                    ? "Try another episode or toggle Sub/Dub."
                    : episode
                      ? "This episode has no playable source right now."
                      : "Episodes are loaded below."}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* status bar */}
      {provider && sources.length > 0 && (
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Playing via {provider}
        </div>
      )}

      {/* sub/dub toggle */}
      {state.available && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">Audio:</span>
          <div className="flex rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
            {(["Sub", "Dub"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setDub(mode === "Dub")}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                  (mode === "Dub") === dub ? "bg-purple-600 text-white" : "text-zinc-300 hover:text-white"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* episode grid */}
      {state.available && state.episodes.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-zinc-400">Episodes</h3>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
            {state.episodes.map((ep) => (
              <button
                key={ep.id}
                onClick={() => play(ep, dub)}
                className={`rounded-lg px-2 py-2 text-sm font-semibold transition ${
                  episode?.id === ep.id
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
