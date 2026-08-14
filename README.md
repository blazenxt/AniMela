# AniMela

A free streaming site for **anime, movies and TV series** — built with Next.js (App Router), React and Tailwind CSS. Browse trending movies/series, search anything, and play instantly with embedded players. No accounts, no downloads.

## Features

- **Home** — featured hero + `Trending Movies`, `Trending Series`, `Popular Anime` rows.
- **Movies / Series / Anime** — paginated grids ("Load more").
- **Search** — live multi-search across movies, series and people.
- **Movie pages** — details, genres, ratings, IMDb link, and an embedded player (Videasy + VidFast).
- **Series pages** — season selector + episode picker (with episode stills), and an embedded player that takes you straight to the right season/episode.

## Tech stack

- [Next.js 15](https://nextjs.org) (App Router) + React 19
- [Tailwind CSS v4](https://tailwindcss.com)
- TypeScript

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
# or, for a production build:
npm run build && npm start
```

The server binds to `0.0.0.0` so it can be previewed / deployed anywhere.

---

## The APIs used

### 1. Metadata & browsing — Cinezo (TMDB proxy)

Base URL: `https://cinezo.net` (redirects to `cinezo.org`). Overridable via `NEXT_PUBLIC_CINEZO_BASE`.

| Purpose | Endpoint |
| --- | --- |
| Trending movies | `/api/tmdb/trending/movie/week?page=1` |
| Trending TV | `/api/tmdb/trending/tv/week?page=1` |
| Search | `/api/tmdb/search/multi?query={query}&page=1` |
| Movie detail | `/api/tmdb/movie/{tmdbId}` |
| TV detail | `/api/tmdb/tv/{tmdbId}` |
| Season / episodes | `/api/tmdb/tv/{tmdbId}/season/{n}` |

Posters/backdrops use TMDB's image CDN: `https://image.tmdb.org/t/p/{size}{poster_path}`.

> **CORS / network note.** The app tries a **direct fetch** from the browser first
> (works when the upstream sends CORS headers). If that fails it retries through the
> same-origin proxy at `/api/proxy?url=…` (hostname-allow-listed, adds
> `Access-Control-Allow-Origin: *`). Some of these hosts block datacenter IPs
> (Cloudflare), so the proxy only helps when the server is running from a
> non-blocked network — the direct browser fetch is always preferred.

### 2. Playback — embedded players

Playback is an `<iframe>` embed, no extra headers needed:

- **TV / anime series** — `https://player.videasy.to/tv/{tmdbId}/{season}/{episode}`
  - e.g. Naruto S1 E9 → `https://player.videasy.to/tv/46260/1/9`
- **Movies / anime movies** — `https://player.videasy.to/movie/{tmdbId}`
  - e.g. Supergirl → `https://player.videasy.to/movie/1081003`
- **Alternative movie player** — `https://vidfast.vc/movie/{tmdbId}?autoPlay=true`

Each player also has an **"open in a new tab"** fallback in case a host refuses iframe embedding.

### 3. Direct stream (experimental) — SpeedRaceLight

An optional pipeline that resolves a real HLS `.m3u8` instead of using an embed.
See [`lib/speedracelight.ts`](./lib/speedracelight.ts) — the `seed` and `sources` fetches
are implemented; the final **decryption** step is a documented stub because the cipher is
a custom FNV-1a / SHA-K key-schedule that must be ported byte-for-byte from the obfuscated
JS. The documented flow is:

1. `GET https://api.speedracelight.com/seed?mediaId={tmdbId}` → `{ seed, ttlMs }`
2. `GET https://api.speedracelight.com/cdn/sources-with-title?...&seed=…` → base64 ciphertext
3. decrypt with the (seed, tmdbId)-keyed stream cipher → JSON whose plaintext starts with `mvm1`
4. play the returned HLS sources.

> ⚠️ The final segment host serves from **residential-only IPs** (403 for datacenter IPs),
> so this flow only works from a residential browser.

## Project structure

```
app/
  page.tsx              Home (hero + rows)
  movies/ series/ anime/   Grid pages
  search/               Search results
  movie/[id]/           Movie detail + player
  tv/[id]/              Series detail + season/episode picker
  api/proxy/route.ts    CORS proxy (allow-listed)
components/             Navbar, Footer, MediaCard, MediaRow, MediaGrid, Player, SeasonEpisodes, …
lib/
  api.ts                Cinezo client (direct → proxy fallback)
  players.ts            Videasy / VidFast URL builders
  images.ts             TMDB image helpers
  types.ts              Types + helpers
  useApi.ts             data hook (loading / error / retry)
  speedracelight.ts     experimental direct-stream pipeline
```

## Disclaimer

AniMela does not host any video files. All metadata and streams are provided by
third-party services; use responsibly and respect the content owners' terms.
