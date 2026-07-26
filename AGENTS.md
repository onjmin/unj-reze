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

This repository contains both the web platform and the game engine.

---

# Engine Invariants

## Event Execution Loop & Context Shift (`GameMaker.tsx`)

- **Single-Threaded State Machine**
  - `runEventCommands` manages event execution with `eventRunningRef` guarding re-entrancy.
  - Never call `runEventCommands` recursively while an event is running unless using an `onDone` callback.

- **Phase Jump (`changePhase` / `#CH_PH`)**
  - `#CH_PH` is an execution context jump, not a subroutine call.
  - Replace the execution context (`curObjId`), command buffer (`cmds`), and reset the command index.
  - Never spawn concurrent execution for cross-event jumps.

- **Implicit Self References**
  - Commands without an explicit target (`setSelfSwitch`, `removeEvent`, `changeDirection`, `changeNpcMovement`, self `playEffect`, etc.) must use the active execution context (`curObjId`).

## RPGEN Map Import

- Imported maps must completely overwrite all terrain layers.
- Missing upper layers must be replaced with blank (`0`) grids.
- Recursively remap `#CH_SP` tile IDs inside nested commands to `draft.tiles`.

---

# Debugging

Before modifying the event engine:

- Trace `eventRunningRef`
- Trace `curObjId`
- Trace `cmds`
- Trace `index`
- Trace `forcedPagesRef`

Verify that no execution-context leaks or deadlocks are introduced.

---

# Skills

## External APIs

- `.agents/skills/rpgen-search.md`