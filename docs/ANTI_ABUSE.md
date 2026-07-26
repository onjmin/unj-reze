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

### Turnstile (invisible mode) — `lib/hooks/useTurnstile.ts`

```tsx
'use client';
import { useTurnstile } from '@/lib/hooks/useTurnstile';
import { collectFingerprint } from '@/lib/fingerprint';

function PostComposer() {
  const { containerRef, getToken } = useTurnstile();

  const handleSubmit = async () => {
    // Always re-executes the widget right before the action, so the token
    // returned here is guaranteed fresh (Turnstile tokens expire ~5 min,
    // and can also expire mid-session — data-expired-callback resets the
    // widget proactively so a stale token is never reused).
    const turnstileToken = await getToken();
    const fingerprint = collectFingerprint();

    await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, content, turnstileToken, fingerprint }),
    });
  };

  return (
    <>
      {/* invisible widget container — renders nothing visible */}
      <div ref={containerRef} />
      <button onClick={handleSubmit}>投稿</button>
    </>
  );
}
```

Env vars (`.env`):
```
TURNSTILE_SECRET_KEY=...        # server-only, never exposed to the client
NEXT_PUBLIC_TURNSTILE_SITE_KEY=... # public, embedded in the widget
```
If `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset, the widget never renders and `getToken()`
resolves `null` — this keeps local dev working without Cloudflare credentials. The
server mirrors this: if `TURNSTILE_SECRET_KEY` is unset, verification is skipped
(`turnstileOk = true`) rather than hard-failing every request.

### Browser fingerprinting — `lib/fingerprint.ts`

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

## 3. Backend layer — `app/api/security/verify/route.ts`

### Step 1 — Turnstile verification (`lib/security/turnstile.ts`)

- POSTs to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with the secret,
  token, and `remoteip`.
- Wrapped in `AbortController` with an 8s timeout — if Cloudflare is slow/unreachable,
  we don't hang the request; we mark it `unreachable` and **fail soft** (+10 score)
  rather than fail closed (+40 for an actual verification failure). This is the explicit
  latency/availability tradeoff requested: don't let a Cloudflare outage block every user.

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
windowed-counter pattern already used for IP-based rate limiting in `proxy.ts`) —
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

`app/api/posts/route.ts` demonstrates the reference wiring: if the request body includes
a `fingerprint`, the route runs Turnstile + scoring inline before creating the post; if
`fingerprint` is absent (older/unmigrated clients), it's skipped entirely. This
backward-compatible, opt-in-per-field design lets you roll the check out to other write
routes (`/api/posts/[id]/replies`, `/api/follow`, `/api/messages`, etc.) one at a time by
copying the same block, without a flag day that breaks every client at once. A shared
`app/api/security/verify/route.ts` endpoint is also provided standalone, for routes/flows
where you'd rather call it as a separate pre-flight check instead of inlining.

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
