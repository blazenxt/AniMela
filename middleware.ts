import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side protection middleware (single-instance Railway deployment).
 *
 * Layers:
 *   1. **Perma-ban** — in-memory + Upstash Redis (cross-restart). Banned IPs
 *      get 403 forever.
 *   2. **Allow-list** — Googlebot / Bingbot / MSNBot pass through untouched
 *      (so the site stays indexable by search).
 *   3. **Bot UA block** — known crawlers/scrapers/headless tools → ban + 403.
 *   4. **Header fingerprint** — missing browser headers → ban + 403.
 *   5. **JS challenge** — unverified visitors get a Cloudflare-style
 *      "Performing security verification" page that runs a small JS check,
 *      sets a clearance cookie, and reloads. No-JS bots never get through.
 *   6. **Rate limiting** on API routes + security headers everywhere.
 *
 * ⚠️ Honest limits: a bot that drives a real browser engine (Playwright +
 * stealth + residential IP + JS) is indistinguishable from a human — no site
 * can block that. This blocks the 99% of bots that use simple HTTP clients.
 */

// ── JS challenge config ─────────────────────────────────────────────────────
const CHALLENGE_SECRET = process.env.CHALLENGE_SECRET || "animela-js-challenge-2026";
const CHALLENGE_COOKIE = "_cf_chl";
const CHALLENGE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "";

/** Synchronous FNV-1a 32-bit hash (works in edge middleware + browser JS). */
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

function validChallenge(req: NextRequest): boolean {
  const v = req.cookies.get(CHALLENGE_COOKIE)?.value;
  if (!v) return false;
  const dot = v.lastIndexOf(".");
  if (dot < 0) return false;
  const ts = v.slice(0, dot);
  const hash = v.slice(dot + 1);
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return false;
  if (Date.now() - n > CHALLENGE_TTL_MS) return false;
  return fnv1a(CHALLENGE_SECRET + ts) === hash;
}

function randomRayId(): string {
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 16; i++) s += hex[Math.floor(Math.random() * 16)];
  return s;
}

function challengePage(url: string): NextResponse {
  const ray = randomRayId();
  // If Turnstile is configured, render the CAPTCHA widget (primary, no secret
  // leaked to the client). Otherwise fall back to the pure JS-hash check.
  const turnstile = TURNSTILE_SITE_KEY
    ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onTurnstile" data-theme="dark"></div>`
    : `<div class="spinner"></div>`;

  const turnstileScript = TURNSTILE_SITE_KEY
    ? `<script>
    function onTurnstile(token) {
      fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token })
      })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d && d.ok) {
          document.cookie = "${CHALLENGE_COOKIE}=" + d.cookie + "; path=/; max-age=86400; SameSite=Lax";
          setTimeout(function(){ location.reload(); }, 300);
        }
      })
      .catch(function(){ /* retry */ });
    }
  </script>`
    : `<script>
    (function(){
      function fnv1a(s){var h=0x811c9dc5;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h.toString(16);}
      var ts = Date.now();
      var token = ts + "." + fnv1a("${CHALLENGE_SECRET}" + ts);
      document.cookie = "${CHALLENGE_COOKIE}=" + token + "; path=/; max-age=86400; SameSite=Lax";
      setTimeout(function(){ location.reload(); }, 600);
    })();
  </script>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Performing security verification</title>
<style>
  body{margin:0;background:#111;color:#e5e5e5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
  .box{max-width:440px;padding:40px 28px}
  .spinner{width:44px;height:44px;margin:0 auto 22px;border-radius:50%;border:3px solid #333;border-top-color:#f7931e;animation:spin 1s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  h1{font-size:19px;font-weight:600;margin:0 0 12px;color:#fff}
  p{font-size:14px;line-height:1.6;color:#9aa0a6;margin:0 0 22px}
  .cf-turnstile{margin:0 auto;width:fit-content}
  .foot{margin-top:26px;font-size:12px;color:#6b7280}
  .foot a{color:#f7931e;text-decoration:none}
</style>
</head>
<body>
  <div class="box">
    ${turnstile}
    <h1>Performing security verification</h1>
    <p>This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot.</p>
    <div class="foot">
      Ray ID: <span id="ray">${ray}</span><br />
      Performance &amp; Security by <a href="https://www.cloudflare.com" rel="noreferrer">Cloudflare</a>
    </div>
  </div>
  ${turnstileScript}
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
    },
  });
}

// ── Upstash Redis (persistent bans) ─────────────────────────────────────────
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisSismember(ip: string): Promise<boolean> {
  if (!REDIS_URL || !REDIS_TOKEN) return false;
  try {
    const res = await fetch(`${REDIS_URL}/sismember/banned_ips/${encodeURIComponent(ip)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;
    const json = await res.json().catch(() => null);
    return json?.result === 1;
  } catch {
    return false;
  }
}

async function redisSadd(ip: string): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  try {
    await fetch(`${REDIS_URL}/sadd/banned_ips/${encodeURIComponent(ip)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    /* non-fatal */
  }
}

// ── Bot detection ───────────────────────────────────────────────────────────
const ALLOWED_UA = [/googlebot/i, /bingbot/i, /msnbot/i];

const BOT_UA = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /crawl/i,
  /scrape/i,
  /scrapy/i,
  /headless/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /python-urllib/i,
  /aiohttp/i,
  /go-http-client/i,
  /okhttp/i,
  /axios/i,
  /node-fetch/i,
  /java\/[\d.]+/i,
  /libwww-perl/i,
  /httpclient/i,
  /postman/i,
  /insomnia/i,
  /nikto/i,
  /sqlmap/i,
  /nmap/i,
  /masscan/i,
  /zgrab/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /telegrambot/i,
  /discordbot/i,
  /whatsapp/i,
  /bytespider/i,
  /pinterestbot/i,
  /petalbot/i,
  /semrush/i,
  /ahrefs/i,
  /mj12bot/i,
  /dotbot/i,
  /applebot/i,
  /duckduckbot/i,
  /yandexbot/i,
  /baiduspider/i,
  /sogou/i,
  /exabot/i,
  /ia_archiver/i,
  /siteexplorer/i,
  /getintent/i,
];

function isAllowedBot(ua: string): boolean {
  return ALLOWED_UA.some((re) => re.test(ua));
}

function isBotUA(ua: string): boolean {
  if (!ua) return true;
  return BOT_UA.some((re) => re.test(ua));
}

// ── State (in-memory, backed by Redis) ─────────────────────────────────────
type Bucket = { count: number; reset: number };
const g = globalThis as unknown as {
  __animelaBuckets?: Map<string, Bucket>;
  __animelaBanned?: Set<string>;
};
const buckets = (g.__animelaBuckets ??= new Map<string, Bucket>());
const banned = (g.__animelaBanned ??= new Set<string>());

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 180;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now > b.reset) {
    buckets.set(ip, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  b.count++;
  if (b.count > MAX_REQUESTS) return false;
  return true;
}

function prune() {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
}

function missingBrowserHeaders(req: NextRequest): boolean {
  const ua = req.headers.get("user-agent") || "";
  const accept = req.headers.get("accept") || "";
  const acceptLanguage = req.headers.get("accept-language") || "";
  if (!accept || !acceptLanguage) return true;
  if (!/text\/html/.test(accept)) return true;
  const secFetch = req.headers.get("sec-fetch-mode");
  if (ua && !secFetch && !/health|api\/hls/.test(req.nextUrl.pathname)) return true;
  return false;
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "X-DNS-Prefetch-Control": "off",
};

function blockResponse(status: number, message: string): NextResponse {
  return new NextResponse(message, {
    status,
    headers: { ...SECURITY_HEADERS, "Content-Type": "text/plain" },
  });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (Math.random() < 0.01) prune();

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "";
  const isApi = pathname.startsWith("/api/");

  // 1. Perma-ban (memory, then Redis for cross-restart persistence)
  if (banned.has(ip) || (await redisSismember(ip))) {
    return blockResponse(403, "Access denied.");
  }

  // 2. Allow-list legitimate search engines (indexable)
  if (isAllowedBot(ua)) {
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    return res;
  }

  // 3. Bot UA → permanent ban
  if (isBotUA(ua)) {
    if (ip !== "unknown") {
      banned.add(ip);
      await redisSadd(ip);
    }
    return blockResponse(403, "Access denied.");
  }

  // 4. Header fingerprint → permanent ban
  if (missingBrowserHeaders(req)) {
    if (ip !== "unknown") {
      banned.add(ip);
      await redisSadd(ip);
    }
    return blockResponse(403, "Access denied.");
  }

  // 5. JS challenge for page requests (not API / static)
  if (!isApi && !validChallenge(req)) {
    return challengePage(req.url);
  }

  // 6. Rate-limit API routes (exempt HLS proxy + health)
  if (isApi) {
    const exempt = pathname === "/api/hls" || pathname === "/api/health";
    if (!exempt && !rateLimit(ip)) {
      banned.add(ip);
      await redisSadd(ip);
      return blockResponse(429, "Too many requests.");
    }
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|css|js)$).*)",
  ],
};
