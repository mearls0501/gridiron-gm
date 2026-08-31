# Adjudication: the four statcheck reds at 190cbd0

**Measured at:** `190cbd0` (working tree clean except untracked docs), 8-seed panel, cloud container.
**Verdict:** three of four are single-seed artifacts. One is a real defect. None are regressions — provably.
**Root cause of the confusion:** a guard whose single-sample noise is 73% of its own tolerance.

---

## 1. Not a regression. This is a one-line proof, and nobody ran it.

```
$ git diff --name-only 7ea95c2 190cbd0 -- v2/lib
(0 files)

$ git diff --stat 7ea95c2 190cbd0
 v2/AGENTS.md           | 19 +++++++++++++----
 v2/docs/HANDOFF.md     | 56 ++++++++++++++++++++++++++++++++++++++++++++++++++
 v2/scripts/drift.ts    |  5 ++++-
 v2/scripts/leverage.ts |  7 ++++++-
```

`190cbd0` is the only commit between `7ea95c2` and HEAD. It touched **zero engine files**. The
simulation is byte-identical to the commit whose own message reads *"every leaderboard floor is
green."*

Whatever these four metrics are reading, they cannot be a regression, because there is no change to
regress from. The question that blocked all three reviewers was answerable in one `git diff
--name-only`. Three agents each ran a full gate instead.

**Action: nobody needs to adjudicate this. It's closed.**

---

## 2. The panel. Three of four go green; one does not.

`scripts/statcheck.ts:12` hardcodes a single seed:

```ts
const st = newGame({ seed: seedFor(8675309) });
```

and then reads the 5th-, 10th- and 20th-best *individual season* off that one league-year
(`statcheck.ts:102`, `rankAt`). That is an order statistic from a sample of one.

Run across 8 seeds (`GG_SEED=1..8`):

| metric | 1 seed (gate) | 8-seed mean | sd | sem | target | verdict at n=8 |
|---|---|---|---|---|---|---|
| `statcheck.qb5PassYds`  | 3943 | **4290** | 262 | 93 | 4497 ±360 | green |
| `statcheck.qb10PassYds` | 3558 | **3859** | 211 | 75 | 4028 ±322 | green |
| `statcheck.wr10RecYds`  | 1063 | **1112** |  77 | 27 | 1208 ±97  | green |
| `statcheck.rb5RushYds`  | 1340 | **1315** |  65 | 23 | 1191 ±95  | **RED (+10.4%)** |

Distance of the hardcoded default seed from the panel mean, in sd:

```
qb5PassYds    -1.32 sd
qb10PassYds   -1.42 sd
qb20PassYds   -1.54 sd
wr10RecYds    -0.64 sd
leadPassYds   -1.56 sd
leadRushYds   +1.52 sd
```

Seed 8675309 is a low-passing draw on every passing axis at once, and it is baked into the harness
permanently. That is the whole story behind three of the four reds.

Corroborated independently by `190cbd0`'s own commit message: *"gate:full --seeds 5: ... Two metric
reds ... tails.milestonesOff 20.80 and statcheck.rb5RushYds 1304."* At 5 seeds only `rb5RushYds`
was red. Same result, already in the log.

---

## 3. `rb5RushYds` is the one real signal

Red at 1 seed (1340), red at 5 (1304, per the HEAD commit message), red at 8 (1315, +10.4%, ceiling
1286). Seed-count independent. It is already a documented known-open row, so the correct action is
not to adjudicate it but to work it.

Two supporting readings from `calibrate 300`, both inside band individually and both hot in the same
direction:

```
calibrate.ypc      4.379   target 4.460 ±0.35   nfl 4.3
calibrate.rushAtt  26.60   target 26.858 ±2.5   nfl 26
```

Slightly more carries at slightly more yards each, compounding into the top-5 tail.

---

## 4. There is no pass/rush mix shift. This was checked and ruled out.

A single-axis play-calling change was the most attractive hypothesis for four metrics moving
together — three passing down, one rushing up. It is wrong. From `calibrate 300` at 190cbd0:

| metric | observed | target | delta |
|---|---|---|---|
| `calibrate.passAtt` | 33.49  | 34.772 ±2.5 | −3.7% |
| `calibrate.rushAtt` | 26.60  | 26.858 ±2.5 | −0.9% |
| `calibrate.passYds` | 236.79 | 240.293 ±12 | −1.5% |
| `calibrate.rushYds` | 116.49 | 119.786 ±10 | −2.8% |
| `calibrate.plays`   | 62.30  | 63.893 ±3   | −2.5% |

Derived pass share: **55.73% observed vs 56.42% baseline** — a shift of 0.69 percentage points.
Nowhere near enough to move an order statistic 12%. The league means are healthy; the distribution
was never the problem. The apparent coherence of the four ~12% deltas was a coincidence of one seed.

---

## 5. The actual defect is in the measurement layer

`statcheck.qb5PassYds` carries a single-sample sd of **262 yards** against a tolerance of **±360**.
Noise is 73% of the band. A guard with that ratio flips red on unchanged code a substantial
fraction of the time — which is exactly what happened here, and what will happen again next session,
and the session after that.

`AGENTS.md` already names this failure mode: *"a silently-degrading harness is worse than no harness
at all — which is exactly how the leverage probe stayed broken."* A harness that fires **falsely** is
the same disease. Every red it emits costs a review cycle, and this one just cost three.

### Two plausible fixes, both wrong

**"Stop emitting these at n=1."** Breaks the gate. `gate.ts` treats a missing metric as a hard FAIL,
deliberately — that is how a silently-degrading harness gets caught. Trades a false red for a worse
one.

**"Add `panelOnly: true` and skip the comparison at n=1."** Subtler, and worse. It suppresses
`rb5RushYds` along with the other three — and `rb5RushYds` is the **one red on this list that is a
real defect**. A repair that hides the true positive in order to get rid of the false ones leaves the
gate less useful than it was.

### What shipped: `Step.minPanel`

Don't take the guard away — give the step enough samples to be a measurement. `Step.minPanel` is a
per-step seed floor honoured on every tier; `statcheck` gets `minPanel: 5`.

It is free. Seeds run sequentially *within* a step, but steps run in **parallel** with each other,
and statcheck is a small fraction of the critical path. Measured on the fast tier:

```
statcheck  80s  (5 seeds)     <- not the critical path
sweep     346s                <- the critical path
```

Result on the fast tier, before and after:

```
before:  4 reds — qb5PassYds 3943 · qb10PassYds 3558 · rb5RushYds 1340 · wr10RecYds 1063
after:   1 red  — statcheck.rb5RushYds 1304
```

1304 is precisely what `190cbd0`'s own `--seeds 5` run reported. Every guard is still live and still
comparing against its locked target; only the false reds are gone.

**Acceptance test, permanently:** if `rb5RushYds` ever reads green on the fast tier, the panel change
has been taken too far and the guard is broken.

Second bug fixed in the same pass: the NOISE detector (`fragile` block) flags any metric whose tol is
under 2×SEM — it would have caught all five of these on day one. It was keyed off the *global* panel
size and short-circuited on `panelN < 2`, so it never ran on the fast tier, the only tier where these
metrics are read as a single sample. It now uses the panel each metric's own step actually ran.

**No `target`, `tol`, `max` or `min` was touched. `gate:lock` was not run.**

Still open: `statcheck.rushers1700` reads 2 against `max 2` on the default seed and 0–1 on most panel
seeds. The panel fixes the noise, but a count whose real-world mean is 0.57 guarded by an integer
`max: 2` is a weak bound regardless — it passes at roughly four times the real rate.

---

## 6. RETRACTED — §5.8 is correct; the challenge to it was a measurement error

An earlier version of this document flagged `7ea95c2`'s team-volume numbers ("sd 34-39 against a real
60", top-5 passers "538-562 against a real 578-596") as possibly stale, on a measurement of sd 50.2
and top-5 team volume of 794/676/662/637/633.

**That measurement was wrong and the commit was right.** The error: team attempts were summed from
players' SEASON lines and attributed to each player's team at season end. A player traded mid-year
carries both clubs' attempts on one line, so his whole season landed on his final club — inflating
some teams, deflating others, and widening the measured spread. The 794 outlier was a traded starter,
not a pass-happy offence.

Re-measured with per-game attribution from the box score (`PlayerGameStat.teamId`), 160 team-seasons,
5 seeds, matching §5.3's definition (attempts exclude sacks):

| | sim | real 17-game | source |
|---|---|---|---|
| team pass attempts, mean | 561 | 570 | §5.3 |
| team pass attempts, **sd** | **35.5** | **60** | §5.3 |
| p10 / median / p90 / max | 517 / 560 / 607 / 664 | 495 / 571 / 647 / 751 | §5.3 |
| team carries, mean / sd | 467 / 53.9 | 457 / 51 | §5.3 |
| corr(attempts, carries) | **−0.43** | **−0.64** | §5.3 |
| individual passer attempts, rank 5 | **545** | 578 | §5.3 |
| individual passer attempts, rank 1 | 606 | 632 ±48 | §5.1 |

sd 35.5 sits inside the cited 34–39. Rank-5 passer attempts of 545 sits inside the cited 538–562.
**§5.8 stands, the accepted limitation stands, and nothing should be re-scoped against a challenge to
it.** The general lesson is the one this whole document is about: attribute per event, not per
season-line, and check the outlier before believing the spread.

One genuinely new reading falls out: `corr(team attempts, team carries)` is **−0.43** against a real
**−0.64**. Real clubs polarise into pass-heavy and run-heavy harder than the sim's do. That is the
same defect as the narrow attempt spread, seen from a second angle, and it is not currently guarded.

---

## 7. `rb5RushYds` diagnosed — it is efficiency, not volume

The one true red. Decomposed over 8 seeds:

| rank | yards | carries | ypc |
|---|---|---|---|
| #1 | 1675 | 296 | 5.65 |
| #5 | **1347** | 255 | **5.29** |
| #10 | 1173 | 235 | 5.06 |

Real, from §5.1: #1 is 1704 ±248 on **327 ±34** carries (ypc **5.21**); #10 takes 230 ±18 carries;
#5 is 1191 ±125 yards.

So the sim's top backs are **short on carries and long on yards per carry**. At the sim's own #5 carry
count (255), hitting the real 1191 needs 4.67 ypc; the sim produces 5.29.

The means are all fine. League ypc is 4.276 against a real 4.3, and qualified-RB ypc is 4.498 against
§5.6's non-kneel 4.51. **The spread is what is wrong:**

```
RBs with 100+ carries (n=243, 5 seeds)
  ypc  mean 4.462   sd 0.666   p90 5.36   p99 5.85   max 6.18
  corr(carries, ypc) = +0.275
```

### CORRECTION 2026-08-10 — the coupling half of this was wrong

The paragraph that stood here claimed *"real football runs the other way — the workhorse back carries
into loaded boxes and the highest ypc figures belong to committee backs."* **That was asserted with no
source and it is false.** It is exactly the move AGENTS.md forbids: a plausible mechanism story
standing in for a measurement. It was written into this document and into `HANDOFF.md` and shipped.

Derived since, into `nfl-reference.md` §5.10 (nflverse 2021-2024 REG, RB/FB/HB, 100+ carries, n=187):

```
real corr(carries, ypc) = +0.129   95% CI -0.014 .. +0.268   (Spearman +0.136)
real ypc sd             =  0.642
sim  corr, matched pop  = +0.159   z = 0.34, p = 0.73  -> indistinguishable
```

The real coupling is **positive**, and the sim's matches it. There is nothing to decouple, and
building in a negative coupling would have tuned the sim *away* from the measurement. The
`+0.275` quoted above also came from an unmatched population and is superseded by the matched
`+0.159`.

**What is actually wrong is dispersion and level, not coupling:**

| | sim | real | |
|---|---|---|---|
| ypc sd, qualified backs | 0.747 | 0.642 | +16%, p ≈ 0.007 |
| ypc level, qualified backs | 4.532 | 4.360 | +3.9% |
| ypc sd, 150-249 carry band | 0.72-0.81 | 0.48-0.50 | where it concentrates |
| rank-5 carries | 255 | 247 | fine |
| rank-5 ypc | 5.29 | 4.95 | +6.9% |

Dividing that 6.9% out of the rank-5 season lands 1315 → **1230** against a real **1222**. Top-end
efficiency is the entire overage; volume is not implicated at all.

So the §5.3 parallel drawn above — "under-spreads volume and over-spreads efficiency on both sides of
the ball" — survives only in its second half. The rushing side over-spreads efficiency. It does not
under-spread volume, and the tidiness of the symmetry is probably what made the unsourced half feel
true.

---

## 8. `positionShort` implemented (`lib/core/select.ts`)

`rosterIssues()` now emits `positionShort`. **Threshold is `POSITION_MIN` (types.ts:37), not
`STARTERS`** — POSITION_MIN is already the league's definition of a legal 53 and is what
`verify.ts:171-179` asserts headlessly. Deriving a separate minimum from STARTERS would have created
a second, looser definition of the same rule, so the UI would call a roster legal that the harness
fails. One authority per rule.

Verified two ways:

- **Control:** stripping a team to 1 QB (min 2) emits `Not enough QB: 1/2`; leaving 2 of 3 required
  WRs emits `Not enough WR: 2/3`. The check fires.
- **Live:** `npx tsx scripts/verify.ts 5` → 537/537, including its own POSITION_MIN assertions after
  generation and after every offseason. No CPU roster ever goes position-short.

So this is a guard against a hole, not a report of a live bug — which is the right outcome. The hole
was real: before this, a 53-man roster with zero quarterbacks passed every check the UI made.

**Trap found while testing:** `advance()` alone never rolls the season over — it parks in
`offseason-recap` indefinitely (2,334 of 2,403 advances in one run, season never incremented). Any
multi-season harness must also drive `advanceOffseason()` while `isOffseason(st.phase)`, the way
`verify.ts:595-601` does. A loop that only calls `advance()` silently measures one season forever.

---

## Recommended order

1. ~~Fix the statcheck seed design.~~ **Done** — `Step.minPanel`, §5 above.
2. ~~Re-derive §5.8.~~ **Done** — §5.8 stands; the challenge was retracted, §6 above.
3. **`rb5RushYds`** — diagnosed in §7. Next action is deriving the real carries↔ypc correlation into
   `nfl-reference.md` §5, because the fix cannot be calibrated without it.
4. ~~`positionShort`.~~ **Done** — §8 above.
5. **`intYds` double-credit** (`game.ts:1311` + `:895`) — real, confirmed, two-line fix. But `intYds`
   feeds no guard, no `evaluate()`, no standings and none of the reds above. It is a display-stat
   correction, not HIGH. Note also the credited amount is `retYds + max(retYds, 20)`, not `2 × retYds`.
6. **Playoff tie-break** (`playoffs.ts:167-173`) — requires 20 consecutive tied overtime replays.
   Correct to fix, but it is unreachable and does not belong on a priority list.

---

## Reproduction

```bash
git diff --name-only 7ea95c2 190cbd0 -- v2/lib     # 0 files
npx tsx scripts/statcheck.ts                        # 3943 / 3558 / 1340 / 1063
npx tsx scripts/calibrate.ts 300                    # mix table, §4
for s in 1 2 3 4 5 6 7 8; do GG_SEED=$s npx tsx scripts/statcheck.ts; done
```

No harness, script or baseline was edited.
