import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side protection middleware (single-instance Railway deployment).
 *
 * Safe-by-default design (learned from a false-positive that locked out a real
 * user): a legitimate browser is NEVER hard-blocked. The layers are:
 *
 *   1. **Exemptions** — /api/health, /api/hls, /api/verify always pass.
 *   2. **Search allow-list** — Googlebot/Bingbot/MSNBot pass (indexable).
 *   3. **Hard bot UA block** — only UNambiguous script/scraper User-Agents
 *      (curl, wget, python, go-http-client, headless, etc.) get 403 + banned.
 *      Real browsers never match these.
 *   4. **Universal JS/Turnstile challenge** — every page request without a
 *      valid clearance cookie gets the verification page. No-JS bots are stuck
 *      here forever; humans pass in <1s.
 *   5. **Rate limiting** on API routes (soft 429 — never a permanent ban).
 *   6. **Security headers** everywhere.
 *
 * We do NOT fingerprint/ban on missing headers: browser fetch() and privacy
 * extensions legitimately vary Accept / Accept-Language / Sec-Fetch, and false
 * bans locked out real visitors. The challenge + hard-UA list is sufficient.
 */

// ── Challenge config ────────────────────────────────────────────────────────
const CHALLENGE_SECRET = process.env.CHALLENGE_SECRET || "animela-js-challenge-2026";
const CHALLENGE_COOKIE = "_cf_chl";
const CHALLENGE_TTL_MS = 24 * 60 * 60 * 1000;
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "";

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

function challengePage(): NextResponse {
  const ray = randomRayId();
  const turnstile = TURNSTILE_SITE_KEY
    ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onTurnstile" data-theme="dark"></div>`
    : `<div class="spinner"></div>`;

  const turnstileScript = TURNSTILE_SITE_KEY
    ? `<script>
    function onTurnstile(token) {
      fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token }) })
        .then(function(r){ return r.json(); })
        .then(function(d){
          if (d && d.ok) {
            document.cookie = "${CHALLENGE_COOKIE}=" + d.cookie + "; path=/; max-age=86400; SameSite=Lax";
            setTimeout(function(){ location.reload(); }, 300);
          }
        })
        .catch(function(){});
    }
  </script>`
    : `<script>
    (function(){
      function f(s){var h=0x811c9dc5;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h.toString(16);}
      var ts = Date.now();
      var token = ts + "." + f("${CHALLENGE_SECRET}" + ts);
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
// NOTE: key is versioned (banned_ips_v2) so any stale false-positive bans from
// an earlier buggy build are ignored going forward.
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BAN_KEY = "banned_ips_v2";

async function redisSismember(ip: string): Promise<boolean> {
  if (!REDIS_URL || !REDIS_TOKEN) return false;
  try {
    const res = await fetch(`${REDIS_URL}/sismember/${BAN_KEY}/${encodeURIComponent(ip)}`, {
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
    await fetch(`${REDIS_URL}/sadd/${BAN_KEY}/${encodeURIComponent(ip)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    /* non-fatal */
  }
}

// ── Bot detection (hard/unambiguous script UAs only) ────────────────────────
const ALLOWED_UA = [/googlebot/i, /bingbot/i, /msnbot/i];

// These are UAs that a REAL browser never sends — safe to hard-block + ban.
const HARD_BOT_UA = [
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /python-urllib/i,
  /aiohttp/i,
  /go-http-client/i,
  /okhttp/i,
  /node-fetch/i,
  /axios/i,
  /java\/[\d.]+/i,
  /libwww-perl/i,
  /postman/i,
  /insomnia/i,
  /scrapy/i,
  /headless/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /nikto/i,
  /sqlmap/i,
  /nmap/i,
  /masscan/i,
  /zgrab/i,
  /httpclient/i,
];

// Secondary crawler/SEO UAs — blocked (403) but NOT permanently banned, since
// some (social previews) are semi-legitimate.
const CRAWLER_UA = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /crawl/i,
  /scrape/i,
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
function isHardBot(ua: string): boolean {
  return HARD_BOT_UA.some((re) => re.test(ua));
}
function isCrawler(ua: string): boolean {
  return CRAWLER_UA.some((re) => re.test(ua));
}

// ── State ───────────────────────────────────────────────────────────────────
type Bucket = { count: number; reset: number };
const g = globalThis as unknown as {
  __animelaBuckets?: Map<string, Bucket>;
  __animelaBanned?: Set<string>;
};
const buckets = (g.__animelaBuckets ??= new Map<string, Bucket>());
const banned = (g.__animelaBanned ??= new Set<string>());

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 600; // generous; only trips on real abuse

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
  return b.count <= MAX_REQUESTS;
}

function prune() {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "X-DNS-Prefetch-Control": "off",
};

function withHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

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

  // 1. Exemptions — health, HLS proxy, and the Turnstile verify endpoint.
  if (pathname === "/api/health" || pathname === "/api/hls" || pathname === "/api/verify") {
    return withHeaders(NextResponse.next());
  }

  // 2. Search-engine allow-list.
  if (isAllowedBot(ua)) {
    return withHeaders(NextResponse.next());
  }

  // 3. Hard script bots → permanent ban. Real browsers never match these.
  if (isHardBot(ua)) {
    if (ip !== "unknown") {
      banned.add(ip);
      await redisSadd(ip);
    }
    return blockResponse(403, "Access denied.");
  }

  // 4. Secondary crawlers → 403 (no permanent ban).
  if (isCrawler(ua)) {
    return blockResponse(403, "Access denied.");
  }

  // 5. Universal challenge for page requests without a clearance cookie.
  if (!isApi && !validChallenge(req)) {
    return challengePage();
  }

  // 6. Rate-limit API routes (soft 429, no ban).
  if (isApi && !rateLimit(ip)) {
    return blockResponse(429, "Too many requests.");
  }

  return withHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|css|js)$).*)",
  ],
};
