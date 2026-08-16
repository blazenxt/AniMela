"use client";

import { Suspense, use, useEffect } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import Loading from "@/components/Loading";
import ErrorState from "@/components/ErrorState";
import AnimeWatch from "@/components/AnimeWatch";

function WatchPage({ id }: { id: string }) {
  const { data, loading, error, retry } = useApi(() => api.animeDetail(id), [id]);

  useEffect(() => {
    if (data?.title) document.title = `Watch ${data.title} — AniMela`;
  }, [data]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Anime not found."} onRetry={retry} />;

  const score = data.averageScore != null ? (data.averageScore / 10).toFixed(1) : null;

  return <AnimeWatch anilistId={data.id} title={data.title} score={score} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Loading />}>
      <WatchPage id={id} />
    </Suspense>
  );
}
