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
