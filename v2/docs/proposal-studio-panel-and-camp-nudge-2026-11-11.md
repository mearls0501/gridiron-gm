# Studio panel protocol on main, and the camp-nudge A/B

**UNSIGNED.** This is a run protocol, not a sim change. It changes no code, test, `scripts/` file, `docs/baselines.json` entry or canary. Matt signs any change. No re-lock, no band, no dial.

Tree: branch `claude/gracious-allen-i8ij43`, main `9e74d34` (#229, `9e74d345d66c644f70f0d987b9edb50946ab208c`). The branch head `72ac945` is a merge of `9e74d34` and has the same tree (`git diff 9e74d34 HEAD` is empty). All line numbers below are from this tree.

## Why now

The last Studio panel on `main` is `ddc62bd` (#204), 2026-10-27, GATE FAIL 1: `coherence` seed 2 at 83.7 under the per-seed floor of 85, panel mean 87.65, accepted as noise (`docs/ROADMAP.md` 81–84, `docs/gate-fail-ddc62bd-seed2-coherence.md`).

`git log --first-parent ddc62bd..9e74d34` lists 21 merges. Nine touch only `docs/` (#203, #206, #207, #208, #209, #217, #219, #220, #228). Eleven reach code that a gate step runs:

| PR | sha | what it touches that a harness reaches |
|---|---|---|
| #213 | `0679a1a` | `offseason/contracts.ts`, `offseason/index.ts`: Start the Season stops rewriting user deals |
| #214 | `f96e356` | `frontOffice.ts`, `offseason/contracts.ts`, `offseason/freeAgency.ts`, `offseason/index.ts`, `select.ts`: CPU spends carried room and spends a legal book back to the floor |
| #216 | `81bb316` | `hallOfFame.ts`, `offseason/progression.ts`: history rows keep the user's club |
| #218 | `f69ecea` | `offseason/contracts.ts`: cutdown posture hoisted |
| #221 | `e819808` | `offseason/contracts.ts`, `offseason/draft.ts`: FA Auto-fix holds the draft and camp bill |
| #222 | `a453c24` | `sim/game.ts`, `scripts/statcheck.ts`, `scripts/tails.ts`: target and tackle share bend, primary tackle credit |
| #223 | `5c5b280` | `season/standings.ts`, `offseason/progression.ts`, `lib/store/simTo.ts`: division place, QB1 pause |
| #225 | `b5c2a21` | `hallOfFame.ts`: classes capped at five |
| #226 | `c7c268c` | `scripts/determinism.ts`: plays the regular season and playoffs |
| #227 | `aa114db` | `app/*`, `components/*`, `scripts/e2e-desks.mjs`: front end only |
| #229 | `9e74d34` | `offseason/draft.ts`, `offseason/contracts.ts`, `lib/view/resignStep.ts`: rookie guarantees (picks 18–224 get none), tag-window cap meter, `trimIdentity` re-lock |

#210 (`6bcee74`) is a twelfth code merge, but it touches only `lib/view/ownerPace.ts`, `lib/view/ownerPace.test.ts` and `app/staff/page.tsx`. The gate reaches it only through the `ownerpace` unit-test step (`scripts/gate.ts` 189); no sim harness reads it.

The table lists the sim and harness files only. Several merges also touch tests, `package.json` and `scripts/gate.ts` (new test steps). #222 also edited `docs/baselines.json` (the `statcheck.leadTackles` retarget to 110 ±18, signed 2026-11-10), `scripts/milestoneComparisons.ts` and both canary tests.

`docs/ROADMAP.md` is stale on two points. Line 120 names `aa114db` as main; main is now `9e74d34`. Lines 90–91 list ten merges and omit #229. The `trimIdentity` row at line 101 reads 1587 cuts, rng 19218870. The test now locks **1600** and **2524091302** (`lib/core/trimIdentity.test.ts` 9, 21), signed in the 2026-11-11 #229 entry (`docs/HANDOFF.md` 11).

#229 is the reason to run before anything else merges. `docs/HANDOFF.md` 15 says it moves the league after the first draft and asks for `drift` (`deadMoneyPct`, payroll, `capBustSeasons`) and `careers` (late-round survival) before merge. It merged without them.

## The camp nudge as it stands

- `campNudgeOn()` returns true only when `process.env.GG_CAMP_NUDGE === "1"` (`lib/core/campGrade.ts` 35–37). In the browser it is always off. No player has ever had it.
- `campNudge` is `campGrade × CAMP_NUDGE_MAX`, and 0 when off (`campGrade.ts` 113–116). `CAMP_NUDGE_MAX = 3` (`campGrade.ts` 26). `SHRINK_SNAPS = 30` (29) and `Z_CAP = 2` (32). The file says this is a design dial, not an NFL rate (8–9).
- It is added in three cut valuations: `quarterbackKeepWorth` (`offseason/contracts.ts` 1660–1663), `surplusWorth` (1880–1883), which `worstSurplus` sorts on (1903; `moveWorstSurplus` calls it at 1925) and `cutWorstActiveAt` sorts on (1914), and `upgradeRoster`'s `held` (2116).
- The grade reads only `offseason-final` with this year's preseason played (`campGrade.ts` 64–68). The harnesses play the preseason: `advanceOffseason` in `offseason-final` plays a week while `preseasonWeeksLeft > 0`, then cuts (`offseason/index.ts` 407–412). `careers`, `drift`, `sweep` and `verify` all drive `advanceOffseason` (`scripts/careers.ts` 184, `scripts/drift.ts` 151, `scripts/sweep.ts` 35, `scripts/verify.ts` 599).
- Preseason games draw from a hash-keyed stream, not the parent (`lib/core/preseason.ts` 26–34). The nudge itself draws nothing. It only reorders.
- The gate passes its whole environment to every child: `{ ...process.env, GG_SEED: String(seed) }` (`scripts/gate.ts` 297). So `GG_CAMP_NUDGE=1 npm run gate:full:serial` turns the nudge on in every step, the unit tests included.

`docs/preseason-games-design-2026-10-20.md` 310–312 and `docs/HANDOFF.md` 471–474 already name this A/B as the condition for turning it on. Neither says how to read it. This doc does.

## Measured on this tree

4-core VM, Node 22.22.0. Not the Studio. Read-only probes in the scratchpad; nothing in the repo was edited.

**Canaries with the nudge on.**

| test | nudge off | `GG_CAMP_NUDGE=1` |
|---|---|---|
| `userOffers.test.ts` | pass (22.7 s) | **pass** (21.7 s). Tag `1779302491`, FA `1323223106` unchanged |
| `trimIdentity.test.ts` | pass, 1600 cuts, rng 2524091302 (3 m 03 s) | **fail**: 1512 cuts against 1600 (2 m 59 s) |

`userOffers` walks seed 42 from `newGame` to the first `offseason-tag` (`userOffers.test.ts` 113–129). A new league starts in `preseason` and has no camp cut before that point, so the nudge cannot reach it.

**Seed-42 cutdowns, nudge off vs on.** Same walk as `trimIdentity.test.ts` 131–150, run to each opening cut. "Spots differing" is active `id:teamId` pairs on one side and not the other after the cut.

| opening | rng at door, off | rng at door, on | rng after cut, off | rng after cut, on | cut log rows off / on | spots differing |
|---|---:|---:|---:|---:|---:|---:|
| 2027 | 1888373461 | 1888373461 | 1256537791 | 1256537791 | 756 / 774 | 69 of 1696 |
| 2028 | 1511180545 | 584197202 | 879344875 | 4247328828 | 1181 / 1089 | 864 of 1696 |
| 2029 | 2614299524 | 529713041 | 1982463854 | 4192844667 | 1292 / 1237 | 1120 of 1696 |
| 2030 | 3155926972 | 836147162 | **2524091302** | **204311492** | **1600** / **1512** | 1308 of 1696 |

The first nudged cut (2027) leaves the parent stream where it was. The nudge itself adds no draw; that the refill after the cut also drew the same count on this seed is a measurement, not a guarantee, because a different set of cut positions can change how many replacements are rolled. It changes 69 roster spots. By the next door the parent stream has moved, and the leagues diverge. The as-built note measured 15 and 19 of about 1,730 (`docs/preseason-games-design-2026-10-20.md` 304–305). That was one season then camp, on an older tree, counting the 53 only. The 69 here includes the refill and waiver moves after the cut.

Consequence for reading: the on and off panels are **not paired**. After the first cut each seed is a different league. Compare the two panels as two independent 5-seed samples.

**Other registered tests that walk through camp**, run once each with `GG_CAMP_NUDGE=1`: `divisionRank`, `offseasonContinue`, `draftNight`, `preseason`, `campGrade`, `tradeWindow`, `rosterCap`, `rosterStatus`, `waivers`, `waiverClearing`, `franchiseTag`, `fifthYearOption`, `tagExtension`, `capMechanics`, `startSeasonCap`, `userFaReserve`, `psychology`, `housekeeping` all exit 0. The review added three more registered tests that call `advanceOffseason` and were missing from that list: `simTo` (72 s), `simToast` and `callSheet` (15 s) all exit 0 with `GG_CAMP_NUDGE=1` on this VM. The review also re-ran `trimIdentity.test.ts` with the nudge on and reproduced the failure: `cut count`, actual 1512, expected 1600 (167 s). `contractCeiling` hit my 470 s timeout at season 2032 of its 12-season walk with no assertion failure; it was not finished here.

## The protocol

Matt runs this on the Mac Studio. Two worktrees on the same commit, so the two runs share no files. No harness writes a file (`grep writeFileSync scripts/*.ts` finds only `gate.ts`, and only under `--lock`), so they can run at the same time.

### 0. Set up once

```bash
cd ~/Projects/gridiron-gm && git fetch origin
SHA=9e74d345d66c644f70f0d987b9edb50946ab208c
LOGS=~/Projects/gg-panels/9e74d34
mkdir -p "$LOGS"
git worktree add --detach ~/Projects/gg-9e74d34-off   "$SHA"
git worktree add --detach ~/Projects/gg-9e74d34-nudge "$SHA"
(cd ~/Projects/gg-9e74d34-off/v2   && npm ci)
(cd ~/Projects/gg-9e74d34-nudge/v2 && npm ci)
```

Do not run either panel from the everyday checkout. A `git pull` mid-run changes the code under the later steps.

### 1. Panel A — main, nudge off

```bash
cd ~/Projects/gg-9e74d34-off/v2
unset GG_CAMP_NUDGE
nohup caffeinate -i sh -c '
  echo "## panel sha=$(git rev-parse HEAD) nudge=${GG_CAMP_NUDGE:-off} node=$(node -v) cores=$(sysctl -n hw.ncpu) start=$(date -u +%FT%TZ)"
  npm run gate:full:serial
  echo "## exit=$? end=$(date -u +%FT%TZ)"
' > "$LOGS/gate-full-5seed-9e74d34-off.log" 2>&1 &
```

This is the main panel. It is what goes in `HANDOFF.md` as the first `main` read since `ddc62bd`.

### 2. Panel B — same commit, nudge on

```bash
cd ~/Projects/gg-9e74d34-nudge/v2
export GG_CAMP_NUDGE=1
nohup caffeinate -i sh -c '
  echo "## panel sha=$(git rev-parse HEAD) nudge=${GG_CAMP_NUDGE:-off} node=$(node -v) cores=$(sysctl -n hw.ncpu) start=$(date -u +%FT%TZ)"
  npm run gate:full:serial
  echo "## exit=$? end=$(date -u +%FT%TZ)"
' > "$LOGS/gate-full-5seed-9e74d34-nudge.log" 2>&1 &
```

The header line is there because the gate does not print a SHA (`docs/HANDOFF.md` 1670), and because the two logs must be told apart by their contents, not only their names. Check the first line of each log says `nudge=off` and `nudge=1` before walking away.

`caffeinate -i` keeps the Studio from idling to sleep. `nohup` keeps the run alive if the terminal closes. Watch with `tail -f "$LOGS"/*.log`; the serial runner tees each child live and long harnesses print one `progress()` line a season (`scripts/gate.ts` 303, `scripts/metrics.ts` 25–26).

### 3. Save for triage

When both logs end with `## exit=`:

```bash
cd "$LOGS"
for f in gate-full-5seed-9e74d34-*.log; do
  awk '/^--- .* ---$/{step=$2; seed=($3=="seed")?$4:0}
       /^##M /{print step"\t"seed"\t"$2"\t"$3}' "$f" > "${f%.log}.metrics.tsv"
  grep -E '^(FAIL|GATE|  (ok|FAIL|NOISE) )' "$f" > "${f%.log}.summary.txt"
  grep -A10 'BY ROUND — sim vs real NFL' "$f" > "${f%.log}.careers-by-round.txt"
done
ls -la
```

The awk keys every `##M` line to its step and seed. The serial runner prints `--- <step>  seed <n> ---` before each seed (`scripts/gate.ts` 350) and the panel is seeds 1–5 (`scripts/gate.ts` 278–279); `rbpanel` owns its panel and runs once as seed 0 (342). I checked the awk on a synthetic log; it was not run on a real Studio log. The gate prints `NOISE` rows indented by two spaces (`scripts/gate.ts` 525), and step rows as `  ok  ` / `  FAIL` (424); the grep matches both.

`careers` prints its per-round table but emits no per-round `##M` line (`scripts/careers.ts` 218–250, 565–583). The `careers-by-round.txt` extract is the only place R6, R7 and UD survival appear.

Leave `~/Projects/gg-panels/9e74d34/` in place. A session attached to the Studio through Remote Control reads it there. For a cloud session that is not attached, attach the two `.log` files and the six extracts to the session.

## Wall time

Last three Studio panels with start and end times:

| commit | start | end | wall |
|---|---|---|---|
| `0f4702f` | 07:50 ET 2026-10-06 | ~15:12 ET | ~7 h 22 m (`docs/HANDOFF.md` 3494) |
| `977d578` | 21:36 ET 2026-10-08 | ~04:09 ET | ~6 h 33 m (2849) |
| `3f4e7a6` | ~18:49 ET 2026-10-11 | ~01:28 ET | ~6 h 39 m (2485) |

Since then the camp plays three preseason weeks a season, about +18% simulated games (`docs/preseason-games-design-2026-10-20.md` 146), and `determinism` plays the season and playoffs (#226). `trimIdentity` alone took 3 m on this VM, and the full tier runs it once per seed. Budget **8–9 h** per panel. No later panel printed a wall time, so this is an estimate, not a measurement.

Both at once on the 14-core Studio: every step is one child at a time (`scripts/gate.ts` 451–457, serial path; the flag is read at 262–267), so two panels use about two cores. Expect about 9–10 h for the pair. One after the other: 16–18 h. If the pair runs slower than 12 h, say so in the write-up, and run the next pair one after the other.

## What to read first — panel A (main)

Read these in this order. "Last" is the newest reading on record. Nothing here is a target to tune toward.

| metric | lock (`docs/baselines.json`) | last | what since `ddc62bd` can move it | what a reading means |
|---|---|---|---|---|
| `careers.survivalMae` | max 11 | 5.94, 2026-08-31 (`ROADMAP.md` 110) | #229: picks 18–224 now cost no guaranteed base on a cut, so late picks are cheaper to release | Up from 5.94 with R6/R7 rostered-y3 down = #229 doing what it says. Over 11 = FAIL; report it against #229. R1–R3 over-survive already (`ROADMAP.md` 110) |
| `careers.careerLenMae` | max 1.6 | 0.57, 2026-08-31 (`ROADMAP.md` 111) | Same | Same reading. "Must not be shortened" (111) is about R1/R2/R4 |
| careers BY ROUND, R4–R7 rostered y3 | §2.2 k=3: 70.7 / 65.2 / 53.6 / 38.1 | not recorded since 2026-08-31 | #229 | The first number to quote. It is what #229 moves and what the nudge acts on |
| `drift.deadMoneyPct` | none (OTC note ~5–8%, `nfl-reference.md` §4, lines 751–756; a published figure, "not a T/D/S/P computation") | 4.93–6.84, single-seed `drift 10 12345` (`HANDOFF.md` 429, 644, 679) | #229 lowers a minimum rookie's dead from $2.04M to $450K (`docs/playtest-1028-dead-if-cut.md`); #214 spends more | Report only. Do not add a band |
| `drift.medianPayrollPct` | 90.602 ±6 (84.602–96.602) | 96.46 at `65e1284`, a #214 branch panel (`ROADMAP.md` 105) | #214's spend back to the floor; #229 | 0.14 under the ceiling last time. Single-seed `drift 10 12345` reads have been 99.4–99.9 since #187 (`HANDOFF.md` 432, 646). A FAIL here is the #214 spend, not noise to widen |
| `drift.capBustSeasons` / `drift.minPayrollSeasonsUnder55` | max 0 / max 0 | — | #214, #229 | Any nonzero is a finding |
| `drift.p0Failures` | max 0 | 0 at `ddc62bd` | anything in offseason | The age-guard row at 15–16 of 20 is the known intermittent (`HANDOFF.md` 1689–1691). Under 15 is new |
| `calibrate.fgPct` | 86.029 ±4, floor 82.029 | 81.995, `calibrate.ts 300` on the pre-merge #222 head (`ROADMAP.md` 102) | #222 | Expected red. Already reported. Quote it; do not tune |
| `coherence` exit / `outlierExplainedPct` | per-seed min 85 (`scripts/coherence.ts` 336–339) | mean 87.65, seed 2 83.7 | #222 moves every game | One seed under 85 with a mean over 85 is the accepted pattern (`ddc62bd`, `89bca4d`, `99f1cae`). Two seeds under, or a mean under, is new |
| `statcheck.leadTackles` | 110 ±18 | 107 (seed 8675309, `HANDOFF.md` 52) | #222 | First 5-seed read of the tackle bend |
| `tails.milestonesOff` | max 16 | 11 (`tails.ts 16`, #222) | #222 | First 5-seed read |
| `determinism` | exit 0 | 4-core VM, 2 seeds, pass | #226 | First Studio read of the full-season replay |
| `useroffers` / `trimidentity` | literals | pass on this tree | — | Must pass. A red here on panel A is a build or Node difference, not the sim |

### Reds already accepted (`docs/ROADMAP.md` 98–115)

A reading in this list does not block anything. Quote it, compare it to the last value, and move on.

- `calibrate.fgPct` under 82.029: **reported red**.
- `coherence` one seed under 85, mean over 85: **noise**.
- `staff.leagueOvrDelta`: the cap is the panel mean, signed 2026-10-27 (#204). One seed over 1.2 is not a FAIL.
- `careers.path2BurnInTop10PrPct` under 7: **reported red**, k-of-n noise (6.03% = 7/116).
- `conditions.coldPointsDelta`: per-seed noise. The gate reads the panel mean.
- `drift.passRecordSeasons` 0 of 20: **accepted limitation**. The lock is max 3, so 0 passes.
- QB availability second moment: **accepted limitation**, not a gate line.
- `careers.survivalMae` and `careers.careerLenMae` above the ROADMAP goals (< 4, < 0.5) but under the locks (11, 1.6): **open**, not red.

Anything not on this list that fails is new. Write it up as `docs/gate-fail-9e74d34-<what>.md` before touching code.

## What to read — panel B against panel A

The nudge acts on who survives the cut. Read only these, in this order.

1. **The FAIL set.** Panel B must fail exactly what panel A fails, plus `FAIL  trimidentity  exited 1`. That one is expected: measured above at 1512 cuts and rng 204311492. `trimIdentity` uses seed 42 regardless of `GG_SEED`, so it is one line, five identical failing runs. `useroffers` must pass on both.
2. **`careers.survivalMae` and `careers.careerLenMae`.** Per-seed values from `*.metrics.tsv`.
3. **R6, R7 and UD rostered y3.** From `*.careers-by-round.txt`. Pool each round across the five seeds: sum `n`, and sum `n × pct`.
4. **`drift.capBustSeasons`, `drift.minPayrollSeasonsUnder55`, `drift.p0Failures`, `drift.medianPayrollPct`, `drift.deadMoneyPct`.** A different 53 is a different payroll.
5. **The steps that never reach a camp.** Only `careers`, `drift`, `staffcheck`, `sweep` and `verify` call `advanceOffseason` among the gate's harnesses (`grep -l advanceOffseason scripts/*.ts`; the other hits are censuses outside the gate). `determinism` plays the regular season and playoffs only (#226). So `calibrate`, `statcheck`, `rbpanel`, `leverage`, `tails`, `conditions`, `coherence`, `determinism` and `scout` should print the same `##M` values on A and B. A difference there means the variable reached something it should not; stop and write that up before reading anything else.
6. `staff`, `sweep`, `verify`: they walk offseasons, so they move with the stream. Read them for new FAIL lines only.

### Decision rule

Let `Δ = mean(B) − mean(A)` over the five seeds, and `SE = sqrt(sd(A)²/5 + sd(B)²/5)`. For a pooled round rate, use the two-proportion `SE = sqrt(p(1−p)(1/nA + 1/nB))` with `p` the rate pooled over both panels. That formula treats every drafted career as independent. They are not: careers within one seed share a league, its cap and its cut decisions, so the true SE is larger and the rule will call some noise "harm". This errs toward keeping the nudge off. A per-seed SE (round rate per seed, then the five-seed formula above) is the cluster-aware alternative; Matt picks one before the panels finish. `careers` does read `GG_SEED` (`scripts/careers.ts` 34, `scripts/metrics.ts` 66–67), so the five seeds are five leagues and `sd` is not zero.

The nudge **stays off** if any one of these holds:

- B has a FAIL line that A does not, other than `trimidentity exited 1`.
- `careers.survivalMae` rises by more than `2 × SE`, or `careers.careerLenMae` rises by more than `2 × SE`.
- Pooled R6 or R7 rostered y3 moves away from `nfl-reference.md` §2.2 (53.6% and 38.1%) by more than `2 × SE`. "Moves away" means `|p_B − ref| − |p_A − ref| > 2 × SE`. The reverse (B closer to §2.2) is **not** a reason to turn the nudge on: that would be choosing a design dial's setting because it lands nearer a target, which AGENTS.md "Check the target before you chase it" and the calibration freeze forbid. Closer is read as neutral.
- `drift.capBustSeasons`, `drift.minPayrollSeasonsUnder55` or `drift.p0Failures` is higher on B.

If none holds, the nudge **may** go on. That is Matt's call, not a pass. The panel cannot show the nudge makes the game more realistic, because no rate for it exists (see "Numbers this needs"). It can only show the nudge does not make `careers` or `drift` worse beyond what five seeds can resolve. A neutral read permits it on game-feel grounds: the user's own bubble players now have a camp that counts.

UD rostered y3 is **report only** in both directions. There is no traced target for it.

If A itself has a new, unexplained red in `careers` or `drift`, hold the nudge decision until that red is written up. The A/B comparison is still valid (same commit). Turning a dial on beside an unexplained red is how the cause gets lost.

## Proposed diff — only if Matt signs the nudge on

Nothing here is part of this protocol. It is what "on" means, so the sign covers it.

`lib/core/campGrade.ts` 34–37:

```diff
-/** On only when a harness asks for it. Ships off. */
+/** On unless a harness turns it off with GG_CAMP_NUDGE=0. Signed on <date>. */
 export function campNudgeOn(): boolean {
-  return typeof process !== "undefined" && process.env?.GG_CAMP_NUDGE === "1";
+  return !(typeof process !== "undefined" && process.env?.GG_CAMP_NUDGE === "0");
 }
```

and the header comment at 8–11 to match. The browser has no `GG_CAMP_NUDGE`, so this is the change players see. Today the browser is always off (35–37).

`lib/core/campGrade.test.ts`:

- `withNudge` (29–37) sets `"1"` or `"0"`. Deleting the variable now means on.
- Line 39 sets `process.env.GG_CAMP_NUDGE = "0"` instead of deleting it.
- Case (1) (41–46) becomes "ships on": with the variable unset `campNudgeOn()` is true; with `"0"` it is false and every `campNudge` is 0.
- Cases (4) and (5) keep their assertions under the new helper.

`lib/core/trimIdentity.test.ts`: re-lock `CUTS`, the count and `RNG_AFTER` (21) from the Studio build after the flip. On this VM that was 1512 cuts and rng 204311492. The 1512 ids are not copied here; regenerate them on the build that ships. This VM has diverged from the Studio before (`docs/panel-a76092b-investigation.md` 7).

No `docs/baselines.json` row moves. `CAMP_NUDGE_MAX` stays 3.

## Regression test plan

For the protocol: none. It runs the existing gate twice.

For the flip, if signed:

1. `npx tsx lib/core/campGrade.test.ts` passes with the variable unset (on) and with `GG_CAMP_NUDGE=0` (off).
2. `GG_CAMP_NUDGE=0 npx tsx lib/core/trimIdentity.test.ts` must fail against the new literal and reproduce the old 1600 / 2524091302. That proves the off switch still restores the old cut.
3. `npx tsx lib/core/userOffers.test.ts` passes with no edit. Tag `1779302491`, FA `1323223106`.
4. The 21 camp-walking tests listed above (the 18, plus `simTo`, `simToast`, `callSheet`) pass with the nudge on by default. `contractCeiling` must be run to completion.
5. One Studio `gate:full:serial` on the flip commit. Its FAIL set must equal panel B's, minus `trimidentity`.

## Gate, canaries

| item | panel A (off) | panel B (`GG_CAMP_NUDGE=1`) | if the flip is signed |
|---|---|---|---|
| `userOffers` seed 42, tag `1779302491` / FA `1323223106` (`userOffers.test.ts` 129, 133) | no move | **no move**, measured. No camp cut happens before the first `offseason-tag` | no move |
| `trimIdentity` seed 42 opening 2030, 1600 cuts, rng `2524091302` (`trimIdentity.test.ts` 21, 154–165) | no move, measured | **moves**: 1512 cuts, rng 204311492 on this VM. The 2027 cut leaves the parent rng at 1256537791 but changes 69 spots; the 2028 door already differs (584197202 against 1511180545) | re-lock required |
| `campgrade` | pass | pass, measured. The test sets its own env (`campGrade.test.ts` 39) | test rewritten as above |
| `careers.*` | first read since 2026-08-31 | moves with the cut and the stream | — |
| `drift.*` payroll and cap rows | first read since `65e1284` | moves with the cut | — |
| `calibrate`, `statcheck`, `rbpanel`, `leverage`, `tails`, `conditions`, `coherence`, `determinism`, `scout` | as main | should equal A: none of them walks an offseason | — |
| `staff`, `sweep`, `verify` | as main | stream moves after the first cut; read for new FAILs only | — |
| `docs/baselines.json` | untouched | untouched | untouched |

Does the proposal move the parent RNG before those points? Panel A: no; no code changes. Panel B: not before the `userOffers` points, measured. Before the `trimIdentity` point, yes: the nudged 2027 cut changes rosters, and every parent draw after it. The flip, if signed, moves `trimIdentity` the same way and leaves `userOffers` alone.

## Numbers this needs that `nfl-reference.md` does not have

- **How much preseason play changes who makes the 53.** No published rate (`campGrade.ts` 8–9). `CAMP_NUDGE_MAX = 3`, `SHRINK_SNAPS = 30` and `Z_CAP = 2` are design dials. The A/B can show harm, not realism. A primary source would be preseason snap and box data (nflverse `load_participation` or `load_pbp` filtered to `season_type == "PRE"`) joined to the week-1 53 from nflverse `load_rosters_weekly`. Not built. Ungated.
- **UDFA survival to season index 3.** §2.8 has 29.7% of undrafted rookies playing a game as a rookie, and the 11–12% starter share. Neither is `rosteredInYear(c, 3)`. nflverse `load_rosters` (`draft_number` missing, `entry_year`, `season`) for 2011–2023 would supply it. The UD row stays ungated, report only.
- **The cutdown trade and waiver market around the 53.** §1.2 has a post-draft-to-camp trade share. Nothing traces claims or trades in the cut window, and no harness emits one. A primary source would be the NFL transaction wire for the cut week. Ungated.

## Decisions for Matt

1. Run panel A on `9e74d34` as the main panel, with the commands above. Yes / no.
2. Run panel B (`GG_CAMP_NUDGE=1`) on the same commit, at the same time as A or after it.
3. The decision rule above (`2 × SE` on `survivalMae`, `careerLenMae`, pooled R6/R7 rostered y3; no new FAIL other than `trimidentity`; no rise in `capBustSeasons`, `minPayrollSeasonsUnder55`, `p0Failures`) as the bar for "may go on". Or name a different bar before the panels finish.
4. If the bar is met: flip `campNudgeOn` to on-by-default with `GG_CAMP_NUDGE=0` as the off switch, rewrite `campGrade.test.ts` case (1) and `withNudge`, and re-lock `trimIdentity` from the Studio build. Or keep it off.
5. UD rostered y3 stays report-only, with no band, until a §2.8 row for season index 3 is traced.
6. Refresh `docs/ROADMAP.md`: main is `9e74d34`, the unpanelled list adds #229, and the `trimIdentity` row is 1600 / 2524091302. Docs only, after panel A posts.
7. For the pooled R6/R7 rule, which SE: the two-proportion formula (treats careers as independent, stricter) or a per-seed SE across the five leagues (cluster-aware). Added by the 2026-11-11 review.

## Review (2026-11-11)

Adversarial pass against this tree (`9e74d34`, branch head `72ac945`). Every file:line cited above was opened. Only this file was edited.

**Corrected in place.**

- `docs/HANDOFF.md` 13 → **11** for the signed `trimIdentity` re-lock. Line 13 is the validation list; line 11 is the signed 1587 → 1600 entry.
- `docs/ROADMAP.md` line 100 → **101** for the stale `trimIdentity` row. Line 100 is the `userOffers` row.
- `surplusWorth` call sites: line 1903 is `worstSurplus`, which `moveWorstSurplus` calls at 1925; line 1914 is `cutWorstActiveAt`. The doc had said `moveWorstSurplus` sorts on it directly.
- #210 is not unread by the gate. It adds `lib/view/ownerPace.test.ts`, which runs as the `ownerpace` step (`scripts/gate.ts` 189). No sim harness reads it. The merge table now says it lists sim and harness files only, and that #222 also edited `docs/baselines.json` (the signed `leadTackles` retarget) and both canary tests.
- `drift.deadMoneyPct` recent reads: **4.93**–6.84, not 5.44–6.84 (`HANDOFF.md` 429 main column is 4.93). The OTC ~5–8% is now labelled as §4's published figure, "not a T/D/S/P computation" (`nfl-reference.md` 756). It stays report-only.
- `drift.medianPayrollPct` single-seed reads: **99.4**–99.9, not 99.2–99.9 (`HANDOFF.md` 432, 646: 99.86, 99.48, 99.46, 99.42).
- Serial-path citation: `scripts/gate.ts` 264 is only the flag parse. The one-step-at-a-time loop is 451–457.
- Triage grep: `NOISE` rows print indented (`scripts/gate.ts` 525), so `^NOISE` matched nothing. Changed to `^(FAIL|GATE|  (ok|FAIL|NOISE) )`.
- The 2027 "rng after cut" equality was described as "as designed". The nudge adds no draw by design. The refill drawing the same count is a measurement on seed 42, not a guarantee. Reworded.
- Camp-walking tests with the nudge on: added `simTo`, `simToast`, `callSheet`, which call `advanceOffseason` and were missing; all three exit 0 with `GG_CAMP_NUDGE=1` here. Regression plan item 4 now names 21 tests.
- Decision rule: defined "moves away from §2.2" as `|p_B − ref| − |p_A − ref| > 2 × SE`, and said that B landing closer to §2.2 is neutral, not a reason to flip. Choosing a dial's setting because it lands nearer a target is tuning toward a target. Added the clustering caveat on the two-proportion SE and Decision 7.

**Confirmed as written.**

- `campGrade.ts` 8–9, 26, 29, 32, 35–37, 64–68, 113–116. `GG_CAMP_NUDGE` is read nowhere else in `lib/` or `scripts/`, only in `campGrade.ts` and `campGrade.test.ts`. The env var cannot reach the play engine.
- `contracts.ts` 1660–1663, 1880–1883, 2116. `campNudge` returns 0 outside `offseason-final`, so in-season callers of `cutWorstActiveAt` and `upgradeRoster` are unaffected.
- `offseason/index.ts` 407–412; `preseason.ts` 26–34 (hash-keyed stream); `scripts/gate.ts` 278–279, 297, 303, 342, 350; `scripts/metrics.ts` 25–26; the `advanceOffseason` calls in `careers.ts` 184, `drift.ts` 151, `sweep.ts` 35, `verify.ts` 599; `careers.ts` 218–250 and 565–583 (no per-round `##M`). `grep -A10` on the BY ROUND bar catches the underline, header, R1–R7 and UD: exactly 10 lines.
- Among gate harnesses, only `careers`, `drift`, `staff` (`staffcheck.ts`), `sweep` and `verify` call `advanceOffseason`. `calibrate`, `statcheck`, `rbpanel`, `tails`, `conditions` and `coherence` build fresh leagues and stop at the end of the season or playoffs. `leverage` sims single games. `scout` drives the draft directly and never enters `offseason-final`. So the "should equal A" claim holds.
- The §2.2 k=3 values 70.7 / 65.2 / 53.6 / 38.1 match `nfl-reference.md` 279–282 and `careers.ts` 71–73. The §2.8 29.7% and 11–12% are at 496–499. The §1.2 post-draft-to-camp ~7% is at 91. The baselines quoted (`survivalMae` max 11, `careerLenMae` max 1.6, `medianPayrollPct` 90.602 ±6, `fgPct` 86.029 ±4, `coherence` min 85, `leadTackles` 110 ±18, `milestonesOff` max 16) match `docs/baselines.json`.
- Wall-time rows: `HANDOFF.md` 3494, 2849, 2485. The +18% is `preseason-games-design` 146.
- **Canaries.** `userOffers` walks seed 42 from `newGame` to the first `offseason-tag` (`userOffers.test.ts` 113–133). Phase order is recap → tag → fa → draft → final (`types.ts` 809–813). So no `offseason-final`, and no nudge, comes before either literal. The nudge cannot move tag `1779302491` or FA `1323223106`. `trimIdentity` with `GG_CAMP_NUDGE=1` was re-run here and fails at **1512 cuts against 1600**, matching the doc. Panel A and the protocol move neither canary. Panel B and the proposed flip move `trimIdentity` and not `userOffers`.
- Invariants. No dependency, backend or LLM is added. The nudge draws no RNG; its effect on the parent stream comes only through which players are cut. Invariants 2, 3, 4 and 6 are untouched: it reorders the cut valuation only. On invariant 7, `CAMP_NUDGE_MAX`, `SHRINK_SNAPS` and `Z_CAP` are design dials, already labelled untraced, and no new NFL rate is introduced. No baseline moves.

**Open: not settled by this review.**

- `contractCeiling` with the nudge on is still unfinished (the earlier 470 s timeout). It must complete before any flip.
- The 2027–2030 divergence table (doors, spot counts) was not re-measured. Only the 2030 endpoint (1512) was reproduced.
- The awk/grep extracts have never been run on a real Studio log.
- Wall time of 8–9 h per panel, and 9–10 h for a concurrent pair, is an estimate. Two serial gates at once on one Studio have not been timed.
- The two-proportion SE ignores clustering by seed (Decision 7).
- The flip diff makes the nudge live in the browser, where no player has had it. Its effect on a user's own camp cut was not exercised in `e2e`.
- `docs/ROADMAP.md` 90–91, 101 and 120 remain stale until Decision 6.
