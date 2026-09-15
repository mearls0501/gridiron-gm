# Gridiron GM — Roadmap

Standing roadmap. Read after `AGENTS.md`, before `HANDOFF.md`. Updated
2026-09-13 against Wave 3.7 panel (Mac Studio,
`npm run gate:full:serial` at `2752729` / #77). **Wave 3.7 panel
posted** in `HANDOFF.md`. Packet 2 (baseline re-lock) awaits Matt
sign. `capBustSeasons` **2.60** and `minPayrollSeasonsUnder55`
**4.40** are findings — report, do not tune. **No feature lanes. No
tuning. Do not edit `baselines.json`.** The engine is the mature
half; the franchise half — people, contracts you can work, a game you
can watch — is what remains. Dispatch rules for parallel agents are
in `ORCHESTRATION.md`.

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
(1254 vs 1191 ±95). Wave 3.7 records `rb5RushYds` **1301.80** (stream).
Do not chase with `CARRY_SHARE`.

### Gate status

Wave 3.7 5-seed means (`2752729` / #77). Full table in `HANDOFF.md`.

| metric | reads | target | status | note |
|---|---|---|---|---|
| `leverage.wrongSign` | 1 | ≤ 0 | non-defect | OT.sta knife-edge probe rounding to 0.0. Do not invent a leverage fix. |
| `statcheck.wr10RecYds` | **1099.60** | 1208 ±97 | stream / record | Wave 3.7. Do not invent a receiving fix. |
| `statcheck.rb5RushYds` | **1301.80** | 1191 ±95 | stream / record | Wave 3.7. Do not chase with `CARRY_SHARE`. |
| `drift.tradesPerSeason` | **~64.8** | 40–70 | **PASS** | Wave 3.7: 62.7/64/67.7/64.0/65.8. #77 kept `Trade:` log rows. Packet 2 proposed today ≈65, min 30, drop internal ≤20 P0. |
| `drift.franchiseTagsPerSeason` | **~14.0** | 8–16 | **PASS** | Wave 3.7: 15.1/13.8/12.3/14.3/14.4. Packet 2 proposed 14 ±4, nfl 10. |
| `drift.p0Failures` | **4.40** | only stale trades≤20 | **FINDING** | More than the stale ceiling (age/cap/payroll/etc.). Report, do not tune. |
| `drift.capBustSeasons` | **2.60** | 0–1 | **FINDING** | 2/1/4/4/2. Tag rules leak. Report, do not tune. |
| `drift.minPayrollSeasonsUnder55` | **4.40** | not on expect table | **FINDING** | Report, do not tune. |
| `drift.saveGrowthMbPerSeason` | **0.47** | ≤ 0.45 | expected red | Packet 2 proposed max 0.52. Do not move the lock here. |
| `drift.saveMbAtEnd` | **12.10** | ≤ 10.5 | expected red | Packet 2 proposed max 13.1. Do not move the lock here. |
| `drift.playerWeeksLost` | **~2621** | 2158 ±700 | **PASS** | Wave 3.7: 2618/2597/2600/2612/2677. |
| `drift.ovrDrift` | **−1.70** | −0.52 ±1.5 | **PASS** | Seeds −1.55/−1.53/−1.80/−1.80/−1.80. Not in gate FAIL list. Packet 2 proposed −1.70 ±1.5. |
| `careers.survivalMae` | 5.94 | < 4 | open | R1–R3 over-survive. Cannot close from a late-round hold. No new MAE claimed. |
| `careers.careerLenMae` | 0.57 | < 0.5 | open | Residue is R1/R2/R4 one–two-season careers; must not be shortened. |
| `conditions.coldPointsDelta` | −0.5 | −2.4 | unconfirmed | Single seed, 6 seasons. Check on a matched-seed baseline first. |
| `tails.milestonesOff` | **19.60** | 0 | stream / KNOWN-HIGH | Wave 3.7 record. Max 16 already in `baselines.json`. Do not tune against the aggregate. |
| `drift.passRecordSeasons` | 0/20 | 1–3/20 | accepted | Leader averages 4,742 vs 5,477 record. Reopen only with a pass-volume mechanism that leaves the mix alone. |
| QB availability 2nd moment | 41% at 16+ | 46% | accepted | Needs a per-position duration table — design change. |

**Standing prerequisite:** Wave 3.7 panel posted (2026-09-12 ~20:51 ET,
Matt's Mac Studio, `npm run gate:full:serial` at `main@2752729` / #77).
Wall ~19555 s (~5.4 h). EXIT 1. GATE FAIL — 9. `ovrDrift` −1.70,
`playerWeeksLost` ~2621, `tradesPerSeason` ~64.8, tags ~14.0 are
**PASS**. Save-size reds (`saveMbAtEnd` 12.10 / `saveGrowth` 0.47)
await Packet 2 re-lock. `capBustSeasons` 2.60 and
`minPayrollSeasonsUnder55` 4.40 are findings. Packet 2 awaits Matt
sign. **No feature lanes / no tuning.** Do not edit `baselines.json`.
Serial path stays the supported long-panel / Mac Studio measurement
path (`#64`, `npm run gate:full:serial`; ratified in AGENTS.md). Use
`--seeds 1` or a dedicated `npx tsx scripts/drift.ts 20` on 4-core
boxes. Do not retry stock `Promise.all` `gate:full` on 4 cores. Do
not merge #9 or #63.

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

Wave 3.7 panel posted (`HANDOFF.md`). Packet 2 awaits Matt sign.
`capBustSeasons` 2.60 and `minPayrollSeasonsUnder55` 4.40 are
findings — report, do not tune. Save-size re-lock is Packet 2, not a
worker edit. **No feature lanes. No tuning.** Do not edit
`baselines.json`. Do not merge #9 or #63.

After the bisect reports: retire stale AGENTS.md rows. Then the published-rules
leftovers: restructure advice text; rookie slot scale and the
compensatory-pick formula (published CBA math, no calibration argument);
`askingPrice` onto the club's belief. Year-2 waiver desk ~267 is the
#41/#49 cap-stuck residue — product decision whether to age them to the
street after the window; not a settle miss. Do not wipe as a "bug fix."
The #64 serial runner and the #47 test-registration exception are
ratified in AGENTS.md. ~~Re-run the scouting challenge audit: the
solved line existed because CPU reads were noise; private signal +
veteran beliefs were meant to fix that and nobody has measured whether
they did.~~ **CLOSED 2026-09-15 (Wave 3.9 scout-audit).** Write-up:
`v2/docs/scouting-challenge-audit-2026-09-14.md`. Verdict: **the
solved line is closed** — information ceiling buys +0.1 true points
per slot over auto-pick (+0.6 in R1–2), inside seed noise; the
exploit arms have fewer starter-seasons per pick and twice the
R1–2 bust rate. Packets 7/8/9 (film/pro-day caps, risk-grade teeth,
+2 probe) are Phase 4 addendum after Packets 3–5 — consequences, not
tuning; none reopen the line.

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
