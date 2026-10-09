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
1. Turnstile (invisible)         Runs on the Worker that             /api/security/verify
   renders, executes right       terminated TLS, so it reads         or inline in a write
   before a critical action  ──▶ request.cf directly and       ──▶  route (see posts/route.ts):
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
auto-created (so bots don't mint users). `app/api/security/verify/route.ts` remains as a standalone
pre-flight endpoint but nothing calls it.

### Step 1 — Turnstile verification (`lib/security/turnstile.ts`)

- POSTs to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with the secret,
  token, and `remoteip`.
- Wrapped in `AbortController` with a 3s timeout — if Cloudflare is slow/unreachable,
  we don't hang the request; we mark it `unreachable` and **fail open** (+10 score only).
  Don't let a Cloudflare outage block every user.
- When `TURNSTILE_SECRET_KEY` is set, a missing/invalid token is a hard **403**
  (`code: "turnstile_failed"`), not just +40 score.

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
stays on IP rate limiting only (strict 5/10s bucket when the UA/TLS looks non-browser).

**Automation**: there is no API-key bypass. Posting from the real UI works (the UI fetches the
token). A raw `fetch()` to `/api/posts` from a page console carries no token and is rejected once
the secret is set — go through the UI or `api.posts.*`.

**KV cost**: scoring does roughly 4-6 KV REST writes per post (hash maps + rate key). With
`KV_PROVIDER=cloudflare` on the free tier (1,000 writes/day) that bounds scored posts to a
couple of hundred per day; the middleware write limiter no longer touches KV (see below), which
more than pays for it. If it becomes a problem, move the correlation maps to a Durable Object.

## 4. Write rate limiting — `lib/security/rate-limit.ts`

`middleware.ts` limits every write method on `/api/*` and `/test/bbs.cgi` per IP
(IPv6 normalised to /64 by `rateLimitKeyFromIp`). Buckets:

| Bucket | Binding (`wrangler.json` `ratelimits`) | Limit |
|---|---|---|
| `write` | `WRITE_LIMITER` (namespace 1001) | 30 / 10s |
| `strict` (bot UA or non-browser TLS) | `WRITE_LIMITER_STRICT` (namespace 1002) | 5 / 10s |
| `csp` (`/api/csp-report`) | `WRITE_LIMITER`, separate key | 30 / 10s |

The Workers Rate Limiting binding is per-location and approximate, but it costs no KV operations
and answers in well under a millisecond. The old KV read-then-write counter (non-atomic, eventually
consistent, one KV write per request) is kept **only** as a fallback when no binding exists
(`next dev` / `next start`), and logs once when used. Every path fails open.

## 5. Content-Security-Policy — `lib/security/csp.ts`

- **Enforced**: `frame-ancestors 'self'; object-src 'none'; base-uri 'self'`.
- **Report-Only**: the full policy (script/style/font/img/media/connect/worker/frame sources),
  built from an inventory of every external origin in the codebase and `@onjmin/dtm`
  (Turnstile, GA, jsdelivr, surikov.github.io WebAudioFont, onjmin.github.io koe TTS, YouTube /
  SoundCloud APIs, embed iframes...). `'unsafe-inline'` stays in `script-src` until nonces are wired
  (Next's inline RSC payload + GA init). `img/media/font/connect` allow any `https:` because
  posts, MV fonts and game assets reference arbitrary user URLs. `/api/rpgen/*` keeps its own
  `sandbox` CSP and gets neither header.
- Reports go to `/api/csp-report` (legacy `report-uri` and Reporting API `report-to`), which keeps
  nothing and logs one line per violation:
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
