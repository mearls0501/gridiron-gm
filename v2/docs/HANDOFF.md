# HANDOFF — 2026-07-29

Where the build stands, what is still wrong, and what to do next. Read this
first, then `AGENTS.md`, then `docs/nfl-reference.md`.

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
| `coherence.eliteCbShadowDrop` | −2.9 (want ≥4) | **Pre-existing open that I made worse.** Diagnosed below. |
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

**2. Fix the receiver/corner asymmetry.** `coherence.eliteCbShadowDrop` is
negative because **every offensive identity emphasises receivers and only three
of the four defensive ones emphasise corners**, so league-wide receivers get
sharpened more often than the men covering them. The emphasis tables in
`staff.ts` need to balance across the ball. Exempting a position's defining
attribute from the drag already recovered −10.3 → −2.9; this is the rest.

**3. Trades are still 12x short of reality.** ~7.8 a season against a real ~90
(`nfl-reference.md` §1.1). Two structural gaps: `needsOf` is count-based, so
once `reconcileRoster` fills every roster to target almost no club has a "need"
and the player-for-pick shape rarely fires; and draft-day trades are one burst
before the draft opens rather than between picks, so no club can move up for a
specific player it has fallen for. Volume and round distribution are right;
motivation is not.

**4. Draft outcomes.** `careers.survivalMae` 8.8 — rounds 3-6 still wash out
11-16 points too fast. `careers.careerLenMae` 1.0 — a 6th or 7th rounder's
median career is 1 and 0 seasons against a real 4 and 2. Second contracts with
the drafting club run 3-5x too high at every round (R7 at ~15% against a real
1.5%).

**5. The passing record.** `drift.passRecordSeasons` was already open before my
churn fix pushed it from 10 to 12. It needs the elite-QB tail looked at
directly rather than another constant.

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
