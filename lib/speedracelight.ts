/**
 * SpeedRaceLight "direct stream" pipeline (EXPERIMENTAL).
 *
 * This is an alternative to the Videasy/VidFast embeds that resolves an
 * actual HLS (.m3u8) URL directly, using a short-lived `seed` as a
 * decryption key. Steps:
 *
 *   1. Metadata  : https://db.speedracelight.com/3            (TMDB proxy)
 *   2. Seed      : GET /seed?mediaId={tmdbId} -> { seed, ttlMs }
 *   3. Sources   : GET /cdn/sources-with-title?...&seed=...   (base64 ciphertext)
 *   4. Decrypt   : custom stream cipher keyed by (seed, tmdbId);
 *                  plaintext starts with the magic "mvm1".
 *   5. Playback  : the decrypted JSON contains HLS sources.
 *
 * NOTE: The final segment host (e.g. losangeles14.site) serves from
 * residential-only IPs and returns 403 to datacenter IPs, so this flow is
 * only usable from a residential browser. The seed is validated server-side
 * (a fake seed -> 401).
 *
 * The `seed` + `sources` fetches below are real. The `decrypt` step is a
 * documented STUB: the cipher is a custom FNV-1a / SHA-K-constants key
 * schedule (61-word state + 32-bit accumulator, per-word PRNG emitting LE
 * keystream words XORed into the bytes). It must be ported from the exact
 * obfuscated JS (or the author's verified Python port) to match byte-for-byte
 * — paste that implementation into `decrypt()` below.
 */

const API = "https://api.speedracelight.com";

export interface SeedResponse {
  seed: string;
  ttlMs: number;
}

export async function getSeed(mediaId: number | string): Promise<SeedResponse> {
  const res = await fetch(`${API}/seed?mediaId=${mediaId}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`seed request failed (${res.status})`);
  const data = await res.json();
  if (!data || typeof data.seed !== "string") throw new Error("no seed in response");
  return data as SeedResponse;
}

export interface SourcesParams {
  title: string;
  mediaType: string; // e.g. "TV Series" | "Movie"
  year: string;
  totalSeasons?: number | string;
  episodeId?: string; // e.g. "s1e9"
  seasonId?: number | string;
  tmdbId: number | string;
  imdbId?: string;
  enc?: number | string;
  seed: string;
}

export async function getSources(params: SourcesParams): Promise<string> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const res = await fetch(`${API}/cdn/sources-with-title?${q.toString()}`, {
    headers: { Accept: "*/*" },
  });
  if (!res.ok) throw new Error(`sources request failed (${res.status})`);
  return await res.text(); // base64 ciphertext
}

export interface DecryptedSources {
  subtitles: unknown[];
  sources: { quality: string; url: string }[];
}

/**
 * Decrypt the base64 ciphertext returned by getSources().
 *
 * TODO(experimental): implement the custom stream cipher here.
 * Expected shape of the plaintext (after the "mvm1" magic header):
 *
 *   {"subtitles":[],"sources":[{"quality":"720P","url":"https://..."}]}
 */
export function decrypt(ciphertextBase64: string, _seed: string, _tmdbId: number | string): DecryptedSources {
  throw new Error(
    "Direct-stream decryption is not implemented yet. " +
      "Port the exact FNV-1a / SHA-K key-schedule cipher (61-word state, LE keystream words, XOR) " +
      "into lib/speedracelight.ts — see the module comment for the documented pipeline."
  );
}
