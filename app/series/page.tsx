"use client";

import MediaGrid from "@/components/MediaGrid";
import { api } from "@/lib/api";

export default function SeriesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 font-display text-3xl font-bold text-white">Trending Series</h1>
      <MediaGrid fetchPage={(p) => api.trendingTv(p)} emptyLabel="No series found." />
    </div>
  );
}
