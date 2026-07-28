# AGENTS.md — the contract for anything editing this repo

Read this before you change a line. It applies to every model, every tool, and
every human. It is short on purpose.

This is a pro-football front-office simulation that runs entirely in the
browser. No database, no backend, no API keys, no network. A save is one
serializable JSON document in IndexedDB.

---

## The five invariants

These hold the build together. Violating any one of them fails review **even if
every test passes**, because the failure they prevent is not one a test catches
on the day it is introduced.

### 1. Seeded RNG only

Nothing outside `lib/core/rng.ts` may call `Math.random()`, `Date.now()`,
`new Date()`, or `performance.now()`. Randomness comes from an `Rng` instance
passed down through the call chain. The RNG state lives on the save, which is
what makes a bug reproducible from a save file and what makes `verify`,
`drift`, `sweep` and `calibrate` mean anything at all.

`npm run determinism` enforces this, both by replaying seeds and by scanning
the source. Two files have a narrow, budgeted exemption for save metadata; see
the script.

### 2. The box score IS the score

Points are only ever added by a scoring play that also writes the matching
player stat lines. Never adjust a score directly. The box score and the
scoreboard must reconcile exactly, on every scoring route — offensive
touchdowns, defensive returns, kick and punt return scores, two-point
conversions, safeties, field goals, extra points.

`verify` and `calibrate` both assert this. `calibrate.scoreMismatches` is
gated at zero and always will be.

### 3. The depth chart drives the simulation

The engine reads `team.depthChart` to decide who plays. Do not select players
inside the sim by sorting on overall rating — that quietly disconnects the
player's decisions from the game they are watching, which is the entire point
of the mode.

### 4. One array of players

`state.players` holds everyone: rostered players, free agents, prospects,
retirees. A draft prospect is a `Player` with `prospect: true`, and drafting
flips the flag. Do not create a parallel collection for any subset.

### 5. No backend, no runtime LLM, no new dependencies

Everything must survive `JSON.stringify` / `JSON.parse` unchanged. Do not add a
package. Do not call an API. Do not introduce a server.

An LLM may eventually write prose the player is already looking at — a scouting
report, a trade rationale, a season recap — behind a thin proxy. It will never
be in a decision loop. Deterministic replay is what makes this codebase
testable, and no CPU-intelligence gain is worth trading it away.

---

## The gate

```bash
npm run gate         # fast tier, ~40s — run after every edit
npm run gate:full    # full tier, ~5m  — run before asking for review
```

One exit code. On failure it prints one line per violation:

```
FAIL  calibrate.passYds  238.4  expected 232.1 +/-6  (NFL ~230)
FAIL  leverage.wrongSign  3     expected <= 0
```

Read the FAIL lines, fix the cause, run it again. That is the whole loop.

Behind it: `tsc --noEmit`, `determinism`, `verify`, `sweep`, `calibrate`,
`statcheck`, `leverage` in the fast tier, plus `tails`, `conditions`,
`coherence` and `drift` in the full tier. Every harness emits its headline
numbers as `##M <name> <value>` lines (`scripts/metrics.ts`); the gate compares
each against `docs/baselines.json`.

A **missing** metric is a failure, not a skip. That rule exists because the
`leverage` harness silently degraded for weeks after in-game injuries shipped
and reported nine attributes as having backwards effects — a broken guard is
worse than no guard, because it manufactures confidence.

### Things you may not do to make the gate pass

- Edit anything in `scripts/`
- Edit `docs/baselines.json`
- Delete, weaken, or comment out an assertion
- Add a dependency
- Reduce `verify`'s check count (it is gated with a floor for this reason)

A baseline that looks wrong might well be wrong — say so and stop. Changing one
is a decision, and decisions go to the orchestrator, then to Matt.

---

## Which harnesses your change must re-run

The gate runs the right set automatically. This table is for knowing what your
change is actually risking, and what to look at when it goes red.

| a change touching… | pay attention to |
|---|---|
| `lib/core/sim/game.ts` | `calibrate`, `tails`, `conditions`, `coherence`, `leverage` — the whole quartet |
| `lib/core/season/*` | `verify`, `statcheck`, `drift` |
| `lib/core/offseason/*`, `frontOffice.ts`, `trades.ts` | `drift`, `verify`, `sweep` |
| `lib/core/generate.ts`, `ratings.ts` | everything — generation feeds every harness |
| `lib/core/rng.ts` | `determinism` first, then everything |
| `app/*`, `components/*` | `node scripts/e2e.mjs` and `node scripts/e2e-interact.mjs` |
| `lib/store/*` | `determinism` (round-trip) and the save-size guard in `drift` |

Running the browser suites needs a built server:

```bash
npx next build
(nohup npx next start -p 3000 &) ; sleep 14
PW_CHROMIUM=/path/to/chromium node scripts/e2e.mjs
```

Two traps: plain `node scripts/e2e.mjs` fails because Playwright wants a
headless-shell build that is not installed, and **never `pkill -f next`** — it
matches the build process and kills your own shell. Never build while a server
is running; it serves a half-written `.next` and every chunk 400s.

---

## How to work

**One task, one branch, one file cluster.** Branch `task/NNN-slug`. Parallel
workers must never touch the same module.

**Diagnose before you edit.** If the task says report first, report first. A
correct diagnosis with no code is worth more than a fix aimed at the wrong
thing.

**Three strikes and stop.** If the gate is not green after three attempts,
stop and report: what you changed, what the gate said each time, and what you
now think is actually wrong. An honest dead end is far more useful than a hack
that goes green.

**Do not refactor.** Do not tidy adjacent code, rename things, reformat, or add
comments explaining what the code obviously does. Make the one change.

**When you finish, output:** the files you changed, the final gate output, and
three sentences on what you did and why.

---

## Known-open items

These are deliberately still failing. They are targets, not regressions, and
their baselines are set to today's value so they cannot get *worse*:

| item | today | target |
|---|---|---|
| `leverage.noEffect` — LB awareness is 16% of OVR and the engine never reads it | 1 | 0 |
| `drift.passRecordSeasons` — the 5,477-yard record falls in half of all seasons | 10 of 20 | ≤ 3 of 20 |
| `tails.milestonesOff` — milestone frequencies against NFL history | 12 | 0 |
| `conditions.byeWinPct` — a bye currently *hurts* | 48.8% | 53–58% |
| `drift.saveGrowthMbPerSeason` — mostly fixed by the save codec and housekeeping | +0.32 MB | < 0.3 MB |

Anything not on this list that goes red is a regression you caused.

Also unguarded, and worth knowing before you touch the surrounding code: free
agency has no live CPU bidding (`FaState`/`FaBid` are declared and always
null); scouting covers 2 prospects a year out of ~230 and a prospect's true
rating leaks through the attribute panel on the player page; ROY is not
restricted to rookies; `history[].standings` exists but no page reads it; there
is no garbage-time QB rotation; kickers and punters cannot be hurt in-game.

---

## Layout

```
lib/core/
  types.ts        domain model — one array of players, one serializable state
  rng.ts          seeded PRNG (nothing else may be non-deterministic)
  ratings.ts      position weights; OVR is derived, never stored authoritative
  generate.ts     league, players, coaches, contracts
  schedule.ts     constraint-based schedule generation
  sim/game.ts     the play engine
  season/         standings, playoffs, stats, injuries, week engine
  offseason/      progression, contracts, draft, free agency
  frontOffice.ts  16 CPU archetypes as numeric dials
  trades.ts       asymmetric valuation — both clubs price a deal themselves
lib/store/        zustand store + IndexedDB persistence
app/              one route per screen
scripts/          verification harnesses and the gate — READ ONLY to workers
docs/baselines.json   the locked numbers — READ ONLY to workers
```
