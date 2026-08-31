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
| **`careers.r1QbSharePct` — leftover after PR #7/#9 is POSITION_VALUE on the CPU board, not scouting (2026-08-30).** PR #9 showed a true-BPA top 32 scored `(ovr − replacement) × POSITION_VALUE` is already ~18–21% QB against a real 10.3% (`nfl-reference.md` §2.4); actual drafts sat near 15% only because need / `startsHere` suppress below that board. Selection premium is still flat — quarterbacks are not scouted worse. `cpuBoardValue` now reads `√POSITION_VALUE` (QB ≈ 1.84× a safety) so the salary table cannot write the first round; contracts / trades / generation keep the raw 3.4×. Careers 30 / seed 12345: **15.1% → 11.6%** toward 10.3, `r1ShareMae` 2.22. 2-seed panel (24 seasons): **9.77**. Other groups on the 30-season run: OL 20.3% (real 20.3), RB 2.4→ toward 4.2, LB 4.9→ toward 7.7, DB 19.8 (was 21.0 vs 16.7), WR 16.7 (was 13.7 vs 13.4), DL 20.0 (was 24.3 vs 24.5). **The locked band is 15.9 ±3.2 — a two-sided lock around the old reading — so 11.6 / 9.77 fail the floor while sitting on the `nfl` note.** That band was built to catch a relapse to 19.6; the honest shape is a max. Re-lock is a lead call; the baseline was not moved. | 11.6 / 9.77 | 10.3% |
| ~~`careers.r1BustPct` — a first rounder who never starts half a season in four years~~ **ROW RETIRED 2026-08-31 — on the traced target, not a leftover.** `isBust` (`lib/core/outcomes.ts`) is a first-rounder who never posted ≥9 GS in years 0–3. Current main reads **6.94%** against `nfl-reference.md` §2.1 R1 St=0 of **6.3%**. The old 28% → ~15% chase is untraced: ~15% is the §2.1 never-two-starter-seasons rate (weighted 1−St≥2 ≈ 14.3%), a different label. Cuts, retirement, and depth-chart stickiness are not a leftover. The only cell still high is R1 QB never-start 22.4% vs 10.7% (§2.5) — a different packet (32-job incumbent); do not start a sim change for it. Baseline not moved. | 6.94 ✓ | 6.3% St=0 |
| ~~second contracts with the drafting club run 3-5x too high at every round~~ **ROW RETIRED 2026-08-31 — mechanism closed by PR #6.** `cpuResign` now requires a rookie-deal player (`draftedRound !== null && yearsPro <= 4`) to outgrow a 70 OVR bar; the loyalty/youth/floor-pull terms that kept replacement-level late-rounders at ~50% (R7 11.5–15% vs 1.5%, `nfl-reference.md` §2.3) no longer apply on that path. Careers was not re-run on this docs pass; no new R7 share is claimed. | was R7 at 15% | R7 at 1.5% |
| ~~`leverage.noEffect` — LB awareness is 16% of OVR and the engine never reads it~~ **CLAIM RETIRED 2026-08-31.** The engine already reads LB `awr` via `frontScore` in `sim/game.ts` (`unitAvg(lbs, "awr") * 0.12` into rush yards). The harness probe is `LB.awr` → `teamRushYds` and the measured swing is ~−4.4, not dead. The leftover `noEffect` 1 is the knife-edge `OT.sta` → `sacksTaken` probe (`leverage.ts` treats `|swing| < 0.05` as dead; it oscillated NO EFFECT / WRONG SIGN on unchanged code). Do not invent a leverage fix. | 1 | 0 |
| **`drift.passRecordSeasons` — reconditioned 2026-08-03; STILL 0 of 20 with the top-end restored, so `min: 1` was NOT added.** The guard used to read the season line after `playoffs.ts` wrote into it, counting REG+POST yards against a REG-only 5,477 (5,316 with playoffs against 4,735 without); it now snapshots at the end of the regular season (§6.8A). task/310b restored elite passing production — every leaderboard floor is green — and the panel still reads **0 of 20**: the sim's single-season leader averages 4,742 at 60 seeds against a record of 5,477, so the tail is ~700 short even now. §6.4's floor is therefore still unmet and the authorized `min: 1` was deliberately withheld. What is left is the top-5 VOLUME gap §5.8 shows cannot be closed honestly (real run-heavy clubs do not spread carries, corr −0.015), so the record may simply be out of reach until pass volume can be widened without the run-share coupling. | 0 of 20 | 1-3 of 20 |
| `conditions.coldPointsDelta` — cold games barely suppress scoring (−0.5 against a real −2.4). Single-seed reading on a 6-season sample; not yet confirmed against a matched-seed baseline. | −0.5 | −2.4 |
| **`tails.milestonesOff` — Poisson-interval verdict LANDED 2026-08-28 (task/312).** The guard now counts how many of 49 threshold categories have an observed count outside the central 95% Poisson interval (λ = NFL rate × seasons). Panel **16.0** (14 / 15 / 15 / 18 / 18, sd 1.87). Ratio-band continuity readings were 14.4 / 17.2 / 16.4 / 20.8 — the drop is the rare-event quantization coming off (~2.75 false fails from 1/16 > 0.06), not an engine change. The 95% interval is tighter than the old 0.62–1.6 ratio band on high-λ categories, so common-rate misses now count. Stable offs on this panel: 450+ pass yds, 200+ rush yds, 3+ sacks (too common, ~1.4×), 15+ tackles, 60+ yd FG (too common, ~2×), 4,500+ pass yds, 1,400+ rec yds, 150+ tackles. The two rare categories previously called genuinely elevated — 1,900+ receiving yards at 2.25× pooled and 23+ sacks at 3.12× — are **not claimed fixed**; 1,900+ failed 1 of 5 seeds here and 23+ failed 0 of 5 at 16-season resolution. Do not tune the engine against this number. | 16.0 | 0 |
| ~~`statcheck.qb20PassYds` — the thin middle~~ **ROW RETIRED 2026-08-03 — GREEN.** Three packets, each fixing a measured mechanism: within-game QB rotation (task/307, 3,431 → 3,278 at 60 seeds), real play volume (task/309), and era-matched QB availability (task/308). It now reads **3,040 at 60 seeds against a real 3,046 ±244**, and 2,953 on the 5-seed panel. Read it at 60 seeds, not on the panel: 60-seed sd is 154 and the paired sd across a code change is 194, so the panel's SEM is ±70 and it cannot resolve its own fixes (§6.8C). | 3040 ✓ | 3046 ±244 |
| **`statcheck.rb5RushYds` — cause found and mostly fixed; residue is not distribution.** `CARRY_SHARE` is EXONERATED (§5.5): the dials are right on the denominator they control — lead back 59.7% of RB carries against a real 58.3%, 68.4% within a game against a real 70.4%. §5.3's 47.4% is a share of TEAM carries and RBs take only 80.7% of those. The real cause was the carry MIX, fixed in task/309 by adding receiver carries and kneel-downs: **1,455 → 1,329 at 60 seeds (1,304 on the panel)**. What remains is the backfield-concentration remainder plus noise; §5.8 shows real run-heavy clubs do not spread carries either (corr −0.015), so there is no distribution lever left. Baseline is CORRECT; do not widen, do not touch `CARRY_SHARE`. | 1329 | 1191 ±95 |
| ~~`statcheck.wr10RecYds` — starter availability~~ **ROW RETIRED 2026-08-02 — never a defect.** It was single-seed noise, exactly as this row had suspected. On a 5-seed panel it reads **1,141 BEFORE any availability work** and 1,136 after, both comfortably inside 1,208 ±97; it only ever failed on the fast tier's one seed. Same finding for `statcheck.implausibleLines`, 0 on the panel before and after. Neither was a depletion side-effect, because neither was ever red on a panel — kept here struck through, per the `byeWinPct` convention, so the next reader does not re-open it. | 1136 ✓ | 1208 ±97 |
| ~~`conditions.byeWinPct` — a bye currently *hurts*~~ **RESOLVED 2026-07-31.** 5-seed panel reads 53.4% (806 bye games), inside the 53-58 band; baseline re-locked 51.732 → 53.37. Caveat: `tol` is ±9, wide enough that the old broken 48.8% still sits inside the band, so this guard cannot yet catch the bye going backwards again. | 53.4% | 53-58% |
| ~~`drift.saveGrowthMbPerSeason` — false P0 from a threshold conflict~~ **RESOLVED 2026-08-03.** The quantity reads **+0.402 MB**, inside the panel-locked `max: 0.45` the whole time; `drift.ts` carried its own internal `growth < 0.4`, so a reading between the two counted a P0 the locked number said was fine. The harness now uses 0.45, matching the baseline, which is the authority. Growth itself is real and understood — receiver carries gave WR/TE rows non-zero rushing fields, and the QB refit logs more absences — and 10.4 MB after 20 seasons is nowhere near the 20 MB quota. | +0.402 MB ✓ | < 0.45 |
| **ACCEPTED LIMITATION — the single-season passing record is unreachable.** `drift.passRecordSeasons`, reconditioned to REGULAR-SEASON yards (§6.8A), reads **0 of 20** even with elite production restored: the sim's single-season leader averages 4,742 at 60 seeds against a 5,477 record. Closing it needs the top-5 VOLUME gap (538-562 attempts against a real 578-596), and **§5.8 establishes that cannot be bought honestly** — real run-heavy clubs do not spread their carries (corr −0.015, slope −0.36 points per +100 carries), so widening team pass spread through the pass/run mix inflates the rushing tail with no measured coupling to redistribute it. §6.4's floor is therefore unmet and the authorized `min: 1` was deliberately WITHHELD; the guard passes on its max for the wrong reason. Reopen only with a mechanism that widens pass volume without touching the mix. | 0 of 20 | 1-3 of 20 |
| **ACCEPTED LIMITATION — QB availability's second moment is 5 points light.** The era-matched refit (§6.8B) lands the first moment exactly — QB1 plays **14.27 of 17 against a real 14.23**, and 36% play all 17 against a real 32% — but the 16+ share comes in at 41% against a real 46%, with under-14 at 42% against 35%. `WEEKLY_TABLE` is shared across every position and `POSITION_DURATION` only scales it, so "hurt rarely, out long" cannot be expressed for quarterbacks without a per-position duration table. That is a design change, not a tuning one. | 41% at 16+ | 46% |
Anything not on this list that goes red is a regression you caused.

**Ratified 2026-08-03 (Matt).** Three decisions taken under the 2026-07-30
full-autonomy instruction and flagged for sign-off in `HANDOFF.md` are now
formally accepted, and are no longer provisional: `drift.saveMbAtEnd` raised
10 → 10.5 (the UDFA chase adds ~100 played careers a season and the record book
keeps played careers by design); the pick-1 guards in `verify.ts` and `drift.ts`
measuring the SLOT via `originalTeamId` rather than the holder (on-the-clock
trading means a bottom-six club may legitimately not HOLD pick 1 — the claim is
unchanged, the confound is removed); and the four `scout.*` structural
baselines (leak floor, tightening floor, clock-trade floor, UDFA band).

Also unguarded, and worth knowing before you touch the surrounding code:
~~free agency has no live CPU bidding (`FaState`/`FaBid` are declared and always
null)~~ **CPU FA bidding is live (PR #3).** `openCpuBidding` / `runCpuFaRound`
write and resolve `FaBid`s on `state.fa`; the user's club stays interactive-only,
same convention as `cpuResign`. ~~ROY is not restricted to rookies;
`history[].standings` exists but no page reads it.~~ **ROY is rookies-only
(PR #2)** — `recordSeasonHistory` scores only `yearsPro === 0`; `verify` asserts
the winner is a rookie. **`/standings` reads `history[].standings`** via
`computeRecords` for archived seasons; the League tab links each year into
`/standings?season=`. Garbage-time QB rotation now exists and is fitted to §5.4b
(`decided` / `onField` in `sim/game.ts`) — both sides, the trailing one sooner
— but a club never benches a passer for playing badly, and there are no trick
plays, which together are most of the real 21.4% of team-games with a second
passer that the sim reaches 19.6% of. Kickers and punters can
now be hurt in-game (on a return, mostly — `kickExposure` in `sim/game.ts`,
~2.5 logged a league-season), but the rate traces to no primary source and is
deliberately **ungated** per invariant 7; see `nfl-reference.md` §4.

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

**Trade calendar**, per `docs/nfl-reference.md` §1:
~~the cutdown window (~17% of real activity) still does not exist, and in-season
deadline volume is thin.~~ **Cutdown and deadline markets landed (PR #4).**
Late-August cutdown (`runCutdownTrades` from `prunePickInventory` during
`offseason-final`) is a one-pick scrap-heap dump capped at the sourced ~16
trades a year. In-season volume follows `TRADE_WEEK_WEIGHTS` in `season/engine.ts`
(~40% in the deadline week, September floor ~3–4% per week; ~16 in-season
trades a year). Draft weekend now has both halves — a pre-draft burst
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
