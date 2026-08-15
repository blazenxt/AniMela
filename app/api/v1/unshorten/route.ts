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
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return fail(400, "Missing required param: url");

  try {
    const result = await unshorten(url);
    return ok(result);
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Upstream error");
  }
}

export { options as OPTIONS };
