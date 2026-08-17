import { NextRequest } from "next/server";
import { proxiedFetch } from "@/lib/proxy-fetch";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Debug endpoint: test whether the ANIME_PROXY is configured + working.
 * Fetches a known URL and reports the effective outbound IP.
 */
export async function GET(_req: NextRequest) {
  const configured = !!process.env.ANIME_PROXY;

  const results: Record<string, unknown> = { configured };

  // 1. Echo the IP we appear to come from (via a simple echo service).
  try {
    const ipRes = await proxiedFetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(10000),
    });
    results.ipify_status = ipRes.status;
    results.ipify_body = await ipRes.text();
  } catch (e) {
    results.ipify_error = e instanceof Error ? e.message : String(e);
  }

  // 2. Test the actual blocked target (anidb.app).
  try {
    const anidbRes = await proxiedFetch("https://anidb.app/browse?q=one+piece", {
      headers: { "User-Agent": "Mozilla/5.0 Chrome/124.0" },
      signal: AbortSignal.timeout(10000),
    });
    results.anidb_status = anidbRes.status;
    results.anidb_len = (await anidbRes.text()).length;
  } catch (e) {
    results.anidb_error = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(results);
}
