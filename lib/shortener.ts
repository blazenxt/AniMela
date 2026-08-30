/**
 * Link shortener / protector resolver (server-side), with dedicated FREE
 * bypass handlers for the common file-host protectors used by Hindi movie
 * sites — ported from the open-source Link-Bypasser ecosystem
 * (r-hulk / TheCaduceus). All techniques here are free; the only "cost" is a
 * free account on a handful of protectors (GDToT / Sharer.pw / AppDrive) whose
 * session cookie you paste into env vars once.
 *
 * Handlers (dispatched by hostname):
 *   - adfly        : decrypt the `ysmm` JS blob (no auth)
 *   - gplinks      : POST the hidden form to `/links/go` (gtlinks.me, gplinks,
 *                    gyanilinks share this engine — no auth)
 *   - droplink     : POST the hidden form (no auth)
 *   - gdtot        : `crypt` cookie → `/dld?id=…` → base64 → Google Drive link
 *   - sharer.pw    : `_token` + POST `/dl` → Google Drive link
 *   - appdrive     : `key` + multipart POST → Google Drive link (account)
 *
 * Generic fallback (for everything else): redirect follow + embedded/cipher
 * extraction, but only accepts known download hosts (no favicon false-positive).
 *
 * ⚠️ Google reCAPTCHA-gated protectors (e.g. mobilejsr's "three step auth")
 * cannot be auto-bypassed for free — the resolver returns `method: "manual"`.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const TIMEOUT_MS = 15000;

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
  "drivesharer",
  "sharer.pw",
  "droplink",
  "mega.nz",
  "mediafire",
  "terabox",
  "pixeldrain",
  "hubdrive",
  "katdrive",
  "kolop",
  "drivefire",
];

export interface UnshortenResult {
  ok: boolean;
  originalUrl: string;
  resolvedUrl?: string;
  host?: string;
  method: "adfly" | "gplinks" | "droplink" | "gdtot" | "sharer" | "appdrive" | "redirect" | "embedded" | "manual";
  note?: string;
  /** true when the final file-host link is dead (e.g. gofile content removed). */
  dead?: boolean;
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

/** Reject SSRF targets. */
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

async function get(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/json,*/*",
      ...(init.headers as Record<string, string> | undefined),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
  });
}

// ── AdFly: decrypt the `ysmm` JS blob ────────────────────────────────────────

function adflyDecrypt(code: string): string | null {
  try {
    let a = "";
    let b = "";
    for (let i = 0; i < code.length; i++) {
      if (i % 2 === 0) a += code[i];
      else b = code[i] + b;
    }
    const key = (a + b).split("");
    let i = 0;
    while (i < key.length) {
      if (/\d/.test(key[i])) {
        for (let j = i + 1; j < key.length; j++) {
          if (/\d/.test(key[j])) {
            const u = parseInt(key[i]) ^ parseInt(key[j]);
            if (u < 10) key[i] = String(u);
            i = j;
            break;
          }
        }
      }
      i++;
    }
    const decrypted = Buffer.from(key.join(""), "base64").subarray(16, -16).toString("utf8");
    return decrypted;
  } catch {
    return null;
  }
}

async function bypassAdfly(url: string): Promise<string | null> {
  const html = await (await get(url)).text();
  const m = html.match(/ysmm\s*=\s*['"]([^'"]+)['"]/);
  if (!m) return null;
  let target = adflyDecrypt(m[1]);
  if (!target) return null;
  if (/go\.php\?u=/.test(target)) {
    target = Buffer.from(target.replace(/.*?u=/, ""), "base64").toString();
  } else if (/&dest=/.test(target)) {
    target = decodeURIComponent(target.replace(/.*?dest=/, ""));
  }
  return target;
}

// ── GPLinks / DropLink: POST hidden form to /links/go ───────────────────────

async function bypassLinksGo(url: string): Promise<string | null> {
  const parsed = new URL(url);
  const origin = `${parsed.protocol}//${parsed.host}`;

  const first = await get(url, { redirect: "manual" });
  const loc = first.headers.get("location");
  const referer = loc ? new URL(loc, origin).origin + "/" : origin + "/";

  const page = await get(url, { headers: { Referer: referer } });
  const html = await page.text();

  // harvest hidden inputs
  const data: Record<string, string> = {};
  const inputRe = /<input[^>]+name=["']([^"']+)["'][^>]+value=["']([^"']*)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(html)) !== null) data[m[1]] = m[2];

  const goUrl = `${origin}/links/go`;
  const res = await fetch(goUrl, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      Referer: referer,
    },
    body: new URLSearchParams(data).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  return json?.url || json?.link || null;
}

// ── GDToT: crypt cookie → /dld?id=… → base64 → Google Drive ─────────────────

async function bypassGdtot(url: string): Promise<string | null> {
  const crypt = (process.env.GDTOT_CRYPT || "").trim();
  if (!crypt) return null; // needs a free GDToT account cookie

  const parsed = new URL(url);
  const id = url.split("/").filter(Boolean).pop() || "";
  const dldUrl = `${parsed.protocol}//${parsed.host}/dld?id=${encodeURIComponent(id)}`;

  await get(url, { headers: { Cookie: `crypt=${crypt}` } });
  const res = await get(dldUrl, { headers: { Cookie: `crypt=${crypt}` } });
  const text = await res.text();
  const m = text.match(/URL=([^"]*)"/);
  if (!m) return null;

  const params = new URLSearchParams(new URL(m[1].replace(/&amp;/g, "&"), parsed.origin).search);
  const gd = params.get("gd");
  if (!gd || gd === "false") return null;

  const decodedId = Buffer.from(gd, "base64").toString("utf8");
  return `https://drive.google.com/open?id=${decodedId}`;
}

// ── Sharer.pw: _token + POST /dl ────────────────────────────────────────────

async function bypassSharer(url: string): Promise<string | null> {
  const xsrf = (process.env.SHARER_XSRF_TOKEN || "").trim();
  const session = (process.env.SHARER_LARAVEL_SESSION || "").trim();
  if (!xsrf || !session) return null;

  const cookie = `XSRF-TOKEN=${xsrf}; laravel_session=${session}`;
  const html = await (await get(url, { headers: { Cookie: cookie } })).text();
  const token = html.match(/_token\s*=\s*['"]([^'"]+)['"]/)?.[1];
  if (!token) return null;

  const res = await fetch(`${url}/dl`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Cookie: cookie,
    },
    body: new URLSearchParams({ _token: token }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  return json?.url || null;
}

// ── AppDrive family: key + multipart POST (account) ─────────────────────────

async function bypassAppdrive(url: string): Promise<string | null> {
  const email = (process.env.APPDRIVE_EMAIL || "").trim();
  const password = (process.env.APPDRIVE_PASSWORD || "").trim();
  if (!email || !password) return null;

  const parsed = new URL(url);
  const origin = `${parsed.protocol}//${parsed.host}`;

  // login (session cookie)
  const jar: string[] = [];
  await fetch(`${origin}/login`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const html = await (await get(url)).text();
  const key = html.match(/["']key["'],\s*["']([^"']+)["']/)?.[1];
  if (!key) return null;

  // multipart POST (type 1→3 until a JSON response)
  for (let type = 1; type <= 3; type++) {
    const boundary = `----AniMela${Math.random().toString(16).slice(2)}`;
    const fields: Record<string, string> = { type: String(type), key, action: "original" };
    const bodyParts: string[] = [];
    for (const [k, v] of Object.entries(fields)) {
      bodyParts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
      );
    }
    bodyParts.push(`--${boundary}--\r\n`);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: bodyParts.join(""),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = await res.json().catch(() => null);
    if (json?.url) return json.url;
  }
  return null;
}

// ── Generic fallback ────────────────────────────────────────────────────────

function extractUrls(text: string): string[] {
  const urls: string[] = [];
  const re = /https?:\/\/[^\s"'<>\\]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) urls.push(m[0].replace(/[),.;]+$/, ""));
  return urls;
}

function extractBase64Urls(html: string): string[] {
  const found: string[] = [];
  const re = /[A-Za-z0-9+/]{40,}={0,2}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const decoded = Buffer.from(m[0], "base64").toString("utf8");
      if (/https?:\/\//.test(decoded)) found.push(...extractUrls(decoded));
    } catch {
      /* skip */
    }
  }
  return found;
}

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

export function extractDecodedTexts(html: string): string[] {
  const out: string[] = [];
  const re = /decodeURI(?:Component)?\s*\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(decodeObfuscated(m[1]));
  return out;
}

export function extractDecodedUrls(html: string): string[] {
  const found: string[] = [];
  for (const decoded of extractDecodedTexts(html)) found.push(...extractUrls(decoded));
  return found;
}

async function genericFallback(url: string, originalHost: string): Promise<UnshortenResult> {
  const base: UnshortenResult = { ok: false, originalUrl: url, method: "manual" };
  try {
    const res = await get(url);
    const html = await res.text();
    const finalHost = extractHost(res.url);

    if (finalHost && finalHost !== originalHost && res.url !== url && isKnownHost(res.url)) {
      return { ok: true, originalUrl: url, resolvedUrl: res.url, host: finalHost, method: "redirect" };
    }

    const candidates: string[] = [...extractUrls(html), ...extractBase64Urls(html), ...extractDecodedUrls(html)];
    const meta = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']?[^"']*url=([^"']+)/i);
    if (meta) candidates.push(meta[1]);
    for (const m of html.matchAll(/(?:window\.location|location\.href|location\.replace)\s*[=.(]\s*["']([^"']+)["']/gi)) {
      candidates.push(m[1]);
    }

    const seen = new Set<string>();
    for (const c of candidates) {
      let u = c.trim();
      if (!/^https?:\/\//i.test(u)) continue;
      u = u.replace(/\\\//g, "/").replace(/[),.;]+$/, "");
      const h = extractHost(u);
      if (!h || h === originalHost || h.endsWith(`.${originalHost}`)) continue;
      if (/\.(png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf|otf|eot)([?#].*)?$/i.test(u)) continue;
      if (seen.has(u)) continue;
      seen.add(u);
      if (isKnownHost(u)) {
        return { ok: true, originalUrl: url, resolvedUrl: u, host: h, method: "embedded" };
      }
    }

    return { ...base, note: "no direct link found (likely captcha-gated)" };
  } catch (e) {
    return { ...base, note: e instanceof Error ? e.message : "fetch failed" };
  }
}

// ── Terminal download hosts (stop following the chain here) ─────────────────

const FINAL_HOSTS = [
  "drive.google.com",
  "docs.google.com",
  "gofile.io",
  "mega.nz",
  "mediafire.com",
  "terabox.com",
  "pixeldrain.com",
  "dropbox.com",
];

function isFinalHost(url: string): boolean {
  const host = extractHost(url);
  if (FINAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true;
  // direct file URLs are terminal too
  return /\.(mp4|mkv|avi|mov|wmv|flv|webm|zip|rar|7z|pdf|apk)([?#].*)?$/i.test(url);
}

const MAX_HOPS = 5;

// ── Gofile dead-link detection ──────────────────────────────────────────────

/**
 * Gofile deletes files after inactivity / takedowns, so a resolved gofile link
 * can be dead. Its public API tells us cheaply:
 *   GET https://api.gofile.io/getContent?contentId={id}
 *     → { status: "ok", ... }        alive
 *     → { status: "error-notFound" } dead
 */
async function checkGofile(url: string): Promise<{ alive: boolean; note?: string }> {
  try {
    const m = url.match(/gofile\.io\/d\/([A-Za-z0-9]+)/);
    if (!m) return { alive: true }; // can't parse id — don't block
    const contentId = m[1];
    const res = await fetch(`https://api.gofile.io/getContent?contentId=${contentId}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Dead content → HTTP 404 with a plain-text "error-notFound" body (not JSON).
    if (res.status === 404) {
      return { alive: false, note: "file removed from gofile (dead link)" };
    }
    const text = await res.text();
    if (/error-notFound|not[-\s]?found/i.test(text)) {
      return { alive: false, note: "file removed from gofile (dead link)" };
    }
    if (/"status"\s*:\s*"ok"/.test(text)) return { alive: true };
    return { alive: true }; // unknown status — don't block
  } catch {
    return { alive: true }; // API unreachable — assume alive
  }
}

/** Resolve ONE hop. Returns `{ url?, method, note? }` — `url` may itself be a shortener. */
async function resolveHop(
  url: string
): Promise<{ url?: string; method: UnshortenResult["method"]; note?: string }> {
  const host = extractHost(url);

  // dedicated handlers
  if (/(^|\.)(gplinks\.|gtlinks\.me|gyanilinks\.|gplink\.)/.test(host)) {
    const r = await bypassLinksGo(url);
    if (r) return { url: r, method: "gplinks" };
  }
  if (/droplink/.test(host)) {
    const r = await bypassLinksGo(url);
    if (r) return { url: r, method: "droplink" };
  }
  if (/adf\.ly|adfly|j\.gs|q\.gs/.test(host)) {
    const r = await bypassAdfly(url);
    if (r) return { url: r, method: "adfly" };
  }
  if (/gdtot/.test(host)) {
    const r = await bypassGdtot(url);
    if (r) return { url: r, method: "gdtot" };
  }
  if (/sharer\.pw/.test(host)) {
    const r = await bypassSharer(url);
    if (r) return { url: r, method: "sharer" };
  }
  if (/appdrive|driveapp|drivehub|gdflix|drivesharer|drivebit|drivelinks|driveace|drivepro/.test(host)) {
    const r = await bypassAppdrive(url);
    if (r) return { url: r, method: "appdrive" };
  }

  // generic fallback
  const g = await genericFallback(url, host);
  if (g.ok && g.resolvedUrl) return { url: g.resolvedUrl, method: g.method };
  return { method: "manual", note: g.note };
}

// ── Dispatcher (follows multi-hop chains) ───────────────────────────────────

export interface UnshortenChainResult extends UnshortenResult {
  /** The hops followed (original → … → final). */
  chain?: string[];
}

/**
 * Build the success result for a terminal download link, checking gofile
 * liveness so users aren't sent to a dead file.
 */
async function finalize(
  inputUrl: string,
  resolvedUrl: string,
  method: UnshortenResult["method"],
  chain: string[]
): Promise<UnshortenChainResult> {
  const host = extractHost(resolvedUrl);
  const result: UnshortenChainResult = {
    ok: true,
    originalUrl: inputUrl,
    resolvedUrl,
    host,
    method,
    chain,
  };

  if (host === "gofile.io" || host.endsWith(".gofile.io")) {
    const g = await checkGofile(resolvedUrl);
    if (!g.alive) {
      result.dead = true;
      result.note = g.note;
    }
  }
  return result;
}

export async function unshorten(url: string): Promise<UnshortenChainResult> {
  const base: UnshortenChainResult = { ok: false, originalUrl: url, method: "manual" };

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return { ...base, note: "invalid url" };
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return { ...base, note: "bad protocol" };
  if (isPrivateHost(target.hostname)) return { ...base, note: "host not allowed" };

  // already a terminal link (user pasted a direct file URL)?
  if (isFinalHost(url)) {
    return finalize(url, url, "redirect", [url]);
  }

  const chain: string[] = [url];
  let current = url;
  let method: UnshortenResult["method"] = "manual";
  let note: string | undefined;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    let hopResult: { url?: string; method: UnshortenResult["method"]; note?: string };
    try {
      hopResult = await resolveHop(current);
    } catch (e) {
      note = e instanceof Error ? e.message : "fetch failed";
      break;
    }

    if (hopResult.url && hopResult.url !== current) {
      current = hopResult.url;
      method = hopResult.method;
      if (!chain.includes(current)) chain.push(current);

      if (isFinalHost(current)) {
        return finalize(url, current, method, chain);
      }
      continue; // follow the next hop
    }

    method = hopResult.method;
    note = hopResult.note;
    break;
  }

  // after following hops, current may now be terminal
  if (current !== url && isFinalHost(current)) {
    return finalize(url, current, method, chain);
  }

  return { ...base, method, note: note || "no direct link found (likely captcha-gated)", chain };
}
