# unj-reze

## About this document

- Repository-wide instructions only; keep it concise (target: under 150 lines).
- Store detailed, checked-in documentation under `docs/`. Link to it instead of duplicating it.
- `.agents/` and `.claude/` are **gitignored** (local-only) — never assume CI has those files.

---

# Project Overview

RPGEN (`unj-reze`) is an anonymous, login-less SNS with heavy creation tooling attached:

- **Social / Community**: feed, posts, replies, likes, hashtags, DMs, notifications, blocks/mutes,
  reports, ranking, and a 2ch-style BBS view (`BbsBoardView.tsx` / `BbsThreadView.tsx`).
  Identity is session/fingerprint based — there are no accounts.
- **Creation tools** attached to the composer: game editor (`GameMaker.tsx`), drawing editors
  (`DrawingEditor.tsx` / `DotDrawingEditor.tsx`, `@onjmin/oekaki`), MML music editor/player
  (`MmlEditor.tsx`, `@onjmin/dtm`).
- **Asset & Game Sharing**: games/sprites/music embedded into posts and played inline
  (`GameBox.tsx` → `GamePreview.tsx` → `GameMaker.tsx`).

The whole app is a client-side SPA driven from `app/page.tsx`, talking to route handlers
under `app/api/`.

## Game engines

`components/GameMaker.tsx` is the single live engine host (~19k lines), covering **two** runtimes
selected by `gameData.engine` (`EngineKind` in `components/game-presets/shared.ts`:
`'action' | 'rpg' | 'touhou' | 'onjReze' | 'yume25d'`) — canvas 2D inline in `GameMaker.tsx` for
every non-`yume25d` kind, and first-person 2.5D via three.js for `yume25d`
(`components/Yume25DMaker.tsx`, `lib/yume25d.ts`). Presets live in `components/game-presets/`;
`components/MiniScriptVM.ts` is the small DSL VM used by bullet-hell/spell scripting.

---

# System Architecture & Backends

Every backend is **pluggable via env var, defaulting to a mock**, so the app runs with zero
external services. Do not hard-code a provider.

| Concern | Env var | Values (default first) | Code |
|---|---|---|---|
| Database | `DATABASE_PROVIDER` | `mock` / `neon` (Postgres, **production**) / `d1` (SQLite file) | `lib/db.ts`, `lib/db/{mock,pg,sqlite}.ts` |
| KV | `KV_PROVIDER` | `mock` (in-memory Map) / `cloudflare` (KV REST API) | `lib/kv/` |
| Object storage | `STORAGE_PROVIDER` | `local` / `r2` (Cloudflare R2) | `lib/storage/` |

- All stores implement `DataStore` (`lib/db/interface.ts`); adding a query means editing **all
  three** of `mock.ts`, `pg.ts`, `sqlite.ts`. `lib/db.ts` wraps the store in a Proxy that
  **auto-falls back to `mockStore`** on connection errors, so a "working" local run may silently
  be on mock data.
- `lib/storage/s3.ts` is the **local filesystem** provider (`./public/uploads`) despite its name; only `lib/storage/r2.ts` uses `@aws-sdk/client-s3`.
- Schema lives in `data/schema.sql`, which is **gitignored** — not in the repo. Migrations are
  applied manually (see `README.md`).

## Deployment targets

- **Cloudflare Workers** — production, `@opennextjs/cloudflare` + `wrangler.json`, served at
  `https://unj-reze.onjmin.workers.dev` with `neon` / `cloudflare` / `r2` providers. KV and R2 are
  reached over REST / the S3 API with account credentials, **not** Worker bindings — hence no
  `kv_namespaces` or `r2_buckets` in `wrangler.json`.
- **GitHub Pages** static demo (`.github/workflows/gh-pages.yml`) — `NEXT_PUBLIC_STATIC_EXPORT=true`
  (or `GITHUB_ACTIONS=true`) flips `next.config.ts` to `output: 'export'` (`basePath: /unj-reze`);
  no API routes or middleware run in this mode, so everything must be static-safe.
- **Netlify** (`netlify.toml`) is a legacy/alternate server-mode config, no longer primary.

## Security & Anti-Abuse

Stateless, login-less abuse scoring: `lib/security/{scoring,tls,turnstile}.ts`,
`lib/fingerprint.ts`, `lib/geo.ts`. Full rationale: [docs/ANTI_ABUSE.md](docs/ANTI_ABUSE.md).

- **TLS signals flow one way: `request.cf` → `middleware.ts` → headers → route handlers.** The
  Worker terminates TLS, so middleware reads `request.cf` itself; no upstream proxy is involved.
  Route handlers must use `readTlsSignalsFromHeaders()` and never trust `x-ja4-fingerprint` &co.
  directly — middleware **overwrites or deletes** those headers precisely because a client can
  forge them. Never change that to a merge.
- A real JA4 needs Cloudflare Bot Management; without it only `tlsVersion`/`tlsCipher` arrive and
  `assessTls()` returns a low-confidence verdict. `unknown` never adds score (fail-open).
  Middleware also tightens the write rate limit (30 → 5 per 10s) for non-browser TLS.
- The **fingerprint** half is still staged but unwired: no caller sends `fingerprint`, so
  `app/api/posts` skips scoring (`if (fingerprint)`) and nothing calls `app/api/security/verify`.
  Wiring `collectFingerprint()` + `useTurnstile()` into the composer activates it.
- Geo comes from `cf-ipcountry` with `x-vercel-ip-country` / other fallbacks (`lib/geo.ts`).

---

# Engine Invariants

## Event Execution Loop & Context Shift (`GameMaker.tsx`)

- **Single-Threaded State Machine**
  - `runEventCommands` manages event execution with `eventRunningRef` guarding re-entrancy.
  - Never call `runEventCommands` recursively while an event is running unless passing an explicit `onDone` callback (e.g. choice subroutines).
- **Phase Jump (`changePhase` / `#CH_PH`)**
  - `#CH_PH` is an **execution context jump**, not a subroutine call or passive condition flag update.
  - Transfer active execution context (`curObjId = targetId`), replace command buffer (`cmds = targetPage.commands`), and reset command step (`index = 0; setTimeout(runNext, 0)`).
  - Never spawn concurrent execution or nested `runEventCommands` calls for cross-event jumps — the `eventRunningRef` guard would swallow them silently.
- **Implicit Self References**
  - Commands omitting an explicit target (`setSelfSwitch`, `removeEvent`, `changeDirection`, `changeNpcMovement`, self `playEffect`, etc.) MUST target the active execution context (`curObjId`).
- **Movement & Touch Cooldowns**
  - `lastTouchTimeMapRef` is keyed by **both** object id and cell coordinate (`` `${col},${row}` ``); touch checks read the max of the two.
  - Instant movement (`moveNpc` with duration 0, `warp`) must register cooldown timestamps on arrival (`performance.now()`) to prevent rapid-fire event re-triggering.
  - A phase jump must *clear* the corresponding cooldown entries so the new page can fire.

## RPGEN Map & Tile Import (`lib/rpgen-parser.ts` + `submitRpgenImport` in `GameMaker.tsx`)

- **Terrain Layer Overwriting**
  - Imported maps must completely overwrite all terrain layers (`map`, `overlayMap`, `overheadMap`).
  - Missing upper layers must be explicitly generated as matching blank (`0`) grids (`createBlankGrid`) to wipe out previous scene/preset terrain.
- **Tile & Command ID Remapping**
  - When merging into an existing scene, assign non-conflicting tile IDs and keep a `tileIdRemap` (with `0 → 0`).
  - Recursively remap `#CH_SP` / `changeTile` tile IDs inside nested commands (`choice`, and the `then`/`else` branches of `ifSwitch` / `ifItem` / `ifGold`).
- **RPGEN Search access has two paths**
  - Client/parse-time (`lib/rpgen-parser.ts`): `NEXT_PUBLIC_RPGEN_SEARCH_TOKEN`, falling back to the public token `n4CrMK7W`.
  - Server proxy `app/api/rpgen/[...path]/route.ts`: uses `RPGEN_SEARCH_TOKEN`, with an endpoint allowlist. Route media through it — upstream `/data/*` sends no CORS headers, and direct loads would taint the game canvas and break export.

---

# Debugging Protocol

Before modifying the event engine, DB schemas, or API endpoints:

- Perform mental execution simulation across state machine transitions.
- Trace key runtime references:
  - `eventRunningRef` (re-entrancy mutex)
  - `curObjId` (active event execution context)
  - `cmds` and `index` (active instruction stream)
  - `forcedPagesRef` (multi-key phase overrides by `id`, `col,row`, and `objId`)
  - `lastTouchTimeMapRef` (object-id + cell-coordinate touch cooldowns)
- When touching `DataStore`, update `mock.ts` / `pg.ts` / `sqlite.ts` together.

Verify that no execution-context leaks, state desynchronizations, or deadlocks are introduced,
then run `pnpm typecheck` and `pnpm lint`.

> `eslint.config.mjs` disables the React Compiler-backed `react-hooks/*` rules **for
> `components/GameMaker.tsx` only** — the compiler OOMs on a 19k-line component even at an 8 GB
> heap. Removing that override makes `pnpm lint` crash instead of fail. `exhaustive-deps` is not
> compiler-backed and stays enabled everywhere.

---

# Documentation

- [docs/ANTI_ABUSE.md](docs/ANTI_ABUSE.md) — abuse-scoring design and threat model.
- [docs/dsl-current-state.md](docs/dsl-current-state.md) — asset-reference / DSL layering.
- [docs/game-feature-design.md](docs/game-feature-design.md) — game↔post binding (`games` table).
- [README.md](README.md) — deploy and local-setup instructions.
- `.agents/skills/rpgen-search.md` — rpgen-search API and auth (local-only, gitignored).
