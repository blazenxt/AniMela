import { NextRequest, NextResponse } from "next/server";
import { proxiedFetch } from "@/lib/proxy-fetch";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const out: Record<string, unknown> = {
    proxyConfigured: !!process.env.ANIME_PROXY,
    proxyEnv: process.env.ANIME_PROXY ? "(set)" : "(unset)",
  };

  // 1. What public IP does the proxy (or direct) route through?
  try {
    const r = await proxiedFetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(12000),
    });
    out.ipify = { status: r.status, body: (await r.text()).slice(0, 200) };
  } catch (e) {
    out.ipifyError = e instanceof Error ? e.message : String(e);
  }

  // 2. Does anidb.app work through the proxy?
  try {
    const r = await proxiedFetch("https://anidb.app/api/frontend/anime/3880/episodes", {
      headers: { "User-Agent": "Mozilla/5.0 Chrome/124.0", Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    out.anidb = { status: r.status, body: (await r.text()).slice(0, 200) };
  } catch (e) {
    out.anidbError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(out);
}
