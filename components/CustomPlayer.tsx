"use client";

import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";

export interface Source {
  quality: string;
  url: string;
}

interface Props {
  sources: Source[];
}

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) return "0:00";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function CustomPlayer({ sources }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [quality, setQuality] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const hlsRef = useRef<Hls | null>(null);

  // sort sources: prefer 720P / 1080P first
  const sorted = useCallback((list: Source[]) => {
    const rank: Record<string, number> = { "1080": 5, "720": 4, "480": 3, "360": 2, "240": 1 };
    return [...list].sort((a, b) => {
      const ra = rank[a.quality.toUpperCase().replace(/[P]/, "")] || 0;
      const rb = rank[b.quality.toUpperCase().replace(/[P]/, "")] || 0;
      return rb - ra;
    });
  }, []);

  const [list] = useState<Source[]>(() => sorted(sources));

  const attach = useCallback(
    (url: string) => {
      const video = videoRef.current;
      if (!video) return;

      // clean up previous instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            setError("Stream error — try another server.");
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari / iOS native HLS
        video.src = url;
        video.addEventListener("loadedmetadata", () => video.play().catch(() => {}), { once: true });
      } else {
        setError("This browser cannot play HLS streams.");
      }
    },
    []
  );

  // attach the selected source
  useEffect(() => {
    const url = list[quality]?.url;
    if (!url) {
      setError("No playable source found.");
      return;
    }
    setError(null);
    setCurrent(0);
    setDuration(0);
    attach(url);
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [quality, list, attach]);

  // --- controls ---
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const seek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const t = Number(e.target.value);
    v.currentTime = t;
    setCurrent(t);
  }, []);

  const changeVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    const val = Number(e.target.value);
    setVolume(val);
    setMuted(val === 0);
    if (v) {
      v.volume = val;
      v.muted = val === 0;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const next = !muted;
    setMuted(next);
    if (v) v.muted = next;
  }, [muted]);

  const toggleFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused) setControlsVisible(false);
    }, 3000);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrent(v.currentTime);
    const onDur = () => setDuration(v.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onEnded = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("durationchange", onDur);
    v.addEventListener("loadedmetadata", onDur);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("durationchange", onDur);
      v.removeEventListener("loadedmetadata", onDur);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("ended", onEnded);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      onMouseMove={showControls}
      onTouchStart={showControls}
      className="group relative w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10"
      style={{ aspectRatio: "16 / 9" }}
    >
      <video
        ref={videoRef}
        playsInline
        onClick={togglePlay}
        className="absolute inset-0 h-full w-full object-contain"
      />

      {/* big center play / pause */}
      {!buffering && (
        <button
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className={`absolute inset-0 z-10 flex items-center justify-center transition ${
            playing && controlsVisible ? "opacity-0" : "opacity-100"
          }`}
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 backdrop-blur">
            {playing ? (
              <svg viewBox="0 0 24 24" fill="white" className="h-8 w-8">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="white" className="h-8 w-8">
                <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11.14-6.86a1.03 1.03 0 0 0 0-1.76L9.56 4.26A1.03 1.03 0 0 0 8 5.14Z" />
              </svg>
            )}
          </span>
        </button>
      )}

      {/* buffering spinner */}
      {buffering && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      )}

      {/* error */}
      {error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-4 text-center text-sm text-red-300">
          {error}
        </div>
      )}

      {/* bottom control bar */}
      <div
        className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 to-transparent px-3 pb-2 pt-8 transition ${
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {/* seek bar */}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={current}
          onChange={seek}
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-purple-500"
          aria-label="Seek"
        />

        <div className="mt-1.5 flex items-center gap-2 text-white">
          {/* play / pause */}
          <button onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} className="shrink-0 p-1">
            {playing ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11.14-6.86a1.03 1.03 0 0 0 0-1.76L9.56 4.26A1.03 1.03 0 0 0 8 5.14Z" />
              </svg>
            )}
          </button>

          {/* time */}
          <span className="shrink-0 text-xs tabular-nums">
            {fmt(current)} / {fmt(duration)}
          </span>

          <div className="flex-1" />

          {/* volume */}
          <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className="shrink-0 p-1">
            {muted || volume === 0 ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M16.5 12a4.5 4.5 0 0 0-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            )}
          </button>

          {list.length > 1 && (
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={changeVolume}
              className="hidden w-20 sm:block"
              aria-label="Volume"
            />
          )}

          {/* quality */}
          {list.length > 1 && (
            <select
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-xs text-white focus:outline-none"
              aria-label="Quality"
            >
              {list.map((s, i) => (
                <option key={i} value={i} className="bg-zinc-900">
                  {s.quality}
                </option>
              ))}
            </select>
          )}

          {/* fullscreen */}
          <button onClick={toggleFullscreen} aria-label="Fullscreen" className="shrink-0 p-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
