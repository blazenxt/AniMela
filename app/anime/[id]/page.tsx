"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import Loading from "@/components/Loading";
import ErrorState from "@/components/ErrorState";
import { formatLabel, statusLabel, stripHtml } from "@/lib/anilist";
import { ExternalLinkIcon, PlayIcon, StarIcon } from "@/components/Icons";

export default function AnimePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, retry } = useApi(() => api.animeDetail(id), [id]);

  useEffect(() => {
    if (data?.title) document.title = `${data.title} — AniMela`;
  }, [data]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Anime not found."} onRetry={retry} />;

  const score = data.averageScore != null ? (data.averageScore / 10).toFixed(1) : null;
  const synopsis = stripHtml(data.description);
  const subtitle =
    data.englishTitle && data.englishTitle !== data.title
      ? data.englishTitle
      : data.nativeTitle && data.nativeTitle !== data.title
        ? data.nativeTitle
        : null;

  return (
    <div>
      <div className="relative h-[40vh] min-h-[240px] w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data.bannerImage || data.coverImage || ""}
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
            src={data.coverImage || ""}
            alt={data.title}
            className="w-36 shrink-0 rounded-2xl shadow-2xl ring-1 ring-white/10 sm:w-56"
          />
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="break-words font-display text-2xl font-bold text-white sm:text-5xl">
              {data.title}
            </h1>
            {subtitle && <p className="mt-1 text-zinc-400">{subtitle}</p>}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-zinc-400 sm:justify-start">
              {data.seasonYear && <span>{data.seasonYear}</span>}
              {data.episodes != null && <span>• {data.episodes} episodes</span>}
              {data.duration != null && <span>• {data.duration} min</span>}
              {score && (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                  • <StarIcon className="h-3.5 w-3.5" /> {score}
                </span>
              )}
              {statusLabel(data.status) && <span>• {statusLabel(data.status)}</span>}
            </div>
            {data.genres && data.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                {data.genres.map((g) => (
                  <span
                    key={g}
                    className="rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-zinc-200 ring-1 ring-white/10"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            <Link
              href={`/anime/${data.id}/watch`}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-3 font-bold text-white shadow-lg shadow-violet-900/40 transition hover:opacity-90"
            >
              <PlayIcon className="h-5 w-5" />
              Watch Now
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
          <div>
            {synopsis && (
              <div className="mt-6">
                <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-bold text-white">
                  <span className="h-5 w-1 rounded-full bg-violet-500" />
                  Synopsis
                </h2>
                <p className="leading-relaxed text-zinc-300">{synopsis}</p>
              </div>
            )}
          </div>

          <aside className="space-y-4 text-sm text-zinc-400">
            <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
              <h3 className="mb-2 font-bold text-white">Details</h3>
              <dl className="space-y-2">
                <Row label="Format" value={formatLabel(data.format)} />
                <Row label="Status" value={statusLabel(data.status) || "—"} />
                <Row label="Episodes" value={data.episodes != null ? String(data.episodes) : "—"} />
                <Row label="Duration" value={data.duration != null ? `${data.duration} min` : "—"} />
                <Row
                  label="Season"
                  value={
                    data.season && data.seasonYear
                      ? `${data.season} ${data.seasonYear}`
                      : data.seasonYear
                        ? String(data.seasonYear)
                        : "—"
                  }
                />
                <Row
                  label="Studios"
                  value={data.studios && data.studios.length ? data.studios.join(", ") : "—"}
                />
                <Row label="MAL Score" value={score ? `${score}/10` : "—"} />
              </dl>
            </div>

            <a
              href={`https://anilist.co/anime/${data.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-xl bg-violet-400/10 p-4 font-semibold text-violet-300 ring-1 ring-violet-400/20 transition hover:bg-violet-400/20"
            >
              View on AniList
              <ExternalLinkIcon className="h-4 w-4" />
            </a>
            {data.malId && (
              <a
                href={`https://myanimelist.net/anime/${data.malId}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-xl bg-sky-400/10 p-4 font-semibold text-sky-300 ring-1 ring-sky-400/20 transition hover:bg-sky-400/20"
              >
                View on MyAnimeList
                <ExternalLinkIcon className="h-4 w-4" />
              </a>
            )}
          </aside>
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
