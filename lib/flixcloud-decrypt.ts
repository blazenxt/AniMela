/**
 * FlixCloud stream decryption (ported from ReAnime.to-API `decrypt.mjs`).
 *
 * flixcloud.cc hosts the HLS streams used by Animelok / ReAnime. It wraps the
 * real m3u8 URL in a rotating, WASM-based AES-256-CBC scheme: every embed page
 * load ships a fresh WASM binary with different constants, a one-time token and
 * new encrypted key material. This module reverse-engineers that flow (pure
 * Node.js crypto + WebAssembly — no headless browser).
 *
 * Flow:
 *   1. GET flixcloud.cc/e/{access_id}?v={1|2}      → SvelteKit SSR data block
 *   2. Derive 7 obfuscated field names via SHA-256 rounds on obfuscation_seed
 *   3. Extract frag1, iv, keyFrag2, token from the crypto object
 *   4. GET flixcloud.cc/api/m3u8/{token}            → encrypted key material
 *   5. Run the WASM payload to derive key material
 *   6. PBKDF2 + XOR + SHA-256 → AES-256-CBC key
 *   7. Decrypt → plaintext m3u8 URL
 */

import crypto from "crypto";
import { proxiedFetch } from "./proxy-fetch";

const FLIX = "https://flixcloud.cc";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function sha256hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function b64(b: string): Buffer {
  return Buffer.from(b, "base64");
}

interface DerivedFields {
  keyField: string;
  ivField: string;
  containerName: string;
  arrayName: string;
  objectName: string;
  tokenField: string;
  keyFrag2Field: string;
}

/** Derive the 7 obfuscated field names from the seed (6 SHA-256 rounds). */
function deriveFields(seed: string): DerivedFields {
  let e = seed;
  for (let i = 0; i < 3; i++) e = sha256hex(e + i);
  let l = e;
  for (let i = 0; i < 3; i++) l = sha256hex(l + i);
  return {
    keyField: "kf_" + e.substring(8, 16),
    ivField: "ivf_" + e.substring(16, 24),
    containerName: "cd_" + e.substring(24, 32),
    arrayName: "ad_" + e.substring(32, 40),
    objectName: "od_" + e.substring(40, 48),
    tokenField: e.substring(48, 64) + "_" + e.substring(56, 64),
    keyFrag2Field: l.substring(0, 16) + "_" + l.substring(16, 24),
  };
}

/** Run the embedded WASM to derive the key fragment. */
async function runWasm(
  wasmB64: string,
  frag1: Buffer,
  kf2: Buffer,
  T_bytes: Buffer,
  seedInt: number
): Promise<Buffer> {
  const result = (await WebAssembly.instantiate(b64(wasmB64))) as unknown as {
    instance: WebAssembly.Instance;
  };
  const exports_ = result.instance.exports as unknown as {
    _s: (seed: number) => void;
    _r: (y: number, v: number, t: number, out: number, len: number) => void;
    memory: WebAssembly.Memory;
  };
  const h = new Uint8Array(exports_.memory.buffer);
  const len = frag1.length;
  const y = 1000;
  const v = 1000 + len;
  const T = 1000 + 2 * len;
  const out = 1000 + 3 * len;
  h.set(frag1, y);
  h.set(kf2, v);
  h.set(T_bytes, T);
  exports_._s(seedInt);
  exports_._r(y, v, T, out, len);
  return Buffer.from(h.subarray(out, out + len));
}

/** Extract the SvelteKit SSR `{type:"data",data:{…}}` object string. */
function extractSsrObj(html: string): string {
  const m = html.match(/\{type:"data",data:(\{)/);
  if (!m) throw new Error("SSR data block not found");
  let depth = 0;
  const start = html.indexOf("{", m.index! + m[0].length - 1);
  for (let i = start; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      if (--depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error("SSR brace matching failed");
}

export interface DecryptedStream {
  url: string;
  subtitles: { url: string; language: string; format?: string }[];
  video_title?: string;
  video_id?: string;
}

export async function decryptFlixcloud(
  accessId: string,
  v: number,
  referer: string
): Promise<DecryptedStream> {
  const embedRes = await proxiedFetch(`${FLIX}/e/${accessId}?v=${v}`, {
    headers: { "User-Agent": UA, Referer: referer },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!embedRes.ok) throw new Error(`flixcloud embed ${embedRes.status}`);
  const html = await embedRes.text();

  // eslint-disable-next-line no-new-func
  const data = new Function("return (" + extractSsrObj(html) + ");")() as any;

  const seed: string = data.obfuscation_seed;
  const fields = deriveFields(seed);
  const ocd = data.obfuscated_crypto_data;
  const obj = ocd[fields.containerName][fields.arrayName][0][fields.objectName];
  const frag1 = b64(obj[fields.keyField]);
  const iv = b64(obj[fields.ivField]);
  const kf2 = b64(data[fields.keyFrag2Field]);
  const token: string = data[fields.tokenField];

  if (!token) throw new Error("Token field missing from embed data");

  const tokRes = await proxiedFetch(`${FLIX}/api/m3u8/${token}`, {
    headers: { "User-Agent": UA, Referer: referer },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!tokRes.ok) throw new Error(`flixcloud token ${tokRes.status}`);
  const tokData = (await tokRes.json()) as Record<string, string>;

  const vidKey = sha256hex(token + "vid").substring(0, 10);
  const keyKey = sha256hex(token + "key").substring(0, 10);
  const v_bytes = b64(tokData[vidKey]);
  const T_bytes = b64(tokData[keyKey]);
  if (!v_bytes.length || !T_bytes.length) {
    throw new Error(`Token missing fields. Got: ${Object.keys(tokData).join(",")}`);
  }

  const wasmOut = await runWasm(
    data.w_payload,
    frag1,
    kf2,
    T_bytes,
    parseInt(seed.substring(0, 8), 16)
  );
  const pbk = crypto.pbkdf2Sync(wasmOut, seed, 1000, 32, "sha256");
  const r = Buffer.from(pbk);
  for (let i = 0; i < 32; i++) r[i] ^= seed.charCodeAt(i % seed.length);
  const aesKey = crypto.createHash("sha256").update(r).digest();

  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
  const url = Buffer.concat([decipher.update(v_bytes), decipher.final()])
    .toString("utf8")
    .trim();

  if (!url.startsWith("http")) throw new Error(`Unexpected URL: ${url.slice(0, 80)}`);

  return {
    url,
    subtitles: (data.subtitles || []).map((s: any) => ({
      url: s.url,
      language: s.language || s.label || "sub",
      format: s.format,
    })),
    video_title: data.video_title || undefined,
    video_id: data.video_id || undefined,
  };
}
