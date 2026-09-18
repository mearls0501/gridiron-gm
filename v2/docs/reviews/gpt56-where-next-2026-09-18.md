# Gridiron GM: where next

## Where the game stands

- `main @ db7f871` is no longer primarily an engine-recovery project. Wave 3.9 shipped the league Hall of Fame, jersey/retired-number identity, and the second-scene career path; Wave 4 Packets 1–4 and 6 are also on main.
- The roadmap's claim that the game is invisible is now stale. `PlayEvent[]` and `DriveSummary[]` already power `/play` and the `/game/[id]` drive chart/play-by-play, and `createLiveGame` advances one in-memory simulation instead of replaying from kickoff.
- Wave 4 is not closed. Draft PR #100 gives medical and character grades consequences, but its four effect-size ladders still need Matt's sign-off. Although the new weekly injury draw is child-keyed, it removes the old parent-stream draw, so this remains a solo outcome packet followed by a panel—not a byte-identical display change.
- The post-tag panel is a mixed but legible result: GATE FAIL 7, `capBustSeasons` at **0.00**, and `topCapPctMean` at **20.28**. The proposed **20.3 ±3** band is not signed and therefore is not a baseline.
- Franchise tags remain **17.11/season**. That is inside the signed 14 ±4 guard but did not make the expected move toward 11–14; `deadMoneyPct` at **2.42** is also only a recorded finding. Neither number authorizes tuning.
- The people layer exists and holdouts are in the expected range (**10.22/season**), but `hcFiresPerSeason` is **0.00** despite a live event-site counter and a signed expectation of 6–8. Trade-request and missed-games counters have no signed bands.
- The identity features need diagnosis, not immediate adjustment: Hall classes are plausible at about **7.2**, while `secondSceneStarPct` is **0%** against the sourced §2.7 reference of **11.4%**. The next product leap is deterministic narration that exposes the systems already built.

## Top three next moves

### 1. Close Wave 4 as a governance and measurement step

Get an explicit accept/revise decision from Matt on PR #100's medical-hazard, character-holdout, and character-demand ladders. If signed, rebase it onto current main, merge it alone, and run the supported five-seed `gate:full:serial` panel before any other outcome work. Record the reshuffled `calibrate`, `statcheck`, and `careers` results plus the new medical/character ratios; do not re-lock anything in the packet.

**Why first:** scouting now has meaningful limits, but risk grades remain mostly price signals until this packet lands. More importantly, removing a parent draw changes downstream seasons, so closing and measuring this packet in isolation is the only way to preserve attribution.

### 2. Ship Phase 5 as a pure view layer over the event log

Build the first narration packet around the existing `PlayEvent[]`, `DriveSummary[]`, `BoxScore`, and `lib/view/playByPlay.ts`. Replace the current terse `formatPlay` output with deterministic, fact-bound snap prose and derive a short game recap from recorded events: decisive scoring sequence, lead change or comeback, turnover swing, and closing drive. Use the same formatter in `/play` and `/game/[id]`; add pure-function fixtures proving stable text and no `GameState` mutation.

Keep the first packet honest about the current data. `PlayEvent` does not identify every defender or recovery, and full play logs are retained only for user games. Narrate only facts present in the event/box data; do not add sim hooks, invent participants, draw RNG for wording, or start retaining every CPU snap.

**Why second:** the simulation already has depth, but the UI still presents most snaps as compact telemetry such as “run for 4 yards.” A zero-RNG narrative layer makes the existing game, people, and identity work perceptible without reopening calibration.

### 3. Run two report-only funnels, then take mechanism decisions to Matt

After the post-#100 panel, inspect `hcFiresPerSeason` first and second-scene outcomes second. For coaches, trace eligible CPU HCs through tenure, owner heat, threshold, `wouldFire`, `fireCpuHeadCoaches`, and the counter write site; the planted 15-fire fixture proves the terminal path, not that normal league state reaches it. For second scenes, report eligibility → fired → opportunity snaps → post-move development → star, split by position and age; a nonzero fired rate with zero stars says the lift is not converting, but not which gate or dial is wrong.

**Why third:** both are player-visible promises that currently produce zero terminal outcomes. Funnel evidence can distinguish disconnected lifecycle logic from weak signed dials without turning a finding into an unauthorized tune.

## What not to do

- Do not edit `docs/baselines.json`, including the unsigned `topCapPctMean` proposal.
- Do not tune franchise tags toward 10 or 11–14, or tune `deadMoneyPct`, `p0Failures`, or `tails.milestonesOff` from this panel.
- Do not adjust HC-firing or second-scene constants before the report-only funnels and a Matt decision.
- Do not bundle PR #100 with narration or any other outcome change, and do not describe its new child stream as preserving the old parent stream.
- Do not make Phase 5 an engine rewrite, runtime-LLM feature, backend, or dependency addition. It should consume recorded facts and remain offline and replay-safe.
- Do not retain full CPU play logs as an incidental narration change; that would put the signed save-growth ceiling back at risk and needs its own storage decision.

## Sharp disagreement risk

The highest-risk wrong choice is treating PR #100 as a harmless child-RNG cleanup and merging it unsigned or bundled. It removes a draw from the weekly parent stream, so later games and careers reshuffle even though the replacement draw is correctly child-keyed; if the proposed effect sizes are wrong, the resulting panel cannot cleanly separate intended risk-grade consequences from stream movement or another packet's effects.
