/**
 * URL obfuscation — AES-256-GCM encrypt external stream/source URLs into
 * opaque, URL-safe tokens so API responses and the page HTML never reveal the
 * actual source hosts (flixcloud, etc.) at a glance.
 *
 * The client receives only tokens; it resolves them to real URLs through the
 * same-origin `/api/v1/resolve` endpoint at play time.
 *
 * ⚠️ Honest note: this is *obfuscation*, not real secrecy. The browser must
 * ultimately connect to the source host to play video, so a determined user
 * inspecting network traffic can still see the final host. It hides the source
 * from the API surface, casual scrapers, and view-source — not from devtools
 * network inspection. For stronger privacy set `OBFUSCATION_KEY` to a secret
 * (and keep the repo private).
 */

import crypto from "crypto";

const SECRET = process.env.OBFUSCATION_KEY || "animela-obfuscation-key-2026";

function key(): Buffer {
  return crypto.createHash("sha256").update(SECRET).digest();
}

/** Encrypt a URL/string into an opaque URL-safe token (no padding). */
export function encryptUrl(url: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url").replace(/=+$/, "");
}

/** Decrypt an opaque token back to its URL. Returns null on any failure. */
export function decryptUrl(token: string): string | null {
  try {
    let t = token;
    while (t.length % 4 !== 0) t += "=";
    const buf = Buffer.from(t, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
