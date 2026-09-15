# Scouting challenge audit — 2026-09-14

Claude's lane, Wave 3.9. Read-only on the engine. Base `main @ 748036a` (#88).
Harness: `v2/scout-audit.ts` on branch `claude/scout-audit` (patch attached;
not gate material — it is a 60-minute run).

## The question

The Aug-31 finding was that the draft had a "solved line": spend the 30
private visits on the prospects around your own slot, run the cheap medical
and interview reveals on everyone, trade down whenever a club comes up, and
out-draft the league — because CPU boards were noise and the user's board
was not. #7/#21 (private signal, durable per-club beliefs) and #24 (veteran
beliefs) were built to close it. Nobody had measured whether they did.

## Method

A policy bot drives the user club headlessly for 14 seasons on three seeds
(12345, 1, 2), three arms per seed, nine runs, same league start:

| arm | what the user club does |
|---|---|
| `control` | auto-drafts through `cpuPick` — exactly what every headless harness does today |
| `line` | the solved line: interviews + medicals on the consensus top 140, all 30 visits on the slot neighbourhood of its R1 and R2 picks (20 + 10, projected from the standings), picks best-by-belief, accepts a trade-down whenever its own board is flat over the gap the buyer asks it to drop |
| `max` | the information ceiling: in-season film on the consensus top 160 until every band is tight (film is uncapped — 960 studies a season), pro days on the top 100, then the line on top |

In every arm the user club is housekept like a CPU club (re-sign, FA bids,
spend-to-floor, cutdown, priority UDFAs) so the known headless-user bias
(`checkParity`) does not leak into snap-share outcome labels. Scoring is
`outcomes.ts` unchanged — hit, bust, 4-year starter, star, elite, starter
seasons — on the nine classes old enough to judge (drafted seasons 1–9,
judged at season 14). "Slot value" is true `ovr + 0.5·(pot − ovr)` at the
draft minus the mean of CPU picks made within ±8 slots: what the pick was
actually worth against what the neighbourhood got.

The bot's board is shaped like the CPU's (`cpuBoardValue`: ability above
replacement × √positional value × starts-here × thin-position), priced on
the user's intel bands instead of the club's private view. It is one
policy, not the best possible one; the ceiling claim below is bounded by it.

## Results — pooled over three seeds

User club, all rounds (n ≈ 200 picks per arm; CPU n ≈ 7,000):

| arm | hit % | bust % (R1–2) | 4-yr starter % | star % | starter seasons / pick | slot value |
|---|---|---|---|---|---|---|
| CPU clubs (any arm) | 42.7–43.3 | 14.0–14.8 | 27.5–28.0 | 5.9–6.3 | 2.2 | 0.00 |
| `control` user | 48.2 | 18.8 | 32.1 | 8.3 | 2.6 | +1.97 |
| `line` user | 46.6 | 30.7 | 27.9 | 6.7 | 2.3 | +2.11 |
| `max` user | 45.7 | 33.3 | 29.9 | 9.6 | 2.5 | +2.09 |

Rounds 1–2 only (n ≈ 55 per arm):

| arm | hit % | bust % | 4-yr starter % | star % | true OVR at draft | true POT at draft | slot value |
|---|---|---|---|---|---|---|---|
| CPU | 85.7–86.8 | 14.0–14.8 | 67.9–70.6 | 20.3–21.3 | 69.5 | 82.8–83.2 | 0.0 |
| `control` | 79.6 | 18.5 | 68.5 | 22.2 | 70.1 | 84.3 | +1.52 |
| `line` | 70.9 | 30.9 | 49.1 | 16.4 | 67.9 | 82.4 | +0.06 |
| `max` | 68.4 | 33.3 | 54.4 | 24.6 | 69.5 | 86.0 | +2.12 |

Rounds 5–7 (n ≈ 70–77):

| arm | hit % | 4-yr starter % | starter seasons / pick | slot value |
|---|---|---|---|---|
| CPU | 15.1–16.5 | 5.0–5.6 | 0.5 | 0.0 |
| `control` | 15.7 | 5.7 | 0.6 | +3.02 |
| `line` | 29.9 | 11.7 | 1.1 | +3.13 |
| `max` | 17.1 | 5.7 | 0.7 | +2.48 |

Activity: `line` took 9–22 trade-downs per 14 drafts out of 64–96 offers;
`max` 7–16. Visits 30/season in both; `max` ran 13,440 film studies per
run. No GM firings in any run. User win rate 8.3–10.8 / 17 in every arm —
the arms did not change the club's competitiveness.

## Verdict

**The solved line is closed.** With private-club beliefs in place, the
user's information advantage — even at its ceiling, near-perfect bands on
the top 160 of every class — buys about **+0.1 true points per slot over
auto-pick** across the draft and **+0.6 in rounds 1–2** (+2.12 vs +1.52).
That is inside the seed-to-seed spread (control-user slot value ran +1.73 to
+2.41 across seeds). On outcomes the exploit arms are not better than
auto-pick: fewer starter seasons per pick (`line` 2.3, `max` 2.5 vs 2.6),
and twice the round-1–2 bust rate. The Aug-31 line no longer out-drafts the
league. #7/#21 did what they were built to do.

Three things the numbers do say, and none of them is the old exploit:

1. **Information buys potential, not floor.** `max` drafts at the same true
   OVR as the CPU (69.5 vs 69.5 in R1–2) but +3 POT (86.0 vs 83.2), and
   pays for it with busts (33% vs 14%) while winning more stars (24.6% vs
   20.3%). That is the bot's board weighting `room` at 0.5 on tight bands,
   and it is the shape a real user's high-upside board would take. It is a
   tradeoff, not an edge — the design goal.
2. **Trading down is a depth strategy, not a value strategy.** `line`'s
   late-round hit rate doubles (29.9% vs 15%) and its 4-year-starter rate
   in rounds 5–7 doubles, because it holds twice as many of those picks and
   the neighbourhood visits land on exactly those men. Its rounds 1–2 are
   the worst in the study (slot value +0.06, bust 30.9%): a bot with 20
   visits' worth of intel on one slot and public bands on everyone else
   chases wide default POT bands. Net starter seasons per pick fall. A
   human would do the same thing for the same reason.
3. **Auto-pick for the user club runs ~+2 true points per slot above CPU
   neighbours in every arm — including `control`, where the user club
   drafts with the CPU's own code.** That is not scouting; the user's
   scouting share is exactly neutral (q = 1.000, CPU spread 0.88–1.15 after
   `refreshCpuStaff`). The two candidates are the user's neutral
   front-office profile against the CPU's randomised `risk`/`bpaBias`
   spread, and the winner's curse on CPU move-ups (the club that trades up
   is the one whose private read is the optimistic one; the user club is
   never a buyer). Both are plausible, both are real-league phenomena, and
   this audit was not built to separate them. **Report, do not tune** — but
   it deserves its own probe, because if it is the winner's curse it says
   CPU clock trades are net-negative for the buyer and that is a number the
   trade market should know.

## Two structural findings from the code, independent of the numbers

- **Risk grades have no teeth.** `medicalRisk` / `characterRisk` are read
  by exactly one consumer: `riskDiscount()`, the CPU's price markdown. No
  injury model, no holdout, no psychology hook reads them. A medical or an
  interview therefore tells the user nothing that changes a career — and a
  user who knows this *wants* the men the CPU marks down, because the
  discount is free value. The audit bot ignored grades for this reason.
  This is a gap between what the scouting calendar promises ("reveal risk")
  and what the sim does with it.
- **Film and pro days are uncapped.** The visit cap (30) is the only
  constraint in the calendar; nothing limits film studies or pro days per
  prospect or per window. `max` ran 960 film studies a season through the
  same code path the Film button uses. The audit shows this does not break
  the draft — but it makes the visit cap decorative and the "miss the
  window and the information does not exist" design a matter of click
  count rather than allocation.

## Recommended follow-up (Phase 4 addendum, not urgent — three small packets)

1. **Cap film and pro days per prospect per window** (e.g. 2 film studies
   in `filmFocus`, 1 pro day). Display-and-gating change in `scouting.ts`
   `canRunScoutingMethod` + `scoutingBlockReason`; `scoutcheck` regression;
   byte-identical calibrate/statcheck. Restores the allocation problem the
   calendar was designed around.
2. **Give risk grades consequences.** `medicalRisk` → injury propensity in
   the existing injury draw (a child stream; `moderate`/`major` raise the
   per-game hazard); `characterRisk` → a holdout / demand-escalation
   modifier in `psychology.ts`. Emits: `careers.medicalMajorGamesMissed`,
   `psychology.holdoutsByCharacter`. Escalate class: the size of each
   effect is a Matt sign-off; the reference should be checked for an
   injury-rate-by-combine-medical number before any baseline.
3. **Probe the +2.** Re-run `control` with the user's front office
   randomised like a CPU club's, and separately tag CPU picks acquired by
   clock trade and measure their slot value against original-owner picks.
   One number each. If the move-up picks run negative, that is a finding
   for the trade market's pricing, not a tuning job.

None of these reopens the solved line; the line is closed. The audit
harness stays on `claude/scout-audit` as a lane script, not a gate test.

## Measurement notes (for `measurement_traps.md`)

- The user club had to be housekept as a CPU club in every arm, or the
  hit label (snap share) would have measured roster weakness, not draft
  quality. `state.userTeamId` was swapped to a sentinel around
  `runFreeAgencyOpen` / `openFaBidding` / `runAllFaWaves` only; the draft
  and the final phase were driven explicitly. Do not use the sentinel
  around `enterDraft` — `runDraftUntilUser` will run the whole draft.
- Slot value is a within-draft measure; it is immune to the roster
  confound and to the line's trade-downs moving picks later. The outcome
  labels are not immune to policy shape (a pot-heavy board *will* bust
  more and star more).
- Nine classes per run; ~200 user picks per arm pooled. Round-band cells
  are n ≈ 55–77 — enough for a 10-point effect, not a 3-point one. Seed
  spread on user slot value is ±0.4.
