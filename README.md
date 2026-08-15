# AniMela

A free, modern streaming interface for **anime, movies and TV series** — built with
Next.js (App Router), React and Tailwind CSS v4. Browse trending titles, search anything,
browse by genre, keep a watchlist, and play instantly. No accounts, no downloads.

> **Disclaimer:** AniMela does not host any video files. Metadata is sourced from
> third-party services and playback is delegated to external players. Use responsibly
> and respect content owners' terms.

---

## ✨ Features

- **Home** — cinematic featured hero + `Trending Movies`, `Trending Series`, `Popular Anime` rows.
- **Movies / Series** — paginated grids ("Load more") of weekly trending titles.
- **Anime** — dedicated anime browser with **Series / Movies** tabs and **Popular / Top Rated** sorting (Japanese animation).
- **Genres** — browse movies & series by genre (Movies + Series genre lists).
- **Search** — live multi-search across movies, series and people.
- **Movie pages** — backdrop hero, poster, genres, rating, runtime, IMDb link, cast, "More like this", and playback.
- **Series pages** — season selector + episode picker (with episode stills), cast, "More like this", and per-episode playback.
- **My List** — watchlist (❤ save any title) + **Continue Watching** (auto-remembers where you left off, saved to `localStorage`).
- **Custom player** — a hand-rolled HTML5 player (hls.js) with full controls, used when a direct stream is available.

---

## 🧱 Tech stack

| Layer | Tech |
| --- | --- |
| Framework | [Next.js 15](https://nextjs.org) (App Router) + React 19 |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) |
| Language | TypeScript |
| Fonts | Inter + Space Grotesk (self-hosted via `@fontsource`) |
| Video (custom player) | [hls.js](https://github.com/video-dev/hls.js) |

---

## 🚀 Run locally

```bash
npm install
npm run dev          # http://localhost:3000

# production build
npm run build
npm start
```

The server binds to `0.0.0.0` so it can be previewed or deployed anywhere.

### Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_CINEZO_BASE` | Override the metadata API host if the domain changes | `https://cinezo.org` |

---

## ☁️ Deploy

The repo is deploy-ready for both Vercel and Railway.

### Railway (recommended — long-running container)

`Dockerfile` (Next.js **standalone** output) + `railway.json` (healthcheck on `/api/health`).

1. [railway.app](https://railway.app) → **Start a New Project** → **Deploy from GitHub repo**.
2. Pick this repo (branch: `arena/01a001db-animela`). Railway auto-detects the `Dockerfile`.
3. Done — you get a `*.up.railway.app` URL (custom domain under **Settings → Networking**).

CLI alternative:

```bash
npm i -g @railway/cli
railway login
railway init
railway up
railway domain
```

> Railway is a long-running container (not serverless), so the `/api/proxy` fallback works
> there reliably.

### Vercel

`vercel.json` sets the framework and build commands.

1. [vercel.com/new](https://vercel.com/new) → **Import** the repo.
2. Vercel auto-detects Next.js — accept the defaults (`next build` / `npm install`).
3. **Deploy** → `*.vercel.app` URL.

CLI:

```bash
npm i -g vercel
vercel login
vercel --prod
```

---

## 🗺️ Project structure

```
app/
  page.tsx                   Home (hero + rows)
  layout.tsx                 Root layout (fonts, providers)
  globals.css                Tailwind theme + design tokens
  movies/ series/ anime/     Grid pages
  genres/                    Genre browser
  genre/[kind]/[id]/         Genre results
  search/                    Search results
  mylist/                    Watchlist + continue watching
  movie/[id]/                Movie detail + player
  tv/[id]/                   Series detail + episodes + player
  api/
    health/route.ts          Healthcheck (Railway)
    proxy/route.ts           CORS proxy (allow-listed)
    source/route.ts          Direct-stream resolver
components/
  Navbar.tsx                 Sticky nav + mobile menu
  Footer.tsx
  MediaCard.tsx              Poster card (hover play, rating, watchlist)
  MediaRow.tsx               Horizontal scrolling row
  MediaGrid.tsx              Paginated grid ("Load more")
  Player.tsx                 Player orchestrator (direct → embed)
  CustomPlayer.tsx           HTML5 player (hls.js) with custom controls
  SeasonEpisodes.tsx         Season selector + episode grid
  CastList.tsx               Cast carousel
  SimilarRow.tsx             "More like this" row
  Icons.tsx                  SVG icon set
  Loading.tsx / ErrorState.tsx
  Providers.tsx              Context providers
lib/
  api.ts                     Metadata client (proxy-first + cache)
  players.ts                 Playback URL builders
  images.ts                  TMDB image helpers
  types.ts                   Types + helpers
  useApi.ts                  Data hook (loading / error / retry)
  library.tsx                Watchlist + continue-watching (localStorage)
  videasy-decrypt.ts         Direct-stream WASM decryption (server-side)
  speedracelight.ts          Experimental direct-stream pipeline (stub)
public/
  favicon.svg  robots.txt
  wasm/module1.wasm          WASM crypto core for stream decryption
```

---

## 🔌 The APIs used

### 1. Metadata & browsing — Cinezo (TMDB proxy)

Base URL `https://cinezo.org` (overridable via `NEXT_PUBLIC_CINEZO_BASE`). Returns TMDB-shaped JSON.

| Purpose | Endpoint |
| --- | --- |
| Trending movies | `/api/tmdb/trending/movie/week?page=1` |
| Trending TV | `/api/tmdb/trending/tv/week?page=1` |
| Search | `/api/tmdb/search/multi?query={q}&page=1` |
| Movie detail | `/api/tmdb/movie/{id}` |
| TV detail | `/api/tmdb/tv/{id}` |
| Season / episodes | `/api/tmdb/tv/{id}/season/{n}` |
| Genres | `/api/tmdb/genre/{movie|tv}/list` |
| Discover | `/api/tmdb/discover/{movie|tv}?with_genres={id}` |
| Similar | `/api/tmdb/{movie|tv}/{id}/similar` |
| Credits | `/api/tmdb/{movie|tv}/{id}/credits` |
| Top rated | `/api/tmdb/{movie|tv}/top_rated` |

Posters/backdrops use TMDB's image CDN: `https://image.tmdb.org/t/p/{size}{path}`.

#### Fetching strategy (`lib/api.ts`)

1. **Proxy-first** — same-origin `/api/proxy?url=…` (hostname-allow-listed, adds CORS headers).
   Reliable on Railway; avoids Cloudflare blocks that hit residential mobile networks.
2. **Direct fetch** — fallback when the user's network reaches Cinezo directly.
3. **Caching** — 5-minute in-memory TTL so back/forward navigation is instant.
4. **Hard timeouts** — every request aborts fast instead of hanging the page.

### 2. Playback — `components/Player.tsx`

Playback is orchestrated: the player first tries a **direct HD stream** and falls back to an
**embedded player** if no direct source resolves. A click-to-play overlay prevents the embed's
first-tap ad/redirect from hijacking the page.

- **Direct stream** — `app/api/source/route.ts` resolves an HLS `.m3u8` and hands it to
  `CustomPlayer` (hls.js) with fully custom controls (play/pause, seek, volume, quality, fullscreen).
- **Embed fallbacks** (`lib/players.ts`):
  - TV / anime — `https://player.videasy.to/tv/{tmdbId}/{season}/{episode}`
  - Movies — `https://player.videasy.to/movie/{tmdbId}` and `https://vidfast.vc/movie/{tmdbId}`

> The direct-stream backend (`lib/videasy-decrypt.ts`, `public/wasm/module1.wasm`) is a ported
> WebAssembly decryption core. Its upstream endpoints are subject to change, so the app is built
> to degrade gracefully to embeds.

### 3. Experimental — SpeedRaceLight (`lib/speedracelight.ts`)

An alternative HLS pipeline (seed → encrypted sources → decrypt). Documented but the decryption
step is a stub pending a byte-exact cipher port. Kept for reference.

---

## ⚖️ Legal note

This project is a **front-end / metadata interface** only. It does not host, store, or
redistribute video content. Any streaming is performed by third-party services in the
visitor's browser. Users are responsible for complying with the laws and terms of the
content they access.
