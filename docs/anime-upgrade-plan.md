# AniMela — Anime Metadata + Streaming Upgrade Plan

> Status: **Proposed** (awaiting implementation)
> Scope: **Both** — real anime metadata (AniList/Jikan) **and** real anime episode
> streaming (HiAnime / Consumet), with provider fallback.

---

## 1. Why this upgrade

Today AniMela is a *movies/TV* app that also lists anime:

| Concern | Current state | Problem |
| --- | --- | --- |
| **Anime metadata** | Cinezo (TMDB) with a hardcoded `with_genres=16&with_origin_country=JP` filter (`lib/api.ts`) | No anime-native data — no Japanese titles, studios, MAL score, airing status, episode count, or proper anime search. TMDB's "Animation + JP" filter is a weak proxy that misses/over-includes titles. |
| **Anime streaming** | TMDB-id → Videasy/VidFast embeds (`lib/players.ts`), plus a Videasy WASM decrypt path (`lib/videasy-decrypt.ts`) | Embeds are ad-heavy, unreliable, and keyed to TMDB ids which anime scrapers don't use. No real episode source resolution (sub/dub, servers, quality). |
| **Resilience** | Single hardcoded source, single embed fallback | No provider abstraction — one source dying breaks playback entirely. |

The repos you shared solve exactly these two problems, in a consistent pattern
(see §2). This plan adopts that pattern and maps it onto AniMela's existing
structure with **zero breaking changes to the current UI/data flow**.

---

## 2. What we learned from each reference

| Reference | What it teaches | What we adopt |
| --- | --- | --- |
| **Snozxyx/Tatakai** | A production anime platform: AniList content mapping, a **provider abstraction** ("Toko" extensions), **source fallback**, HLS proxy, multi-dub, Supabase persistence. | Provider-interface design, ordered-fallback resolver, HLS proxy idea, dub/sub tracking. |
| **anshumanv/awesome-anime-sources** | Streaming sites are ephemeral — always have **multiple alternatives**. | Multi-provider list + graceful degradation; never hardcode one domain. |
| **roflmuffin/node-anime-scraper** | GogoAnime scraping: search → anime → episodes → video URLs. Cloudflare is the main obstacle (needs cookie/bypass). | The *scrape pipeline shape* (search→detail→episodes→servers→sources). We skip GogoAnime (dead/unstable) for HiAnime. |
| **topics: anime-scraper / hianime-scraper / hianime-api** | The modern, maintained approach is **HiAnime (hianime.to, ex zoro.to/aniwatch)** + **Consumet** as a meta-aggregator. Dozens of working clones confirm the endpoints. | HiAnime as primary stream provider, Consumet as fallback, AniList as the identity/metadata spine. |
| **topics: anime-website / anime-api** | Standard UX + REST conventions: `/search`, `/anime/{id}`, `/episodes/{id}`, `/servers`, `/stream`. | Our new `/api/v1` anime endpoints mirror these shapes. |

**Core conclusion:** the reference ecosystem converged on one architecture —

```
AniList  ──► identity / metadata (stable, free, no key)
HiAnime  ──► episode list + stream sources (scrape, sub/dub, servers)
Consumet ──► fallback stream aggregator (multi-provider)
```

AniMela should adopt this spine while keeping TMDB/Cinezo for movies & TV
(which it already does well).

---

## 3. Target architecture

```
                    ┌──────────────────────────────────────────────┐
                    │                Browser (client)              │
                    │   app/anime/*  app/search  app/tv/[id] ...    │
                    └───────────────▲───────────────────▲──────────┘
                                    │ /api/v1/...        │ /api/v1/stream
                    ┌───────────────┴───────┐   ┌───────┴──────────────┐
                    │  lib/anime-meta.ts    │   │ lib/anime-stream.ts  │
                    │  (server, cached)     │   │ (server, cached)     │
                    └───────────┬───────────┘   └───────────┬──────────┘
                                │                           │
                    ┌───────────▼───────────┐   ┌───────────▼───────────────────┐
                    │  AniList GraphQL      │   │  StreamProvider abstraction   │
                    │  (primary)            │   │  ├─ HiAnimeProvider  (primary)│
                    │  Jikan v4 (fallback)  │   │  ├─ ConsumetProvider (fallback)│
                    └───────────────────────┘   │  └─ (future) Gogo/AnimePahe   │
                                                └───────────────────────────────┘
```

Design principles carried over from the references:

1. **Provider interface first** — every source implements one contract; a dead
   provider is removed without touching the UI.
2. **Ordered fallback** — resolver tries providers in order, returns the first
   playable result, logs the rest.
3. **Server-side scraping** — all scraping happens in API route handlers
   (Node runtime, not edge), so CORS/referer/Cloudflare limits don't apply.
4. **Caching + rate limits** — 5-min TTL like the existing `lib/api.ts`, plus
   backoff/health so a broken provider is skipped for a cooldown window.
5. **Graceful degradation** — if every anime source fails, fall back to the
   existing Videasy embed path. The current player already has this shape.

---

## 4. Phase 1 — AniList metadata provider

New module `lib/anime-meta.ts` (server) + `lib/anilist.ts` (shared types/query).

### 4.1 AniList GraphQL (primary)

- Endpoint: `POST https://graphql.anilist.co`
- No API key for public queries; rate limit ~90 req/min (we stay well under it
  with caching).
- Two graph shapes we need:

```graphql
query Page($search: String, $sort: [MediaSort], $type: MediaType, $genre: String, $page: Int) {
  Page(page: $page, perPage: 20) {
    pageInfo { hasNextPage }
    media(search: $search, type: $type, sort: $sort, genre: $genre, isAdult: false) {
      id
      idMal
      title { romaji english native }
      description            # HTML — sanitize before rendering
      coverImage { extraLarge }
      bannerImage
      format                 # TV / MOVIE / TV_SHORT / OVA / ONA ...
      episodes               # total count
      duration
      averageScore           # 0–100 (MAL-style /10 in UI)
      popularity
      status                 # FINISHED / RELEASING / NOT_YET_RELEASED
      season
      seasonYear
      genres
      studios { nodes { name } }
      isAdult
      trailer { id site }    # YouTube
    }
  }
}
```

Mapping used to power the pages:

| AniMela need | AniList |
| --- | --- |
| Anime series browser (`/anime?type=series`) | `format` in (TV, TV_SHORT, ONA, OVA, SPECIAL) |
| Anime movies (`/anime?type=movies`) | `format: MOVIE` |
| Popular sort | `sort: POPULARITY_DESC` |
| Top rated sort | `sort: SCORE_DESC` |
| Trending | `sort: TRENDING_DESC` |
| Genre browse | `genre: "Action"` etc. (string enum) |
| Search | `search: "naruto"` |

### 4.2 Jikan v4 (fallback metadata, optional)

- `https://api.jikan.moe/v4/anime?q=...`, `/v4/anime/{id}/full`,
  `/v4/top/anime`, `/v4/seasons/now`.
- Free, no key, **3 req/s / 60 req/min** hard limit → cache aggressively,
  never fan-out.
- Used only if AniList is down, or to enrich with `idMal` → MAL rating/
  `mal_id` links. Maps 1:1 to AniList via `idMal`.

### 4.3 Client

- `lib/api.ts` gets `api.animeSeries/animeMovies` replaced by AniList-backed
  equivalents; keep the same function signatures so `app/anime/page.tsx` barely
  changes.
- `app/anime/[id]/page.tsx` (new) — the anime watch page: banner, Japanese/
  romanized title, synopsis, studios, status, score, episode grid, player.
- Anime items now carry `anilistId` + `malId` so the stream resolver can map
  them without a TMDB id.

---

## 5. Phase 2 — Stream source resolver

New module `lib/anime-stream.ts` (server) exposing one function:

```ts
interface EpisodeSource {
  quality: string;       // "1080p" | "720p" | "default" | "backup"
  url: string;           // .m3u8 or .mp4
  isM3U8: boolean;
}

interface StreamResult {
  provider: string;      // "hianime" | "consumet"
  subOrDub: "sub" | "dub";
  server: string;
  sources: EpisodeSource[];
  subtitles?: { url: string; lang: string }[];
  headers?: Record<string, string>; // referer/origin required by some CDNs
}

interface StreamProvider {
  id: string;
  healthy(): boolean;
  searchAnime(query: string): Promise<AnimeRef[]>;           // { anilistId?, malId?, title, year }
  resolveEpisode(ref: AnimeRef, ep: number, dub: boolean): Promise<StreamResult | null>;
}
```

### 5.1 `HiAnimeProvider` (primary)

Scrape pipeline (all server-side):

```
search "naruto"       GET hianime.to/ajax/search/suggest?keyword=naruto
anime detail          GET hianime.to/{anime-id}           (parse episode list / dub flag)
episode servers       GET hianime.to/ajax/v2/episode/servers?episodeId={id}
episode sources       GET hianime.to/ajax/v2/episode/sources?id={serverId}
                      → returns { data: encryptedJson, key, iv } (AES-CBC)
decrypt               → [{ file, type }]  m3u8 links
```

- **Encryption caveat:** HiAnime has rotated its source-endpoint schema several
  times (v1 → v2 ajax, plain → AES-CBC encrypted `sources` payload). The
  provider isolates this: it owns the endpoints + decryption, returns the clean
  `StreamResult`. When HiAnime changes again, only this file is patched.
- **Dub support:** HiAnime exposes `sub`/`dub` category on the servers request —
  this gives AniMela a Sub/Dub toggle, matching Tatakai's multi-dub feature.
- **Referer:** stream URLs frequently need `Referer: https://hianime.to/` — the
  player must send these headers (see §6 HLS proxy).

### 5.2 `ConsumetProvider` (fallback)

- Public meta API `https://api.consumet.org` (and mirrors). Endpoints:
  - `GET /meta/anilist/{id}` — maps AniList id → provider id
  - `GET /anime/zoro/episodes/{animeId}` — episode list
  - `GET /anime/zoro/watch?episodeId={id}` — sources (sub/dub)
  - `GET /anime/gogoanime/watch/{episodeId}` — alternate provider
- Used when HiAnime fails; gives provider diversity for free.

### 5.3 Resolver with fallback

```
resolveStream(anilistId, episode, dub):
  for provider in [HiAnime, Consumet]:   // healthy, ordered
    try result = provider.resolveEpisode(...)
    if result && result.sources.length: cache + return
    else mark provider degraded (cooldown 60s)
  return null  → client falls back to Videasy embed (existing path)
```

---

## 6. Phase 3 — API surface (public, read-only)

Extend the existing `/api/v1` (CORS-enabled, cached, consistent `{ ok, data }`
envelope) — mirroring the endpoint shapes seen across the reference APIs.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/anime/search?q=` | AniList search (native titles, MAL id) |
| GET | `/api/v1/anime/trending?page=` | Trending (AniList) |
| GET | `/api/v1/anime/popular?page=` | Popular (AniList) |
| GET | `/api/v1/anime/top?page=` | Top rated (AniList) |
| GET | `/api/v1/anime/genres` | Genre list (AniList genre enum) |
| GET | `/api/v1/anime/{id}` | Anime detail (AniList + Jikan enrich) |
| GET | `/api/v1/anime/{id}/episodes` | Episode list (from stream provider) |
| GET | `/api/v1/anime/{id}/stream?ep={n}&dub={0\|1}` | Resolve `StreamResult` (HiAnime→Consumet) |

Internal routes (not public):

- `app/api/source/anime/route.ts` — the resolver above; the player calls this.
- `app/api/hls/route.ts` — **HLS proxy** (Tatakai-style): fetches `.m3u8` +
  segments server-side and rewrites segment URLs to same-origin, attaching the
  required `Referer`. This makes HiAnime streams play in-browser without CORS
  or referer blocks. (Phase 3, after direct playback is verified.)

---

## 7. UI wiring (minimal diff)

| Component / page | Change |
| --- | --- |
| `app/anime/page.tsx` | Switch `fetchPage` to AniList-backed calls (same UI, new data). Add a **Trending** tab. |
| `app/anime/[id]/page.tsx` | **New** watch page: banner/poster, synopsis, studios, status/score, episode grid, player. |
| `components/Player.tsx` | Add an `anilistId` + `episode` path: try `/api/source/anime` first (direct HLS), else existing embed. Add **Sub/Dub** toggle when dub exists. |
| `components/SeasonEpisodes.tsx` | Reuse as the episode grid for anime (or a thin `AnimeEpisodes.tsx`). |
| `components/MediaCard.tsx` | Render Japanese title under romaji; AniList `coverImage` fallback when TMDB poster missing. |
| `app/search/page.tsx` | Add an "Anime" results lane from AniList search. |
| `lib/types.ts` | Add `AnimeItem` / `AnimeDetail` types; `itemTitle` gains romaji/english/native handling. |

---

## 8. Configuration & env

| Variable | Purpose | Default |
| --- | --- | --- |
| `ANILIST_BASE` | AniList GraphQL endpoint | `https://graphql.anilist.co` |
| `JIKAN_BASE` | Jikan v4 base | `https://api.jikan.moe/v4` |
| `HIANIME_BASE` | HiAnime base host | `https://hianime.to` |
| `CONSUMET_BASE` | Consumet instance | `https://api.consumet.org` |
| `ANIME_PROVIDER_ORDER` | `"hianime,consumet"` | provider priority |

Add the anime hosts to the `/api/proxy` allow-list **only if** we choose to
proxy them through it; the stream resolver runs server-side and does not need
the proxy.

---

## 9. Caching, rate limits, error handling

- **Metadata cache:** 5-min in-memory TTL (same pattern as `lib/api.ts` /
  `lib/server-api.ts`). AniList results are stable; 5 min is plenty.
- **Stream cache:** short TTL (~10 min) — stream URLs are signed and expire.
- **Rate limits:** Jikan ≤ 1 req/s globally (we serialize + cache). HiAnime/
  Consumet requests are on-demand only (one per user "play" click), never
  pre-fetched in bulk.
- **Health/backoff:** each provider keeps an in-memory `failedUntil` timestamp;
  after N failures it's skipped for a cooldown. Prevents hammering a dead
  upstream and matches the "resilient multi-source" lesson from
  awesome-anime-sources.
- **Degradation:** `resolveStream` returning `null` is a *normal* outcome — the
  existing Videasy embed path is the final safety net. No hard failure UX.

---

## 10. Legal / compliance note

Same posture as the current README — AniMela hosts no video, only resolves
third-party URLs at play time. Add to README:

> Anime metadata via AniList/Jikan; stream resolution via third-party providers
> in the user's browser. No content is stored or redistributed.

---

## 11. Risks & mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| HiAnime changes endpoints/encryption | Streams break | Provider isolation (§5.1); Consumet fallback; embed safety net. |
| HiAnime/Consumet geo-block or Cloudflare | Streams fail | Server-side fetch with browser UA; HLS proxy; retry/backoff. |
| AniList rate limit / downtime | Metadata empty | Jikan fallback; 5-min cache smooths bursts. |
| Adult/NSFW content | Policy issue | `isAdult: false` filter in every query (already in TMDB calls). |
| Scraping fragility overall | Maintenance burden | All scraping in 2 files (`anime-stream.ts` + providers); README documents swap procedure. |

---

## 12. Implementation checklist

- [ ] `lib/anilist.ts` — types + GraphQL query builders (search/trending/popular/top/detail).
- [ ] `lib/anime-meta.ts` — server fetch + cache + Jikan fallback + AniList→`AnimeItem` mapping.
- [ ] `lib/anime-stream.ts` — `StreamProvider` interface + `resolveStream` fallback loop.
- [ ] `lib/providers/hianime.ts` — search/detail/servers/sources + AES decrypt + `headers`.
- [ ] `lib/providers/consumet.ts` — AniList-id mapping + episodes + watch.
- [ ] `app/api/v1/anime/*` routes (search, trending, popular, top, genres, detail, episodes, stream).
- [ ] `app/api/source/anime/route.ts` — resolver endpoint for the player.
- [ ] `app/api/hls/route.ts` — HLS proxy (Phase 3).
- [ ] `app/anime/[id]/page.tsx` + episode grid + player integration.
- [ ] `components/Player.tsx` anime path + Sub/Dub toggle.
- [ ] `app/anime/page.tsx` Trending tab + AniList data source.
- [ ] `app/search/page.tsx` anime lane.
- [ ] `lib/api.ts` client methods; `lib/types.ts` types.
- [ ] README + `.env.example` updates; deploy notes (Node runtime required for scraping).

---

## 13. Out of scope (for now)

- Manga reading / torrents / Real-Debrid (Tatakai features) — different domain.
- Accounts/auth/DB (Supabase) — AniMela is intentionally no-account.
- Electron/mobile apps.
