import { NextRequest } from "next/server";
import { unshorten, extractDecodedUrls } from "@/lib/shortener";
import { ok, fail, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/v1/unshorten?url=...
 *
 * Resolves a link-protector / shortener URL to its direct download link
 * server-side. Returns { ok, originalUrl, resolvedUrl?, method, note? }.
 * method is "redirect" | "embedded" | "manual" (manual = captcha-gated, the
 * caller should show the original link).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const url = sp.get("url");
  if (!url) return fail(400, "Missing required param: url");

  // Debug mode: dump raw HTML (truncated) + all extracted candidates so we can
  // reverse-engineer a protector's actual reveal mechanism. Dev only.
  if (sp.get("debug") === "1") {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 Chrome/126.0" },
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });
      const html = await res.text();
      const urls = [...html.matchAll(/https?:\/\/[^\s"'<>\\]+/gi)].map((m) => m[0]);
      const decoded = extractDecodedUrls(html);
      return ok({
        finalUrl: res.url,
        htmlLength: html.length,
        urls,
        decodedUrls: decoded,
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
