/**
 * URL slug helpers — generate pretty "title-id" slugs and parse ids back out.
 *
 * Routes accept either a bare id ("21") or a slugged id ("one-piece-21"), so
 * old links keep working while new links get SEO/social-friendly URLs.
 */

export function slugify(title: string): string {
  return (title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

/** Build a "title-id" slug (e.g. one-piece-21). */
export function withSlug(id: number | string, title?: string | null): string {
  const s = title ? slugify(title) : "";
  return s ? `${s}-${id}` : String(id);
}

/** Extract the numeric id from a slug ("one-piece-21" → "21", "21" → "21"). */
export function parseIdFromSlug(slug: string): string {
  // trailing numeric segment wins (id always comes last)
  const m = String(slug).match(/(\d+)$/);
  if (m) return m[1];
  // fallback: whole thing is already a number
  if (/^\d+$/.test(String(slug))) return String(slug);
  return String(slug);
}
