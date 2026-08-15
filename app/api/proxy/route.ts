import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin CORS proxy used as a fallback when a direct browser fetch to an
 * upstream API is blocked by CORS. Hostnames are allow-listed to prevent SSRF.
 */

const ALLOWED_HOSTS = [
  "cinezo.net",
  "cinezo.org",
  "api.speedracelight.com",
  "db.speedracelight.com",
];

export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "missing url" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ error: "bad protocol" }, { status: 400 });
  }

  const allowed = ALLOWED_HOSTS.some(
    (h) => target.hostname === h || target.hostname.endsWith(`.${h}`)
  );
  if (!allowed) return NextResponse.json({ error: "host not allowed" }, { status: 403 });

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": UA,
      },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });

    const body = await upstream.text();
    const headers = new Headers();
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Content-Type", upstream.headers.get("content-type") || "application/json");
    return new NextResponse(body, { status: upstream.status, headers });
  } catch (e) {
    return NextResponse.json(
      { error: `proxy error: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }
}
