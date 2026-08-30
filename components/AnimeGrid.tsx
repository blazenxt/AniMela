"use client";

import { useEffect, useState } from "react";
import { AnimeItem } from "@/lib/anilist";
import AnimeCard from "./AnimeCard";
import { SkeletonCard } from "./Loading";

interface AnimePage {
  page: number;
  has_next_page: boolean;
  results: AnimeItem[];
}

/**
 * Paginated grid for AniList-backed anime results. Mirrors MediaGrid but uses
 * AniList's `has_next_page` cursor (no total page count) and AnimeCard.
 */
export default function AnimeGrid({
  fetchPage,
  emptyLabel = "No anime found.",
}: {
  fetchPage: (page: number) => Promise<AnimePage>;
  emptyLabel?: string;
}) {
  const [items, setItems] = useState<AnimeItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchPage(1)
      .then((d) => {
        if (!active) return;
        setItems(d.results || []);
        setHasNext(!!d.has_next_page);
        setPage(1);
      })
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = async () => {
    if (loadingMore || !hasNext) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const d = await fetchPage(next);
      setItems((prev) => [...prev, ...(d.results || [])]);
      setPage(next);
      setHasNext(!!d.has_next_page);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {items.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">{emptyLabel}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((a) => (
            <AnimeCard key={a.id} item={a} className="w-full" />
          ))}
        </div>
      )}

      {hasNext && (
        <div className="mt-8 text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-xl bg-white/10 px-6 py-3 font-semibold text-white transition hover:bg-white/15 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </>
  );
}
