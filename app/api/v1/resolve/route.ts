import { NextRequest } from "next/server";
import { decryptUrl } from "@/lib/obfuscate";
import { ok, fail, options } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * GET /api/v1/resolve?token=...
 *
 * Decrypts an opaque token (produced by the servers / stream endpoints) back
 * into its real URL, so the client can load the player iframe. The token is
 * generated server-side and never exposes the source host in the API response
 * or page HTML.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return fail(400, "Missing required param: token");

  const url = decryptUrl(token);
  if (!url) return fail(400, "Invalid or expired token");

  return ok({ url });
}

export { options as OPTIONS };
