import { NextRequest, NextResponse } from "next/server";
import { decryptVideasy } from "@/lib/videasy-decrypt";

/**
 * Resolves a direct HLS (.m3u8) stream for a movie or TV episode.
 *
 * Flow (server-side, so browser CORS/referer limits don't apply):
 *   1. Fetch the encrypted "sources-with-title" payload from api.videasy.to
 *      (trying each active provider in turn).
 *   2. Decrypt it with the WASM crypto core (see lib/videasy-decrypt.ts).
 *   3. Return { sources: [{quality, url}], subtitles } to the client.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API_BASE = "https://api.videasy.to";
const ORIGIN = "https://www.vidking.net";
const REFERER = "https://www.vidking.net/";

const PROVIDERS = [
  { name: "Oxygen", endpoint: "mb-flix" },
  { name: "Hydrogen", endpoint: "cdn" },
  { name: "Lithium", endpoint: "downloader2" },
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  Referer: REFERER,
  Origin: ORIGIN,
};

interface Params {
  tmdbId: string;
  mediaType: string;
  title: string;
  year?: string;
  seasonId?: string;
  episodeId?: string;
  imdbId?: string;
}

async function fetchCipher(endpoint: string, params: Params): Promise<string> {
  const q = new URLSearchParams();
  q.set("title", params.title);
  q.set("mediaType", params.mediaType);
  if (params.year) q.set("year", params.year);
  if (params.mediaType === "tv") {
    q.set("seasonId", params.seasonId || "1");
    q.set("episodeId", params.episodeId || "1");
  }
  q.set("tmdbId", params.tmdbId);
  if (params.imdbId) q.set("imdbId", params.imdbId);

  const url = `${API_BASE}/${endpoint}/sources-with-title?${q.toString()}`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.text()).trim();
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tmdbId = sp.get("tmdbId");
  const mediaType = (sp.get("mediaType") || "movie").toLowerCase();
  const title = sp.get("title");

  if (!tmdbId || !title) {
    return NextResponse.json({ error: "tmdbId and title are required" }, { status: 400 });
  }

  const params: Params = {
    tmdbId,
    mediaType,
    title,
    year: sp.get("year") || undefined,
    seasonId: sp.get("seasonId") || undefined,
    episodeId: sp.get("episodeId") || undefined,
    imdbId: sp.get("imdbId") || undefined,
  };

  const errors: string[] = [];
  for (const p of PROVIDERS) {
    try {
      const cipher = await fetchCipher(p.endpoint, params);
      if (!cipher) {
        errors.push(`${p.name}: empty response`);
        continue;
      }
      const data = await decryptVideasy(cipher, tmdbId);
      const sources = (data?.sources || []).filter((s: any) => s && s.url);
      if (!sources.length) {
        errors.push(`${p.name}: no playable sources`);
        continue;
      }
      return NextResponse.json({
        provider: p.name,
        sources,
        subtitles: data?.subtitles || [],
      });
    } catch (e) {
      errors.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json(
    { error: `All providers failed — ${errors.join("; ")}` },
    { status: 502 }
  );
}
