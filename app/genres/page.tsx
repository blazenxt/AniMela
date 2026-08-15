"use client";

import Link from "next/link";
import { api, Genre } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import Loading from "@/components/Loading";

const COLORS = [
  "from-fuchsia-500/30 to-purple-500/20",
  "from-rose-500/30 to-red-500/20",
  "from-amber-500/30 to-orange-500/20",
  "from-emerald-500/30 to-teal-500/20",
  "from-sky-500/30 to-indigo-500/20",
];

function GenreGroup({
  title,
  kind,
}: {
  title: string;
  kind: "movie" | "tv";
}) {
  const { data, loading } = useApi(() => api.genreList(kind), [kind]);
  const genres: Genre[] = data?.genres || [];

  if (loading) return <Loading label={`Loading ${title.toLowerCase()}…`} />;

  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-white">
        <span className="h-5 w-1 rounded-full bg-purple-500" />
        {title}
      </h2>
      <div className="flex flex-wrap gap-3">
        {genres.map((g, i) => (
          <Link
            key={g.id}
            href={`/genre/${kind}/${g.id}?name=${encodeURIComponent(g.name)}`}
            className={`rounded-xl bg-gradient-to-br ${COLORS[i % COLORS.length]} px-4 py-3 font-semibold text-white ring-1 ring-white/10 transition hover:ring-white/30`}
          >
            {g.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function GenresPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 font-display text-3xl font-bold text-white">Browse by Genre</h1>
      <p className="mb-8 text-sm text-zinc-500">Pick a genre to explore movies or series.</p>
      <div className="space-y-10">
        <GenreGroup title="Movies" kind="movie" />
        <GenreGroup title="Series" kind="tv" />
      </div>
    </div>
  );
}
