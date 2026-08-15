/**
 * Shortener / link-protector resolver (server-side).
 *
 * The Hindi-movie providers wrap their real download links (Google Drive,
 * GDToT, gofile, …) inside link-protector pages like `mobilejsr.com/view/…`.
 * This module tries to "unshorten" those so users can get the direct link
 * without clicking through the ad/captcha page.
 *
 * Strategies, in order:
 *   1. **Redirect follow** — if the protector simply 302-redirects, return the
 *      final URL. Free win for plain shorteners.
 *   2. **Embedded extraction** — fetch the page HTML and look for the target
 *      URL embedded in it (plain `https?://…` matches, base64-encoded blobs,
 *      `meta refresh`, `window.location` / `location.href` JS assignments, and
 *      known download-host links). Filters to recognized download hosts first,
 *      then falls back to any external URL.
 *
 * What it can't do (returned as `method: "manual"` so the UI can fall back to
 * the original link):
 *   - Captcha-gated protectors (mobilejsr's "three step auth" + Google Captcha)
 *   - GDToT (needs a logged-in session cookie `PHPSESSID` + `CRYPT`)
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const TIMEOUT_MS = 10000;

/** Hosts we consider the "real" download target (prioritized when embedded). */
const KNOWN_HOSTS = [
  "drive.google.com",
  "docs.google.com",
  "gdtot",
  "gdflix",
  "gofile.io",
  "appdrive",
  "driveapp",
  "drivehub",
  "drivelinks",
  "drivebit",
  "driveace",
  "drivepro",
  "sharer.pw",
  "droplink",
  "mega.nz",
  "mediafire",
  "terabox",
  "pixeldrain",
  "streamtape",
  "streamwish",
  "hubdrive",
  "katdrive",
  "kolop",
  "drivefire",
  "linkvertise",
];

export interface UnshortenResult {
  ok: boolean;
  originalUrl: string;
  resolvedUrl?: string;
  host?: string;
  /** how it was resolved: "redirect" | "embedded" | "manual" */
  method: "redirect" | "embedded" | "manual";
  note?: string;
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isKnownHost(url: string): boolean {
  const host = extractHost(url);
  return KNOWN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Fetch a page and return { finalUrl, html } (manual redirect handling). */
async function fetchPage(url: string): Promise<{ finalUrl: string; html: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
  });
  const html = await res.text();
  return { finalUrl: res.url || url, html };
}

/** Pull every URL-looking token out of a string. */
function extractUrls(text: string): string[] {
  const urls: string[] = [];
  const re = /https?:\/\/[^\s"'<>\\]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let u = m[0].replace(/[),.;]+$/, "");
    urls.push(u);
  }
  return urls;
}

/** Try to base64-decode candidate blobs and pull URLs out of them. */
function extractBase64Urls(html: string): string[] {
  const found: string[] = [];
  const re = /[A-Za-z0-9+/]{40,}={0,2}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const decoded = Buffer.from(m[0], "base64").toString("utf8");
      if (/https?:\/\//.test(decoded)) {
        found.push(...extractUrls(decoded));
      }
    } catch {
      /* skip */
    }
  }
  return found;
}

/**
 * Decode the link-protector's obfuscation cipher (used by mobilejsr and
 * similar "LinkShrink"-style scripts):
 *
 *   decodeURIComponent(s).replace(/@@/g, "@")
 *     .split("").map((n, r) => {
 *       const t = n.charCodeAt(0) - 32;
 *       return t >= 0 && t < 95 ? String.fromCharCode(32 + (t + r) % 95) : n;
 *     }).join("")
 */
export function decodeObfuscated(encoded: string): string {
  let d: string;
  try {
    d = decodeURIComponent(encoded);
  } catch {
    d = encoded;
  }
  d = d.replace(/@@/g, "@");
  let out = "";
  for (let r = 0; r < d.length; r++) {
    const t = d.charCodeAt(r) - 32;
    out += t >= 0 && t < 95 ? String.fromCharCode(32 + ((t + r) % 95)) : d[r];
  }
  return out;
}

/**
 * Extract the raw encoded strings from inline scripts of the form
 * `decodeURI("...")` / `decodeURIComponent("...")` (the protector's reveal
 * payload), decode them, and return any URLs inside the decoded output.
 */
export function extractDecodedUrls(html: string): string[] {
  const found: string[] = [];
  for (const decoded of extractDecodedTexts(html)) {
    found.push(...extractUrls(decoded));
  }
  return found;
}

/** Return the fully-decoded payload text for every `decodeURI("…")` call. */
export function extractDecodedTexts(html: string): string[] {
  const out: string[] = [];
  // Double-quoted payload (the protector's string may contain apostrophes,
  // so we can't use a broad [^"'] exclusion).
  const re = /decodeURI(?:Component)?\s*\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push(decodeObfuscated(m[1]));
  }
  return out;
}

/** Reject obvious SSRF targets (localhost / private / link-local / metadata). */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "metadata.google.internal" || h.endsWith(".internal")) return true;
  if (h === "::1" || h === "0.0.0.0") return true;
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

export async function unshorten(url: string): Promise<UnshortenResult> {
  const base: UnshortenResult = { ok: false, originalUrl: url, method: "manual" };

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return { ...base, note: "invalid url" };
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return { ...base, note: "bad protocol" };
  }
  if (isPrivateHost(target.hostname)) {
    return { ...base, note: "host not allowed" };
  }

  const originalHost = extractHost(url);

  try {
    const { finalUrl, html } = await fetchPage(url);
    const finalHost = extractHost(finalUrl);

    // 1) Simple redirect shortener.
    if (finalHost && finalHost !== originalHost && finalUrl !== url) {
      // Only accept if it moved to a real download host OR a different domain.
      if (isKnownHost(finalUrl) || !finalHost.includes(originalHost.split(".")[0])) {
        return {
          ok: true,
          originalUrl: url,
          resolvedUrl: finalUrl,
          host: finalHost,
          method: "redirect",
        };
      }
    }

    // 2) Embedded extraction.
    const candidates: string[] = [
      ...extractUrls(html),
      ...extractBase64Urls(html),
      ...extractDecodedUrls(html),
    ];

    // meta refresh
    const meta = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']?[^"']*url=([^"']+)/i);
    if (meta) candidates.push(meta[1]);

    // JS assignments
    const js = [
      ...html.matchAll(/(?:window\.location|location\.href|location\.replace)\s*[=.(]\s*["']([^"']+)["']/gi),
    ].map((m) => m[1]);
    candidates.push(...js);

    // clean + dedupe, drop the protector's own URLs
    const seen = new Set<string>();
    const external: string[] = [];
    for (const c of candidates) {
      let u = c.trim();
      if (!/^https?:\/\//i.test(u)) continue;
      u = u.replace(/\\\//g, "/").replace(/[),.;]+$/, "");
      const h = extractHost(u);
      if (!h || h === originalHost || h.endsWith(`.${originalHost}`)) continue;
      if (seen.has(u)) continue;
      seen.add(u);
      external.push(u);
    }

    const known = external.filter(isKnownHost);
    const pick = known[0] || external[0];

    if (pick) {
      return {
        ok: true,
        originalUrl: url,
        resolvedUrl: pick,
        host: extractHost(pick),
        method: "embedded",
      };
    }

    return { ...base, note: "no embedded link found (may be captcha-gated)" };
  } catch (e) {
    return {
      ...base,
      note: e instanceof Error ? e.message : "fetch failed",
    };
  }
}
