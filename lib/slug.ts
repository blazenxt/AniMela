/**
 * Opaque URL slug helpers — 50-character, deterministic, reversible tokens.
 *
 * Routes accept an opaque 50-char hex slug (e.g. "0000000015a3f2c9…") OR a
 * legacy readable slug ("one-piece-21") OR a bare id ("21"), so old links keep
 * working while new links expose nothing about the underlying id/source.
 *
 * The token is NOT cryptographically secret (the numeric id is recoverable from
 * the first 10 hex chars); it is purely for obfuscation — the URL no longer
 * reveals the AniList/TMDB id or title at a glance. This must run client-side
 * too, so it uses pure-JS math (no Node crypto).
 */

/** Deterministic 40-char hex "noise" derived from a string (pure JS). */
function noise40(input: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  let c = 0x85ebca6b;
  let d = 0xc2b2ae35;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    a = Math.imul(a ^ ch, 0x01000193) >>> 0;
    b = Math.imul(b ^ ch, 0x5bd1e995) >>> 0;
    c = Math.imul(c ^ ch, 0x85ebca6b) >>> 0;
    d = Math.imul(d ^ ch, 0xc2b2ae35) >>> 0;
  }
  return (
    a.toString(16).padStart(8, "0") +
    b.toString(16).padStart(8, "0") +
    c.toString(16).padStart(8, "0") +
    d.toString(16).padStart(8, "0")
  ).slice(0, 40);
}

/** Build a 50-char opaque slug from a numeric id. */
export function withSlug(id: number | string, _title?: string | null): string {
  const n = Number(id);
  const idHex = n.toString(16).padStart(10, "0"); // 10 hex chars (up to ~1.1e12)
  return (idHex + noise40(`animela:${n}`)).slice(0, 50);
}

/** Extract the numeric id from a slug (opaque, readable, or bare). */
export function parseIdFromSlug(slug: string): string {
  const s = String(slug);

  // opaque 50-char hex slug → id is the first 10 hex chars
  if (/^[0-9a-f]{50}$/.test(s)) {
    const id = parseInt(s.slice(0, 10), 16);
    if (!Number.isNaN(id)) return String(id);
  }

  // legacy readable slug ("one-piece-21") → trailing digits
  const m = s.match(/(\d+)$/);
  if (m) return m[1];

  // bare numeric id
  if (/^\d+$/.test(s)) return s;

  return s;
}

/** Legacy readable slugify (kept for potential use; not used for new links). */
export function slugify(title: string): string {
  return (title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}
