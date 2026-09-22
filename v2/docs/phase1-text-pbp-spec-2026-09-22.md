# Phase 1 text play-by-play / drive-log — design SPEC

**Wave 4.1 Claude lane B · 2026-09-22 · docs only**

Product target: **ROADMAP Phase 1** (“make the engine visible”) — text
play-by-play and a drive log generated from events `game.ts` already
produces, with **zero outcome changes** (gate metrics byte-identical).

Orchestration memory historically called this “Phase 5 text PBP.” That
label is wrong for implementation. **Phase 5 is LLM narration**
(scouting prose, season recaps, pressers) — a separate later track.
This spec only sketches Phase 5 as non-goals / future hooks so the two
are not confused.

**Status of the product target (as of `main` after Wave 4.1 Packets
1–4):** the Phase 1 core is **already shipped** (Lane A / #53, live
resume / #81, liveGame tidy / #83). This document inventories what
exists, locks the contract, lists remaining gaps for a later implement
wave, and defines Matt-signable acceptance checks. It does **not**
authorize engine or UI work in this PR.

---

## 1. Inventory — what exists today

### 1.1 Engine event stream — `lib/core/sim/game.ts`

The play loop keeps a local `playLog: PlayEvent[]` and an internal
`emit()` that stamps `q` / `clock` / `homeScore` / `awayScore`, pushes
the log, and calls `emitPlay` (`events.ts`). Emits happen **after**
outcomes the engine already computed — observation only.

| When | `kind` / `result` (typical) | Notes |
|---|---|---|
| Game open / halftime restart | `kickoff` / `touchback` | Implied TB — no live opening kick animation |
| Kickoff TB / return / KR TD | `kickoff` | |
| XP / two-point | `xp` / `two` | Stay on the scoring drive in `buildDrives` |
| FG make / miss | `fg` | |
| Punt TB / return / PR TD / downed | `punt` | |
| Kneel / TO on downs after kneels | `kneel` / `downs` | |
| Pre-snap penalties | `penalty` / `accepted` | Yardage only; no foul type string |
| Scrimmage | `run` \| `pass` \| `sack` | Results include gain/loss/complete/incomplete/td/int/fumble |
| Safety | `safety` | |
| Turnover on downs | `downs` | |

`SimResult = { homeScore, awayScore, box, plays }` always returns the
full in-memory `playLog`. Box attach policy (`game.ts` ~1946–1961):

- `box.drives = buildDrives(playLog)` — **every** game on this build
- `box.plays` — **only if** the user club is in the game (save-size)
- CPU games: `plays` returned in memory, **not** persisted on the box

Bulk path: `simulateGame` drains `openGameSim` in one sync `.next()` —
no yield. Live path: `SimOpts.live` yields `{ info, plays: playLog }`
at user-club offensive snaps.

### 1.2 Capture / drive builder — `lib/core/sim/events.ts`

| Export | Role |
|---|---|
| `emitPlay` / `onPlayEvent` | Module pub/sub. Comment: observation only; **no RNG**. After #83, **nothing subscribes**; live views read the yielded `playLog`. |
| `isOffensiveSnap` | `run` \| `pass` \| `sack` \| `kneel` |
| `lastCalledSnap` | Nth user-offense run/pass/sack (powers “Last snap”) |
| `buildDrives(plays)` | Pure grouping → `DriveSummary[]` |

Drive rules: kickoff (non–return-TD) closes prior drive and opens next;
PAT / two-point stay on the scoring drive; opening touchback is how the
engine starts (“no live opening kick”).

### 1.3 Types — `lib/core/types.ts` (~563–701)

```
PlayKind   = kickoff | punt | fg | xp | two | run | pass | sack | kneel | penalty | safety | downs
PlayResult = touchback | return | td | good | miss | fail | gain | loss | complete | incomplete
             | sack | int | fumble | accepted | safety | downs
PlayEvent  = { q, clock, down, toGo, yardLine, offenseId, kind, result, yards,
               playerId?, targetId?, homeScore, awayScore }
DriveResult = touchdown | field_goal | missed_fg | punt | turnover | downs | safety
              | end_half | end_game | return_td
DriveSummary = { n, offenseId, q, clock, startYl, endYl, plays, yards, result, from, to }
BoxScore     += plays?: PlayEvent[]; drives?: DriveSummary[]
```

`PlayEvent` comment: **display only — never feeds the engine.**
Separate `ScoringPlay { q, clock, teamId, desc, homeScore, awayScore }`
is the scoring-summary prose list (not the snap log).

### 1.4 Live session — `lib/core/liveGame.ts`

- Kickoff state deep-cloned once; inactives declared once on the clone.
- `peek()` returns cached `LiveView` — **no re-sim on re-render**.
- `call` / `finishAuto` resume the paused generator — **no kickoff
  re-sim** (#81). Views built from yielded `playLog` (#83).
- `LiveView`: mid-game `{ done:false, info, calls, plays, lastSnap, drives }`
  or finished `{ done:true, result, ... }`.

### 1.5 Presentation — `lib/view/playByPlay.ts`

Deterministic templates: `clockLabel`, `quarterLabel`, `spotLabel`,
`downDistance`, `formatPlay`, `driveResultLabel` / `Tone`, `driveBar`,
`drivePlays`. No LLM. No RNG.

### 1.6 Player-facing surfaces

| Surface | File | What the player sees |
|---|---|---|
| Play-the-Game | `app/play/page.tsx` | Down/distance/score, **Last snap**, Run/Pass/Coach, **Drive Log**, **Play by Play** (live log; highlights last called snap). Commit → call sheet + Play Week. |
| Box score | `app/game/[id]/page.tsx` | Scoring Summary (`scoringPlays`), **Drive Chart** if `drives`/`plays` present, **Play by Play** only if `box.plays` (user games). Grouped by drive via `drivePlays`. |
| Links | `/week`, `/schedule` | → `/game/${id}` |

CPU completed games: Drive Chart yes, text snap log **no** (by design,
save size).

### 1.7 Persistence — `lib/store/codec.ts`

`plays` / `drives` pass through encode/decode unchanged. Old boxes
without those fields still load (tested).

### 1.8 Gate harnesses

| Gate name | Path | Contract |
|---|---|---|
| `playbyplay` | `lib/view/playByPlay.test.ts` | Same-seed scores/yards/`deepEqual` play logs; user `box.plays` present; CPU `plays === undefined` + drives present; peek identity; live finish vs call-sheet; codec round-trip |
| `livegame` | `lib/core/liveGame.test.ts` | Opening play object-identity across `call` (no re-sim); hand-call / `finishAuto` `deepEqual` box **and** plays vs `simulateGame` |

Both registered in `scripts/gate.ts` FAST + FULL. `scripts/determinism.ts`
has no PBP-specific checks — the two unit harnesses own the contract.

Browser smoke already covers the happy path:

- `scripts/e2e-desks.mjs` — `/play` Run/Pass → Last snap + Play by Play
  or Drive Log
- `scripts/e2e.mjs` — box score Drive Chart; notes CPU games without
  snap log

### 1.9 Docs that are stale vs reality

`ROADMAP.md` “What is missing” (~76–79) still claims no PBP and that
`liveGame.ts` re-runs on every peek. That paragraph is **stale** after
#53 / #81 / #83. Phase 1 finish-order text (~144–149) is the product
target and is largely met. Phase 5 (~177–181) remains LLM narration.

---

## 2. Player-facing contract (Phase 1 product)

What Matt can point at and say “this is Phase 1 done”:

1. **Drive chart / drive log** — every completed game on this build
   shows possessions with start spot, play count, yards, result pill,
   and a field bar. Live `/play` shows the same as a Drive Log while
   the game is in progress.
2. **Text play-by-play** — user games (live + persisted box) show a
   snap-by-snap log rendered by `formatPlay` from `PlayEvent`s. CPU
   boxes may omit the snap log.
3. **Call results without re-sim on peek** — `/play` shows the result
   of the snap just called (Last snap). Re-renders and peek must not
   re-run the game from kickoff. Continue / coach-finish resume the
   generator.
4. **Zero outcome changes** — emit hooks and view code must not move
   scores, yards, or parent RNG. Gate calibrate / statcheck metrics
   stay byte-identical to the pre-change tip when an implement packet
   claims “observation only.”

Out of the Phase 1 bar (intentional leftovers, not blockers for
calling Phase 1 “visible”):

- Madden formation tree / play art / timeout / defensive-call buttons
- Persisting live `/play` mid-game across refresh (session is in-memory)
- Live opening kickoff animation (engine still opens on implied TB)
- Full snap log on every CPU box (save-size tradeoff)

---

## 3. Event schema the UI consumes — reuse + gaps

### 3.1 Reuse (do not invent a parallel log)

UI must keep consuming `PlayEvent` / `DriveSummary` / `ScoringPlay` as
defined today. Implement packets may **add optional fields** to
`PlayEvent` (additive, old saves default) but must not rename or
retype existing fields (`ORCHESTRATION.md` types rule).

`formatPlay` is the single prose surface for snaps. Scoring Summary
stays on `scoringPlays.desc` (engine prose). Do not merge the two
streams into one type.

### 3.2 Gaps (candidates for a later implement wave)

| Gap | Where it shows up | Suggested fix shape |
|---|---|---|
| Defensive return TDs richer in `scoringPlays` than in `PlayEvent` | Snap still emits as `int`/`fumble` with scored path; no distinct “return TD” play kind | Optional result/flag, or accept scoring-summary as the rich line — **no new RNG** |
| Penalty events lack foul type | `formatPlay` → “Penalty — N yards” | Optional `desc?` / `penaltyCode?` stamped from existing outcome strings |
| `onPlayEvent` unused after #83 | `events.ts` still exports pub/sub | Leave dead API, delete in a tidy packet, or document as reserved for tooling |
| CPU no snap log | `/game/[id]` Drive Chart only | Keep default; optional “keep snap log for rivalry CPU games” would be a **save-size** lead decision |
| Opening implied kickoff | First PBP row is always TB | Engine change if ever “live KO” — out of Phase 1 polish unless Matt asks |
| Stale ROADMAP “invisible” blurb | Docs | Docs-only packet (or fold into HANDOFF hygiene) |
| Drive Chart not interactive | Click drive → jump to PBP section | Pure UI; no engine |
| `/play` refresh loses session | Noted leftover | Persist mid-game live state = save schema + design; not Phase 1 |

---

## 4. Determinism / gate invariants

Hard rules for any later implement packet:

1. **No new parent-stream RNG** in `sim/game.ts` emit sites, `events.ts`,
   `liveGame.ts`, or `lib/view/playByPlay.ts`. Observation / formatting
   only. `npm run determinism` stays clean.
2. **If** a packet needs randomness for presentation (e.g. optional
   flavor synonyms — **not recommended**; Phase 5 owns prose), it must
   use a **child stream** keyed from the save RNG and must prove
   calibrate / statcheck `##M` lines are unchanged vs tip.
3. **Byte-identical outcomes:** same-seed `simulateGame` scores, team
   yards, and `deepEqual(playLog)` vs tip before UI-only changes; for
   emit-hook packets, also `calibrate` + `statcheck` metric dump diff
   empty (pattern from #81 / #83 HANDOFF notes).
4. **Peek / resume:** `peek()` identity; `call` must not rewrite the
   opening play object; `finishAuto` box+plays match `simulateGame`
   after the same inactives declare (`livegame` harness).
5. **Codec:** old boxes without `plays`/`drives` still decode; new
   optional fields default safe.
6. **Do not edit `docs/baselines.json`.** Phase 1 presentation is not
   a lock-moving event.

Invariant reminders from `AGENTS.md` that still apply: seeded RNG only;
box score IS the score; no runtime LLM in a decision loop.

---

## 5. Non-goals

### 5.1 Out of scope for Phase 1 implementation

- LLM / generative narration of snaps, drives, or seasons
- Putting any model in the play-call or CPU decision loop
- Formation tree, play art, audible UI, timeout / defensive call pads
- Changing scramble / coverage / tackle math to “look better on PBP”
- Requiring snap logs on all 256 weekly CPU boxes (quota)
- Editing baselines or retuning calibrate knobs “because PBP showed X”

### 5.2 Phase 5 narration — separate later track (sketch only)

ROADMAP Phase 5 is the **approved** LLM use: scouting-report prose,
season recaps, press conference after a loss. Thin optional proxy; keys
off client; offline play survives; **never in a decision loop**.

Future hooks (do not implement here):

- Optional post-game “presser” card on `/game/[id]` that reads
  **already-rendered** `DriveSummary` + scoring leaders — never
  re-sims, never draws play outcomes
- Scouting / season-recap copy that cites box stats the player already
  sees
- Explicit feature flag / offline no-op so gate and determinism stay
  independent of network

Phase 5 must **not** replace `formatPlay` for the live snap loop. Text
PBP stays deterministic templates.

---

## 6. Suggested packet split (later implement wave)

Small PRs, one cluster each. Order is preference, not a calendar.

| Packet | Title | Owns | Does not touch | Gate bar |
|---|---|---|---|---|
| **P0** | Docs hygiene | `ROADMAP.md` “What is missing” refresh; cross-link this spec from ORCHESTRATION Lane A | Engine / UI | Docs only |
| **P1** | Drive Chart ↔ PBP UX | `app/game/[id]/page.tsx`, maybe `lib/view/playByPlay.ts` helpers | `sim/game.ts`, RNG | `playbyplay` + browser: click drive scrolls/highlights snaps |
| **P2** | Schema polish (optional fields) | Additive `PlayEvent` fields + `formatPlay` + emit stamps from **existing** outcome strings | Play math, baselines | `playbyplay` + `livegame`; calibrate/statcheck byte-identical if `game.ts` touched |
| **P3** | events.ts tidy | Drop or quarantine dead `onPlayEvent` API; comment authenticity | Live resume semantics | `livegame` + `playbyplay` |
| **P4** | e2e / harness tighten | `e2e.mjs` / `e2e-desks.mjs` asserts; optional golden `formatPlay` cases | Engine | Existing e2e + unit |
| **P5** (lead) | CPU snap-log policy | Save-size measurement + Matt sign before persisting more plays | Forbidden knobs | `drift.saveMb*` only after lead sign |

Do **not** start P5 without a save-size read. Do **not** combine P2
emit stamps with unrelated engine fixes in one PR.

---

## 7. Acceptance checks Matt can sign

### 7.1 Already green on `main` (regression bar)

Any implement packet that claims Phase 1 polish must keep:

1. **Unit — `playbyplay`:** same-seed play logs `deepEqual`; peek
   cache identity; user vs CPU persist policy; codec old-box load.
2. **Unit — `livegame`:** no kickoff re-sim across `call`; live
   finish matches `simulateGame` box + plays.
3. **Browser — `/play`:** New Franchise → Start Season → `/play`.
   Opening PBP row is kickoff touchback. Call Run or Pass → Last snap
   updates; **same** opening row stays row 1; clock / Drive Log move;
   no second kickoff. (Matches #81 HANDOFF verification.)
4. **Browser — `/game/[id]` (user):** after Play Week, Drive Chart
   possessions + Play by Play snap count > 0, grouped by drive.
5. **Browser — `/game/[id]` (CPU):** Drive Chart present; snap log
   absent is OK (note, not fail) — same as `e2e.mjs` today.
6. **Outcomes:** if `sim/game.ts` emit sites change, paste calibrate +
   statcheck `##M` diff vs tip — must be empty. No `baselines.json`
   edits.

### 7.2 Sign-off checklist for a polish wave (copy into PR)

```
[ ] playbyplay harness exit 0
[ ] livegame harness exit 0
[ ] /play: Last snap + Drive Log + PBP; peek/re-render does not re-sim
[ ] /play: continue does not rewrite opening kickoff row
[ ] /game/[id] user: Drive Chart + text PBP
[ ] /game/[id] CPU: Drive Chart; no snap log (unless P5 signed)
[ ] No new Math.random / Date.now in touched files (determinism scan)
[ ] No baselines.json edit
[ ] Phase 5 LLM not introduced on the snap path
```

### 7.3 Visual / Playwright notes

Prefer extending `scripts/e2e-desks.mjs` and `scripts/e2e.mjs` over a
new runner. Chromium path / `next start` rules in `AGENTS.md` still
apply. Screenshot optional for Matt; the text asserts above are enough
to sign.

---

## 8. File index (cite-first map)

| Path | Role |
|---|---|
| `lib/core/types.ts` | `PlayEvent` / `DriveSummary` / `BoxScore.plays\|drives` |
| `lib/core/sim/events.ts` | Emitter, `buildDrives`, `lastCalledSnap` |
| `lib/core/sim/game.ts` | Emit sites, `openGameSim` / `simulateGame`, persist policy |
| `lib/core/liveGame.ts` | Cached peek; generator resume |
| `lib/core/callSheet.ts` | `SimOpts.live` / `playCaller` |
| `lib/view/playByPlay.ts` | Deterministic formatting |
| `lib/view/playByPlay.test.ts` | Gate `playbyplay` |
| `lib/core/liveGame.test.ts` | Gate `livegame` |
| `app/play/page.tsx` | Live Last snap / Drive Log / PBP |
| `app/game/[id]/page.tsx` | Drive Chart / conditional text PBP |
| `lib/store/codec.ts` | Persist plays/drives |
| `scripts/gate.ts` | Registers both harnesses |
| `scripts/e2e.mjs` / `e2e-desks.mjs` | Browser smoke |
| `docs/ROADMAP.md` | Phase 1 target; Phase 5 narration; stale “missing” blurb |
| `docs/HANDOFF.md` | #53 / #81 / #83 ship notes |
| `docs/ORCHESTRATION.md` | Lane A ownership map |

---

## 9. One-line verdict

Phase 1 text PBP / drive log is **live on `main`**; this Wave 4.1
Claude B packet locks the inventory, contract, gaps, and Matt-signable
checks so a later implement wave polishes leftovers without confusing
Phase 1 with Phase 5 LLM narration — and without touching outcomes or
baselines.
