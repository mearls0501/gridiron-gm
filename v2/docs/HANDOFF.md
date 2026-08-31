# HANDOFF — 2026-08-02

Where the build stands, what is still wrong, and what to do next. Read this
first, then `AGENTS.md`, then `docs/nfl-reference.md`.

---

## 2026-08-31 — late-round careers camp rope (branch `task/324-late-round-careers`)

The known-open 8.8 / 1.0 rows were stale. Measured current main first
(careers 24 / seed 12345), then diagnosed, then one function.

**Main, before any edit**

| rd | rostered y3 | real §2.2 | med | real |
|---|---:|---:|---:|---:|
| 1 | 100.0% | 94.4% | 9 | 8 |
| 2 | 97.1% | 89.5% | 8 | 7 |
| 3 | 89.6% | 79.6% | 7 | 7 |
| 4 | 79.2% | 70.7% | 6 | 5 |
| 5 | 61.2% | 65.2% | 5 | 5 |
| 6 | 45.6% | 53.6% | 2 | 4 |
| 7 | 34.1% | 38.1% | 1 | 2 |

`survivalMae` **6.81** (want < 4). `careerLenMae` **0.86** (want < 0.5).
`r1QbSharePct` 13.02. `draftSignal` 5.95. R1–R4 are too sticky; R6/R7 are
the leftover.

**Diagnosis (4 finalize classes, seed 12345).** Retirement is not the path
(`ret=0` on every year-0 class). UDFA-on-53 is ~1/club. `cutWorstSurplus`
is. R7 year-0 +8 (PR #8) already works — year-0 R7 survival ~86% vs real
75.4% — but those men are the first cut the next August when the extra
vanishes (`cutWorstSurplus` yp1 R7 = 35). R6 never got the bump and still
loses the 65-to-53 trim (`cutWorstSurplus` yp0 R6 = 38). `upgradeRoster`
is secondary. `spendToFloor` / `enforceCap` are not.

**Change.** `draftCapitalHold` only. Camp rope covers R7 years 0–1 (year-0
stays +8) and R6 years 0–2 (+5 decaying). `ROUND_HOLD` table, R1–R5,
`cpuResign`, `POSITION_VALUE`, and `CARRY_SHARE` untouched.

**After (same instrument)**

| rd | y3 | med |
|---|---:|---:|
| 6 | 45.6 → **50.0** vs 53.6 | 2 → **4** |
| 7 | 34.1 → **40.9** vs 38.1 | 1 → **2** |

`survivalMae` 6.81 → **5.94**. `careerLenMae` 0.86 → **0.57**. R1/R2
medians still 9 and 8. `r1QbSharePct` **10.16** (max 16). `draftSignal`
5.51 (min 2). `starterRateMae` 8.12 → 6.96 (max 8). Residue on
`careerLenMae` is R1/R2/R4 one–two seasons long — not this packet. MAE
cannot honestly go under 4 from a late-round-only hold while R1–R3 sit
5–10 points high.

File cluster: `v2/lib/core/offseason/contracts.ts` (`draftCapitalHold`),
the two known-open rows in `AGENTS.md`, this note. `baselines.json` not
moved.

### Gate (`nproc`=4)

Fast: all 8 harnesses exit 0. Four inherited `statcheck` single-seed reds
(`leadTackles` 129, `qb5` 4057, `rb5` 1291, `wr10` 1058) — byte-identical
to PR #8 / #9 / #11 / #13 / #14 on main. Not this packet.

**`npm run gate:full -- --seeds 2`:** all 14 harnesses exit 0.

```
FAIL  tails.milestonesOff  16.50  expected <= 16   known-open Poisson row; 2-seed noise around the 16.0 lock
FAIL  drift.saveMbAtEnd    10.51  expected <= 10.5  knife-edge +0.01; same family as #10's 10.53
FAIL  statcheck.qb5PassYds  4080  expected 4497 +/-360  inherited (same 4080 on #8)
FAIL  statcheck.rb5RushYds  1401  expected 1191 +/-95   known-open (same 1401 on #8)
```

Nothing else went red. No `careers.*` line in the FAIL list.

---

## 2026-08-31 — Season Review UI (branch `task/324-season-review`)

Presentation only. The Hub phase card advertised awards, retirements, and
development and then rendered nothing; the Season panel said "No games
scheduled" after the year was over. Progression already ran on Confirm
(`runRecap`); the recap surface was missing.

`presentSeasonReview` reads `history` when the year is archived, and otherwise
scores MVP / OPOY / DPOY / ROY / leaders with the same formulas as
`recordSeasonHistory` from the season lines already on the save. No writer,
no invented awards, no sim edits. Retirements come from this year's
`retires at` log entries (honest empty until Confirm writes them).
Development is year-over-year production, labeled as derived — OVR deltas
are not stored. `/recap` is the dedicated route. Hub short-roster copy
during `offseason-final` no longer reads like a cutdown when the club is
under 53.

File cluster: `v2/lib/view/seasonReview.ts`, `v2/components/SeasonReview.tsx`,
`v2/app/recap/page.tsx`, `v2/app/page.tsx`, this note. Nothing in the sim
cluster, `scripts/`, `baselines.json`, or `AGENTS.md`.

### Gate (`nproc`=4)

Fast: all 8 harnesses exit 0. Four inherited `statcheck` single-seed reds
(`leadTackles` 129, `qb5` 4057, `rb5` 1291, `wr10` 1058) — same numbers as
PR #8 / #11 / #13 / #14 on main. Not this packet.

`node scripts/e2e.mjs` against a built `next start` (`PW_CHROMIUM` = full
Chrome): **E2E PASSED**. Interact suite not run — no new controls, only
presentation and a recap link.

---

## 2026-08-31 — `r1QbSharePct` re-locked as a max (branch `cursor/relock-r1-qb-share-db93`)

Lead-authorized. `careers.r1QbSharePct` only. The two-sided 15.9 ±3.2 band
was a lie after PR #10: careers 30 / seed 12345 moved **15.1% → 11.6%**
toward nfl 10.3 (`nfl-reference.md` §2.4), and the 2-seed panel read
**9.77**, but both failed the floor. That band's ceiling (19.1) existed to
catch a relapse to 19.6. Honest shape is a `max`, not a new two-sided band
around 11.6. `npm run gate:lock` was not used.

New lock: `max: 16`, `nfl: 10.3`. 11.6 / 9.77 / ~10.3 pass; 19.6 fails.
Known-open row retired. Do not start the R1 QB never-start 22.4 vs 10.7
packet.

File cluster: `v2/docs/baselines.json` (this metric only), `v2/AGENTS.md`,
this note. Nothing in `v2/lib`, `draft.ts`, `POSITION_VALUE`, scouting,
contracts, generation, tests, or `careers.ts`.

### Gate (`nproc`=4)

Fast: all 8 harnesses exit 0. Four inherited `statcheck` single-seed reds
(`leadTackles` 129, `qb5` 4057, `rb5` 1291, `wr10` 1058) — byte-identical to
PR #8 / #9 / #11 / #13 on main. Not this packet. `careers` is full-tier only;
the recorded 9.77 / 11.6 sit under `max: 16` (gate fail is `value > max`).
Full tier not run; this packet does not re-measure careers.

---

## 2026-08-31 — `r1BustPct` leftover retired (branch `cursor/retire-r1bustpct-9ede`)

Docs only. The known-open `careers.r1BustPct` row in `AGENTS.md` still said
28% → ~15%. That chase is stale and is now struck, same convention as PR #12.

`isBust` is a first-rounder who never posted ≥9 GS in years 0–3. Current
main (careers 30 / seed 12345, recorded on the POSITION_VALUE packet) reads
**6.94%** against the traced `nfl-reference.md` §2.1 R1 St=0 of **6.3%**. The
~15% figure is untraced; it is the never-two-starter-seasons rate (weighted
1−St≥2 ≈ 14.3% from the same §2.1 bands), not this metric. Cuts, retirement,
and depth-chart stickiness are not the leftover.

The only cell still high is R1 QB never-start **22.4% vs 10.7%** (§2.5). That
is a 32-job incumbent packet, not this one. Do not start a sim change for it.
The `r1QbSharePct` band (15.9 ±3.2) was not re-locked.

File cluster: `v2/AGENTS.md` (the known-open row) and this note. Careers was
not re-run. `baselines.json` was not moved. Nothing in this packet can move
a number.

### Gate (`nproc`=4)

Fast: all 8 harnesses exit 0. Four inherited `statcheck` single-seed reds
(`leadTackles` 129, `qb5` 4057, `rb5` 1291, `wr10` 1058) — byte-identical to
PR #8 / #9 / #11 on main. Not this packet. Full tier not run; docs cannot
move a careers number.

---

## 2026-08-31 — week-0 League tab seeds (branch `cursor/week0-league-seeds-2802`)

The leftover was real and presentation-only. `/standings` League always ran
`computeSeeds` and painted the 14 green seed pills. At week 0 (and week 1
before kickoff) every club is 0-0, so the pills were the team-id tiebreak —
a made-up playoff picture.

`seasonHasResults` now gates that column: anyone with a W/L/T (live games
or an archived `history[].standings` table) still sees seeds. Empty records
do not. `computeSeeds` itself is unchanged. Conference cut-line and the
Playoffs page were left alone.

File cluster: `v2/app/standings/page.tsx` only.

### Gate (`nproc`=4)

Fast: all 8 harnesses exit 0. Four inherited `statcheck` single-seed reds
(`leadTackles` 129, `qb5` 4057, `rb5` 1291, `wr10` 1058) — same numbers as
PR #8 / #9 on main.

**`npm run gate:full -- --seeds 2`:** all 14 harnesses exit 0.

```
FAIL  tails.milestonesOff  16.50  expected <= 16   known-open Poisson row; 2-seed noise around the 16.0 lock
FAIL  drift.saveMbAtEnd    10.53  expected <= 10.5  knife-edge +0.03; not this packet
FAIL  careers.r1QbSharePct  9.77  expected 15.90 +/-3.2  leftover from #9; toward nfl 10.3
FAIL  statcheck.qb5PassYds  4080  expected 4497 +/-360  inherited (same 4080 on #8)
FAIL  statcheck.rb5RushYds  1401  expected 1191 +/-95   known-open (same 1401 on #8)
```

Nothing in this packet moved a number. Screenshots: week-0 League before
(green 1–7 pills on 0-0) / after (Seed column gone); week 9 League still
shows conference 1–7 from real records.

---

## 2026-08-30 — POSITION_VALUE on the CPU board (branch `cursor/position-value-r1-qb-c9f5`)

PR #9 was right: the leftover R1 QB gap is not `scouting.ts`. A true-BPA top 32
scored `(ovr − replacement) × POSITION_VALUE` is **21.3% QB** (40 classes, 5
seeds) against a real 10.3% (`nfl-reference.md` §2.4). No-PV true-OVR is 4.4%
QB, matching that finding. Actual CPU drafts sat near 15% only because need /
`startsHere` already suppress below the salary product.

`cpuBoardValue` now multiplies surplus by `√POSITION_VALUE` (QB ≈ 1.84× a
safety). The raw 3.4× salary table is unchanged — contracts, trades, FA,
generation, and the user board were not touched. Square root is the geometric
mean of the same table, not a fitted constant.

**Careers 30 seasons, seed 12345, n=576 mature R1** (same instrument as #7/#9):

| group | real §2.4 | main (#9) | after |
|---|---:|---:|---:|
| QB | 10.3% | 15.1% | **11.6%** |
| DB | 16.7% | 21.0% | 19.8% |
| DL | 24.5% | 24.3% | 20.0% |
| OL | 20.3% | 17.9% | **20.3%** |
| WR | 13.4% | 13.7% | 16.7% |
| LB | 7.7% | 3.8% | 4.9% |
| RB | 4.2% | 1.0% | 2.4% |
| TE | 2.7% | 3.1% | 3.6% |

`r1QbSharePct` 15.10 → **11.63**. `r1ShareMae` **2.22**. `r1BustPct` 6.94
(max 34). `draftSignal` 6.24 (min 2). R1 true OVR 72.4 (was 71.9).

DL is the cost — it was the one group sitting on the real rate and dropped
4.3pp. WR overshot by about the same amount. Net composition mae improved.
RB / LB / OL / DB all moved toward §2.4.

**Lead call, baseline not moved.** The locked band is 15.9 ±3.2, built to
catch a relapse to 19.6. 11.6 (and the 2-seed panel 9.77) fail the *floor*
while sitting on the `nfl` note. The honest shape is a `max`.
`starterRateMae` 8.30 vs max 8 on the 30-season seed did **not** fail on the
2-seed panel. Not chased.

### Gate (`nproc`=4)

Fast: all 8 harnesses exit 0. Four inherited `statcheck` single-seed reds
(`leadTackles` 129, `qb5` 4057, `rb5` 1291, `wr10` 1058) — byte-identical to
PR #8 / #9 on main.

**`npm run gate:full -- --seeds 2`:** all 14 harnesses exit 0.

```
FAIL  tails.milestonesOff  16.50  expected <= 16   known-open Poisson row; 2-seed noise around the 16.0 lock
FAIL  drift.saveMbAtEnd    10.53  expected <= 10.5  knife-edge +0.03; not diagnosed (draft scoring does not grow the save)
FAIL  careers.r1QbSharePct  9.77  expected 15.90 +/-3.2  THIS PACKET — toward nfl 10.3; two-sided lock
FAIL  statcheck.qb5PassYds  4080  expected 4497 +/-360  inherited (same 4080 on #8)
FAIL  statcheck.rb5RushYds  1401  expected 1191 +/-95   known-open (same 1401 on #8)
```

File cluster: `v2/lib/core/offseason/draft.ts` (`cpuBoardValue` only), plus
the known-open row in `AGENTS.md` and this note.

---

## 2026-08-28 — Poisson-interval verdict for `milestonesOff` (branch `task/312-poisson-milestones`)

The prescribed count-based verdict is in. `scripts/tails.ts` no longer compares
a quantized per-season rate to a ratio band. A category PASSES when the
observed count sits inside the central 95% Poisson interval for
λ = NFL rate × seasons.

**Measured 5-seed panel, 16 seasons each (seeds 1-5):** 15 / 14 / 18 / 15 / 18,
mean **16.0**, sd 1.87. `tails.milestonesOff` re-locked `max` 12 → **16** to
match the new meaning. No other baseline moved. No engine, generation, or sim
code was touched.

The rare-event floor is gone: 550+ pass yds, 300+ rush yds, 5,500+ pass yds,
50+ pass TD, and 23+ sacks all passed on this panel (one occurrence is inside
[0,2] or [0,3] at these λ). 1,900+ receiving yards failed 1 of 5 (seed 3,
count 4 vs [0,3]); 23+ sacks failed 0 of 5. Those two are **not claimed
fixed** — pooled 80-season evidence still has them at 2.25× and 3.12×.

What the new number actually is: the 95% interval is much tighter than the old
0.62–1.6 ratio band once λ is large, so common-rate misses that used to read
"ok" now count. Stable offs across all five seeds: 450+ pass yds, 200+ rush
yds, 3+ sacks (~31 vs 22, too common), 15+ tackles, 60+ yd FG (~3.2 vs 1.5,
too common), 4,500+ pass yds, 1,400+ rec yds, 150+ tackles. Do not tune the
play engine against 16.0.

**`gate:full --seeds 5` on 4 cores (72 min).** All 14 harnesses exit 0.
`tails.milestonesOff` is inside the new max of 16 (not in the FAIL list).
One metric red, the inherited known-open row:

```
FAIL  statcheck.rb5RushYds  1304  expected 1191 +/-95  (NFL ~1191)
```

Fast gate (single seed) still has the four inherited leaderboard reds
(`qb5` / `qb10` / `rb5` / `wr10`). None of those are this change.

---

## 2026-08-03 — FINALE: measurement repairs, panel, merge (branch `task/311-finale`)

**`gate:full --seeds 5`: all 14 harnesses exit 0.** Two metric reds, both
documented known-open rows, so acceptance holds and the chain was merged.

```
FAIL  tails.milestonesOff  20.80   known-open row (Poisson repair NOT done — see below)
FAIL  statcheck.rb5RushYds  1304   known-open row
```

### Repairs

- **`drift.ts` save-growth threshold 0.4 → 0.45**, matching the panel-locked
  `max: 0.45` baseline, which is the authority. The harness had been counting a
  P0 for a reading the locked number called fine. `drift` now exits 0.
- **`leverage.ts` zero boundary**: a swing that rounds to 0.0 at the precision
  the harness REPORTS is NO EFFECT and can never be WRONG SIGN. `OT.sta`
  against sacks taken sat exactly there and oscillated between the two
  classifications across seeds on unchanged code.

### Poisson verdict — done in task/312

The count-based Poisson-interval repair specified below was **not** done in
this session. It landed 2026-08-28 on `task/312-poisson-milestones` (panel
16.0). Pooled evidence still says only two rare categories are genuinely
elevated — 1,900+ receiving yards at 2.25x and 23+ sacks at 3.12x.

### `careers` deltas, 24 seasons x 5 seeds (what 310b could not capture)

| metric | value |
|---|---|
| `careers.survivalMae` | 4.56 |
| `careers.careerLenMae` | 1.06 |
| `careers.r1BustPct` | 18.39 |
| `careers.r1QbSharePct` | 15.62 |
| `careers.r1ShareMae` | 3.10 |
| `careers.starterRateMae` | 5.12 |
| `careers.draftSignal` | 4.67 |
| `careers.draftedCareers` / `matureCareers` | 2,688 / 8,154 |

All nine inside their guards.

### Known-open table reconciled

Retired: `drift.saveGrowthMbPerSeason` (threshold conflict resolved). Recorded
as ACCEPTED LIMITATIONS with citations: the single-season passing record is
unreachable (§5.8 — the top-5 volume that would close it cannot be bought
without inflating the rushing tail, and `min: 1` was withheld), and QB
availability's 16+ share is 5 points light (§6.8B — `WEEKLY_TABLE` is shared
across positions). The three 2026-07-30 decisions are formally ratified.

---

## 2026-08-03 — top-end spread FINISHED (branch `task/310b-top-finish`, NOT merged)

**Every leaderboard floor is green, at 60 seeds and on the 5-seed panel.** One
of the two remaining components was fixed; the other was measured and found to
be a closed door, exactly as the brief's off-ramp anticipated.

### Component 2 first, because it decided the shape of the packet

The escape from task/309's run-share coupling was that real run-heavy clubs
might SPREAD their extra carries. **They do not.** 17-game era, n=128
team-seasons, quintiles by team carries: lead-back share runs 57.8 / 59.4 /
58.1 / 60.2 / **56.3**, **corr −0.015**, slope −0.36 points per +100 carries
(§5.8). There is no curve to implement — a club that runs 140 more times gives
its lead back the same ~58%, he just gets more. So the coupling cannot be
decoupled honestly, team pass spread stays short (sd 34-39 against a real 60),
and the top-5 volume gap (538-562 attempts against a real 578-596) is accepted
as the brief allowed.

### Component 1 — the passer gradient (§5.9)

`armQuality` was `0.865 + q/520`: a **5% span across the entire QB
population**. It now carries an extra slope centred on the middle of the
starting population, `+ (q - 70) * 0.0040`, so an elite arm gains what a
replacement arm sheds.

| metric (60 seeds) | task/308 | + `sepEdge` | **+ gradient** | band |
|---|---|---|---|---|
| `qb5PassYds` | 4,057 | 4,037 | **4,156** | floor 4,137 ✓ |
| `qb10PassYds` | 3,678 | 3,683 | **3,754** | floor 3,706 ✓ |
| `wr10RecYds` | 1,081 | 1,103 | **1,115** | floor 1,111 ✓ |
| `qb20PassYds` | 3,040 | 3,089 | **3,076** | real 3,046 ✓ |
| `leadPassYds` | 4,604 | 4,609 | **4,742** | real 5,024, in lock ✓ |
| `rushers1700` | 0.2 | 0.45 | **0.28** | real 0.57 ✓ |
| `rb5RushYds` | 1,312 | 1,334 | **1,329** (panel 1,304) | still high |

**One honest deviation from the brief:** it asked for a steepening under which
`calibrate.passYds` does not move, and it moved **234.59 → 237.98** (+1.4%).
Attempt-weighting is why — a gradient centred on the unweighted mean arm is
still net-positive because better quarterbacks take more of the attempts.
Centring on the attempt-weighted mean (~72.5) would hold the league exactly and
costs ~1.4% off every rank, which puts `qb5PassYds` back under its floor. The
value is well inside its lock and is closer to the locked target than what it
replaced, though further from the `nfl: 230` note. Written up in §5.9 rather
than hidden.

### Verification — `gate:full --seeds 5`

13 of 14 harnesses exit 0, including **`calibrate` 28/28**, `statcheck`
(no leaderboard failures at panel precision), `tails` (so
`bestSeasonPassYds` is inside 5,392 ±500), `careers`, `staff`, `leverage`,
`conditions`, `coherence`, `verify`, `determinism`, `sweep`, `scout`.

```
FAIL  drift.p0Failures     0.60   save growth vs drift.ts's internal < 0.4
FAIL  tails.milestonesOff  20.80  reported for the verdict-redesign session
FAIL  statcheck.rb5RushYds  1304  reported, not chased
```

`drift.p0Failures` is the inherited threshold conflict, unchanged in nature:
`baselines.json` gates save growth at `max: 0.45` and `drift.ts` at `< 0.4`
internally. Still a lead call, still untouched.

### The record tail — `min: 1` NOT added

With the top restored, the reconditioned `drift.passRecordSeasons` **still
reads 0 of 20**. Per the brief that is report-only, and the authorized
addition was withheld. The single-season leader averages 4,742 against a
record of 5,477 — about 700 short — and what would close it is the top-5
volume that §5.8 just showed cannot be bought honestly. §6.4's floor remains
unmet and the guard still passes for the wrong reason.

### Gap in this report

`careers` passed all 9 metrics on the panel but the gate prints per-metric
values only for FAILING steps, and a standalone `careers 24` across 5 seeds is
~35 minutes I did not have. Deltas not extracted — the pass/fail is verified,
the numbers are not in hand.

---

## 2026-08-03 — top-end spread: DECOMPOSED, one mechanism fixed, NOT closed (branch `task/310-top-spread`, NOT merged)

**Stopped cleanly at a verified boundary, short of the packet's acceptance
criteria.** Step 1 is complete and decisive. Step 2 is partial: one of the
three components is found and fixed, the other two are measured and specified.
Steps 3 and 4 were NOT reached — no `min: 1` was added to the record guard, and
no 5-seed panel was run, because the state does not warrant the 55 minutes.

### Step 1 — the decomposition (complete, `nfl-reference.md` §5.7)

**Volume is exonerated; this is entirely per-play production.** Sim against
real, 3 seeds × 3 seasons:

| | sim | real |
|---|---|---|
| passing #10 attempts | 520 | **520** |
| passing #20 attempts / YPA | 440 / 7.02 | **439 / 7.04** |
| receiving #5 / #10 targets | 144 / 136 | **145 / 137** |
| passing #10 YPA | 7.29 | 7.79 |
| receiving #1 yds/target | 8.43 | 9.82 |

Attempts and targets are exact at every rank the guards touch. The shortfall
grows with rank — receiving is −8.6% at #10 and −14.2% at #1 — which is a
gradient too flat, not a level too low:

| gradient | sim | real |
|---|---|---|
| passing YPA span, 1-5 → 11-20 | 4.0% | **9.3%** |
| passing #5 / #20 | 1.326 | **1.476** |
| receiving #1 / #10 | 1.357 | **1.443** |

### Step 2 — one component fixed, mean-preserving

**Air yards depended on the passer's arm and on nothing about the receiver.** A
man who beat his corner all afternoon was thrown the same route as one who
could not get open; his only edges were catch rate and run-after. `sepEdge` in
`passPlay` now scales air yards by his separation against the coverage he
faces, centred on a neutral matchup — so it widens the elite-to-replacement gap
without moving a league mean (`calibrate.passYds` 234.05 → 234.59).

**Honest effect at 60 seeds**, which is the only precision that can see these
(§6.8C):

| metric | task/308 | task/310 | band |
|---|---|---|---|
| `wr10RecYds` | 1,081 | **1,103** | floor 1,111 — still LOW |
| `qb5PassYds` | 4,057 | 4,037 | floor 4,137 — still LOW |
| `qb10PassYds` | 3,678 | 3,683 | floor 3,706 — still LOW |
| `qb20PassYds` | 3,040 | 3,089 | OK |
| `leadPassYds` | 4,604 | 4,609 | OK |
| `rb5RushYds` | 1,312 | 1,334 | HIGH (reported, not chased) |
| `rushers1700` | 0.2 | 0.45 | max 2, OK |

The receiving gradient moved 1.357 → **1.413** against a real 1.443, so the
mechanism is real. It is also clearly not sufficient. **A 4-season instrument
run overstated it badly** (it showed pooled 1-5 YPA 7.49 → 7.84); the 60-seed
sweep is what should be believed, and the lesson is the one §6.8C already
records for `qb20PassYds` — do not read these ranks off small samples.

### What the finishing packet must do, both components measured

1. **The passer's own gradient.** `armQuality` is `0.865 + q/520` — about **5%
   across the whole QB population**. That is why a receiver-side fix moved
   receiving and left `qb5`/`qb10` untouched. Steepen it, re-centred on the
   population mean exactly as `sepEdge` was, or league passing yards move.
2. **Team pass volume at the very top.** Sim top-5 passers throw 538-562
   against a real 578-596, because team pass-attempt sd is 34-39 against a real
   60. This is the spread task/309 tested and correctly reverted — widening
   `coach.passBias` widens the run share through the same mix lever and took
   `rushers1700` 0.8 → 1.4. **A mechanism that widens PASS volume without
   widening run concentration has not been found, and `qb5PassYds` cannot be
   closed without it**: it is a −10% gap at that rank and efficiency alone does
   not reach it.

### Not done

- **Step 3 not reached.** `drift.passRecordSeasons` was not re-measured and no
  `min: 1` was added. The record needs the top restored first, and it is not.
- **Step 4 partial.** Fast gate run (5 single-seed reds, all inherited floors
  plus noise); 60-seed sweep done and reported above; **no 5-seed panel, no
  `careers` deltas, no `milestonesOff` reading.** Running a 55-minute panel to
  document a state that misses its acceptance criteria is not a good use of it.

The `sepEdge` change is kept rather than reverted: it is mechanism-honest, it
is mean-preserving by construction, and it moves the receiving gradient
measurably toward reality. It is one third of a fix, labelled as such.

---

## 2026-08-03 — record guard reconditioned + QB availability closed (branch `task/308-qb-close`, NOT merged)

Two approved fixes, both landed. **`statcheck.qb20PassYds` is green for the
first time in this lineage.** The reconditioned record guard, meanwhile,
uncovered something worse than the bug it fixed.

### 1. `drift.passRecordSeasons` — reconditioned, and it reads ZERO

The guard read each season's stat line at `offseason-recap`, after
`playoffs.ts` had written into it, so it compared REG + POST passing yards
against Manning's REG-only 5,477 (5,316 with playoffs against 4,735 without, on
matched seasons). `drift.ts` now snapshots the three single-season marks at the
end of the regular season; everything else, `playerWeeksLost` included, is
still read exactly where it was, so no other metric's basis moved.

| | inflated | reconditioned |
|---|---|---|
| 5-seed panel, 20 seasons each | 5.0 of 20 | **0.0 of 20** (every seed) |

**§6.4 says zero is as wrong as the record falling every other year, and it
means the 5,477-yard season is unreachable. It is.** The sim's best REG passing
year is ~4,600-4,700, about four sd short. This is the flat-elite-production
defect that also has `qb5PassYds` and `qb10PassYds` under their floors —
top-to-mid ratio 1.23x against a real 1.48x — and it is NOT an availability
problem. It already has its own packet.

`max` moved 10 → **3**, taken from §6.4's discipline rather than from the
sim's reading, computation in `nfl-reference.md` §6.8A. **A `min: 1` was
deliberately NOT added**: it would red-gate a defect that belongs to another
packet. Until that packet lands, this guard passes for the wrong reason, and
that is written into the baseline's own note so nobody reads the green line as
a healthy tail.

### 2. QB availability, era-matched — one group refitted

§6.6 established that §6.5's blended column understates a 17-game target.
Against the era-matched real figure (nflverse weekly 2021-2024, QB1 = his
club's attempts leader, n=128):

| | real 17-game | before | after |
|---|---|---|---|
| mean games of 17 | **14.23** | 15.11 | **14.27** |
| games missed | 2.77 | 1.89 | **2.73** |
| played all 17 | 32% | 50% | **36%** |
| 16+ | 46% | 59% | 41% |
| under 14 | 35% | 27% | 42% |

`POSITION_RISK.QB` 0.98 → **1.62**, `POSITION_DURATION.QB` 2.0 → **1.78**,
fitted jointly on §6.5's two moments, QB only — no other group touched. The
mean and the all-17 share land; the 16+ share comes in 5 points light because
`WEEKLY_TABLE` is shared across positions and only scales, so "hurt rarely, out
long" cannot be expressed without a per-position table. Recorded, not tuned
around (§6.8B).

**Both required guards hold:** week-1 starters' weeks lost **1,120** (band
1,100-1,250), `drift.playerWeeksLost` **2,745.9** (max 2,858). The third
required guard — the reconditioned record guard at ≥1 of 20 — was **already 0
before this refit** and is unaffected by it; it cannot be satisfied by
availability work in either direction.

### 3. `statcheck.qb20PassYds`, both precisions

| | 5-seed panel | 60 seeds |
|---|---|---|
| task/309 (inherited) | 3,293 | 3,293 |
| **task/308 (here)** | **2,953** | **3,040** |
| real | — | **3,046 ±244** |

Green at both precisions. The panel and the 60-seed sweep differ by 87 yards on
identical code, which is the point: 60-seed sd is 154, paired sd across a
change is 194, so the panel's SEM is ±70. Recorded in §6.8C. Per-seed panel
values: 2,684 / 3,018 / 3,111 / 3,083 / 2,871.

Three packets closed this: within-game rotation (task/307), real play volume
(task/309), era-matched availability (here). Row retired in AGENTS.md.

### 4. Everything else, reported not chased

Fast gate: 12 of 14 green — `calibrate` 28/28, `verify`, `determinism`,
`sweep`, `leverage`, `scout` all clean. Two reds, both inherited and both
expected per the packet brief:

```
FAIL  statcheck.rb5RushYds  1338 (60-seed 1,312)   ceiling 1286
FAIL  statcheck.wr10RecYds  1009 (60-seed 1,081)   floor 1111
```

The known unmasked defect, at 60 seeds: `qb5PassYds` **4,057** (floor 4,137),
`qb10PassYds` **3,678** (floor 3,706), `wr10RecYds` **1,081** (floor 1,111).
The QB refit pushed these down as the brief said it would; that is the
elite-production packet's to fix.

**One thing got worse and needs a lead call.** `drift.saveGrowthMbPerSeason` is
**0.402**, against a locked `max: 0.45` (fine) but `drift.ts`'s own internal
`growth < 0.4` (not fine) — so 4 of 5 seeds count a P0 and `drift` exits 1,
where task/309 had 1 of 5. The cause is legible and is the mechanism the row
always predicted: task/309's receiver carries gave WR/TE rows non-zero rushing
fields, and this packet's QB refit logs more absences. The two thresholds
disagree with each other by 0.05 MB and one of them should move. Untouched
here — it is neither of my two scoped items.

---

## 2026-08-03 — the play economy (branch `task/309-play-economy`, NOT merged, NOTHING re-locked)

**Both §5.4/§5.5 defects are fixed and hit their targets. The cost is that
cutting 2.2% of the league's plays deflates every individual leaderboard, and
three locked floors now fail. That is the re-lock decision this branch exists to
inform — it is Matt's, and nothing here was re-locked.**

Branched off `task/306-carry-share`: **`task/308-qb-close` does not exist**,
locally or on the remote, so the tip of the 307→306 lineage was used instead.

### What was built

All three mechanics are measured against `nfl-reference.md` **§5.6**, written
first from nflverse play-by-play 2021-2024 and validated against the completely
separate weekly file used by §5.3-§5.5 — the two reconcile exactly (62.90
plays/team-game against 62.89; 26.17 rushes + 0.761 kneels = 26.93 carries
against 26.93; 33.41 passes + 0.126 spikes = 33.54 against 33.54).

- **Receiver carries.** Jet sweeps and end-arounds, 3.9% of designed non-QB
  runs, the ball-carrier drawn by SPEED from the receivers the depth chart
  already has on the field (invariant 3 — nothing sorts on overall).
- **Kneel-downs.** Victory formation: a lead, the ball, fourth quarter, and 112
  seconds or less. Credited as a QB rush for −2..0 yards, which is what puts it
  in his line the way a real one is.
- **Clock.** The incompletion and sack runoffs were transplanted exactly from
  the measured values (5-9 → 3-7, real mean 5.0; 29-39 → 31-45, real 38.1). The
  run runoff is the free parameter fitted to the aggregate — 23-38 → 25-40 —
  and §5.6 records why it cannot simply be set to the measured 35.7: the engine
  charges nothing for the 21.4-second gap before a punt snap and models no
  clock stoppages, so transplanting every row lands the sim at 60.0 plays.

**Stream discipline.** All new draws come off a per-game child stream
(`econRng`, seeded by one parent draw in `simulateGame`), so the number of
decisions these mechanics make can never move the parent stream.

### The play economy, before and after (3 seeds × 3 seasons, n=4,896 team-games)

| | before | after | real (§5.6) |
|---|---|---|---|
| scrimmage plays / team-game | 64.30 | **62.92** | **62.90** |
| seconds / play | 28.0 | **28.6** | **28.6** |
| drives / team-game | 10.99 | 10.76 | 10.87 |
| plays / drive | 5.85 | 5.85 | 5.79 |
| RB carries (share) | 24.00 (87.4%) | **22.2 (81.7%)** | 21.74 (80.7%) |
| QB carries (share) | 3.15 (11.5%) | **3.91 (14.4%)** | 4.24 (15.7%) |
| WR carries (share) | 0.05 (0.2%) | **0.79 (2.9%)** | 0.83 (3.1%) |
| TE carries (share) | 0.03 (0.1%) | **0.13 (0.5%)** | 0.11 (0.4%) |

Two residuals, both reported not chased: the sim's jet sweep gains **4.2 yards
against a real 5.86** — the engine's run model is an interior-run model and
gives the perimeter nothing — and non-kneel QB carries are 2.9 against a real
3.48.

### Every calibrate metric — 24 seeds, before → after

**No calibrate metric left its band, and almost all moved TOWARD their `nfl`
note.** This is the opposite of what the packet expected, and it means the
calibrate re-lock the task anticipated is NOT required.

| metric | target ±tol | nfl | before | after |
|---|---|---|---|---|
| plays | 63.89 ±3 | 63 | 63.93 | **62.58** |
| passYds | 240.29 ±12 | 230 | 240.22 | **234.05** |
| rushYds | 119.79 ±10 | 115 | 119.97 | **114.99** |
| passAtt | 34.77 ±2.5 | 34 | 34.77 | **33.87** |
| rushAtt | 26.86 ±2.5 | 26 | 26.86 | 26.48 |
| ypc | 4.46 ±0.35 | 4.3 | 4.47 | **4.34** |
| pts | 23.14 ±1.6 | 22.5 | 23.37 | **22.73** |
| sacks | 2.26 ±0.45 | 2.4 | 2.30 | 2.23 |
| cmpPct | 66.72 ±2.5 | 65 | 66.57 | 66.46 |
| passTd / int | 1.60 / 0.77 | 1.5 / 0.8 | 1.63 / 0.78 | 1.56 / 0.76 |
| rushTd | 0.94 ±0.2 | 0.9 | 0.96 | 0.93 |
| firstDowns | 19.59 ±2 | 20.5 | 19.52 | 18.94 |
| punts | 3.35 ±0.9 | 4.2 | 3.38 | 3.35 |
| thirdDownPct | 37.94 ±3 | 39 | 38.10 | 38.27 |
| turnovers | 1.36 ±0.28 | 1.3 | 1.36 | 1.33 |
| fumbles | 1.21 ±0.3 | 1.3 | 1.20 | 1.17 |
| penalties | 6.53 ±1 | 6.2 | 6.47 | 6.23 |
| fgPct | 86.03 ±4 | 85 | 85.68 | 85.14 |
| fourthDownAtt | 1.66 ±0.5 | 1.9 | 1.70 | 1.65 |
| redZoneTdPct | 60.04 ±7 | 55 | 61.46 | 60.93 |
| topMinutes | 30.17 ±0.6 | 30 | 30.16 | 30.17 |
| **qbRushYds** | 17.21 ±8 | **13 (wrong)** | 16.91 | **15.68** |
| seasonPfg | 22.32 ±1.6 | 22.5 | 22.16 | 21.52 |
| seasonYdsPerGame | 350.38 ±22 | 340 | 348.00 | **336.81** |
| seasonPfgSpread | 19.38 ±7 | 15 | 19.55 | 19.13 |
| scoreMismatches | 0 | — | 0 | **0** |

`qbRushYds` moved from 16.91 to 15.68 against a **real 18.7** (§5.5) — away from
reality, toward the `nfl: 13` note that §5.5 already showed to be wrong. Kneels
subtract, as the packet predicted. The baseline is untouched; the note is the
thing that is wrong.

### Where it costs — 5-seed panel, `gate:full --seeds 5`

13 of 14 harnesses exit 0. `drift` exits 1. Eight metric failures:

```
FAIL  drift.p0Failures        0.20   save growth +0.4002 vs drift.ts's internal < 0.4
FAIL  leverage.wrongSign      0.20   OT.sta -> sacksTaken, measured effect +0.0
FAIL  tails.milestonesOff       25   was 16.4
FAIL  statcheck.qb5PassYds  4062.4   floor 4137
FAIL  statcheck.qb10PassYds 3697.4   floor 3706
FAIL  statcheck.rb5RushYds  1320.4   ceiling 1286   (was 1455 -> 1432 -> 1320)
FAIL  statcheck.wr10RecYds  1065.2   floor 1111
```

**`rb5RushYds` went 1,455 → 1,320** (24-seed sweep: 1,398 → 1,307), against the
~1,290 the packet predicted. Still 34 over its ceiling, not forced.
`drift.passRecordSeasons` improved 7.0 → **5** of 20 and `playerWeeksLost` 2,775
→ 2,641.

**Two of the failures are not what they look like:**

- **`leverage.wrongSign` is the knife-edge probe task/307 already flagged.**
  `OT.sta` against sacks taken reads **2.4 vs 2.4, +0.0** — the effect is zero
  at the harness's resolution, and it is being classified as WRONG SIGN on one
  seed where the parent branch classified the same probe as NO EFFECT on three.
  Matched seeds 1-5, wrongSign before 0/0/0/0/0 and after 0/0/0/0/1, while
  noEffect goes 0/0/1/1/1 → 0/1/0/0/0. Same probe trading categories. This is
  the "guard whose noise exceeds its tolerance" pattern; re-conditioning it is
  a design decision.
- **`drift.p0Failures` is save growth crossing a threshold the baseline itself
  puts elsewhere.** Growth went 0.3963 → **0.4002** MB/season (+0.9%) — one of
  five seeds over `drift.ts`'s internal `< 0.4`, while `baselines.json` gates
  the same quantity at `max: 0.45` and the known-open row says to act only if
  it crosses 0.45. The cause is mine and is legible: receiver carries give WR
  and TE rows non-zero rushing fields the save codec must now store.

**The other four are one finding, not four.** Cutting 2.2% of plays takes 3-4%
off the top of every individual leaderboard, and three floors were close enough
to catch it: qb5 4,284 → 4,144 on 24 seeds (4,062 on the panel's five), qb10
3,978 → 3,860 (3,697), wr10 1,104 → 1,080 (1,065). Note `wr10RecYds` was
**already below its floor before this change** on a 24-seed sweep (1,104 against
1,111) — the row AGENTS.md retired as "green on a 5-seed panel" is seed-lucky,
and a wider sweep does not support the retirement. `tails.milestonesOff` 16.4 →
25 is the same arithmetic from the other side: with fewer plays, categories that
were TOO COMMON become TOO RARE, and the guard counts both.

**None of this was chased and no baseline was touched.** Compensating for a
measured, primary-sourced 2.2% volume cut by inflating per-play production would
trade a measured error for an unmeasured one.

### What the re-lock decision has to weigh

The engine now matches the real play economy on every structural figure §5.6
pins. The locked leaderboard bands were set when the league ran 2.2% hot, so
three of them now sit just above where the sim can reach. Either the bands move
with the level (they are all `target`/`tol` regression bands, not primary-source
claims — the `nfl` values sit INSIDE the new readings for qb5 and qb10), or the
volume cut is judged not worth the leaderboard cost and this branch is dropped.
`statcheck.qb20PassYds` did NOT tick down as the packet expected (3,298 → 3,293
on 24 seeds), which is worth understanding before deciding.

---

## 2026-08-03 — the backfield split: measured, NOT changed (branch `task/306-carry-share`)

**No engine change. The dials this packet was opened to cut are already
right, and cutting them would have introduced an eleven-point error.**

The packet was to bring the sim's lead-back share from 58.1% down to §5.3's
47.4% and take `statcheck.rb5RushYds` green with it. Before touching a dial I
checked the target, per AGENTS.md, and the two numbers are not measuring the
same thing.

**§5.3's 47.4% is a share of TEAM carries. `CARRY_SHARE` and
`script.leadBackShare` divide RB carries.** Real clubs give RBs only 80.7% of
their carries — quarterbacks take 15.7% and receivers 3.1% (§5.5, computed this
session from the same nflverse rows, pipeline validated by reproducing §5.3's
rushing row exactly first).

Measured three ways, all on 3 seeds × 4 seasons, REG only, n = 384 team-seasons:

| | sim | real 17-game era | verdict |
|---|---|---|---|
| lead RB share **within one game** — what the dials set | **68.4%** | **70.4%** | sim slightly LOW |
| lead RB **season** share of RB carries — like-for-like | **59.7%** | **58.3%** | +1.4pp, ~1 SEM |
| lead rusher season share of TEAM carries — §5.3's row | **52.2%** | **47.3%** | +4.9pp |
| RB carries as a share of team carries | **87.5%** | **80.7%** | **the whole gap** |

The shares compose exactly on both sides — 0.597 × 0.875 = 52.2% for the sim,
0.583 × 0.807 = 47.2% for the real league — so the entire §5.3-basis gap is the
RB share of team carries, not the backfield split. **Cutting the dials to hit
47.4% on the RB denominator would have driven the per-game share to roughly 55%
against a real 70.4%, and the season share to 47% against a real 58.3%.**

**Where `rb5RushYds` actually comes from.** The sim's leading back takes 13.5%
more carries than his real counterpart, and it decomposes multiplicatively:

| factor | ratio | share of the excess |
|---|---|---|
| RB share of team carries (87.5% against 80.7%) | 1.084 | **62%** |
| league scrimmage play count (§5.4, +2.2%) | 1.022 | 16% |
| backfield concentration (59.7% against 58.3%) | 1.024 | 18% |

The RB rushing leaderboard is high all the way down and worse in the middle —
#1 1,774 against a real 1,732, #3 1,442 against 1,332, #5 1,332 against 1,222,
#10 1,176 against 1,032 — which is the same fat-middle shape §5 describes for
passing, and it is not a concentration problem.

**What the next packet is.** Non-RB carries: the sim gives 12.5% of team
carries to somebody other than a running back against a real 19.3%, and every
one of them is the quarterback — there are no receiver carries in the engine at
all (real 0.83 a game at 5.86 a carry) and no kneel-downs. Note the sim's QBs
already out-rush real ones per game, so this is a carry-count question rather
than a yardage one: real QB rushing is 4.24 carries at 4.42 ypc, the sim's is
about 3.4 at 5.1. That is a play-mix change with its own design, not a dial.

**Not done, deliberately:** `statcheck.rb5RushYds` stays red at ~1,432 on the
5-seed panel. Nothing in the two dials this packet owns can fix it honestly.
**The `statcheck.rb5RushYds` row in AGENTS.md still says the sim's 58.1%
sits against a real 47.4% and that `CARRY_SHARE` is safely tunable — that
sentence is wrong on the denominator and should be corrected, but retiring or
rewriting a known-open row is a lead edit, so it is left as-is and flagged
here.**

**Verification.** No source file changed, so the branch behaves exactly as
`task/307-qb-volume`: `npm run gate` (fast) reproduces the same three failures
it inherits (`leverage.noEffect` 2, `rb5RushYds`, `wr10RecYds` — the latter two
single-seed artifacts of the fast tier), `drift 20` and `statcheck` were swept
across 3 seeds and match the parent branch.

---

## 2026-08-02 — QB pass volume, session seven (branch `task/307-qb-volume`)

**One engine change shipped, one candidate tested and reverted, three findings
recorded.** The residual on `statcheck.qb20PassYds` (3,413 against 3,046 ±244)
was instrumented against all three candidates before anything was edited.

**Measurement method.** A throwaway harness ran 3 seeds × 4 seasons (12 league
seasons, REGULAR SEASON ONLY) and dumped team-season and per-game passer
structure; the real side is `nfl-reference.md` §5.4/§5.4b, computed the same
day from nflverse and validated by reproducing §5.3 exactly before use. Effect
sizes were then measured with `statcheck` swept over **60 seeds** (5 seconds a
sweep — it is one season) because the 5-seed panel's SEM on `qb20PassYds` is
about ±85 and cannot resolve a 100-yard change.

**Measure the regular season.** Playoff games write into the same season stat
line (`applyGameStats` is called from `playoffs.ts`), so a harness that advances
to `offseason-recap` before reading `p.stats` is reading REG + POST. On the same
12 seasons the best passing season reads **5,316 including the playoffs and
4,735 without**. `statcheck` stops at the end of the regular season and is
correct; `drift` does not — see the finding below.

**The verdict on the three candidates.**

- **(c) per-attempt yardage — EXONERATED.** Ranks 11-20 average **7.11** yards
  an attempt against a real 7.23, and ranks 1-10 read 7.44 against 7.69. The
  sim's mid-table passers are, if anything, slightly inefficient. Every yard of
  the residual is attempts.
- **(a) team attempt distribution — real defect, WRONG CAUSE, reverted.** Team
  pass attempts read mean 585 sd 36 against a real 17-game-era **570 / 60**, so
  the spread is 60% of reality. But the LEVEL is not a passing decision at all:
  the sim's dropback share of scrimmage plays is **57.3% against a real 57.2%**,
  and the whole +15 comes from running **64.3 scrimmage plays per team-game
  against a real 62.9** (+2.2%). Widening `coach.passBias` from sd 0.125/±0.30
  to sd 0.40/±1 fitted the attempt distribution well (581 / 54) and **did not
  move `qb20PassYds` beyond noise** (60 seeds: 3,278 without it, 3,285 with),
  because rank 20 sits close to the median where a symmetric widening cancels.
  It also cost real ground elsewhere — `rushers1700` 0.8 → **1.4** against a
  real 0.57 and a guard max of 2, `rb5RushYds` 1,401 → 1,450, `leadPassYds`
  4,815 → 4,974. **Reverted.** The reason it cannot work: team carries already
  carry 90% of their real spread (46 against 51) and the mix lever moves carries
  about 1:1 with attempts, while reality needs attempts to gain roughly four
  times the variance carries do. That is a different mechanism and a later
  packet.
- **(b) within-game QB split — CONVICTED, and the engine had the sign
  backwards.** In games he played, the sim's leading passer took **98.8%** of
  his club's attempts against a real **97.0%** (17-game era), and only 8.1% of
  team-games had a second passer against a real 21.4%. The engine rested only
  the side that was AHEAD. Real clubs go to the backup MORE readily when they
  are being beaten — 91.1% share in a 25-point loss against 95.6% in a
  25-point win — and the trailing side carries 72% of all the attempts the league's starters
  do not take, 86% of everything above the one-score-win floor (§5.4b).

**The change.** `onField` in `sim/game.ts` now steps down the depth chart for
whichever side the game is decided FOR, not for the scoreboard. The winning
side keeps `garbageTime`'s margins (22 late / 29); the trailing side is
20 / 27; "late" tightened from 10 minutes to 7 for both because a real relief
appearance is SHALLOW — the 10th percentile of the leader's within-game share
is 93.1%, two or three attempts, not half a game. Fitted to the measured
target, not to the metric: within-game leader share **96.6% against a real
97.0%**, multi-passer games 19.6% against 21.4%, leader attempts 33.2 against
33.1.

**Movement, matched seeds.**

| | main | after | note |
|---|---|---|---|
| `statcheck.qb20PassYds`, 60 seeds | 3,431 ±26 | **3,278 ±22** | −153, paired SEM 34 |
| `statcheck.qb20PassYds`, gate 5-seed panel | 3,413 | **3,358** | band tops at 3,290 — still red |
| `statcheck.qb5PassYds`, 60 seeds | 4,335 | 4,277 | the top does not deflate (§6.4) |
| `statcheck.leadPassYds`, 60 seeds | 4,788 | 4,815 | unchanged |
| `drift.passRecordSeasons`, per seed | 7 / 11 / 7 / 8 / 10 = **8.6** | 4 / 10 / 5 / 7 / 9 = **7.0** | guard max 10; §6.4 floor holds, min 4 |
| `drift.playerWeeksLost` | 2,792.8 | 2,774.5 | availability untouched |
| `statcheck.rb5RushYds`, 60 seeds | 1,430 | 1,401 | |
| `statcheck.wr10RecYds`, 60 seeds | 1,123 | 1,118 | |

The 5-seed panel reads a −55 move where 60 seeds read −153; the paired per-seed
differences are +85 / −206 / +195 / −42 / −308, sd 194. **The guard cannot
resolve its own fix at five seeds**, which is worth knowing before anyone reads
a future panel as evidence of anything at this rank. The change also tightens
the metric considerably: per-seed range 3,145-3,610 before, 3,302-3,444 after.

**Verification: `gate:full --seeds 5`, 14 cores, ~55 minutes. All 14 harnesses
exit 0. Three metric failures, all pre-existing known-open rows, two of them
improved:**

```
FAIL  tails.milestonesOff     16.40    expected <= 12    (was 17.2)
FAIL  statcheck.qb20PassYds   3357.80  expected 3046 +/-244  (was 3413)
FAIL  statcheck.rb5RushYds    1431.60  expected 1191 +/-95   (was 1455)
```

Nothing else went red. `leverage` passes on the panel at 0.6 — the
`noEffect 2` the FAST tier reports is one knife-edge probe (`OT.sta` against
sacks taken, reading −0.0) at the single default seed; on GG_SEED 1-6 main and
this branch are byte-identical on that harness, and main's own spread there is
0-1. `milestonesOff` moved 17.2 → 16.4 against a documented sd of 2.88, which
is noise in the direction of better and should not be read as anything else.

**Deltas reported, not tuned** (5-seed panel, against the values this file
recorded for the same panel on main):

| | main | after |
|---|---|---|
| `careers.survivalMae` | 4.53 | 4.77 |
| `careers.careerLenMae` | 1.14 | 1.03 |
| `careers.r1BustPct` | 17.7 | 19.43 |
| `careers.r1QbSharePct` | 16.04 | 17.71 |
| `careers.draftSignal` | 4.67 | 4.61 |
| `calibrate.passYds` | 240.29 (locked) | 239.00 |
| `calibrate.passAtt` | 34.77 (locked) | 34.62 |
| `calibrate.rushYds` | 119.79 (locked) | 120.07 |
| `calibrate.plays` | 63.89 (locked) | 63.93 |
| `calibrate.scoreMismatches` | 0 | 0 |

All nine `careers` metrics and all 28 `calibrate` metrics are inside their
guards. `passAtt` barely moves, which is the point: the attempts change hands
from the starter to the backup, they do not leave the league.

**Three findings for Matt, none acted on.**

1. **`drift.passRecordSeasons` compares REG + POST yards against a regular
   season record.** `drift` advances to `offseason-recap` before reading the
   stat line, and playoff yardage is in it — worth about +580 at rank 1. The
   guard's claim ("the passing record is not broken every year") is fine; the
   measurement is confounded, the same shape as the `eliteCbShadowDrop` and
   pick-1 `originalTeamId` reconditionings. Changing what it measures is a
   design decision. Until then, note that 8.6 → 7.0 of 20 is a comparison
   against an inflated number on both sides.
2. **The era mix flatters the sim on QB1 share, and it is §6.6's error in
   reverse.** §5.3's pooled QB1 attempt-share median of 89.4% mixes 16- and
   17-game seasons; the 17-game-era figure is **85.8%**, and the mean is 80.4%
   against a pooled 82.3%. The sim reads 86.3% mean, which looks correct against
   the pooled median and is ~6 points high against the era it actually plays.
   Underneath it, the sim's QB1 plays **15.0 of 17 games against a real 14.23**.
   That residual is worth roughly −180 at `qb20PassYds` — the largest single
   piece left — and it is availability, which this packet was told not to touch
   and did not. §6.5's own fit (weighted residual −0.01 games) is satisfied on
   its own terms; §6.5's QB row is the one to re-examine, not `POSITION_RISK`.
3. **The league runs ~2.2% too many scrimmage plays** (64.3 against 62.9 per
   team-game, §5.4). It inflates every volume stat proportionally — worth about
   −75 at `qb20PassYds` and a matching amount on the rushing side — and it is
   the same signature as the `calibrate.punts` note ("drives run long, punts run
   light"). Fixing it is a drive/clock packet that would move a dozen calibrate
   baselines toward their `nfl` values, all of which sit 2-4% below what the sim
   does today. Not attempted here.

---

## 2026-08-02 — starter availability, session six (branch `task/305-availability`, NOT merged)

**Panel: `gate:full --seeds 5`, FAIL, 3 problems.** Three strikes reached; this
is a stop-and-report, not a hand-off-and-continue.

**What the correction did.** Session five hit every §6.5 starter target by
raising `POSITION_RISK` ~2x across the board, and blew `drift.playerWeeksLost`
to 3,698 against 2,158 ±700 — because a flat multiplier raises a fourth
cornerback's hazard as much as a left tackle's. This session routed the
increase through EXPOSURE instead: `WORKLOAD_EXP = 2.8` raises the clamped snap
ratio to a power, so the roster-wide curve runs 0.013 → 3.7 instead of
0.25 → 1.6. A 63-snap starter's exposure barely moves (1.15 → 1.48); a 20-snap
reserve's falls about three quarters. That bought a large walk-back of
`POSITION_RISK` — QB 1.90 → 0.98, RB 2.80 → 1.58, CB 2.04 → 1.29, LB 1.40 →
1.03 (now below its ORIGINAL 1.10). `POSITION_DURATION`, the 0.0205 base and
the [0.0008, 0.09] clamp were not touched.

**Both constraints now hold.** 20 league-seasons, 5 seeds:

| | sim | target |
|---|---|---|
| week-1 starters, weeks lost | **1,160** | 1,216 (band 1,100-1,250) |
| `drift.playerWeeksLost` | **2,792.8** (sd 37) | 2,158 ±700 -> [1,458, 2,858] |
| population-weighted §6.5 residual | **-0.01 games** | 0 |

Session five's fit, measured the same way, was **-0.59 games** per starter —
it over-injured everyone by more than half a game a season.

**Two measurement errors found and written up (`nfl-reference.md` §6.6, §6.7).**

- §6.5's "mean games" column spans three 16-game seasons. Its own two figures
  pin club REG games at 16.55, so the 17-game-equivalent target is **0.4 games
  higher per starter** than printed, and the league total is 1,216 not 1,184.
  The first fit aimed at the uncorrected column and over-injured accordingly.
- `drift.playerWeeksLost` is **~49% roster churn, not absence**. A player earns
  a box-score row only when credited a snap, so a fifth receiver covering five
  weeks of injuries books twelve "weeks lost" while perfectly healthy. Churn
  scales at ~1.2 per extra starter-week, so the metric amplifies any real
  availability change ~2.2x. It is a valid regression guard and NOT a
  statement about real football.

**The three reds, and what they actually are.**

- `statcheck.rb5RushYds` 1,455 (band tops at 1,286). **Not an availability
  problem.** The post-availability `CARRY_SHARE` re-measurement that AGENTS.md
  asked for: the sim's team leading rusher takes **58.1%** of his club's RB
  carries over a season against a real **47.4%**. `CARRY_SHARE[0]` is 0.60 and
  `script.leadBackShare` averages 0.645 — both above the real SEASON share,
  which is backwards. Next lever, and it is a backfield-distribution change.
- `statcheck.qb20PassYds` 3,413 (band tops at 3,290). Availability is half of
  it: 3,706 -> 3,413 is -293 of the -660 needed. The rest is reachable only by
  injuring starters harder than §6.5 says is real, which is what session five
  did to get it green at 3,204. Next lever is QB1 attempt share inside the
  games he plays (§5.3) and garbage-time rotation.
- `tails.milestonesOff` 17.2 (baseline 12). **Partly pre-existing**: the branch
  read 14.4 on a 5-seed panel at `6d77561`, before any availability engine
  change. Availability took it 14.4 -> 20.0 (session five) -> 17.2. Not
  diagnosed further.

**Two rows retire, and not for the reason anyone expected.**
`statcheck.wr10RecYds` and `statcheck.implausibleLines` were **already green on
a 5-seed panel before any availability work** (1,141 and 0). They were fast-tier
single-seed artifacts, never depletion side-effects. `drift.p0Failures` is 0
before and after.

**Also shipped:** the in-game K/P injury path (`kickExposure` in `sim/game.ts`)
— a kicker or punter is exposed on a return and in the pile, ~2.5 logged a
league-season. No primary source exists for specialist injury rates, so the
axis is deliberately ungated (`nfl-reference.md` §4).

**Panel deltas, reported not tuned.** `drift.passRecordSeasons` 8.6 of 20
(guard max 10; §6.4's warning that availability could thin the tail did not
materialise). `tails.bestSeasonPassYds` 5,147 (5,392 ±500). `statcheck.qb5PassYds`
4,355 (4,497 ±360). `calibrate` 28/28 green, `scoreMismatches` 0.
`careers`: survivalMae 4.53, careerLenMae 1.14, r1BustPct 17.7, r1QbSharePct
16.04, draftSignal 4.67 — all inside their guards.
`drift.saveGrowthMbPerSeason` 0.39 against a max of 0.45, up from the 0.32
recorded in AGENTS.md; worth a look, not diagnosed here.

---

## 2026-07-30 — the scouting + draft system, end to end

Plan and reconciliation in `docs/scouting-draft-plan-2026-07-30.md`. Built in
one pass, cloud session, branch `task/301-scouting-draft-e2e`.

**What shipped.**

- `lib/core/scouting.ts` — the fog of war. Public prospect profiles (college,
  class, measurements, combine numbers derived from true physical attributes +
  weight at real exchange rates); the user's stored per-method intel
  (`state.scouting`: OVR **and potential** bands, both centred on genuinely
  wrong estimates); CPU beliefs DERIVED from a pure stable hash — durable,
  private, per-club, zero save growth, zero RNG stream consumption.
- **Both information leaks are closed.** `cpuBoardValue` no longer reads true
  `p.pot` (three sites) or the user's shared band; the player-page attribute
  panel shows scouted ranges for prospects instead of the true values that
  made every scouting mechanic cosmetic.
- Method-based scouting: film / pro day / private workout / medical /
  interview, different costs, different truths revealed. Runs all season from
  the staff-budget scouting points. Risk grades are real — they act through
  durability and devSpeed at generation, not flavor text.
- War room on `/draft`: focus card per prospect (testing sheet, both bands,
  method buttons, risk file), board calls (tiers 1-5, watchlist, do-not-draft,
  notes), all persisted per save and pruned with the class.
- **On-the-clock trading** — the feature the funnel analysis called for. CPU
  clubs whose board tier collapses pay a premium to move up
  (`tryCpuClockTrade`, ~18 in-draft trades a season on top of the pre-burst);
  the user gets live trade-down offers on the clock and can ask a price to
  move up (`quoteMoveUp`). Total draft-window volume now lands near the real
  ~35.
- **Priority UDFA** — after pick 224, clubs chase the undrafted from their own
  boards (`runUdfaChase`); the user signs interactively from the big board.
  Same user-club convention as `cpuResign`.
- `scripts/scoutcheck.ts` in both gate tiers (`scout`), guarding: no rendered
  surface reconstructs true OVR; CPU beliefs are stable, private, and carry
  genuine potential error; user spend tightens only user bands; invariant 6
  holds exactly; a headless draft completes with clock trades and a real UDFA
  chase. Four structural baselines added (`scout.*` in `baselines.json`).

**Verification record (2 cores, single-seed where noted).** Fast gate PASS
(55 metrics, `scout` step included); `careers 24` PASS with real movement —
survivalMae 8.8 → 4.4-4.7, r1BustPct 28.4 → 21.6-28.6, careerLenMae 1.0 →
0.57, draftSignal 3.7 → 3.9-4.3 across three 24-season runs.
`careers.r1QbSharePct` stays the known-open red it already was: it read 19.0,
20.6 and 23.7 on three runs of near-identical code, which is the same
seed-sensitivity the HANDOFF already documented (14.1/17.7/21.1) — judge it
only after the panel re-lock. `drift 20` PASS, no P0 regressions,
save growth +0.39; `conditions`/`coherence`/`staff`/`tails` all exit 0; both
browser suites pass with 0 console errors.

**Three decisions that need Matt's sign-off** (all lead-tier changes, made
under his 2026-07-30 full-autonomy instruction, reversible):

1. **`drift.saveMbAtEnd` raised 10 → 10.5.** The UDFA chase adds ~100 played
   careers a season and the record book keeps played careers forever by
   design. Growth guards unchanged.
2. **The pick-1 guards in `verify.ts` and `drift.ts` now measure the SLOT
   (`originalTeamId`), not the holder.** With on-the-clock trading and future
   firsts as sweeteners, a bottom-six club legitimately may not HOLD pick 1 —
   the guards' claim (order tracks standings) is unchanged, the confound is
   removed. Same reconditioning pattern as the shadow-CB yards-per-target fix.
3. **Four `scout.*` structural baselines added** (leak floor, tightening
   floor, clock-trade floor, UDFA band).

**Single-seed re-rolls pending the panel re-lock** (generation changed, the
stream moved — `gate_stream_sensitivity` applies): `tails.milestonesOff` reads
19 single-seed (baseline commit read 18 single-seed; the 12 max is
panel-locked); `conditions.byeWinPct` reads 62.8 against 51.7±9 — note the
bye is no longer BACKWARDS (it was 48.8; the P2.3 target is 53-58, this seed
overshoots it). Run `gate:full -- --seeds 5` on a real machine and re-lock
before tuning anything against these.

**Honest notes for whoever is next.**

- League generation changed (profiles draw on the class child stream), so the
  PRNG stream moved and single-league metrics re-rolled. Fast gate passed at
  the locked baselines on seed 1; run the panel re-lock (`gate:full --seeds 5`
  on a real machine) before any further tuning — that instruction predates
  this session and still stands.
- CPU potential error is new: clubs used to draft with a perfect `pot` read.
  Tuned so aggregate accuracy matches the old effective error (common ~7 sd +
  club ~4.5 sd vs the old shared ~10 + 3.5 jitter), and `careers` bands held
  on the seeds run this session — but the DYNAMICS are different (winner's
  curse is real now), so watch `careers.r1BustPct` drift over future work.
- The UDFA chase signs ~160 priority free agents league-wide (~5 a club).
  Real clubs sign 10-15 into 90-man camps; v2 has no 90-man, and the cutdown
  (`upgradeRoster`) contests every one of these deals at finalize. If roster
  churn metrics move, the threshold in `runUdfaChase` is the dial.
- `spendScouting`/`SCOUT_COST`/`initialScoutingPass` are legacy but still
  live: the initial pass seeds the public default band every board falls back
  to, and the legacy `p.scouted*` fields are kept mirrored so `displayedOvr`
  and old saves stay coherent. Do not delete them without moving that.

---

## Read this before you tune anything

Three targets in `scripts/careers.ts` and one in `docs/baselines.json` were
wrong by 2x to 30x, and the simulation had been tuned toward them for weeks.
The worst was a flat **42.6%** roster-survival figure for draft rounds 4-7 that
traces to a blog post whose author disclosed the statistics were AI-generated
and told readers to verify them. It is a top Google result for "NFL draft pick
survival rate by round." The real values are 70.7 / 65.2 / 53.6 / 38.1.

Every calibration number now lives in `docs/nfl-reference.md` with its dataset,
its aggregation and its source. That is invariant 7 in `AGENTS.md`. **If a
number you are about to chase is not in that file, that is the finding — report
it instead of hitting the target.**

---

## What was done this session

**Measurement.**
- `docs/nfl-reference.md` written from primary data: the nflverse mirror of
  Pro Football Reference draft tables (2011-2019, n=2,289) and nflverse
  `trades.csv` (2002-2026). Pipelines validated against independently reported
  figures before use.
- `careers` now emits nine metrics and is in the full gate. The draft — the
  centre of the game — previously had no regression protection at all.
- `staffcheck` added: six self-asserting checks and ten metrics.
- 95 metrics gated, up from 80.

**Bugs fixed, in rough order of how much they mattered.**
- `cutWorstSurplus` released players by sorting on raw `p.ovr`. A rookie is by
  construction the lowest-rated man on a roster, so every draft class pushed its
  club past 53 and this cut the class straight back off before anyone played a
  down. Seventh rounders had a median career of **zero** seasons against a real
  two. Also against invariant 3.
- `packageValue` applied its quantity concavity to picks as well as players,
  making pick-for-pick trades arithmetically impossible — the receiver needed
  the bundle worth >1.13x the target and the proposer needed it worth <1.10x.
  Combined with a club pick appetite that was a flat scalar (and so cancelled
  from both sides), the league struck zero pick swaps.
- `generate.ts` clamped `realize` at 1.1, generating ~2% of players with a
  ceiling **above their own potential**.
- `progression.ts` never reconciled OVR against potential except at peak age,
  where `p.pot = Math.max(p.ovr, ...)` silently raised potential to meet
  ability. Potential followed ability upward instead of bounding it.
- `schemeAttrMultiplier` dulled `cov` for corners under Zone Match — 36% of a
  cornerback's rating. A scheme is a choice about emphasis, not competence.

**Built.**
- `lib/core/staff.ts` — one pool of 100 points across development, scouting,
  training and scheme; up to three named development priorities; eight scheme
  identities. Every effect is a deviation from an even split and is exactly 1.0
  there, which is invariant 6.
- Scheme reaches the play engine via `att()` and `sc()` in `sim/game.ts`.
- `app/front-office` — the screen that makes all of it playable.
- `.claude/agents/nfl-researcher.md` and `sim-tuner.md`.

**Measured movement** (matched seed where stated):

| | before | after |
|---|---|---|
| `drift.tradesPerSeason` (20 seasons, seed 1) | 1.2 | 7.8 |
| `careers.survivalMae` | ~12.0 | 8.8 |
| `careers.r1ShareMae` | 4.26 | 2.83 |
| `staff.focusOvrGain` (same player, 4 seasons) | — | 4.36 |
| `staff.overPotential` | 616 | 0 |
| `statcheck.leadRushYds` | — | 1791 (real ~1800) |

---

## Still red, and why

The full gate at one seed exits clean on all 13 harnesses. Five metrics fail.

| metric | reading | status |
|---|---|---|
| `drift.passRecordSeasons` | 12 of 20 (want ≤3) | **My regression.** Fixing `cutWorstSurplus` keeps high-potential young players alive, more reach their ceiling, and the 5,477-yard record falls more often. Baseline was 10. |
| `conditions.coldPointsDelta` | −0.5 (want −2.4) | **Unconfirmed.** New this session, but single-seed on a 6-season sample and never checked against a matched-seed baseline. Do that before assuming it is real. |
| `tails.milestonesOff` | 14 (want ≤12) | Panel artifact. Locked across 5 seeds; a single seed read **18 at the baseline commit** and 14 now, so this is better, not worse. |
| `careers.r1QbSharePct` | 21.1 (want 15.9 ±3.2) | Genuinely high — real is 10.3% — and very seed-sensitive (14.1 / 17.7 / 21.1 across three seeds). |

None were fixed by widening a guard.

---

## Next, in the order I would do it

**1. Re-lock the panel before tuning anything.** Several metrics swing hard
between seeds — `leadRushYds` moved 2396 → 1506 → 1791 across three modest
parameter changes. A single-seed full gate is a smoke test, not a measurement,
and tuning against one is how this repo got into trouble in the first place.
Run `npm run gate:full -- --seeds 5` on a machine with more than two cores and
re-lock. **This is the prerequisite for everything below.**

**2. ~~The shadow metric~~ — RESOLVED. See the section below for what it cost
and what it taught.**

**3. Trades — the funnel is measured now, and the answer is a feature, not
tuning.** ~15 a season against a real ~90. Three fixes landed (below), but the
remaining gap will not close by adjusting constants. Read the funnel first.

Over 4,000 instrumented attempts on a four-season-old league:

| stage | pick-for-pick | player-for-pick |
|---|---|---|
| attempts | 2,218 | 1,782 |
| an offer got built | 39 (1.8%) | 256 (14%) |
| offer accepted | **39 (100% of built)** | 94 (37%) |

**When a pick swap gets built it clears every single time.** The bottleneck is
entirely the builder, and drilling into its four exit paths over 3,000 attempts:

| exit | count |
|---|---|
| the proposer would be worse off | **2,533 (84%)** |
| could not reach the price in 3 picks | 418 |
| built | 49 |

Three real causes found and fixed:

- **Target selection ignored disagreement.** It weighted purely by round, so a
  club shopped for picks its counterparty happened to love. Now weighted by the
  ratio of what the two clubs pay for that pick. Worth knowing: weighting by
  disagreement ALONE produces a round mix within a couple of points of the real
  one (R1 11% / R2 11% / R3 13% / R4 21% / R5 16% / R6 19% / R7 10% against a
  real 8/10/12/14/17/20/18) — the realistic distribution genuinely falls out of
  the mechanism rather than needing to be imposed.
- **The bundle builder ignored size.** It took the highest-edge picks in order,
  so a club shopping for a seventh would open by offering a second. Now each
  piece is chosen for edge from among the picks that fit what is left to cover,
  with room to round up on the last one.
- **`needsOf` was a headcount.** `fillRoster` brings every club to
  `POSITION_TARGET` every offseason, so by the time the window opened almost
  nobody had a hole and the player-for-pick shape had nothing to chase. A need
  is now either a headcount shortage OR a starting job held by somebody the club
  would replace.

Net 7.8 → 15.3 a season, matched 12-season runs.

**Why constants will not finish this.** The valuation model has plenty of
disagreement available — across club pairs, the same pick prices over a 2.28x
range. But WITHIN one pair the ratio is driven almost entirely by round and
years-out, so the spread a single negotiation can exploit is much narrower, and
the double-sided margin test (receiver wants +3%, proposer wants to come out
ahead) leaves a thin band. Raising attempt counts buys volume at a linear cost
in CPU and does not make the market smarter.

**The actual fix is on-the-clock draft trading.** Draft weekend is ~35 trades
and 38% of all annual volume (§1.5), and right now it is one burst before the
first pick rather than trades between picks. A club on the clock that has fallen
for a specific player has a concrete, large, legible valuation for moving up —
which is a deal that clears easily and for the right reason. That is where the
missing 70 trades a year live, and it is a feature with its own design, not a
constant to nudge.

**4. Draft outcomes.** `careers.survivalMae` 8.8 — rounds 3-6 still wash out
11-16 points too fast. `careers.careerLenMae` 1.0 — a 6th or 7th rounder's
median career is 1 and 0 seasons against a real 4 and 2. Second contracts with
the drafting club run 3-5x too high at every round (R7 at ~15% against a real
1.5%).

**5. The passing record.** `drift.passRecordSeasons` was already open before my
churn fix pushed it from 10 to 12. It needs the elite-QB tail looked at
directly rather than another constant.

---

## The shadow metric — RESOLVED, and worth reading anyway

`coherence.eliteCbShadowDrop` was gated on yards per GAME at `min: 4`. It now
gates yards per TARGET at `min: 0.4` and reads **1.25 / 1.46 / 0.78** across
three seeds — positive every time, sd 0.35. The engine was fine. The guard was
the bug, and it took four attempts at "fixing the engine" before anyone
measured the guard.

**The metric's noise exceeds its own guard.** Three seeds on identical code read
**+8.3, −9.6, +3.5** — a standard deviation around nine against a threshold of
four. It passes or fails at random. This is the `leverage` failure in a new
costume: a guard whose tolerance is narrower than its own variance manufactures
confidence rather than providing it.

**Three genuine harness defects were found and fixed along the way.** All three
are worth keeping regardless of what happens to the guard:

1. The test pinned the *corner* at a given `cov` and let the **receiver float**,
   so every seed measured a different WR1 against a different supporting cast.
   Both sides are now pinned and the result is averaged over four offences.
2. It mutated `attrs.cov` and never called `refreshOvr`, so the manipulation was
   invisible to everything reading `p.ovr` — including the depth-chart sort that
   decides who CB1 is and therefore who does the shadowing. Both the 45 and 95
   trials read `ovr 71`.
3. The baseline set CB1 to `cov 45` while leaving the backups at 55. Sides mode
   **shuffles** the corners (`game.ts assignCoverage`), so the baseline handed
   the receiver a *worse* average matchup than the elite trial did — which is
   why an elite corner playing sides appeared to help the receiver. The baseline
   is now a uniform secondary, so the trials differ in one variable.

**The mechanism does work when it fires.** On seed 2 after the fixes, shadowing
takes the WR1 from 27.0 to 11.5 yards a game. That is a real, large effect.

**What is still unexplained**, and where the next person should start:
`coherence.eliteCbSidesDrop` reads negative on both seeds tested — adding a
shutdown corner who plays *sides* does not reliably help the defence, and on
seed 1 appears to hurt it by nine yards. Since sides mode is `rng.shuffle` over
three starting corners, WR1 draws the elite man only a third of the time; that
dilutes the effect but should not invert it. Look at target selection —
specifically whether the passer avoids the covered receiver, because if he does
not, an elite corner attracts targets rather than deterring them.

**What fixed it.** Yards per game stacked three larger sources of variance on
top of the effect: how often the offence throws, how the game script moves that
around, and how the passer distributes targets. The coverage matchup was the
smallest term in it. Yards per target divides the volume back out and leaves
the thing the design actually claims — when this receiver IS thrown at, does a
corner glued to him make it go worse.

**And it explained the anomaly.** On seed 1 the elite-sides trial gave WR1
25.9 yards on 2.6 targets against 17.2 on 1.8 for the baseline. His efficiency
barely moved; he simply got thrown at more. Adding a shutdown corner *somewhere*
in the secondary pushes targets TOWARD whoever he is not covering, and with the
sides shuffle that is often WR1. The per-game metric read a sensible engine
behaviour as a bug for four rounds of investigation.

`eliteCbSidesDrop` is now report-only with a wide band. It reads about zero
(-0.42 / -0.10 / 0.00), which is correct rather than broken: the shuffle means
WR1 draws the elite corner only a third of the time.

---

## Things that will trip you up

- **Check `nproc` first.** The gate fans all steps out with `Promise.all` across
  a 5-seed panel. On two cores that is an hour-plus with buffered output, so it
  looks hung when it is merely slow. Use `--seeds 1` or `--seeds 2` there.
- **Never `pkill -f next`** — it matches the build process. Kill by PID.
- Playwright needs `PW_CHROMIUM` pointing at a full chromium, not the headless
  shell: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` in the sandbox.
- The RNG is a counter, so any change to how many values generation draws lands
  the whole simulation on a different stream. A metric that moved may have moved
  because you reshuffled the league. A metric that did *not* move across three
  different models is the same tell in reverse.
- **Beware selection bias in your own harness.** My first concentration test
  compared named against unnamed players inside one league and reported
  development focus as a 14-point *penalty* — because clubs name the players
  furthest from their potential, so the measure just rediscovered the selection
  rule. The same-seed A/B in `staffcheck` is the honest version.

---

## Not calibrated, on purpose

`nfl-reference.md` §4. The largest gap is the **played badly → became good**
path — the Darnold case the design is built around. Every public study measures
men who never got on the field, and by that measure quarterback is the *worst*
position for late emergence (10%, the lowest of any position), not the best.
Allen and Goff both cleared the snap threshold as rookies, so they are in
nobody's sample. That path has to be designed rather than calibrated, and the
staff budget is the mechanism: environment moves the box score today
(`sim/game.ts` pressure from the line), and development focus moves the rating
permanently, bounded by `pot`.

---

## `milestonesOff` quantization — the guard cannot reach its own target

Measured during the 2026-07-31 panel re-lock. No code or baseline changed; this
records why `tails.milestonesOff` has a floor it cannot go below at 16 seasons.

`milestonesOff` counts how many of **49 threshold categories** (29 single-game,
20 full-season) have a per-season rate outside their NFL band. Seven of those
categories carry an NFL rate at or below 0.05, and `verdict()` (tails.ts:90-93)
passes them only at a rate ≤ 0.06. At 16 seasons the finest non-zero rate the
harness can express is 1/16 = **0.0625**, already over that line — so a single
occurrence in the entire run flips the category to TOO COMMON. There is no
representable value between "never happened" and "fails".

**A correctly calibrated sim therefore fails several of them by construction.**
For the four categories at 0.02/season, λ = 0.32 over 16 seasons and
P(≥1) = 1 − e^−0.32 = 27%. For the three at 0.05, λ = 0.8 and P(≥1) = 55%.
Expected failures from the seven alone: 4(0.274) + 3(0.551) = **2.75 per seed
from correct behaviour**. The target of 0 is unreachable at this season count,
and part of the panel-locked 12 is the guard's arithmetic rather than the sim's.

Panel evidence (seeds 1-5, 16 seasons each, 80 pooled seasons). Counts are
per-seed occurrences; pooling gives 1/80 = 0.0125 resolution, which separates
what a single 16-season run cannot:

| category | NFL/szn | counts by seed | pooled/szn | × NFL | trips | P(≥obs \| NFL) |
|---|---|---|---|---|---|---|
| 550+ pass yds (G) | 0.02 | 1,0,1,1,0 | 0.0375 | 1.88 | 3 | 0.217 |
| 300+ rush yds (G) | 0.02 | 1,0,0,0,2 | 0.0375 | 1.88 | 2 | 0.217 |
| 300+ rec yds (G) | 0.05 | 1,0,0,0,2 | 0.0375 | **0.75** | 2 | 0.762 |
| 5,500+ pass yds (S) | 0.02 | 0,0,0,0,1 | 0.0125 | **0.62** | 1 | 0.798 |
| 50+ pass TD (S) | 0.05 | 0,0,0,0,0 | 0.0000 | 0.00 | 0 | 1.000 |
| 1,900+ rec yds (S) | 0.05 | 2,4,1,0,2 | 0.1125 | 2.25 | 4 | **0.021** |
| 23+ sacks (S) | 0.02 | 1,0,1,1,2 | 0.0625 | 3.12 | 4 | **0.024** |

16 tripwire failures across 5 seeds (3.2/seed, against 2.75 expected under
perfect calibration). **Ten of the 16 fired on exactly one occurrence** — the
resolution limit, carrying no information about the sim. Only two categories
are genuinely elevated once pooled: 1,900+ receiving yards (2.25×, p = 0.021)
and 23+ sacks (3.12×, p = 0.024). Two others — 300+ receiving yards and 5,500+
passing yards — **fail in some seeds while the sim produces them LESS often
than the NFL does** (0.75× and 0.62×), which is the clearest statement of the
problem available.

Panel: 17 / 14 / 17 / 10 / 14, mean 14.40, sd 2.88, SEM 1.29. Against the
5-seed lock of 12 that is z ≈ 1.3 — consistent with no change since the
2026-07-29 lock, i.e. the metric did not regress; it is simply noisy at a level
the max cannot resolve.

**Two candidate repairs, both design decisions for Matt.**

1. **More seasons.** 32 seasons makes 1/32 = 0.031 representable and 48 makes
   1/48 = 0.021, so one freak game no longer trips a category. Cost is linear
   in runtime — `tails` was 146s for the 5-seed panel, so this is the cheap
   option. It shrinks the artefact but does not remove it. Not taken.
2. **A count-based verdict.** Fail only when the observed COUNT falls outside a
   Poisson interval for λ = rate × seasons, instead of comparing a quantized
   rate against a ratio band. This removes the floor rather than shrinking it,
   and is the honest version of the claim the thresholds are making. It changes
   WHAT the guard measures, so per AGENTS.md it is a design decision.

**Repair 2 landed 2026-08-28 (task/312).** Central 95% Poisson interval, panel
16.0. See the session header. Do not tune the engine against the new number.
