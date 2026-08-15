/**
 * HiAnime provider — direct scraper for hianime.to (ex zoro.to / aniwatch).
 *
 * This is the "self-hosted, no third-party" primary provider. It scrapes the
 * public AJAX endpoints directly:
 *
 *   GET /ajax/search/suggest?keyword={q}       → { suggestions: [{ id, name, ... }] }
 *   GET /ajax/v2/episode/list/{animeId}        → HTML (episode ids)
 *   GET /ajax/v2/episode/servers?episodeId={id}→ HTML (sub/dub server ids)
 *   GET /ajax/v2/episode/sources?id={serverId} → JSON (possibly AES-encrypted)
 *
 * ⚠️ HiAnime rotates its source-endpoint schema and encryption periodically.
 * This file isolates that churn: search/episodes/servers are stable, while the
 * `sources` decryption is best-effort (configurable via `HIANIME_SOURCES_KEY`).
 * If it fails, the resolver transparently falls back to Consumet — this is the
 * whole point of the provider abstraction.
 */

import crypto from "crypto";
import { AnimeEpisode, AnimeRef, StreamProvider, StreamResult } from "../anime-stream";

const BASE = (process.env.HIANIME_BASE || "https://hianime.to").replace(/\/+$/, "");
const TIMEOUT_MS = 10000;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  Referer: `${BASE}/`,
  Origin: BASE,
};

async function getJson<T = any>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`hianime ${res.status}`);
  return (await res.json()) as T;
}

async function getHtml(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...HEADERS, Accept: "text/html, */*" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`hianime ${res.status}`);
  return res.text();
}

// ── title → hianime slug cache (avoid double search in list→resolve) ────────
const slugCache = new Map<string, string>();

async function resolveSlug(ref: AnimeRef): Promise<string | null> {
  const cacheKey = `${ref.title}::${ref.year || ""}`;
  const cached = slugCache.get(cacheKey);
  if (cached) return cached;

  const d = await getJson<any>(`/ajax/search/suggest?keyword=${encodeURIComponent(ref.title)}`);
  const suggestions: any[] = d?.suggestions || [];
  if (!suggestions.length) return null;

  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const target = norm(ref.title);
  const match =
    suggestions.find((s) => norm(s.name) === target || norm(s.jname) === target) ||
    suggestions[0];

  if (match?.id) slugCache.set(cacheKey, match.id);
  return match?.id || null;
}

// ── HTML parsing (regex — no DOM lib needed) ─────────────────────────────────

function parseEpisodes(html: string): AnimeEpisode[] {
  const ids = [...html.matchAll(/data-id="(\d+)"/g)].map((m) => m[1]);
  const nums = [...html.matchAll(/data-number="(\d+)"/g)].map((m) => Number(m[1]));
  const out: AnimeEpisode[] = [];
  for (let i = 0; i < ids.length; i++) {
    out.push({ id: ids[i], number: nums[i] ?? i + 1 });
  }
  return out;
}

interface ServerInfo {
  id: string;
  name: string;
}

function parseServers(html: string): { sub: ServerInfo[]; dub: ServerInfo[] } {
  const pick = (block: string): ServerInfo[] => {
    const ids = [...block.matchAll(/data-server-id="(\d+)"/g)].map((m) => m[1]);
    const names = [...block.matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1].trim());
    return ids.map((id, i) => ({ id, name: names[i] || `Server ${i + 1}` }));
  };

  // split on the sub/dub block markers if present
  const subBlock = html.split(/ps_-block-dub/)[0];
  const dubBlock = html.includes("ps_-block-dub") ? html.split(/ps_-block-dub/)[1] : "";
  return { sub: pick(subBlock), dub: pick(dubBlock) };
}

/**
 * Best-effort AES-256-CBC decrypt of HiAnime's encrypted `sources` payload.
 * Handles both common shapes:
 *   - key/iv provided alongside base64 ciphertext
 *   - bare base64 whose first 16 bytes are the IV
 * The key defaults to env `HIANIME_SOURCES_KEY` (verify against upstream —
 * HiAnime has rotated this before).
 */
function decryptSources(data: string, key?: string, iv?: string): string | null {
  const KEY = (key || process.env.HIANIME_SOURCES_KEY || "").trim();
  if (!KEY) return null;
  try {
    let keyBuf = Buffer.from(KEY, "utf8");
    if (keyBuf.length < 32) keyBuf = Buffer.concat([keyBuf, Buffer.alloc(32 - keyBuf.length)]);
    if (keyBuf.length > 32) keyBuf = keyBuf.subarray(0, 32);

    const raw = Buffer.from(data, "base64");
    const ivBuf = iv ? Buffer.from(iv, "utf8").subarray(0, 16) : raw.subarray(0, 16);
    const cipher = iv ? raw : raw.subarray(16);

    const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuf, ivBuf);
    return Buffer.concat([decipher.update(cipher), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Extract { sources, tracks } from a (possibly decrypted) payload. */
function mapEncryptedSources(text: string): StreamResult["sources"] {
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    return [];
  }
  const list = obj?.sources || obj?.data?.sources || [];
  return (Array.isArray(list) ? list : [])
    .map((s: any) => ({
      url: s.file || s.url,
      quality: s.quality || s.label || "default",
      isM3U8: (s.type || "").toLowerCase().includes("hls") || /\.m3u8/.test(s.file || s.url || ""),
    }))
    .filter((s: any) => s.url);
}

export const HiAnimeProvider: StreamProvider = {
  id: "hianime",

  async searchAnime(query: string): Promise<AnimeRef[]> {
    const d = await getJson<any>(`/ajax/search/suggest?keyword=${encodeURIComponent(query)}`);
    return (d?.suggestions || []).map((s: any) => ({
      title: s.name || s.jname || "",
      format: s.moreInfo ? undefined : undefined,
    }));
  },

  async listEpisodes(ref: AnimeRef): Promise<AnimeEpisode[] | null> {
    const slug = await resolveSlug(ref);
    if (!slug) return null;
    const html = await getHtml(`/ajax/v2/episode/list/${slug}`);
    const eps = parseEpisodes(html);
    return eps.length ? eps : null;
  },

  async resolveEpisode(
    ref: AnimeRef,
    episode: number,
    dub: boolean
  ): Promise<StreamResult | null> {
    const slug = await resolveSlug(ref);
    if (!slug) return null;

    const eps = parseEpisodes(await getHtml(`/ajax/v2/episode/list/${slug}`));
    const ep = eps.find((e) => e.number === episode) || eps[episode - 1];
    if (!ep) return null;

    const serversHtml = await getHtml(`/ajax/v2/episode/servers?episodeId=${ep.id}`);
    const { sub, dub: dubServers } = parseServers(serversHtml);
    const servers = dub && dubServers.length ? dubServers : sub;
    if (!servers.length) return null;

    // try each server until one yields playable sources
    for (const server of servers) {
      try {
        const d = await getJson<any>(`/ajax/v2/episode/sources?id=${server.id}`);

        // Shape A — encrypted `data` payload (current HiAnime).
        let sources: StreamResult["sources"] = [];
        if (typeof d?.data === "string") {
          const decrypted = decryptSources(d.data, d?.key, d?.iv);
          if (decrypted) sources = mapEncryptedSources(decrypted);
        }
        // Shape B — plain sources already present.
        if (!sources.length && Array.isArray(d?.sources)) sources = mapEncryptedSources(JSON.stringify(d));

        if (sources.length) {
          return {
            provider: "hianime",
            server: server.name,
            subOrDub: dub ? "dub" : "sub",
            sources,
            subtitles: (d?.tracks || []).map((t: any) => ({
              url: t.file || t.url,
              lang: t.label || t.kind || "sub",
            })),
            headers: { Referer: `${BASE}/` },
          };
        }
      } catch {
        // try next server
      }
    }

    return null;
  },
};
