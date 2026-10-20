# Gridiron GM — Roadmap

Standing roadmap. Read after `AGENTS.md`, before `HANDOFF.md`. **Updated
2026-10-20** against the #182 Studio panel (`a393ac9`, Mac Studio
`npm run gate:full:serial`, 5 seeds) and draft PR #185. `HANDOFF.md` is the
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
- **Trades (#185, draft).** Review before Accept and Propose; the calling club
  re-checks an offer at Accept like a physical; guarantees travel with a traded
  contract and the check prices what execution posts (CBA Art. 13 §6(b)(ii)).
- **Saves.** Storage identity separate from the league seed; legacy saves
  repair regular-season totals on load (#182).

### Gate status

Latest Studio panel: #182 at `a393ac9`, **GATE FAIL 5**, all five decided by
Matt 2026-10-18. Since then on a 4-core box: `gate:serial --seeds 1` **PASS**
on #185 head `4d350f0` (72 metrics). #185's full tier has not been run.

| metric | reads | target | status | note |
|---|---|---|---|---|
| `userOffers` seed-42 canary | tag 2282341061, FA 3785709883 | literal | signed 2026-10-20 | Moved with #185 trade cap accounting (3967213056 / 3639016065), then with trade valuation. No new parent draws. |
| `staff.problems` | seed 2 `leagueOvrDelta` 1.31 | ≤ 1.2 per seed | reported red | Mean 0.58. Left reported 2026-10-18. Do not widen 1.2. |
| `careers.path2BurnInTop10PrPct` | 7/116 = 6.03% | 7–16% pooled | reported red | k-of-n noise (P(k≤8)≈0.40). Left reported. |
| `statcheck.rb5RushYds` | 1255.68 (100-seed, #185) | 1191 ±95 | **PASS** | Fixed 100-seed panel since 2026-10-18. |
| `drift.playerWeeksLost` | 1638.95 | 2158 ±700 | PASS, not re-locked | Measurement changed to weekly injury/IR status (2026-10-16). |
| `tails.milestonesOff` | 10.0 | ≤ 16 | **PASS** | Exact Poisson comparisons (2026-10-16). |
| `leverage.wrongSign` / `drift.p0Failures` / coherence | 0 / 0 / ok | 0 / 0 / ≥85 | **PASS** at `a393ac9` | Age guard replaced by the paired post-peak guard. |
| `careers.survivalMae` | 5.94 (2026-08-31) | < 4 | open | R1–R3 over-survive. Not re-measured since. |
| `careers.careerLenMae` | 0.57 (2026-08-31) | < 0.5 | open | R1/R2/R4 residue; must not be shortened. |
| `conditions.coldPointsDelta` | −0.5 | −2.4 | unconfirmed | Single seed, 6 seasons. |
| `drift.passRecordSeasons` | 0/20 | 1–3/20 | accepted limitation | Needs pass volume without touching the mix. |
| QB availability 2nd moment | 41% at 16+ | 46% | accepted limitation | Needs a per-position duration table. |

## Finish order

### Now — land #185

Run `npm run gate:full:serial` on the Mac Studio against #185, post the GATE
table to `HANDOFF.md`, click through `/trades`, merge. #185 changed which CPU
trades clear (paired 10-season drift, seed 12345: trades 77.6 → 81.8,
dead money 5.37% → 5.51%), so `drift` and `careers` must be read before merge.

### Next — CPU prices a trade at the acquiring club's cost (`claude/trade-valuation`)

`playerTradeValue` priced a target at the sender's `capHit`, bonus proration
included. Since #185 the receiver only takes on base salary (and the
guarantee), so CPU clubs over-priced bonus-heavy players. The acquiring side
now uses `acquiredCapHit` (base only); a club valuing its own player is
unchanged. Paired 10-season drift (seed 12345): trades 81.8 → **88.9** (NFL
≈90), dead money 5.51% → 5.44%. Seed-42 canary signed 2026-10-20. Stacked on
#185; needs a Studio panel.

### Later — in-season salary is pro rata (season-wide rule; design first)

The sim charges a full year's base salary to whoever holds a contract, at any
point in the season: a deadline trade, a mid-season street signing, a waiver
claim and a cut all count the whole year. In the NFL base salary is paid
weekly over the regular season, so each club carries only the weeks it held
the player (`docs/nfl-reference.md`, "Trade cap accounting", not modelled).
Doing it for trades alone would make trades the one transaction priced by the
week. It needs one rule for every in-season transaction, and a separate
bucket for salary already earned — booking it as dead money would inflate
`drift.deadMoneyPct`, which is read against OTC's dead-money share. Primary
source and design first, then a packet with its own panel.

### Then — the long tail (Phase 6, unchanged)

Preseason games feeding camp battles into the cutdown. Onside kicks, blocked
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
