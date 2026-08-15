"use client";

import { useState } from "react";
import AnimeGrid from "@/components/AnimeGrid";
import { api } from "@/lib/api";

type Tab = "series" | "movies";
type Sort = "trending" | "popularity" | "rating";

const TABS: { id: Tab; label: string }[] = [
  { id: "series", label: "Anime Series" },
  { id: "movies", label: "Anime Movies" },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "popularity", label: "Popular" },
  { id: "rating", label: "Top Rated" },
];

export default function AnimePage() {
  const [tab, setTab] = useState<Tab>("series");
  const [sort, setSort] = useState<Sort>("trending");

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 font-display text-3xl font-bold text-white">Anime</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Real anime catalog — Japanese &amp; English titles, studios, airing status and MAL-style
        scores, sourced from AniList.
      </p>

      {/* tab + sort controls */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                tab === t.id ? "bg-purple-600 text-white" : "text-zinc-300 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
          {SORTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                sort === s.id ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <AnimeGrid
        key={`${tab}-${sort}`}
        emptyLabel="No anime found."
        fetchPage={(p) => api.animeBrowse({ type: tab, sort, page: p })}
      />
    </div>
  );
}
