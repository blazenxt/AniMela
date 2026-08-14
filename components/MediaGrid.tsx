"use client";

import { useEffect, useState } from "react";
import { MediaItem } from "@/lib/types";
import MediaCard from "./MediaCard";
import Loading from "./Loading";

interface PageResult {
  results: MediaItem[];
  total_pages?: number;
}

export default function MediaGrid({
  fetchPage,
  emptyLabel = "No results found.",
}: {
  fetchPage: (page: number) => Promise<PageResult>;
  emptyLabel?: string;
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
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
        setTotalPages(d.total_pages || 1);
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
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const d = await fetchPage(next);
      setItems((prev) => [...prev, ...(d.results || [])]);
      setPage(next);
      setTotalPages(d.total_pages || totalPages);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {items.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">{emptyLabel}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((m) => (
            <MediaCard key={m.id} item={m} />
          ))}
        </div>
      )}

      {page < totalPages && (
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
