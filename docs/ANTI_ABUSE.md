# Anti-Abuse / Device Identification System

Stateless, no-login, multi-layered detection for IP rotation, incognito/private-tab
recycling, and headless/automation spoofing — built for edge deployment (Cloudflare Workers).

## Why this exists

We previously relied on client IP to recognize returning anonymous users
(see `lib/session.ts`), but discovered the edge network — including its own
`context.ip` — only ever exposed an internal load-balancer address in that deployment,
not the real visitor IP. That ruled out IP as an identity or abuse signal on its own.
This system replaces "trust the IP" with three independent, corroborating signals that
each fail differently, so an attacker has to defeat all three simultaneously.

## Architecture

```
Browser                          proxy (middleware.ts)              Next.js API Route
────────                         ─────────────────────              ──────────────────
1. Turnstile (invisible)         Runs on the Worker that             inline in a write route
   renders, executes right       terminated TLS, so it reads         via guardNewPost (see
   before a critical action  ──▶ request.cf directly and       ──▶  posts/route.ts):
2. collectFingerprint()          rewrites x-ja4-fingerprint /        - verify Turnstile token
   (canvas/webgl/hw/screen/      x-tls-* (overwrite or delete,       - correlate signals in KV
   tz/lang/platform), sent       never merge — see tls.ts).          - score 0–100
   as raw JSON, not a hash                                           - 200 / 403 / 429
```

## 1. Client-side layer

### Turnstile — `lib/security/turnstile-client.ts` / `post-guard-client.ts`

Wired for **new threads and replies**. The client half is injected centrally in `lib/api.ts`
(`api.posts.create` / `api.posts.replies.create` spread `await collectPostGuard()` into the body),
so every composer (home, thread detail, BBS view, hashtag view) gets it without per-screen wiring.
The two raw-`fetch` reply callers (`GameThreadBoard`, `LiveGameView`) spread it themselves.

- **Lazy load**: the Turnstile script is loaded only when a composer textarea gets focus
  (`prefetchPostGuard()`), never on a plain page view.
- **One token per submit**: tokens are single-use and live 300s. One token is prefetched on
  focus; the submit takes it and discards it; any retry fetches a fresh one. A prefetched
  token older than 240s is thrown away.
- A fresh widget is rendered per token (`appearance: "interaction-only"`) into a fixed
  bottom-right host and removed afterwards — normally nothing is visible; a checkbox appears
  only if Cloudflare wants interaction (the wait then extends to 120s).
- If the token can't be obtained, the request is sent without one and the server answers 403
  with a message the UI shows as a toast; the failed-draft stash in `app/page.tsx` keeps the
  draft, and the next submit gets a new token.

Env vars (`.env`):
```
TURNSTILE_SECRET_KEY=...           # server-only (Workers secret)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=... # public, baked in at build time
```
Set them **as a pair**. Without the site key the client sends no token; without the secret
the server skips verification (logs a warning once) — this is how local dev works.
**Secret set but site key missing = every post/reply is 403.**

### Browser fingerprinting — `lib/security/fingerprint.ts`

Collected signals (see `lib/security/types.ts: FingerprintSignals`):

| Signal | Source | Notes |
|---|---|---|
| `canvas` | `canvas.toDataURL()` | **Fixed `width=280 height=60` attributes**, set before any drawing. This is the zoom/DPI fix: canvas pixel dimensions are independent of CSS/browser-zoom/OS scaling *only* if you set the width/height attributes explicitly rather than relying on CSS — otherwise the canvas backing store gets resampled and the same device produces a different hash at 100% vs 125% zoom. |
| `webglVendor` / `webglRenderer` | `WEBGL_debug_renderer_info` extension | GPU/driver-level signal, survives cookie/storage clears entirely. |
| `hardwareConcurrency` | `navigator.hardwareConcurrency` | Low entropy alone, but cheap and free to combine. |
| `deviceMemory` | `navigator.deviceMemory` | Chromium-only; `null` elsewhere (handled explicitly, not treated as a mismatch). |
| `screen` | `screen.{width,height,colorDepth}` + `devicePixelRatio` | |
| `timezone` | `Intl.DateTimeFormat().resolvedOptions().timeZone` | |
| `language` / `languages` | `navigator.language(s)` | |
| `platform` | `navigator.platform` | |

**Sent as raw JSON, not a single client-side hash** — per the spec, hashing happens
server-side (`computeFingerprintHash` in `lib/security/scoring.ts`) so the server can
reason about *which* fields matched/mismatched (e.g. "everything matches except
`deviceMemory` changed" is a different signal than "the canvas hash is completely
different"), which a pre-hashed client blob would destroy.

## 2. Infrastructure / Edge layer — TLS fingerprinting (JA3/JA4)

Reading the raw TLS handshake is impossible from inside a V8 isolate — the handshake is
already complete by the time any JS runs. It therefore has to come from whatever terminates
TLS. **Since the app now runs on Cloudflare Workers, that is us**, so no extra proxy layer
is required: `request.cf` carries the handshake data directly.

The flow is one-directional and lives in `lib/security/tls.ts`:

1. `middleware.ts` calls `getCloudflareContext()` and reads `request.cf` via
   `readTlsSignalsFromCf()`.
2. It writes the values onto the downstream request as `x-ja4-fingerprint`,
   `x-ja3-fingerprint`, `x-tls-version`, `x-tls-cipher`.
3. Route handlers read them back with `readTlsSignalsFromHeaders()` and pass them to
   `scoreRequest()`.

**These headers are attacker-controllable, so step 2 overwrites or deletes them — never
merges.** A client that sends its own `x-ja4-fingerprint` has it discarded before any
scoring code sees it. Outside Cloudflare (`next dev`, static export) `request.cf` is
unavailable, so every TLS header is *deleted* and the signal degrades to "unknown" rather
than trusting client input.

What is actually available depends on the plan:

| Signal | Availability | Used for |
|---|---|---|
| `botManagement.ja4` / `ja3Hash` | Bot Management only | Prefix match against known-browser JA4s → high-confidence verdict |
| `tlsVersion` | all plans | Legacy TLS (1.0/1.1) from a self-declared modern browser → low-confidence verdict |
| `tlsCipher` | all plans | Recorded; not yet scored |

`assessTls()` returns `browser` / `non-browser` / `unknown` plus a confidence level, and
`unknown` never adds score — the signal degrades gracefully rather than false-flagging
everyone when Bot Management isn't enabled.

## 3. Backend layer — `lib/security/post-guard.ts` (`guardNewPost`)

Called from `POST /api/posts` and `POST /api/posts/[id]/replies` **before** the session user is
auto-created (so bots don't mint users). The old standalone pre-flight endpoint
`app/api/security/verify/route.ts` now always returns **410** without scoring or touching KV: nothing
called it, and anyone could hit it to burn KV REST writes (it also wrote raw session ids into KV).

### Step 1 — Turnstile verification (`lib/security/turnstile.ts`)

- POSTs to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with the secret,
  token, and `remoteip`.
- Wrapped in `AbortController` with a 3s timeout — if Cloudflare is slow/unreachable,
  we don't hang the request; we mark it `unreachable` and **fail open** (+10 score only).
  Don't let a Cloudflare outage block every user.
- When `TURNSTILE_SECRET_KEY` is set, a missing/invalid token is a hard **403**
  (`code: "turnstile_failed"`), not just +40 score.
- The widget `action` must be `"post"` (the client renders it with that action) whenever siteverify
  returns one, so a token minted by another widget on the same site key can't be replayed into a post.
  The hostname is checked only when the optional `TURNSTILE_ALLOWED_HOSTNAMES` (comma-separated) is set.

### Tor

`guardNewPost` (before Turnstile runs) and `PATCH /api/posts/[id]` reject Tor exits
(`cf-ipcountry: T1`) with a 403 (`torBlockedResponse`), and `/test/bbs.cgi` does the same. Everything written here
also appears on unj's boards, and unj rejects Tor, so reze must not be the way around it.

### Step 2 — Multi-signal scoring (`lib/security/scoring.ts`)

`computeFingerprintHash()` hashes the canonical signal set with FNV-1a (32-bit,
synchronous, no crypto API round-trip — this runs on every write request so it needs to
be cheap). Correlated against KV (`lib/kv`, Redis-compatible in production):

| Pattern | Detection | KV shape | Score |
|---|---|---|---|
| **A — IP Hopping** | Same fingerprint hash seen from ≥5 distinct IPs within a 10-minute window | `fp:{hash}:ips` → hash-map of `ip → lastSeenTimestamp`, pruned on read | +35 |
| **B — UA/TLS mismatch** | User-Agent claims a mainstream browser but (a) `x-ja4-fingerprint` doesn't match a known-browser prefix, or (b) the UA string itself matches a known bot/HTTP-client pattern (`curl`, `python-requests`, `puppeteer`, `playwright`, headless Chrome, etc.) | stateless, per-request | +40 (TLS mismatch) / +30 (bot UA, no TLS signal available) |
| **C — Incognito Recycling** | Same fingerprint hash seen under ≥4 distinct session IDs within a 30-minute window | `fp:{hash}:sessions` → hash-map of `sessionId → lastSeenTimestamp`, pruned on read | +20 |
| **Turnstile failure** | Token invalid/missing | — | +40 (or +10 if verification was merely unreachable) |

Scores are additive, capped at 100. `blocked = score >= 80`.

### Step 3 — Rate limiting & enforcement

A sliding 10-second window per fingerprint hash (`fp:{hash}:rate:{windowIndex}`, same
windowed-counter pattern; IP-based limiting is separate, see "Write rate limiting" below) —
more than 20 scored actions in 10s ⇒ `429`. `score >= 80` ⇒ `403`. Otherwise `200`
with the score/reasons returned for observability, even when allowed.

### Response contract

`scoreRequest()`'s verdict, shown as the removed verify endpoint used to return it. `guardNewPost`
maps `blocked` → 403 and `rateLimited` → 429 with its own `{ error, code }` body:

```jsonc
// 200
{ "allowed": true, "score": 0, "reasons": [] }
// 403 (blocked)
{ "allowed": false, "score": 85, "reasons": ["ua-tls-mismatch", "session-recycling:5-sessions"] }
// 429 (rate limited)
{ "allowed": false, "score": 35, "reasons": ["rate-limit:21/10s"] }
```

### Integration pattern

`guardNewPost(request, body, action)` returns `null` (continue) or a ready `NextResponse`
(403 Turnstile / 403 score >= 80 / 429). Fingerprints are validated for shape and size before use
(a malformed one is treated as absent); the session id is SHA-256-hashed before it reaches KV.
Scoring failures (KV down) fail open with a warning. To protect another write route, call it the
same way and make the client spread `collectPostGuard()` into the body.

**Not covered: `/test/bbs.cgi` (専ブラ).** 2ch browsers cannot run Turnstile or JS, so that path
stays on IP rate limiting (strict 5/10s bucket when the UA/TLS looks non-browser) plus:
- cross-site browser submissions are rejected (`Sec-Fetch-Site` cross-site/same-site, or an `Origin`
  host that differs from the request host). 2ch browsers send neither header, so they are unaffected;
  this stops another site's auto-submitting form from posting under the visitor's IP identity;
- Tor exits are rejected (above);
- a new identity (`bbscgi:<IPv4>` / `bbscgi:<IPv6 /64>`) is charged to the `signup` budget like
  `/api/auth/anonymous`; existing users keep their old key;
- the form body is read as a stream and capped at 64 KB.

**Text rules** (`app/api/_lib/unj-text-rules.ts`, ported from unj `content-schema.ts`): invisible,
bidi and control characters are stripped, at most 8 URLs per post, and unj's blacklists (dark web,
URL shorteners, other uploaders) apply. The URL count also includes reze-only link chunks that unj's
regex misses (e.g. fullwidth hosts, which reze still renders as links), and `#mml` lines are checked too.
New posts, replies, edits (`PATCH`, which only rejects URLs/images it adds) and bbs.cgi share them.

**Automation**: there is no API-key bypass. Posting from the real UI works (the UI fetches the
token). A raw `fetch()` to `/api/posts` from a page console carries no token and is rejected once
the secret is set — go through the UI or `api.posts.*`.

**KV cost**: scoring does roughly 4-6 KV REST writes per post (hash maps + rate key). With
`KV_PROVIDER=cloudflare` on the free tier (1,000 writes/day) that bounds scored posts to a
couple of hundred per day; the middleware write limiter no longer touches KV (see below), which
more than pays for it. If it becomes a problem, move the correlation maps to a Durable Object.

**KV circuit breaker** (`lib/kv/cloudflare.ts`): KV goes through the Cloudflare REST API, so once
the write quota or the API rate limit is exhausted every call returns 429. On a 429, a 5xx or a
network error the client stops calling for 120 s (per isolate) and throws immediately instead;
every caller (scoring, play dedupe, the rate-limit KV fallback) already fails open, so features
degrade quietly instead of adding a doomed round trip to each request.

## 4. Rate limiting — `lib/security/rate-limit.ts`

`middleware.ts` limits every write method on `/api/*` and `/test/bbs.cgi` per IP
(IPv6 normalised to /64 by `rateLimitKeyFromIp`, plus a second /48 tier by `rateLimitKey48FromIp`;
both tiers go through `checkTieredRateLimit`), and GET/HEAD on expensive read paths that are **not**
edge-cached (`/unj/dat/*`, `/api/search` (not `/trends`), `/api/hashtag/*`, `/api/users/*`,
`/api/posts/<id>` (not `/replies`), `/api/games/*` (not `/ranking`), `/api/media-search`,
`/api/music/search`, `/api/rpgen/*` except `/api/rpgen/data/*`, `/api/messages`, `/api/oshi`).
Edge-cached routes are charged inside `withEdgeCache` instead, and only for requests that reach
`produce()` (MISS, personalized, no Cache API) — hits are free, so ordinary browsing barely counts,
but varying an allow-listed param (`beforeId`, `limit=20<junk>`) to force misses is capped.
New anonymous users are budgeted in `getOrCreateSessionUserById` (`lib/auth/session-server.ts`). Buckets:

| Bucket | Binding (`wrangler.json` `ratelimits`) | Limit | No binding |
|---|---|---|---|
| `write` | `WRITE_LIMITER` (namespace 1001) | 30 / 10s per /64 | KV counter |
| `strict` (bot UA or non-browser TLS) | `WRITE_LIMITER_STRICT` (namespace 1002) | 5 / 10s per /64 | KV counter |
| `csp` (`/api/csp-report`) | `WRITE_LIMITER`, separate key | 30 / 10s per /64 (no /48 tier) | KV counter |
| `write48` (IPv6 writes except csp) | `WRITE_LIMITER_48` (namespace 1004) | 240 / 10s per /48 | skipped |
| `read` (expensive GETs above) | `READ_LIMITER` (namespace 1003) | 60 / 10s per /64 | skipped |
| `readBurst` (`/api/rpgen/{sprites,sprite-anims,sounds}/<id>`) | `READ_LIMITER_48`, separate key | 480 / 10s per /64 | skipped |
| `read48` (IPv6 reads) | `READ_LIMITER_48` (namespace 1008) | 480 / 10s per /48 | skipped |
| `miss` (edge-cache misses) | `READ_LIMITER`, separate key | 60 / 10s per /64 | skipped |
| `miss48` (IPv6 misses) | `READ_LIMITER_48`, separate key | 480 / 10s per /48 | skipped |
| `signup` (new users only) | `SIGNUP_LIMITER` (namespace 1005) | 20 / 60s per /64 | skipped |
| `signup48` (IPv6 new users) | `SIGNUP_LIMITER_48` (namespace 1007) | 60 / 60s per /48 | skipped |
| dedupe (`dedupeOnce`) | `DEDUPE_LIMITER` (namespace 1006) | 1 / 60s per key | old KV dedupe |

The Workers Rate Limiting binding is per-location and approximate, but it costs no KV operations
and answers in well under a millisecond. The old KV read-then-write counter (non-atomic, eventually
consistent, one KV write per request) is kept **only** as a fallback for `write`/`strict`/`csp` when
no binding exists (`next dev` / `next start`), and logs once when used. Every other bucket is
**never** counted in KV (a read limiter on KV would burn the write quota on every GET) — without
its binding it logs once and lets everything through. Every path fails open.

429 bodies: JSON for `/api/*`, bbs.cgi-style HTML for `/test/bbs.cgi` (2ch browsers read the post
result as HTML), and **no body** for other `/unj/*` GETs — a 2ch browser parses dat/subject.txt
as numbers and crashes on `<`. A limited dat poll that sent `If-Modified-Since` gets 304 instead
("no new posts"); the next poll after the window re-fetches from its own timestamp, so nothing is lost.

The rpgen detail lookups get `readBurst` because the asset browsers fetch every member name of an
opened sheet (100+ requests); under `read` the names went missing and the next search failed with 429.
The browsers now send them 6 at a time (`lib/async/for-each-limit.ts`) instead of one `Promise.all`.

`DEDUPE_LIMITER` replaces the KV `kvExists` + `kvSetEx` pair for play / clear / preset-open counts
(`isFirstWithinWindow`, keys `play:<kind>:<id>:<ip64>`, `clear:game:…`, `preset:…`), the post
votes/hearts in posts-write (`vote:<uid>:<postId>`, `heart:<uid>:<postId>`), and the session
`last_used_at` bump (`touch:<userId>`, at most once per 60 s per user and location); use a new key
prefix for a new use. Its window is fixed at 60 s; the old KV path (local dev) keeps its longer TTLs.

Session creation: `/api/auth/anonymous` is POST-only (same-origin `Sec-Fetch-Site`/`Origin` and a
JSON body; GET is 410) and never sets a cookie — `lib/session.ts` writes it client-side, preferring
localStorage when the two disagree. Unknown session ids create a user only if UUID-shaped and within
the `signup` (and, for IPv6, `signup48`) budget; writes without any session id get 401 instead of
minting an orphan user. A first visit sends 2–4 concurrent POSTs with the same new id (one per
`useCurrentUser` + the page itself), and each one is charged — exempting repeats of the same id would
let anyone skip the budget by sending an id twice — so `SIGNUP_LIMITER` is sized at 20 / 60s
(≈5–10 brand-new visitors per minute behind one IPv4). The client now shares one in-flight POST per
session id (`lib/api.ts` `sharedAnonymous`), so once that build is everywhere it can be lowered toward
5–10 / 60s.

## 5. Content-Security-Policy — `lib/security/csp.ts`

- **Enforced**: `frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`.
- **Report-Only**: the full policy (script/style/font/img/media/connect/worker/frame sources),
  built from an inventory of every external origin in the codebase and `@onjmin/dtm`
  (Turnstile, GA, the two pinned jsdelivr paths `npm/midi-player-js@2.0.16/` and
  `npm/soundfont-player@0.12.0/` — never the whole host, which serves any npm/GitHub file —,
  surikov.github.io WebAudioFont, onjmin.github.io koe TTS, YouTube /
  SoundCloud APIs, embed iframes...). `'unsafe-inline'` stays in `script-src` until nonces are wired
  (Next's inline RSC payload + GA init). `img/media/font/connect` allow any `https:` because
  posts, MV fonts and game assets reference arbitrary user URLs. `/api/rpgen/*` keeps its own
  `sandbox` CSP and gets neither header.
- Reports go to `/api/csp-report` (legacy `report-uri` and Reporting API `report-to`), which keeps
  nothing and logs one line per violation (at most 3 per request, control characters stripped so a
  crafted report cannot forge extra log lines):
  `[csp-violation] report directive=script-src-elem blocked=https://example.com page=/post/123 source=...`
  (blocked URL reduced to its origin, page to its path).

**Reading reports**: `npx wrangler tail unj-reze --format pretty | grep csp-violation`, or Workers
-> unj-reze -> Logs (observability is on) filtered by `csp-violation`. Group by
`directive` + `blocked`: browser extensions (`chrome-extension:` / `moz-extension:`) are noise; a real
origin we load means "add it to `csp.ts`".

**When to enforce**: after about 2 weeks of normal traffic (including playing games, MV/talk/otomad
playback with TTS, embeds, Turnstile, and the drawing tools) with no violations other than
extension noise, switch the Report-Only header to the enforced one in `applySecurityHeaders`
(keep `report-uri` so regressions still show up). Script/frame sources are the parts that matter;
if in doubt, enforce just `script-src` + `frame-src` first.

## Analytical matrix — which signal counters which evasion

| Evasion technique | Countered by | Why it works |
|---|---|---|
| **VPN / proxy / mobile-carrier IP rotation** | Fingerprint (canvas+WebGL+hardware) staying identical while IP changes (Pattern A) | Rotating IP doesn't change the GPU, CPU core count, screen, or canvas rendering pipeline — those are tied to the physical device/browser install, not the network path. |
| **Incognito / private-tab "identity reset"** | Fingerprint persistence across sessions (Pattern C) | Private browsing clears cookies/localStorage/`sessionId`, but does **not** change canvas rendering, WebGL renderer strings, or hardware — the device signal survives even though our own session cookie doesn't. |
| **Headless browser / automation frameworks (Puppeteer, Playwright, Selenium)** | UA string pattern match + (when available) JA4 mismatch (Pattern B) | Headless Chrome/automation UAs are directly detectable by string; more robustly, automation libraries built on raw HTTP clients (not a real browser TLS stack) produce a JA3/JA4 hash that doesn't match any real browser, even if the UA header is spoofed to say "Chrome/120". |
| **Simple UA spoofing without automation** (e.g. curl claiming to be Chrome) | JA4 mismatch (Pattern B) specifically defeats this — UA string alone is trivially spoofable and is treated as the *weaker* half of Pattern B | TLS ClientHello (cipher suites, extension order) is generated by the underlying TLS library, not application code — curl/Go/Python can set any `User-Agent` header they like but can't easily replicate Chrome/Firefox's exact handshake shape. |
| **Distributed low-and-slow abuse (many devices, few requests each)** | Not fully solved by any single signal here — this is the known limit of device fingerprinting | Rate limiting operates per-fingerprint; a genuinely large botnet of distinct real devices making few requests each will each look "clean" individually. Turnstile's own risk scoring (not covered by our code, but part of what `siteverify` evaluates) is Cloudflare's mitigation layer for this case. |
| **Cloudflare Turnstile solved by a human click-farm / CAPTCHA-solving service** | Not solved by Turnstile alone — combine with the fingerprint/TLS layers | A solved Turnstile token proves *a* browser executed the challenge, not that the same entity isn't automating everything else; that's exactly why Turnstile is one of three layers, not the sole gate. |

## Known limitations (stated explicitly, not glossed over)

- **A real JA4 requires Cloudflare Bot Management.** Running on Workers gives us
  `request.cf`, but `botManagement.ja4` is populated only with Bot Management enabled.
  Without it Pattern B is limited to `tlsVersion` (which catches legacy-TLS clients
  claiming to be modern browsers) plus UA-string heuristics — weaker than a real
  fingerprint mismatch, since a bot using a current TLS stack looks the same as a browser.
- **`deviceMemory` and WebGL debug info are increasingly restricted** by Chrome's privacy
  budget and Firefox's fingerprinting protections; over time these fields will trend
  toward `null` for a growing share of real users, which is handled (treated as "no
  signal", not "mismatch") but does reduce Pattern A/C's fingerprint stability.
- **Distributed abuse across genuinely distinct devices is out of scope** for
  fingerprint-based correlation by definition — see the matrix row above.
- **KV state is currently unbounded** aside from timestamp-based pruning on read; a
  determined attacker generating many distinct fingerprint hashes could grow the KV
  store. For production scale, add a scheduled sweep or TTL-based storage (e.g. Redis
  `EXPIRE` on the hash keys themselves, not just per-field pruning) rather than relying
  solely on read-time pruning.
