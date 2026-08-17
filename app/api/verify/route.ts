import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/verify
 *
 * Verifies a Cloudflare Turnstile token and, on success, returns the signed
 * clearance cookie VALUE (the client sets it and reloads). The cookie is signed
 * server-side with CHALLENGE_SECRET so it can't be forged — and, unlike the
 * pure-JS fallback, the secret is never exposed to the client.
 */

export const dynamic = "force-dynamic";

const CHALLENGE_SECRET = process.env.CHALLENGE_SECRET || "animela-js-challenge-2026";
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || "";

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    ""
  );
}

export async function POST(req: NextRequest) {
  if (!TURNSTILE_SECRET) {
    return NextResponse.json({ ok: false, error: "Turnstile not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }

  const form = new URLSearchParams();
  form.set("secret", TURNSTILE_SECRET);
  form.set("response", token);
  const ip = clientIp(req);
  if (ip) form.set("remoteip", ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    if (!data?.success) {
      return NextResponse.json({ ok: false, error: "Challenge failed" }, { status: 400 });
    }

    const ts = Date.now();
    const cookie = `${ts}.${fnv1a(CHALLENGE_SECRET + ts)}`;
    return NextResponse.json({ ok: true, cookie });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "verify error" },
      { status: 502 }
    );
  }
}
