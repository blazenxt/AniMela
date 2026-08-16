import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side protection middleware (single-instance Railway deployment).
 *
 * What this actually does:
 *   - **Rate limiting** on API routes → limits how fast someone can hammer
 *     (scrape) the endpoints. Real anti-abuse.
 *   - **Security headers** on every response → blocks clickjacking, MIME
 *     sniffing, and enforces a strict referrer/permissions policy.
 *
 * What it deliberately does NOT pretend to do:
 *   - It does NOT prevent "inspect element" (DevTools is the visitor's own
 *     browser — impossible to disable).
 *   - It does NOT prevent scraping outright (any public page can be scraped;
 *     server-side bots ignore all browser tricks). It only *limits the rate*.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 180; // per IP per minute (generous for normal browsing)

// In-memory bucket per IP. Persist across hot-reloads via globalThis.
type Bucket = { count: number; reset: number };
const g = globalThis as unknown as { __animelaBuckets?: Map<string, Bucket> };
const buckets = (g.__animelaBuckets ??= new Map<string, Bucket>());

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

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "X-DNS-Prefetch-Control": "off",
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Cheap periodic cleanup (every ~2 min of traffic).
  if (Math.random() < 0.01) prune();

  // Rate-limit API routes, but exempt the HLS proxy (a single video stream
  // makes many segment requests) and the health check.
  if (pathname.startsWith("/api/")) {
    const exempt = pathname === "/api/hls" || pathname === "/api/health";
    if (!exempt) {
      const ip = clientIp(req);
      if (!rateLimit(ip)) {
        return new NextResponse("Too many requests — slow down.", {
          status: 429,
          headers: { ...SECURITY_HEADERS, "Retry-After": "60" },
        });
      }
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
    // Apply to everything except static assets / images / _next internals.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|css|js)$).*)",
  ],
};
