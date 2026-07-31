# HANDOFF — 2026-07-30

Where the build stands, what is still wrong, and what to do next. Read this
first, then `AGENTS.md`, then `docs/nfl-reference.md`.

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

**Two candidate repairs, both design decisions for Matt. Neither was done.**

1. **More seasons.** 32 seasons makes 1/32 = 0.031 representable and 48 makes
   1/48 = 0.021, so one freak game no longer trips a category. Cost is linear
   in runtime — `tails` was 146s for the 5-seed panel, so this is the cheap
   option. It shrinks the artefact but does not remove it.
2. **A count-based verdict.** Fail only when the observed COUNT falls outside a
   Poisson interval for λ = rate × seasons, instead of comparing a quantized
   rate against a ratio band. This removes the floor rather than shrinking it,
   and is the honest version of the claim the thresholds are making. It changes
   WHAT the guard measures, so per AGENTS.md it is a design decision.

Until one of them lands, read `milestonesOff` as roughly "2.7 of arithmetic
plus whatever the sim is actually doing", and do not tune against it.
