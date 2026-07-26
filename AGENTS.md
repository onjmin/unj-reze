# RPGEN

## About this document

- This file contains repository-wide instructions only.
- Keep this file concise (target: under 150 lines).
- Store detailed documentation under `.agents/`.
- Link to specialized documents instead of duplicating their contents.

---

# Project Overview

RPGEN is an integrated platform combining:

- Social networking
- Game creation
- Asset sharing
- Community features

This repository contains both the web platform and the game engine (`components/GameMaker.tsx` and `lib/rpgen-parser.ts`).

---

# Engine Invariants

## Event Execution Loop & Context Shift (`GameMaker.tsx`)

- **Single-Threaded State Machine**
  - `runEventCommands` manages event execution with `eventRunningRef` guarding re-entrancy.
  - Never call `runEventCommands` recursively while an event is running unless passing an explicit `onDone` callback (e.g. choice subroutines).

- **Phase Jump (`changePhase` / `#CH_PH`)**
  - `#CH_PH` is an **execution context jump**, not a subroutine call or passive condition flag update.
  - Transfer active execution context (`curObjId = targetId`), replace command buffer (`cmds = targetPage.commands`), and reset command step (`index = 0; setTimeout(runNext, 0)`).
  - Never spawn concurrent execution or nested `runEventCommands` calls for cross-event jumps.

- **Implicit Self References**
  - Commands omitting an explicit target (`setSelfSwitch`, `removeEvent`, `changeDirection`, `changeNpcMovement`, self `playEffect`, etc.) MUST target the active execution context (`curObjId`).

- **Movement & Touch Cooldowns**
  - Instant movement (`moveNpc` with duration 0, `warp`) must register cell-coordinate cooldown timestamps (`lastTouchTimeMapRef.set(`${col},${row}`, performance.now())`) to prevent rapid-fire event re-triggering upon arrival.

## RPGEN Map & Tile Import (`lib/rpgen-parser.ts` & `submitRpgenImport`)

- **Terrain Layer Overwriting**
  - Imported maps must completely overwrite all terrain layers (`map`, `overlayMap`, `overheadMap`).
  - Missing upper layers (`overlayMap` or `overheadMap`) must be explicitly generated as matching blank (`0`) 2D grids to wipe out previous scene/preset terrain.

- **Tile & Command ID Remapping**
  - Assign non-conflicting tile IDs in `draft.tiles`.
  - Recursively remap `#CH_SP` / `changeTile` tile IDs inside nested commands (`choice`, `ifSwitch`, `ifItem`, `ifGold`) to match `draft.tiles`.

- **API Token Authentication**
  - Sprite hash resolutions against `rpgen-search.pages.dev` require authentication header/token fallback (`n4CrMK7W`) when `NEXT_PUBLIC_RPGEN_SEARCH_TOKEN` is unset.

---

# Debugging Protocol

Before modifying the event engine or parser:

- Perform mental execution simulation across state machine transitions.
- Trace key runtime references:
  - `eventRunningRef` (re-entrancy mutex)
  - `curObjId` (active event execution context)
  - `cmds` and `index` (active instruction stream)
  - `forcedPagesRef` (multi-key phase overrides by `id`, `col,row`, and `objId`)
  - `lastTouchTimeMapRef` (cell-coordinate touch cooldowns)

Verify that no execution-context leaks, state desynchronizations, or deadlocks are introduced.

---

# Skills

## External APIs

- `.agents/skills/rpgen-search.md`