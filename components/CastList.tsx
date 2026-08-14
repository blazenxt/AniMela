"use client";

import { api, Kind } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { poster } from "@/lib/images";

interface CastMember {
  id: number;
  name: string;
  character?: string;
  profile_path?: string | null;
}

export default function CastList({ kind, id }: { kind: Kind; id: number | string }) {
  const { data, loading } = useApi(() => api.credits(kind, id), [kind, id]);
  const cast: CastMember[] = (data?.cast || []).slice(0, 12);

  if (loading) return <p className="text-sm text-zinc-500">Loading cast…</p>;
  if (!cast.length) return null;

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-white">Cast</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
        {cast.map((c) => (
          <div key={c.id} className="w-24 shrink-0 text-center">
            <div className="aspect-[2/3] overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={poster(c.profile_path, "w185")}
                alt={c.name}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
            <p className="mt-1.5 truncate text-xs font-semibold text-zinc-200">{c.name}</p>
            <p className="truncate text-[11px] text-zinc-500">{c.character}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
