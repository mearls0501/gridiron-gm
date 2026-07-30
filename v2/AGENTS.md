# AGENTS.md — the contract for anything editing this repo

Read this before you change a line. It applies to every model, every tool, and
every human. It is short on purpose.

**Picking the project back up after a break?** Read `docs/HANDOFF.md` first —
it has where the work stands, what is still red and why, and what to do next.

This is a pro-football front-office simulation that runs entirely in the
browser. No database, no backend, no API keys, no network. A save is one
serializable JSON document in IndexedDB.

---

## The seven invariants

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

### 6. An even staff budget changes nothing

Every effect in `lib/core/staff.ts` is written as a deviation from an even
25/25/25/25 split, and at that split every multiplier it returns is exactly 1.
A league that has not allocated must play precisely as the game did before the
budget system existed.

That is what makes the whole system a strategy layer rather than a difficulty
slider. Allocation moves value between players and between clubs; it may not
create it. If it could, every outcome rate the NFL research pinned down would
drift with it and none of the calibration below would mean anything.

Two hard consequences, both gated:

- **`pot` is a wall.** No investment, no scheme, no coaching may take a player
  past his potential — `staff.overPotential` is gated at zero. This is the only
  thing standing between "a reclamation project" and "a roster of seventh
  rounders who all became Pro Bowlers", and it has already been quietly broken
  twice: once in generation (a `realize` clamp of 1.1 handed ~2% of players a
  ceiling above their own potential) and once in progression (`pot` was
  reconciled only at peak age, where it silently rose to meet ability).
- **A scheme redistributes.** `schemeAttrMultiplier` sharpens what an identity
  practises and dulls the rest, sized so the mean across the position's graded
  attributes is unchanged. `staff.schemeScoringDelta` watches league scoring
  between a floor-funded and a fully-funded league.

### 7. Every calibration number traces to a primary source

**This one is new, and it is here because the repo failed it.**

Any number that represents "what the real NFL does" — a target in
`docs/baselines.json`, a `TARGET_*` table in a harness, a constant justified in
a comment as realistic — must trace to a block in **`docs/nfl-reference.md`**,
which shows the dataset, the computation, and the source URL.

Three targets in `scripts/careers.ts` and one in `docs/baselines.json` were
wrong by 2x to 30x, and the simulation had been tuned toward them for weeks.
The flat 42.6% roster-survival figure for rounds 4-7 appears to have originated
in an LLM-generated statistic in a blog post carrying its own "verify this"
disclaimer. Real trade volume is ~90 a year; the guard said 3.

A number with no provenance is worse than no number, because it manufactures
confidence and then everything downstream is tuned to match a fiction. If a
figure cannot be traced, the honest move is to leave that axis **ungated** and
say so in `docs/nfl-reference.md` §4.

---

## The gate

```bash
npm run gate         # fast tier  — run after every edit
npm run gate:full    # full tier  — run before asking for review
```

One exit code. On failure it prints one line per violation:

```
FAIL  calibrate.passYds  238.4  expected 232.1 +/-6  (NFL ~230)
FAIL  leverage.wrongSign  3     expected <= 0
```

Read the FAIL lines, fix the cause, run it again. That is the whole loop.

Behind it: `tsc --noEmit`, `determinism`, `verify`, `sweep`, `calibrate`,
`statcheck`, `leverage` in the fast tier, plus `tails`, `conditions`,
`coherence`, `drift`, `careers` and `staff` in the full tier. Every harness emits its
headline numbers as `##M <name> <value>` lines (`scripts/metrics.ts`); the gate
compares each against `docs/baselines.json`.

A **missing** metric is a failure, not a skip. That rule exists because the
`leverage` harness silently degraded for weeks after in-game injuries shipped
and reported nine attributes as having backwards effects — a broken guard is
worse than no guard, because it manufactures confidence.

### Cost, and why the full tier may not run where you are

The gate fans all steps out with `Promise.all` and sweeps a 5-seed panel. On a
2-core box that is an hour-plus of thrashing and the output stays buffered the
whole time, so it looks hung when it is merely slow. Check `nproc` first.

```bash
npm run gate:full -- --seeds 2      # honest on 2 cores
npx tsx scripts/drift.ts 20         # or run the one harness your change risks
```

Fewer seeds means a noisier number, not a wrong one. Say which you ran.

### Things you may not do to make the gate pass

- Delete, weaken, or comment out an assertion
- Add a dependency
- Reduce `verify`'s check count (it is gated with a floor for this reason)
- Change a baseline to match what your code now does

That last one is the whole game. **A baseline may only move when the number
behind it moves in `docs/nfl-reference.md` first**, with the computation shown.
"The sim does 1.44 and the guard wants 2, so lower the guard" is how the trade
model stayed 60x off reality without a single red line.

Editing `scripts/` and `docs/baselines.json` is a **lead** decision, not a
worker one. If you are running as a worker on a task, report and stop.

### When a guard is the thing that is wrong

There is one legitimate reason to change a guard, and it is not "my code does
something else now". It is that the guard's own noise exceeds its tolerance, so
it reports at random and can neither catch a regression nor confirm a fix.

Establish it before acting on it: run the metric across three or more seeds on
**unchanged** code and show the spread. `coherence.eliteCbShadowDrop` read
+8.3 / -9.6 / +3.5 on identical code against a threshold of 4 — a standard
deviation near nine. Four separate attempts were made to "fix the engine"
before anyone measured the guard itself, and one of them was written up as a
regression that had never happened.

The repair is almost never a wider tolerance, which just makes a useless guard
quieter. It is a better-conditioned measurement of the same claim. That metric
now reads yards per TARGET instead of yards per game — dividing out volume,
game script and target distribution, none of which the claim was ever about —
and reads 1.25 / 1.46 / 0.78 on the same three seeds.

Changing WHAT a guard measures is a design decision. Diagnose it, write it up,
and take it to Matt.

---

## Which harnesses your change must re-run

The gate runs the right set automatically. This table is for knowing what your
change is actually risking, and what to look at when it goes red.

| a change touching… | pay attention to |
|---|---|
| `lib/core/sim/game.ts` | `calibrate`, `tails`, `conditions`, `coherence`, `leverage` — the whole quartet |
| `lib/core/season/*` | `verify`, `statcheck`, `drift` |
| `lib/core/offseason/*`, `frontOffice.ts`, `trades.ts` | `drift`, `verify`, `sweep`, **`careers`** |
| `lib/core/generate.ts`, `ratings.ts` | everything — generation feeds every harness |
| `lib/core/outcomes.ts`, `offseason/draft.ts`, `progression.ts` | **`careers` first**, then `drift` |
| `lib/core/scouting.ts` | **`scout` first**, then `careers` — CPU boards read `cpuProspectView`, so intel error shapes every draft |
| `lib/core/staff.ts` | **`staff` first**, then `calibrate` and `statcheck` — the scheme lean reaches the play engine |
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

**Check the target before you chase it.** Before tuning toward any number, open
`docs/nfl-reference.md` and confirm the number is in there. If it is not, that
is the finding — report it instead of hitting the target. This rule would have
saved several days of tuning roster churn to twice the correct harshness.

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
| `drift.tradesPerSeason` — real league-wide volume is ~90 a year | 7.8 of ~90 | 60-120 |
| `careers.survivalMae` — rounds 3-6 still wash out 11-16 points too fast | 8.8 | < 4 |
| `careers.careerLenMae` — a 6th or 7th rounder's median career is 1 and 0 seasons against a real 4 and 2 | 1.0 | < 0.5 |
| `careers.r1QbSharePct` — quarterbacks are 10.3% of round 1 in reality | 14-18% | 10.3% |
| `careers.r1BustPct` — a first rounder who never starts half a season in four years | 28% | ~15% |
| second contracts with the drafting club run 3-5x too high at every round | R7 at 15% | R7 at 1.5% |
| `leverage.noEffect` — LB awareness is 16% of OVR and the engine never reads it | 1 | 0 |
| **`drift.passRecordSeasons` — REGRESSION, caused 2026-07-29.** Fixing `cutWorstSurplus` keeps high-potential young players alive, more of them reach their ceiling, and the 5,477-yard record now falls more often. Matched-seed: 10 → 13 of 20. Left red rather than widened. | 13 of 20 | ≤ 3 of 20 |
| `conditions.coldPointsDelta` — cold games barely suppress scoring (−0.5 against a real −2.4). Single-seed reading on a 6-season sample; not yet confirmed against a matched-seed baseline. | −0.5 | −2.4 |
| `tails.milestonesOff` — milestone frequencies against NFL history | 12 | 0 |
| `conditions.byeWinPct` — a bye currently *hurts* | 48.8% | 53-58% |
| `drift.saveGrowthMbPerSeason` — mostly fixed by the save codec and housekeeping | +0.32 MB | < 0.3 MB |

Anything not on this list that goes red is a regression you caused.

Also unguarded, and worth knowing before you touch the surrounding code: free
agency has no live CPU bidding (`FaState`/`FaBid` are declared and always
null); ROY is not restricted to rookies; `history[].standings` exists but no
page reads it; there is no garbage-time QB rotation; kickers and punters
cannot be hurt in-game.

**The scouting system** (`lib/core/scouting.ts`, war room on `/draft`, guarded
by `scout`): the user holds stored per-method intel (`state.scouting`) with OVR
AND potential bands centred on wrong estimates; every CPU club's belief is
DERIVED — truth plus stable hash noise keyed (seed, season, club, player) — so
opinions are durable, private, and cost no save bytes. `cpuProspectView` is the
only window a club gets; nothing may read true `pot` or the user's bands in
draft logic, and the player-page attribute panel shows scouted RANGES for
prospects (the old panel handed back true OVR via position weights). Hidden
`ceiling` is never scoutable by anyone, ever. Draft weekend trades on the
clock (`tryCpuClockTrade`, capped per draft) and closes with a priority-UDFA
chase (`runUdfaChase`, user's club interactive-only by the same convention as
`cpuResign`).

**The staff budget** (`lib/core/staff.ts`, screen at `/front-office`) is the
strategy layer: one pool of 100 points a season across development, scouting,
training and scheme, plus up to three named development priorities and an
offensive and defensive identity. Development spending buys back the gap
between a player's `ceiling` and his `pot` and never touches `pot` itself. CPU
clubs allocate from their existing archetype via `refreshCpuStaff`.

**Structurally missing in the trade model**, per `docs/nfl-reference.md` §1:
the cutdown window (~17% of real activity) still does not exist, and in-season
deadline volume is thin. Draft weekend now has both halves — a pre-draft burst
(`runDraftDayTrades`) and an on-the-clock market (`tryCpuClockTrade` /
`generateClockOffers` / `quoteMoveUp` in `offseason/draft.ts`) where a club
whose board tier collapsed pays a premium to move up, which is the mechanism
the funnel analysis said was missing.

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
  outcomes.ts     career outcome taxonomy — the labels `careers` grades against
  staff.ts        the staff budget: one pool, four buckets, and the schemes
  frontOffice.ts  16 CPU archetypes as numeric dials
  trades.ts       asymmetric valuation — both clubs price a deal themselves
lib/store/        zustand store + IndexedDB persistence
app/              one route per screen
scripts/          verification harnesses and the gate — lead-owned
docs/baselines.json   the locked numbers — lead-owned
docs/nfl-reference.md the primary-source computations every number traces to
```
