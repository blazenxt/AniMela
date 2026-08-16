import { NextRequest } from "next/server";

/**
 * Same-origin HLS proxy.
 *
 * flixcloud.cc (Animelok's stream host) IP-binds its signed m3u8 tokens to the
 * requester's IP and sits behind Cloudflare. The token we decrypt server-side
 * is bound to *our* server IP, so the visitor's browser can't fetch the stream
 * directly — it gets blocked. This proxy fetches the playlist + segments from
 * our server (matching IP) and rewrites the URLs so the browser only ever talks
 * to us.
 *
 *   GET /api/hls?url={encoded_m3u8_or_segment}&referer={encoded_referer}
 *
 * Playlists are rewritten (relative URIs resolved + re-proxied); segments are
 * streamed through byte-for-byte.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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

function proxyUrl(url: string, referer: string): string {
  return `/api/hls?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
}

/** Rewrite a playlist body: resolve each URI line to absolute + re-proxy it. */
function rewritePlaylist(body: string, baseUrl: string, referer: string): string {
  const lines = body.split("\n");
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    // URI line — resolve against the playlist's own URL, then re-proxy.
    let abs: string;
    try {
      abs = new URL(trimmed, baseUrl).toString();
    } catch {
      return line;
    }
    return proxyUrl(abs, referer);
  });
  return out.join("\n");
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const url = sp.get("url");
  const referer = sp.get("referer") || "";

  if (!url) return new Response("missing url", { status: 400 });

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return new Response("invalid url", { status: 400 });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return new Response("bad protocol", { status: 400 });
  }
  if (isPrivateHost(target.hostname)) {
    return new Response("host not allowed", { status: 403 });
  }

  const headers: Record<string, string> = { "User-Agent": UA };
  if (referer) headers["Referer"] = referer;

  const upstream = await fetch(target.toString(), {
    headers,
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });

  if (!upstream.ok) {
    return new Response(`upstream ${upstream.status}`, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") || "";
  const isPlaylist =
    contentType.includes("mpegurl") ||
    contentType.includes("x-mpegurl") ||
    /\.m3u8($|\?)/i.test(target.pathname);

  if (isPlaylist) {
    const body = await upstream.text();
    const rewritten = rewritePlaylist(body, target.toString(), referer);
    return new Response(rewritten, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Segment (ts/m4s/fmp4/key/etc.) — stream through.
  const buf = await upstream.arrayBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
