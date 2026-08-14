"use client";

import MediaGrid from "@/components/MediaGrid";
import { api } from "@/lib/api";

export default function AnimePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-3xl font-black text-white">Anime</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Anime movies &amp; series — anything animated, streamed with the same players.
      </p>
      <MediaGrid
        emptyLabel="No anime found."
        fetchPage={async (p) => {
          const d = await api.search("anime", p);
          return { ...d, results: (d.results || []).filter((r: any) => r.media_type !== "person") };
        }}
      />
    </div>
  );
}
