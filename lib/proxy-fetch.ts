/**
 * Proxy-aware fetch for outbound scraping requests.
 *
 * Anime stream CDNs (flixcloud, anidb.app, gogoanime, …) sit behind Cloudflare
 * and block datacenter IPs (Railway/Vercel). A residential proxy lets our
 * server fetch through a trusted IP. Configure it via the `ANIME_PROXY` env var.
 *
 * Accepted formats:
 *   http://user:pass@host:port        (standard)
 *   host:port:user:pass               (residential provider copy-paste format)
 *
 * Falls back to a normal fetch when ANIME_PROXY is unset.
 */

import { ProxyAgent, fetch as undiciFetch } from "undici";

function parseProxy(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // already a full URL (http:// or https://)
  if (/^https?:\/\//.test(s)) return s.replace(/^https/, "http"); // undici ProxyAgent wants http:// for the proxy itself
  // host:port:user:pass format
  const parts = s.split(":");
  if (parts.length === 4) {
    const [host, port, user, pass] = parts;
    return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  }
  return null;
}

const PROXY_URL = parseProxy(process.env.ANIME_PROXY || "");

// Cache a single ProxyAgent (undici supports dispatcher reuse).
let _agent: ProxyAgent | null = null;
function agent(): ProxyAgent | null {
  if (!PROXY_URL) return null;
  if (!_agent) _agent = new ProxyAgent(PROXY_URL);
  return _agent;
}

/**
 * Fetch like the global `fetch`, but route through the residential proxy when
 * configured. Returns the same shape (a Response).
 */
export function proxiedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const dispatcher = agent();
  if (dispatcher) {
    return undiciFetch(input as any, { ...(init as any), dispatcher }) as unknown as Promise<Response>;
  }
  return fetch(input, init);
}
