"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import MediaGrid from "@/components/MediaGrid";
import AnimeGrid from "@/components/AnimeGrid";
import { api } from "@/lib/api";

function Results() {
  const sp = useSearchParams();
  const q = sp.get("q") || "";

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 font-display text-3xl font-bold text-white">Results for “{q}”</h1>

      <MediaGrid
        key={`media-${q}`}
        emptyLabel={`No results for "${q}".`}
        fetchPage={async (p) => {
          const d = await api.search(q, p);
          return { ...d, results: (d.results || []).filter((r: any) => r.media_type !== "person") };
        }}
      />

      <h2 className="mb-4 mt-12 flex items-center gap-2 font-display text-xl font-bold text-white">
        <span className="h-5 w-1 rounded-full bg-violet-500" />
        Anime
      </h2>
      <AnimeGrid
        key={`anime-${q}`}
        emptyLabel={`No anime for "${q}".`}
        fetchPage={(p) => api.animeSearch(q, p)}
      />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-zinc-500">Loading…</div>}>
      <Results />
    </Suspense>
  );
}
