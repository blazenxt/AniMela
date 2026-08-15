"use client";

import { useState } from "react";
import { ExternalLinkIcon } from "@/components/Icons";

export interface PlayerSource {
  label: string;
  src: string;
}

export default function Player({ sources }: { sources: PlayerSource[] }) {
  const [active, setActive] = useState(0);
  const src = sources[active]?.src;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {sources.map((s, i) => (
          <button
            key={s.label}
            onClick={() => setActive(i)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              i === active ? "bg-purple-600 text-white" : "bg-white/5 text-zinc-300 hover:bg-white/10"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div
        className="relative w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10"
        style={{ aspectRatio: "16 / 9" }}
      >
        <iframe
          key={src}
          src={src}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
          title="Stream player"
        />
      </div>

      {src && (
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-purple-300 transition hover:text-purple-200"
        >
          Having trouble playing? Open in a new tab
          <ExternalLinkIcon className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}
