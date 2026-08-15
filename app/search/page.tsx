"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import MediaGrid from "@/components/MediaGrid";
import { api } from "@/lib/api";

function Results() {
  const sp = useSearchParams();
  const q = sp.get("q") || "";

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 font-display text-3xl font-bold text-white">Results for “{q}”</h1>
      <MediaGrid
        key={q}
        emptyLabel={`No results for "${q}".`}
        fetchPage={async (p) => {
          const d = await api.search(q, p);
          return { ...d, results: (d.results || []).filter((r: any) => r.media_type !== "person") };
        }}
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
