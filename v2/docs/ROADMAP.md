# Gridiron GM — Roadmap

Standing roadmap. Read after `AGENTS.md`, before `HANDOFF.md`. Updated
2026-09-10 against `main@a1c419a` (#66 docs; same engine as `c2233e1` /
#64). The 2026-09-10 panel framing in #66 is **wrong**: five metrics
that were inside on the last green 5-seed panel (`190cbd0`, 2026-08-03)
are now red and are not on the known-open list. Those are
**regressions**. Wave 3.3 Packet 1 (read-only bisect on Mac Studio) is
in flight. **No feature lanes. No tuning. Until the bisect reports.**
The engine is the mature half; the franchise half — people, contracts
you can work, a game you can watch — is what remains, but that work
waits on a green panel. Dispatch rules for parallel agents are in
`ORCHESTRATION.md`.

## Where we are

48 commits since 190cbd0, almost all 2026-08-30 → 09-04. ~40 of them
touched the engine with no full-tier read. ~31k LOC ts/tsx, 22
gate harnesses, 14 unit-test files, zero `TODO` markers.

Landed: live free-agency market (CPU counter-bids, `CONTENDER_PULL 0.16` /
`GUARANTEE_PULL 0.25`), Poisson verdict for `milestonesOff`, CPU private
scouting signal + quality scaling, calendar windows + 30 private visits
replacing scouting points, veteran beliefs on the FA market, cutdown +
deadline trade markets, late-round career fixes, Season Review, standings
history, ROY rookies-only. Roster-rules cluster: 90-man camp + cut to 53,
IR + 16-man PS, gameday inactives 47/48, waiver wire + claim-chain settle,
call sheet + Play-the-Game, camp-90 fill, CPU IR replacements, franchise-tag
phase, fifth-year option, July 15 extension. PRs #46–49: playtest-chain
fixes (stale prior-year picks + inbox into tag window; defenders as
receiving leaders; camp copy /53→/90; waiver-hundreds accepted as
cap-stuck residue). `rb5RushYds` was **inside** on the last green panel
(1254 vs 1191 ±95). The 2026-09-10 Mac Studio panel reads **1301.80**.
That is a regression, not a leftover to record.

### Gate status

| metric | reads | target | status | note |
|---|---|---|---|---|
| `leverage.wrongSign` | 1 | ≤ 0 | non-defect | OT.sta knife-edge probe rounding to 0.0. Do not invent a leverage fix. |
| `statcheck.wr10RecYds` | **1099.60** | 1208 ±97 | panel-red | Inherited family historically; this panel is also red (was 1,136 on a prior panel; fast-tier single-seed 1018). One of the nine FAIL ticks. Do not invent a receiving fix while Packet 1 is in flight. |
| `statcheck.rb5RushYds` | **1301.80** | 1191 ±95 | **regression** | Inside on `190cbd0` (1254). Not on the known-open list. Provisional shipped tick until the panel is green. Do not chase with `CARRY_SHARE`. |
| `drift.tradesPerSeason` | **~13.25** | 60–120 | **symptom** | Mac Studio 5-seed panel: 12.45 / 12.45 / 14.05 / 12.65 / 14.65. Dedicated Wave 3.1B `drift.ts 20` seed 12345 still **12.6**. Passes `min: 5`. The 87/55/40/63/1/6/then 0×14 collapse is the same franchise-arc event as `capBustSeasons` (~31% of clubs in 2030–31) and `ovrDrift`: cap-stuck clubs fail `checkTrade`; deflated OVR shrinks `evaluate()` surplus above `REPLACEMENT_OVR=58`. Not a volume-tuning leftover. |
| `drift.p0Failures` | **3** | ≤ 0 | **regression** | Inside on `190cbd0`. Not known-open. Internal p0s: save growth, OVR deflation, age ordering. Not the trades floor. |
| `drift.saveGrowthMbPerSeason` | **0.46** | ≤ 0.45 | **regression** | Was +0.402 and retired green. Dedicated 0.462. Do not move the locked max. |
| `drift.saveMbAtEnd` | **11.91** | ≤ 10.5 | **regression** | Inside on `190cbd0`. Not known-open. Dedicated 20-season was 12.02. Do not move the locked max. |
| `drift.playerWeeksLost` | **2976.25** | 2158 ±700 | **regression** | Inside on `190cbd0`. Not known-open. Dedicated 20-season was 3041. |
| `drift.ovrDrift` | **−4.31** | −0.52 ±1.5 | **regression** | Inside on `190cbd0`. Not known-open. Dedicated 20-season was −4.13. Deflation. |
| `careers.survivalMae` | 5.94 | < 4 | open | R1–R3 over-survive. Cannot close from a late-round hold. Careers **ok** on this panel (16527 s ×5); no new MAE claimed. |
| `careers.careerLenMae` | 0.57 | < 0.5 | open | Residue is R1/R2/R4 one–two-season careers; must not be shortened. |
| `conditions.coldPointsDelta` | −0.5 | −2.4 | unconfirmed | Single seed, 6 seasons. Check on a matched-seed baseline first. |
| `tails.milestonesOff` | **19.60** | 0 | panel-worse | Mac Studio panel vs max 16 (KNOWN-HIGH already in `baselines.json`). Prior lock 16.0 (14/15/15/18/18). Known-open got worse. One of the nine FAIL ticks. Do not tune against the aggregate. |
| `drift.passRecordSeasons` | 0/20 | 1–3/20 | accepted | Leader averages 4,742 vs 5,477 record. Reopen only with a pass-volume mechanism that leaves the mix alone. |
| QB availability 2nd moment | 41% at 16+ | 46% | accepted | Needs a per-position duration table — design change. |

**Standing prerequisite:** five-seed panel is **FAIL** (2026-09-10,
Matt's Mac Studio, 14 cores, `npm run gate:full:serial` at
`main@c2233e1` / #64). Wall ~50937 s (~14.1 h). GATE FAIL — 9
problems. Five of them (`ovrDrift`, `playerWeeksLost`, `p0Failures`,
`saveMbAtEnd`, `rb5RushYds`) were inside on `190cbd0` and are not
known-open — **regressions**. The nine reds are provisional shipped
ticks until the panel is green again. Do not edit `baselines.json`.
Wave 3.3 Packet 1 (read-only bisect on Mac Studio) is in flight; **no
feature lanes / no tuning until it reports.** `tradesPerSeason` panel
mean ~13.25 is the collapse symptom, not a leftover knob. Serial path
stays the right tool on 4-core VMs (`#64`, `npm run gate:full:serial`);
AGENTS.md ratification of that additive `scripts/` serial mode is
still owed as a lead edit. Use `--seeds 1` or a dedicated
`npx tsx scripts/drift.ts 20` on that class of box. Do not retry stock
`Promise.all` `gate:full` on 4 cores. Do not merge #9 or #63.

## What is missing

**The game is invisible.** No play-by-play anywhere; the game page is a scoring
summary with no drive log or chart. Play-the-Game shows down/distance/score but
never the result of the snap you just called; `liveGame.ts` is 72 lines that
re-run the game from a snapshot on every peek.

**No people.** Coaches are seven numbers on `Team`, generated once — no
HC/OC/DC, contracts, hiring, firing, carousel. No owner, expectations, or job
security (`firingEnabled` is wired to nothing and migrates off). No media or
storylines. No player psychology — no morale, holdouts, trade requests,
contract-year behavior, or personality beyond `coachability`.

**The GM's desk is half empty.** No user extensions or restructures
(`select.ts:280` and `briefing.ts:242` tell the user to "restructure at
/finances" — there is no button there). No void years, no cap carryover;
Finances is a read-only cap sheet. Rookie deals are per-round (pick 1 = pick
32). No compensatory picks (224 vs real 254–262; `draft.ts:28`).
`askingPrice` / `negotiatedApy` run on true OVR — an invertible leak.

**The world is thin.** No preseason games (a phase, not games). No Hall of Fame
or franchise-history page despite the data existing. Special teams: no onside
kicks, blocks, fair catches, returner slots. No QB benched for bad play, no
trick plays. The Darnold path is "not calibrated on purpose" — it has to be
designed. No 6-vet PS cap, no international PS slot. Year-2 waiver desk reads
267 names — mathematically correct, but a product problem.

## Finish order

Sequence matters more than the list. Each phase is one or more packets under
the contract: one task, one branch, one file cluster, gate green, HANDOFF note.

### Phase 0 — recover the last green panel (NOW)

The 2026-09-10 panel is a FAIL, not a finished re-lock. Five metrics that
were inside on `190cbd0` are red and not on the known-open list:
regressions. ~40 engine-touching commits landed with no full-tier read;
some broke the franchise arc. Wave 3.3 Packet 1 (read-only bisect on Mac
Studio) is **in flight**. Find the commit(s). **No feature lanes. No
tuning.** Do not edit `baselines.json`. Do not merge #9 or #63.

After the bisect reports: retire stale AGENTS.md rows; ratify the #64
serial runner (additive `scripts/` progress + serial mode) in AGENTS.md
as a lead edit — that paragraph is still owed. Then the published-rules
leftovers: restructure advice text; rookie slot scale and the
compensatory-pick formula (published CBA math, no calibration argument);
`askingPrice` onto the club's belief. Year-2 waiver desk ~267 is the
#41/#49 cap-stuck residue — product decision whether to age them to the
street after the window; not a settle miss. Do not wipe as a "bug fix."
Write the "registering a new test in `gate.ts` is the one permitted
`scripts/` edit" exception into AGENTS.md (PR #47 did it; make it a
rule). Re-run the scouting challenge audit when the arc is green again:
the "solved line" existed because CPU reads were noise; private signal +
veteran beliefs were meant to fix that and nobody has measured whether
they did.

### Phase 1 — make the engine visible (after the panel is green)

Text play-by-play and a drive log generated from the events `game.ts` already
produces. A real game page with a drive chart. Play-the-Game that shows the
result of every snap you called, without re-simulating from a snapshot per
peek. Zero outcome changes — gate metrics byte-identical to `main`.

Highest-leverage item in the project once the panel is green: every hour of
calibration becomes something the player can feel.

### Phase 2 — the people layer, kept deterministic

HC + two coordinators as people with contracts and tendencies, feeding
`effectiveCoach` and carrying the schemes; an offseason carousel where CPU
clubs poach your OC. An owner with expectations from `teamOutlook` posture and
a patience dial so `firingEnabled` finally bites. Minimal player psychology:
contract-year effects, holdouts and trade requests driven by role vs rating vs
money. No morale sliders. All on child RNG streams. Add a `peoplecheck`
harness so turnover, firing rate, and holdout frequency are measured against
real NFL rates.

### Phase 3 — the contract office

User extensions, restructures, void years, cap carryover. Finances becomes a
desk. Cap gymnastics is half of what a real GM does.

### Phase 4 — history and identity

Hall of Fame, franchise-history page (`SeasonHistory` data exists), retired
numbers, all-time timeline. Design the Darnold path: a change-of-scene
development window at QB gated by scheme fit and real opportunity, with a
`careers` metric so we know how often it fires.

### Phase 5 — narration

The approved LLM use: scouting-report prose, season recaps, a press conference
after a loss. Thin proxy so keys stay off the client; fully optional so offline
play survives; never in a decision loop.

### Phase 6 — the long tail

Preseason games feeding camp battles into the cutdown. Onside and blocked
kicks. Benching a passer for bad play. Trick plays. Per-position injury
duration for QB. Real, not urgent.

## The bar

OOTP wins on depth of world. Football Manager wins on the feeling that the
people are real. Madden franchise wins on presentation. Nobody wins on provable
realism — a gate that can say "statistically indistinguishable from the NFL"
and mean it, and a scouting system where the CPU has beliefs rather than
answers. That is already built. Phases 1 and 2 are what let it compete on the
other two axes.
