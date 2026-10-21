# Gridiron GM — Roadmap

Standing roadmap. Read after `AGENTS.md`, before `HANDOFF.md`. **Updated
2026-10-21** against the #182 Studio panel (`a393ac9`, Mac Studio
`npm run gate:full:serial`, 5 seeds) and `main` at `664d212` (#185–#189
merged). `HANDOFF.md` is the
record; this file is the plan. Dispatch rules for parallel agents are in
`ORCHESTRATION.md`.

Standing rules, unchanged:

- **CALIBRATION FREEZE** (Matt SIGNED 2026-10-08). No new metrics, bands or
  re-locks unless a playtest finding needs one.
- **Report, never tune.** Do not edit `docs/baselines.json` without a signed
  re-lock. Every real-NFL number traces to `docs/nfl-reference.md`.
- The serial runner is the measurement path. On a ≤4-core box use
  `--seeds 1` or one harness; a cloud session's 2-hour background limit cannot
  hold `gate:full:serial`.

## Where we are

Phases 1–4 of the September plan have shipped. What follows is the shape, not
the changelog; each line has a dated `HANDOFF.md` entry.

- **Engine visible (Phase 1).** Text play-by-play, drive log and Drive Chart
  (#53, #81, #83, P1/P3/P4 signed 2026-09-28). `/play` calls a situation,
  stores the snap, and a finished `/play` game is the official result. Paced
  draft night.
- **People (Phase 2).** Seeded coaches and owners at `newGame` (#111); HC and
  coordinator chairs, empty chairs, the coaching carousel on the tag hub; owner
  heat window and two-season firing rule (no fire after a winning season or a
  three-win jump); holdouts and trade requests; people counters and teeth.
- **Contract office (Phase 3).** User extensions and restructures, void years,
  cap carryover, contract ceilings, rookie slot scale, compensatory picks,
  franchise tag window and tender ceiling, fifth-year option, July 15
  extension, retirement acceleration, user re-sign step, FA bid premium
  ceiling.
- **History and identity (Phase 4).** Hall of Fame as a league event (with
  postseason club history), jersey and retired numbers, franchise history,
  the second scene (Darnold path, success band 7–16% pooled).
- **Scouting.** Named scouts and a focus list, film / pro-day caps, risk grades
  with consequences, public athletic testing, scheme-fit grades, CPU drafting
  on believed fit, future classes alive before they are scouted, fogged trade
  board. The solved line is closed (2026-09-15 audit).
- **Roster rules.** Camp 90 → 53, IR + 16-man PS, gameday inactives, waiver
  wire with claim chains, QB ≤3 on the 53.
- **Trades (#185, #186).** Review before Accept and Propose; the calling club
  re-checks an offer at Accept like a physical; guarantees travel with a traded
  contract and the check prices what execution posts (CBA Art. 13 §6(b)(ii)).
  CPU clubs price an acquired player at the base salary they take on.
- **Pro rata salary (#187).** In-season base salary is charged by the
  regular-season week; weeks already paid stay with the club that paid them.
- **Preseason (#189, packet A).** Three exhibition weeks in camp before the
  cut, outside `state.games`; starters mostly sit; no camp nudge yet.
- **Saves.** Storage identity separate from the league seed; legacy saves
  repair regular-season totals on load (#182).

### Gate status

Latest Studio panel: #182 at `a393ac9`, **GATE FAIL 5**, all five decided by
Matt 2026-10-18. **No Studio panel since**, so #185–#189 are unpanelled.

On a 4-core box, 2026-10-21 (HANDOFF has the detail):
- `gate:serial --seeds 1` **PASS** on each merge, preseason last.
- Full tier on `main` `5b6d738`, split by step: determinism, verify,
  leverage, sweep, calibrate, statcheck, rbpanel, tails, coherence, staff
  and scout **PASS**. `conditions` **FAIL** on the default seed only
  (`coldPointsDelta` −0.02); `GG_SEED=1..4` all inside the band.
  `careers` and `drift` did not finish inside the 2-hour limit.

| metric | reads | target | status | note |
|---|---|---|---|---|
| `userOffers` seed-42 canary | tag 1725353685, FA 2028992364 | literal | signed 2026-10-20 | Moved with #185 trade cap accounting, trade valuation (2282341061 / 3785709883), then pro rata salary. No new parent draws. |
| `staff.problems` | seed 2 `leagueOvrDelta` 1.31 | ≤ 1.2 per seed | reported red | Mean 0.58. Left reported 2026-10-18. Do not widen 1.2. |
| `careers.path2BurnInTop10PrPct` | 7/116 = 6.03% | 7–16% pooled | reported red | k-of-n noise (P(k≤8)≈0.40). Left reported. |
| `statcheck.rb5RushYds` | 1255.68 (100-seed, #185) | 1191 ±95 | **PASS** | Fixed 100-seed panel since 2026-10-18. |
| `drift.playerWeeksLost` | 1638.95 | 2158 ±700 | PASS, not re-locked | Measurement changed to weekly injury/IR status (2026-10-16). |
| `tails.milestonesOff` | 10.0 | ≤ 16 | **PASS** | Exact Poisson comparisons (2026-10-16). |
| `leverage.wrongSign` / `drift.p0Failures` / coherence | 0 / 0 / ok | 0 / 0 / ≥85 | **PASS** at `a393ac9` | Age guard replaced by the paired post-peak guard. |
| `careers.survivalMae` | 5.94 (2026-08-31) | < 4 | open | R1–R3 over-survive. Not re-measured since. |
| `careers.careerLenMae` | 0.57 (2026-08-31) | < 0.5 | open | R1/R2/R4 residue; must not be shortened. |
| `conditions.coldPointsDelta` | −0.02 default seed; −2.37 / −2.18 / −3.00 / −2.05 on `GG_SEED=1..4` | −2.13 ±1.6 | default seed red, noise | Default seed moved −1.21 → −0.02 with #187's roster changes; other seeds in band (2026-10-21). |
| `drift.healthyIrWeeks` | 49.3 → 73.4 with preseason (one seed) | report-only | explained | Rule-driven: healed inside the 4-game IR minimum (~55%) or club out of its 8 return designations (~45%). Preseason on vs off, 2 seeds × 4 seasons: no consistent change (2026-10-21). |
| `drift.passRecordSeasons` | 0/20 | 1–3/20 | accepted limitation | Needs pass volume without touching the mix. |
| QB availability 2nd moment | 41% at 16+ | 46% | accepted limitation | Needs a per-position duration table. |

## Finish order

### Now — a Studio panel on `main`

Run `npm run gate:full:serial` on the Mac Studio against `main` (`664d212`)
and post the GATE table to `HANDOFF.md`. It is the first panel since #182 and
covers five merges: trade review and cap accounting (#185), trade valuation
(#186), pro rata salary (#187), the e2e fix (#188) and preseason packet A
(#189). `careers` and `drift` have not been read on any of them; drift moved
trades 77.6 → 92.3 across #185–#187 (NFL ≈90).

### Next — preseason packet B (the camp nudge)

Let preseason play move who survives the cut. It acts on `careers` survival
(R6–R7, UDFA), which is already open (R1–R3 over-survive), so it must be read
on a Studio panel before it is turned on. Design:
`docs/preseason-games-design-2026-10-20.md`.

### Then — the long tail (Phase 6, unchanged)

Onside kicks, blocked
kicks and fair catches (none in the sim today). Benching a passer for bad
play. Trick plays. A per-position injury duration table (closes the QB
availability limitation). The 6-veteran PS cap and international PS slot.
Real, not urgent.

### Phase 1 leftovers

Formation tree and play art; a `/play` session that survives refresh; a live
opening kick; **P5** (snap log on every CPU box — save-size lead decision, not
signed); **P2** (optional `PlayEvent` fields, not signed).

### Phase 5 — narration

The approved LLM use: scouting-report prose, season recaps, a press conference
after a loss. Thin proxy so keys stay off the client; fully optional so offline
play survives; never in a decision loop. Not started.

### Small product items

- The draft room's on-the-clock offers accept in one click with no review and
  no re-check (`acceptClockOffer`). Nearly always pick-for-pick, so low
  priority.
- Year-2 waiver desk (~267 names) is cap-stuck residue — product decision
  whether to age them to the street after the window. Not a settle miss.

## The bar

OOTP wins on depth of world. Football Manager wins on the feeling that the
people are real. Madden franchise wins on presentation. Nobody wins on provable
realism — a gate that can say "statistically indistinguishable from the NFL"
and mean it, and a scouting system where the CPU has beliefs rather than
answers. That is already built. Phases 1 and 2 are what let it compete on the
other two axes.
