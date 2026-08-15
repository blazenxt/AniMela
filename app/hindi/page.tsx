"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { api, HindiMovieItem } from "@/lib/api";
import HindiMovieCard from "@/components/HindiMovieCard";

function HindiPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const q = sp.get("q") || "";

  const [query, setQuery] = useState(q);
  const [items, setItems] = useState<HindiMovieItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const fetcher = q ? api.hindiSearch(q) : api.hindiRecent();
    fetcher
      .then((d) => active && setItems(d.results || []))
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [q]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = query.trim();
    router.push(t ? `/hindi?q=${encodeURIComponent(t)}` : "/hindi");
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 font-display text-3xl font-bold text-white">Hindi Movies</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Hindi dubbed, Bollywood &amp; regional movies — search below or browse the latest.
      </p>

      <form onSubmit={submit} className="mb-8 flex max-w-xl gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Hindi / Bollywood movies…"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
        <button
          type="submit"
          className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
        >
          Search
        </button>
      </form>

      {q && (
        <h2 className="mb-4 text-sm text-zinc-400">
          Results for <span className="font-semibold text-white">“{q}”</span>
        </h2>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No movies found.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((m) => (
            <HindiMovieCard key={`${m.provider}-${m.id}`} item={m} className="w-full" />
          ))}
        </div>
      )}
    </div>
  );
}

export default function HindiPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-zinc-500">Loading…</div>}>
      <HindiPageInner />
    </Suspense>
  );
}
