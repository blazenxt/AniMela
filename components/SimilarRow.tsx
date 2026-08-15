"use client";

import { api, Kind } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { MediaItem } from "@/lib/types";
import MediaCard from "./MediaCard";

export default function SimilarRow({ kind, id }: { kind: Kind; id: number | string }) {
  const { data, loading } = useApi(() => api.similar(kind, id), [kind, id]);
  const items: MediaItem[] = (data?.results || []).slice(0, 20);

  if (loading) return <p className="text-sm text-zinc-500">Loading recommendations…</p>;
  if (!items.length) return null;

  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-white">
        <span className="h-5 w-1 rounded-full bg-violet-500" />
        More like this
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
        {items.map((m) => (
          <MediaCard key={m.id} item={m} className="w-40 shrink-0 snap-start" />
        ))}
      </div>
    </div>
  );
}
