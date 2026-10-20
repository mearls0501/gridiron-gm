# GLM 5.2 — where next (strategy review, 2026-09-18)

Strategy review only. No engine, no baselines, no dials touched. Written
against `main @ db7f871` (Wave 3.9 Phase 4 done; Wave 4 Packets 1–4 + 6
landed; Packet 5 risk teeth is DRAFT #100). Reads: `AGENTS.md`,
`docs/ORCHESTRATION.md`, `docs/HANDOFF.md` (top Wave 4 sections),
`docs/ROADMAP.md`, PR #100 body, and the code paths the findings point at
(`lib/core/owner.ts`, `lib/core/coaches.ts`, `lib/core/secondScene.ts`,
`scripts/drift.ts`, `scripts/careers.ts`, `docs/baselines.json`).

---

## 1. Where the game stands

- **The ROADMAP's "What is missing" section is stale — the franchise half is
  largely built.** Phase 1 play-by-play shipped (`lib/view/playByPlay.ts`,
  `lib/core/sim/events.ts` `buildDrives`, `openGameSim` in `sim/game.ts`,
  wired into `app/game/[id]/page.tsx` and `app/play/page.tsx` with a drive log
  and per-snap `formatPlay`). Phase 2 people shipped (`coaches.ts`, `owner.ts`,
  `psychology.ts`, `/staff`, `/forced-move` for the user-GM chair). Phase 3
  contract office shipped (`restructure`/`addVoidYears`/`carryover`/`extend`
  on `/finances`; compensatory picks in `offseason/draft.ts`). Phase 4 shipped
  (HOF, jersey, `secondScene.ts`). The ROADMAP still says "the game is
  invisible / no people / finances is read-only" — none of that is still true.

- **Wave 4 is one packet from closed.** Packets 1–4 + 6 are on `main`.
  Packet 5 (PR #100, risk teeth) is **DRAFT, blocked on Matt** — the
  `MEDICAL_HAZARD` / `CHARACTER_HOLDOUT` / `CHARACTER_DEMAND` table has no
  primary source (`nfl-reference.md` §4 has no injury-rate-by-grade series),
  so it is a Matt dial per ORCHESTRATION §7. It also **moves the weekly injury
  draw off the parent stream** onto a per-player child keyed
  `(seed, season, week, "medical", playerId)`, so it is a solo packet + panel,
  not byte-identical year-0.

- **The signed backstops held on the post-tag panel @ `6e3b7bf`.**
  `drift.capBustSeasons` **0.00** (the 28% tag ceiling from Packet 2 worked —
  was 3.40 pre-ceiling). `drift.saveGrowthMbPerSeason` 0.48 / `saveMbAtEnd`
  12.43 MB inside the #91 locks (0.61 / 15.89). `drift.ovrDrift` −1.95 inside
  −1.70±1.5. `drift.tradesPerSeason` **78.67** (record, inside `min: 30`).
  `drift.deadMoneyPct` 2.42 (record low). GATE FAIL **7** — down from the
  pre-ceiling panel because `capBustSeasons` cleared.

- **Three signed-band metrics sit healthy and are report-only by rule.**
  `franchiseTagsPerSeason` **17.11** (inside the signed 14±4 band, ceiling 18
  — did *not* dip toward 11–14, and that is the sourced rule, not a retune).
  `holdoutsPerSeason` **10.22** (inside single-digits–12 expect).
  `tradeRequestsPerSeason` 48.8 and `holdoutGamesMissedPerSeason` 37.09 are
  first reads with no band.

- **Four open findings are deliberately report-only** (AGENTS.md known-open +
  HANDOFF): `secondSceneStarPct` **0.0** vs §2.7 ref 11.4%; `hcFiresPerSeason`
  **0.00** vs 6–8/yr (counter is live, write site reads zero);
  `topCapPctMean` **20.28** with a **20.3±3 PROPOSAL** that Matt has **not**
  signed; `franchiseTagsPerSeason` 17.11 not dipping. None of these is a
  regression and none is a tune target.

- **Four FAIL lines are NOT in the known-open table and are the real signal.**
  `drift.p0Failures` **0.40** (the pick1-from-bottom-6 P0 guard, which the
  2026-08-03 ratification explicitly re-fixed to read `originalTeamId`);
  `conditions.problems` 0.20; `staff.problems` 0.20; `tails.milestonesOff`
  **22.60** against a `baselines.json` max of 16 — a jump from the 16.0
  (14/15/15/18/18) the known-open row cites. These are the items that can be
  regressions rather than findings.

- **Phase 5 narration is half-built deterministically and half-unstarted.**
  Deterministic scouting-report prose (`lib/core/scouting-reports.ts`, stable
  hashes, no RNG) and Season Review (`lib/view/seasonReview.ts`, "nothing is
  invented, the writer is not called") are live. The remaining Phase 5 piece
  is the approved LLM-proxy prose (scouting reports, season recaps, press
  conferences) behind a thin proxy, optional, offline-survivable, never in a
  decision loop — and it is genuinely not started.

---

## 2. Top 3 next moves, ranked

### Move 1 — Diagnose the four non-known-open FAILs (cheap, gate-fed, prerequisite for everything else)

`drift.p0Failures 0.40` is the priority. It is a **P0** guard
(`scripts/drift.ts:231` — `pick1 === flat.length`, pick1 read via
`originalTeamId` per the 2026-08-03 ratification). 0.40 across a 5-seed
panel means ~2 of 5 seeds had a season where pick 1's original team was not
a bottom-6 club. The most likely vector is the recent trade-market packets
(PR #4 cutdown/deadline + draft-day burst, #101 +2 probe) letting a
non-bottom-6 club acquire pick 1 *before* the `offseason-fa` snapshot the
guard reads at `drift.ts:148`. That would be a real regression, not a
finding — and it's the one item that genuinely gets worse if ignored.

`tails.milestonesOff 22.60` is the second. The known-open row cites a 16.0
panel (14/15/15/18/18, sd 1.87) against a `baselines.json` max of 16; 22.60
is a 6.6-point jump off that row's mean. Per AGENTS.md "when a guard is the
thing that is wrong," the move is to run 3+ seeds on **unchanged** code and
show the spread before touching anything — not to widen the tolerance and
not to tune the engine against the aggregate.

`conditions.problems 0.20` and `staff.problems 0.20` are one problem each on
the panel; both are self-reported problem lists
(`scripts/conditions.ts:147`, `scripts/staffcheck.ts:48`), so the diagnosis
is "read which line failed," not "measure noise."

**Why first:** every other next move (Packet 5 panel, Phase 5) is gated on a
green panel, and a P0 regression that slipped in under the Wave-4 packets is
the one thing that actually compounds. This is hours of work, not a wave.

### Move 2 — Close Wave 4: get Matt's sign on Packet 5, merge solo, run the panel

Packet 5 (#100) is the only open Wave-4 work and it is blocked on a Matt
decision, not on code. The effect-size table
(clean 1.00 / minor 1.08 / moderate 1.20 / major 1.40 hazard, and the
character holdout/demand multipliers) has no primary source, so it is
Matt's dial. Once signed, it merges **alone with nothing in flight** (it
moves the parent stream — ORCHESTRATION §3), then the 5-seed
`gate:full:serial` panel runs and re-locks nothing in the same PR.

**Why second, not first:** it's blocked on Matt, so it can't be #1 — but
it's the smallest, cleanest close in the project right now (one sign, one
solo merge, one panel), and it is the gate to declaring Wave 4 done and to
the `topCapPctMean` 20.3±3 proposal becoming signable as a Lead packet.

### Move 3 — Diagnose (do not tune) the two zero people findings, hand the write-up to Matt

Both are report-only by rule — owner patience/firing thresholds and
secondScene K are Matt's dials (ORCHESTRATION §7). But both have a
concrete, codebase-specific root cause that a worker can hand Matt as a
write-up, not a guess:

- **`hcFiresPerSeason` 0.00 vs 6–8/yr.** The counter write site is proven
  live (`lib/core/peopleTeeth.test.ts:131` asserts it increments at the fire
  site; `housekeeping.test.ts` asserts rollover resets it). So the dial is
  the bug, not the counter. In `lib/core/owner.ts`, `fireHeatThreshold` is
  `62 + patience*28` → 72–90, and `ownerHeatFor` accrues heat slowly: a
  rebuild club (target 6) losing 3 games/year gets ~7.8/year under the
  2-year `rebuildGrace` (×3 multiplier) then ~21/year after (×8), so ~36
  heat after 3 years against a ~77 threshold — the chair never trips. The
  grace + cool-down swallow the signal. `fireCpuHeadCoaches`
  (`coaches.ts:321`) then correctly reads zero because `job.heat <
  job.threshold` always.

- **`secondSceneStarPct` 0.0 vs §2.7 11.4%.** The scene DOES fire —
  `secondSceneFiredPct` is 8.47% of eligible, `secondSceneEligiblePct` 2.64%
  of mature QBs (`scripts/careers.ts:449–451`). The zero is at the **star**
  step: `c.seasons.some(s => s.star && s.season > p.secondScene!.season)`
  never fires. The lift in `maybeApplySecondScene` is
  `rng.normal(gap*0.45, gap*0.25)` on a minimum 6-point bust gap → ~+2.7
  `ceiling`, which has to be bought back through `developPlayer` over years
  and is too small to flip a bust into a star season. The six-gate
  conjunction (starter at the new club + 500 snaps + first season +
  `sceneImproved`) is also tighter than the real Darnold path (backup →
  mid-year job → year-2 break out).

**Why third:** it's report-only and Matt's dial, so it's lower-urgency than
the FAILs — but it's the highest-leverage **content** gap. The people layer
is shipped and two of its three signature behaviors are silent; the
write-ups are already half-done by the code itself, so Matt gets a
decision-ready packet, not a research request.

---

## 3. What NOT to do

- **Do not retune toward any report-only number.** `franchiseTagsPerSeason`
  17.11 (the tag rule is sourced; the 11–14 dip was an expectation, not a
  target), `topCapPctMean` 20.28 (the 20.3±3 band is a **PROPOSAL** Matt has
  not signed — the sign widget was skipped), `deadMoneyPct` 2.42 (record
  low, nothing to fix). AGENTS.md is explicit: a baseline only moves when
  the number behind it moves in `nfl-reference.md` first.

- **Do not tune the engine against `tails.milestonesOff` 22.60 or chase
  `statcheck.wr10RecYds`.** The former is a known-high Poisson aggregate
  (rare-event quantization; the known-open row says "do not tune the engine
  against this number"); the latter is single-seed noise tighter than the
  panel SEM (ORCHESTRATION §2 lists it as an inherited red to leave alone).

- **Do not touch `docs/baselines.json`, `scripts/` emit math, or any Matt
  dial.** Owner patience / `fireHeatThreshold`, `secondScene` K, and the
  Packet 5 effect-size table are all ORCHESTRATION §7 escalations. This is a
  strategy review; even outside one, those are lead decisions, not worker
  ones.

- **Do not start the Phase 5 LLM proxy before the panel is green and Wave 4
  is closed.** Invariant 5 (no backend, no runtime LLM, no new deps) plus
  the "fully optional so offline play survives" constraint means the proxy
  design is a lead decision. Shipping it on a red panel hides regressions
  behind prose and adds a non-deterministic surface to a build whose entire
  value proposition is provable realism.

- **Do not "fix" the year-2 waiver desk (~267 names) or the cold-weather
  scoring delta as bugs.** Both are flagged in AGENTS.md / ROADMAP as
  product / un-gated decisions (the waiver desk is the #41/#49 cap-stuck
  residue; `conditions.coldPointsDelta` is a single-seed 6-season sample
  not yet confirmed against a matched-seed baseline). Neither is a settle
  miss; wiping either as a "bug fix" repeats the trade-volume mistake.

---

## 4. One sharp disagreement risk if we pick wrong

The ROADMAP's own framing — "the engine is the mature half; the franchise
half is what remains" — invites the next move to be **ship Phase 5
narration**, because the franchise layer is in and prose is the obvious
"feeling" gap Football Manager wins on.

I'd hold Phase 5 for one cycle. The risk of picking prose-first: we add a
non-deterministic LLM surface to a build whose entire moat is "a gate that
can say *statistically indistinguishable from the NFL* and mean it,"
**before** we know whether `p0Failures 0.40` is a real draft-order regression
and **before** `milestonesOff 22.60` is understood. The red panel stays red
underneath the new copy, and the next person to pick up the save reads
pretty press conferences over a broken pick-1 guard.

The deeper disagreement is about what "the franchise half is built"
actually means. The people layer is shipped, but two of its three
signature behaviors are **silent** — a coach is never fired
(`hcFiresPerSeason` 0.00) and a Darnold never breaks out
(`secondSceneStarPct` 0.0). The gap between "the franchise half is built"
and "the franchise half is *felt*" is exactly those two dials, and both
are Matt's to turn. If we spend the cycle on the FAIL diagnosis (Move 1)
plus the two people write-ups (Move 3), Matt gets a decision-ready packet
on dials that make the existing code do the thing it was designed to do.
If we spend it on prose, we get a prettier game that still never fires a
coach and still never produces a second scene — and we've spent the
determinism budget to hide it.
