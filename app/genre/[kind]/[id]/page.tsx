"use client";

import { Suspense, use } from "react";
import { useSearchParams } from "next/navigation";
import MediaGrid from "@/components/MediaGrid";
import { api, Kind } from "@/lib/api";

function GenreResults({ kind, id }: { kind: Kind; id: string }) {
  const sp = useSearchParams();
  const name = sp.get("name") || "Genre";

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-3xl font-black text-white capitalize">{name}</h1>
      <p className="mb-6 text-sm text-zinc-500">{kind === "movie" ? "Movies" : "Series"} in this genre.</p>
      <MediaGrid
        key={`${kind}-${id}`}
        emptyLabel={`No ${kind === "movie" ? "movies" : "series"} found in this genre.`}
        fetchPage={(p) => api.discover(kind, id, p)}
      />
    </div>
  );
}

export default function GenrePage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = use(params);
  const validKind: Kind = kind === "tv" ? "tv" : "movie";

  return (
    <Suspense fallback={<div className="py-20 text-center text-zinc-500">Loading…</div>}>
      <GenreResults kind={validKind} id={id} />
    </Suspense>
  );
}
