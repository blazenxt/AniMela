import { NextRequest } from "next/server";
import { unshorten } from "@/lib/shortener";
import { ok, fail, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/v1/unshorten?url=...
 *
 * Resolves a link-protector / shortener URL to its direct download link
 * server-side. Returns:
 *   { ok, originalUrl, resolvedUrl?, host?, method: "redirect"|"embedded"|"manual", note? }
 *
 * `method: "manual"` means the protector is captcha-gated (e.g. mobilejsr's
 * "three step auth") and cannot be auto-bypassed — the caller should fall back
 * to opening the original link.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const url = sp.get("url");
  if (!url) return fail(400, "Missing required param: url");

  // Reverse-engineering mode: dump raw HTML, forms, scripts, and any token
  // so we can build a dedicated handler for a new protector.
  if (sp.get("dump") === "1") {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0" },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });
      const html = await res.text();
      const forms = [...html.matchAll(/<form[\s\S]*?<\/form>/gi)].map((m) => m[0]);
      const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
        .map((m) => m[1])
        .filter((s) => s.trim());
      const inputs = [...html.matchAll(/<input[^>]*>/gi)].map((m) => m[0]);
      const buttons = [...html.matchAll(/<(button|a)[^>]*>(?:(?!<\/\1>)[\s\S])*?<\/\1>/gi)].map((m) => m[0]);
      const urls = [...html.matchAll(/https?:\/\/[^\s"'<>\\]+/gi)].map((m) => m[0]);
      const ajax = [...html.matchAll(/(?:fetch|\.get|\.post|\.ajax|XMLHttpRequest|\.open|axios)\s*\(?[^;]{0,150}/gi)].map((m) => m[0]);
      return ok({
        finalUrl: res.url,
        htmlLength: html.length,
        urls,
        forms,
        inputs,
        buttons,
        ajax,
        scripts: scripts.map((s) => s.slice(0, 2000)),
        htmlTail: html.slice(-3000),
      });
    } catch (e) {
      return fail(502, e instanceof Error ? e.message : "Upstream error");
    }
  }

  try {
    const result = await unshorten(url);
    return ok(result);
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
