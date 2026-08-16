"use client";

import { use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import Loading from "@/components/Loading";
import ErrorState from "@/components/ErrorState";
import { ExternalLinkIcon, StarIcon } from "@/components/Icons";
import { PLACEHOLDER } from "@/lib/images";

function ResolveButton({ url, label }: { url: string; label: string }) {
  const [resolved, setResolved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [dead, setDead] = useState(false);

  const resolve = async () => {
    setBusy(true);
    setNote(null);
    setDead(false);
    try {
      const d = await api.unshorten(url);
      if (d.ok && d.resolvedUrl) {
        setResolved(d.resolvedUrl);
        setDead(!!d.dead);
        setNote(d.dead ? d.note || "dead link" : d.method === "redirect" ? "direct link" : "resolved");
      } else {
        setNote(d.note || "protected link (captcha)");
      }
    } catch {
      setNote("could not resolve");
    } finally {
      setBusy(false);
    }
  };

  const href = resolved || url;

  return (
    <span className="inline-flex items-center gap-1.5">
      <a
        href={href}
        target="_blank"
        rel="noreferrer nofollow"
        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 transition ${
          dead
            ? "bg-rose-500/10 text-rose-300 ring-rose-500/30 line-through"
            : "bg-white/5 text-white ring-white/10 hover:bg-white/10"
        }`}
      >
        {label}
        {resolved && !dead && <span className="text-xs text-emerald-300">✓</span>}
        {dead && <span className="text-xs">✕</span>}
        <ExternalLinkIcon className="h-4 w-4 text-zinc-400" />
      </a>
      <button
        onClick={resolve}
        disabled={busy}
        title="Resolve the shortener server-side to get the direct link"
        className="rounded-lg px-2 py-2 text-xs font-semibold text-violet-300 ring-1 ring-violet-400/30 transition hover:bg-violet-400/10 disabled:opacity-50"
      >
        {busy ? "…" : resolved ? "re-resolve" : "resolve"}
      </button>
      {note && (
        <span className={`text-xs ${dead ? "text-rose-400" : "text-zinc-500"}`}>{note}</span>
      )}
    </span>
  );
}

export default function HindiMoviePage({
  params,
}: {
  params: Promise<{ provider: string; id: string }>;
}) {
  const { provider, id } = use(params);
  const { data, loading, error, retry } = useApi(() => api.hindiDetail(provider, id), [provider, id]);

  useEffect(() => {
    if (data?.title) document.title = `${data.title} — AniMela`;
  }, [data]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Movie not found."} onRetry={retry} />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-6 sm:flex-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data.image || PLACEHOLDER}
          alt={data.title}
          className="w-40 shrink-0 self-center rounded-2xl shadow-2xl ring-1 ring-white/10 sm:w-56 sm:self-start"
        />

        <div className="min-w-0 flex-1">
          <h1 className="break-words font-display text-2xl font-bold text-white sm:text-4xl">
            {data.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-400">
            {data.year && <span>{data.year}</span>}
            {data.rating && (
              <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                • <StarIcon className="h-3.5 w-3.5" /> {data.rating}/10
              </span>
            )}
          </div>

          {data.plot && (
            <div className="mt-5">
              <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-bold text-white">
                <span className="h-5 w-1 rounded-full bg-violet-500" />
                Plot
              </h2>
              <p className="leading-relaxed text-zinc-300">{data.plot}</p>
            </div>
          )}

          {data.links.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-white">
                <span className="h-5 w-1 rounded-full bg-fuchsia-500" />
                Download / Watch
              </h2>
              <p className="mb-3 text-xs text-zinc-500">
                These are third-party download links (Google Drive / GDToT behind a shortener).
                Tap <span className="font-semibold text-violet-300">resolve</span> to try to get the
                direct link server-side (captcha-protected links will fall back to opening the
                original page).
              </p>
              <div className="flex flex-wrap gap-2">
                {data.links.map((l, i) => (
                  <ResolveButton key={i} url={l.url} label={l.label} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
