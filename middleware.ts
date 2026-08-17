import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side protection middleware (single-instance Railway deployment).
 *
 * Layered bot protection:
 *   1. **Blocked User-Agent list** — known crawlers/scrapers/headless tools get
 *      a 403 permanently (by their UA signature).
 *   2. **Perma-ban map** — any IP that trips the bot heuristics is banned for
 *      the lifetime of the process (in-memory; see note below).
 *   3. **Header fingerprint** — requests missing basic browser headers, or
 *      with suspicious header combos, are treated as bots.
 *   4. **Rate limiting** on API routes → slows scraping.
 *   5. **Security headers** on every response.
 *
 * ⚠️ Honest limits (documented, not hidden):
 *   - This runs in a single Railway container with in-memory state, so a
 *     "permanent" ban lasts until the container restarts/redeploys. For a true
 *     persistent ban list across restarts you'd need a DB (e.g. Upstash Redis).
 *   - A sophisticated bot that mimics a real browser (correct UA + headers +
 *     residential IP + JS) is indistinguishable from a human and cannot be
 *     blocked — this is true for every website on the internet.
 */

// ── Bot / crawler / headless UA signatures (blocked permanently) ────────────
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
  /census/i,
  /facebookexternalhit/i, // allow social preview? keep blocked for now
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
  /bingpreview/i,
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

/** Allow legitimate search engines? Currently NOT allow-listed (block all). */
function isBotUA(ua: string): boolean {
  if (!ua) return true; // no UA at all = bot
  return BOT_UA.some((re) => re.test(ua));
}

// ── In-memory perma-ban + rate-limit state (globalThis for hot reload) ──────
type Bucket = { count: number; reset: number };
const g = globalThis as unknown as {
  __animelaBuckets?: Map<string, Bucket>;
  __animelaBanned?: Set<string>;
};
const buckets = (g.__animelaBuckets ??= new Map<string, Bucket>());
const banned = (g.__animelaBanned ??= new Set<string>());

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 180; // per IP per minute (normal browsing)

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

/** Header fingerprint: real browsers always send these. */
function missingBrowserHeaders(req: NextRequest): boolean {
  const ua = req.headers.get("user-agent") || "";
  const accept = req.headers.get("accept") || "";
  const acceptLanguage = req.headers.get("accept-language") || "";

  // Real browsers send Accept and Accept-Language; bots often omit them.
  if (!accept) return true;
  if (!acceptLanguage) return true;

  // A normal browser Accept header contains text/html.
  if (!/text\/html/.test(accept)) return true;

  // Sec-Fetch-* headers are sent by all modern browsers; a missing
  // sec-fetch-mode on a navigation request is a strong bot signal.
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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (Math.random() < 0.01) prune();

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "";

  // 1. Perma-ban check (IPs already flagged as bots)
  if (banned.has(ip)) {
    return blockResponse(403, "Access denied.");
  }

  // 2. Bot UA signature → ban permanently + block
  if (isBotUA(ua)) {
    if (ip !== "unknown") banned.add(ip);
    return blockResponse(403, "Access denied.");
  }

  // 3. Header fingerprint (missing browser headers) → treat as bot
  if (missingBrowserHeaders(req)) {
    if (ip !== "unknown") banned.add(ip);
    return blockResponse(403, "Access denied.");
  }

  // 4. Rate-limit API routes (exempt HLS proxy + health)
  if (pathname.startsWith("/api/")) {
    const exempt = pathname === "/api/hls" || pathname === "/api/health";
    if (!exempt && !rateLimit(ip)) {
      banned.add(ip); // hammering = bot → permanent ban
      return blockResponse(429, "Too many requests.");
    }
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(k, v);
  }
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|css|js)$).*)",
  ],
};
