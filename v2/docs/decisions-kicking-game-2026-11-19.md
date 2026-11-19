# Kicking-game events — the decisions, with a recommendation on each

**SIGNED by Matt, 2026-11-19: all six lines ("sign all six and build stage 1").** Stage 1 was built the same day (`HANDOFF.md`). Stage 2 is not started. Decisions only. This note changes no code, test, `scripts/` file, `docs/baselines.json`, `docs/nfl-reference.md` or canary. It is the short form of `docs/proposal-kicking-game-events-2026-11-11.md`, read against the rates traced since (`nfl-reference.md` §5.14, 2026-11-13) and against `main` at `937db70` (#257).

The text below is the note as signed.

## What changed since the proposal was written

- **The rates exist.** Decision 1 of the proposal (trace first) is done. §5.14 holds every row below.
- **Special-teams tackles landed first** (#257). The proposal's Stage 1 parity literal (rng 3282470162, hash 4083448151) is stale and must be re-measured on `main` before Stage 1 is checked.
- **The canary literals in the proposal are stale.** They are now `userOffers` tag **4171186477**, FA **108340363**; `trimIdentity` **1412** cuts, rng **3165849988**.
- **The trace removed two routes.** In four seasons no blocked field goal and no blocked punt was returned for a touchdown (0 of 78, 0 of 42). Those routes have no rate, so they are not built.

## Decision A — kickoff era

The 2021–2024 window holds three kickoff rule sets. §5.14 does not pool them.

| era | kickoffs | touchback | fair catch | returned | onside recovered |
|---|---:|---:|---:|---:|---:|
| 2021–22 | 5,369 | 0.5981 | 0.0002 | 0.3926 | 14 / 154 = 0.0909 (2021–23) |
| 2023 | 2,657 | 0.7414 | 0.0342 | 0.2205 | (in the row above) |
| 2024 | 2,753 | 0.6549 | 0.0004 | 0.3327 | 3 / 50 = 0.0600 |

**Recommend: 2021–22 for kickoffs, the 2021–23 row for onside kicks.**

- The engine's touchback is at the 25. That is the 2021–22 spot. The 2024 kickoff puts it at the 30 and adds a landing zone the engine does not model.
- 2021–22 is the largest sample, and its rule was not a one-year trial (2023) or changed again after the window (2024).
- The 2023 fair-catch trial did not change the onside kick, so §5.14 already pools 2021–23 for onside: **154** attempts, **14** recovered.
- **Kickoff fair catches are not built.** In this era the row is 1 in 5,369.

Not part of this decision: the engine's own kickoff and punt constants (touchback 0.62 against 0.5981, punt returned 0.55 against 0.4636, and the rest of the §5.14 findings table). Picking an era does not move them. Moving them is a separate change with its own re-lock.

## Decision B — staging

**Recommend: two PRs, as proposed, with Stage 2 cut down to what the trace supports.**

### Stage 1 — labels only. Moves no outcome and no canary.

| label | carved from | rate (§5.14) |
|---|---|---|
| blocked field goal | the misses the engine already rolls | 78 / 639 = **0.1221** of non-made |
| blocked extra point | the XP misses the engine already rolls | 31 / 247 = **0.1255** of non-made |
| punt fair catch | the punts the engine already does not return | 2,352 / 4,255 = **0.5528** of unreturned |

- Every coin is on a new per-game side stream (`kickEventRng`, keyed like the coverage stream). No draw on the parent.
- Check: the re-measured parity literal reproduces exactly, and both canaries stay where they are. A red canary means a bug, not a re-lock.
- **Stats: add `blk` on the blocker. No fair-catch count.** A fair catch is a play-log label. The blocker comes from the depth chart's DT, EDGE and LB starters with a snap that game.
- Stage 1 can be built before the Studio panel is read. It cannot move a panel number.

### Stage 2 — outcomes change. Moves all four canary literals.

Built:

- **Blocked punt.** 42 / 8,587 = **0.0049** of punts. The defence takes the ball behind the line. **3 of 42** end as a safety. No touchdown route (0 of 42).
- **Onside kick.** Recovery 14 / 154 = **0.0909**. No return, no touchdown (`own_kickoff_recovery_td` is 0 in the window).

Left out, each for a traced reason:

- **Blocked field goal returned for a touchdown.** 0 of 78.
- **Defensive two-point return.** 3 in four seasons, and the box-score formula has no field for it. Adding one means editing `verify.ts` and `calibrate.ts`. A blocked extra point stays a dead ball.
- **Surprise onside, onside on the opening or second-half kick.** 197 of 204 attempts were by a trailing club.
- **A user onside prompt.** The user's club follows the same policy as the CPU. A kick-call prompt is a UI decision for later.
- **Attribute tilt.** Flat traced rates in v1.

Two things Stage 2 still needs before it can be built. Neither is a sign-off; both are missing numbers.

1. **The onside attempt rate has no denominator.** §5.14 counts **126** attempts in 2021–23 by a trailing club in the last 5:00 of the fourth quarter. That is 126 / 1,630 team-games = **0.077** a team-game. It does not say how many kickoffs those clubs had in that spot. The proposal's policy (always kick onside when trailing by 1–16 under a clock threshold) gave **0.090** qualifying kickoffs a team-game at 5:00 and **0.058** at 3:00 on the old tree. Choosing the threshold to land near 0.077 is fitting a policy to a target. **Recommend: trace one more row, onside attempts over kickoffs by a trailing club in the last 5:00 of Q4, split by deficit, and roll the attempt as a coin at that rate on the side stream.** The window is then the trace's own definition, not a dial.

   *Traced 2026-11-19 (§5.14, "Onside attempt rate by situation"): 113 / 202 = 0.559 in the last 5:00 down 1–16. The rate depends heavily on clock and deficit, so one coin has the wrong shape. Using the clock-by-deficit table is a new decision, not covered by the signature above.*
2. **Rule geometry is not cited.** The onside spot (kickoff spot plus the 10-yard minimum) and the blocked-punt stat convention come from the rulebook. §5.14 says operations.nfl.com was not reachable when it was written. Both need a citation in §4.

**Blocked-punt convention. Recommend: a blocked punt counts as a punt.** §5.14's own denominator counts it (42 of 8,587 `punt_attempt` rows), and `calibrate.punts` keeps its meaning. The yards credited to the punter wait for the citation. A blocked punt and a failed onside kick are not counted as turnovers, so `calibrate.turnovers` keeps its meaning too.

## Decision C — the Stage 2 re-lock and the freeze exception

Stage 2 moves the parent RNG early in the first season. Both `userOffers` literals and both `trimIdentity` literals move. No `baselines.json` row is edited, but scoring, ties and turnovers-adjacent rows can drift inside their bands.

The calibration freeze allows a re-lock only for a playtest finding. Stage 2 is a roadmap item, not a playtest finding. So it needs two signatures: an exception to the freeze, and the four new literals.

**Recommend: sign the exception in principle now, on four conditions.**

1. **Stage 2 is not started until the owed Studio panel is read.** That panel is the first with #248 and #257 in it, and it is where `careers.path2BurnInTop10PrPct` and `staff.leagueOvrDelta` get a lock. A second outcome-moving change on top would blur it.
2. **The re-lock covers the four canary literals only.** No band moves. If Stage 2 pushes a gated metric out of band, that is reported, not re-locked.
3. **The literals are measured on the pinned Node 22.23.4** on the Studio, not on a cloud box.
4. **The PR carries a before-and-after table**, rows at zero against rows filled on the same build, as #257 did: points a game, tie rate, punts, turnovers, and the count of each new event against its traced rate.

## How much this is

For scale, from §5.14, league-wide per season: about **20** blocked field goals, **8** blocked extra points, **10** blocked punts, **51** onside kicks of which **3 or 4** are recovered, and about **590** punt fair catches. Stage 1 is mostly labels on plays that already happen. Stage 2 changes possession on roughly **14** plays a season and moves every canary to do it.

## Signed 2026-11-19

| | decision | recommendation |
|---|---|---|
| A | Kickoff era | 2021–22 for kickoffs; 2021–23 row for onside. No kickoff fair catch. |
| B1 | Stage 1 | Build now as its own PR: FG and XP block labels, punt fair-catch label, `blk` stat. No canary moves. |
| B2 | Stage 2 scope | Blocked punts (with safeties) and onside kicks only. No block-return touchdowns, no defensive two, no user prompt, no tilt. |
| B3 | Onside attempt | Trace the attempt rate first; roll it as a coin. Do not fit a clock threshold. |
| B4 | Blocked punt | Counts as a punt. Not a turnover. |
| C | Re-lock | Freeze exception for the four canary literals only, after the Studio panel, measured on Node 22.23.4. |
