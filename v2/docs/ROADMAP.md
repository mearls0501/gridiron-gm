# Gridiron GM — Roadmap

Standing roadmap. Read after `AGENTS.md`, before `HANDOFF.md`. **Updated
2026-11-13** against `main` at `2b5b81e` (#234). The last Studio panel on
`main` is `ddc62bd` (#204, 2026-10-27). `HANDOFF.md` is the record; this file
is the plan. Dispatch rules for parallel agents are in `ORCHESTRATION.md`.

Standing rules, unchanged:

- **CALIBRATION FREEZE** (Matt SIGNED 2026-10-08). No new metrics, bands or
  re-locks unless a playtest finding needs one.
- **Report, never tune.** Do not edit `docs/baselines.json` without a signed
  re-lock. Every real-NFL number traces to `docs/nfl-reference.md`.
- The serial runner is the measurement path. On a ≤4-core box use
  `--seeds 1` or one harness; a cloud session's 2-hour background limit cannot
  hold `gate:full:serial`.

## Where we are

Phases 1–4 of the September plan have shipped. Since 2026-10-21 the work has
been playtest fixes, cap mechanics and stat tails, not new phases. What
follows is the shape, not the changelog; each line has a dated `HANDOFF.md`
entry.

- **Engine visible (Phase 1).** Text play-by-play, drive log and Drive Chart
  (#53, #81, #83, P1/P3/P4 signed 2026-09-28). `/play` calls a situation,
  stores the snap, and a finished `/play` game is the official result. Paced
  draft night. A live game screen and grouped nav (#227).
- **People (Phase 2).** Seeded coaches and owners at `newGame` (#111); HC and
  coordinator chairs, empty chairs, the coaching carousel on the tag hub;
  coordinators stay on the staff market and an empty HC is flagged (#195);
  owner heat window and two-season firing rule; the owner card judges pace in
  season (#210) and early firing verdicts are withheld (#194); holdouts and
  trade requests; people counters and teeth.
- **Contract office (Phase 3).** User extensions and restructures, void years,
  cap carryover, contract ceilings, rookie slot scale, compensatory picks
  (labelled, #193), franchise tag window and tender ceiling, fifth-year
  option, July 15 extension, retirement acceleration, user re-sign step (fixed
  in #196; the tag waits until a fired GM picks), FA bid premium ceiling.
- **Cap mechanics.** Pro rata in-season base salary (#187). Waiver clearing:
  the bonus books at the cut, a claim carries base and guarantee only, no
  limbo (#198). CPU clubs spend carried room under a signed 20% carryover
  ceiling, legalize with the smallest covering hit, and spend a legal book
  back to the floor (BUG-A, #214). Start the Season no longer rewrites the
  user's deals and is blocked while the user is over the cap (BUG-D, #213).
  FA Auto-fix holds the user's draft and camp bill (#221).
- **Trades.** Review before Accept and Propose; the calling club re-checks an
  offer at Accept; guarantees travel with a traded contract (CBA Art. 13
  §6(b)(ii)); CPU clubs price an acquired player at the base salary they take
  on (#185, #186). Draft-night trade-downs are reviewed before they commit
  (#191). Post-deadline trade calls are dropped (#193).
- **Roster rules.** Camp 90 → 53, IR + 16-man PS, gameday inactives, waiver
  wire with claim chains, QB ≤3 on the 53. Depth charts, auto-fill and the
  53 (#197); CPU rosters refilled after the waiver cap cut (#201); the
  emergency quarterback only on an empty room (#202) and a short QB unit does
  not take another position (#205). The Hub sim stops on a long QB1 injury
  (#223).
- **Preseason.** Three exhibition weeks in camp before the cut, outside
  `state.games` (#189, packet A). The camp nudge (packet B, #192) is built
  and ships **off**.
- **History and identity (Phase 4).** Hall of Fame as a league event, classes
  capped at five under the signed bar (#225); jersey and retired numbers;
  franchise history that keeps the club the user ran that year (#216) and
  the archived division place (#223); the second scene (Darnold path, success
  band 7–16% pooled).
- **Stat tails.** Target share and tackle share bend past the NFL tails;
  primary tackle credit at the 2021–24 rate; no tackle on a scoring play
  (#222). Team tackles near **655** a season are accepted (Matt, 2026-11-11);
  the engine credits no special-teams tackle. The real 712.3 includes them:
  44.6 a club-season come on kickoffs and punts, so the scrimmage-only
  comparison is **667.7** (`nfl-reference.md` §5.14, 2026-11-13).
- **Scouting.** Named scouts and a focus list, film / pro-day caps, risk grades
  with consequences, public athletic testing, scheme-fit grades, CPU drafting
  on believed fit, future classes alive before they are scouted, fogged trade
  board. The solved line is closed (2026-09-15 audit).
- **Performance and saves.** Start the Season no longer walks every retiree
  (#218). Storage identity separate from the league seed; legacy saves repair
  regular-season totals on load (#182). `determinism` plays the regular season
  and playoffs (#226).

### Gate status

**Last Studio panel on `main`:** `ddc62bd` (#204), 2026-10-27, **GATE FAIL 1**:
`coherence` seed 2 at 83.7 under the per-seed floor of 85 (mean 87.65). Not a
sim bug; #205 reshuffled the seed-2 sample
(`docs/gate-fail-ddc62bd-seed2-coherence.md`). Accepted as noise.

The #214 branch was panelled three times (`cf73d64`, `65e1284`, `a76092b`;
GATE FAIL 4 / 4 / 7). Each led to a signed fix
(`docs/panel-*-investigation.md`). The final #214 head was not panelled.

**Unpanelled on `main` since `ddc62bd`:** #213, #214, #216, #218, #221, #222,
#223, #225, #226, #227. `drift` and `careers` have not been read on any of
them.

On a 4-core box, 2026-11-11, merge head `b5c2a21` plus the signed re-lock:
`tsc --noEmit` pass; `npm test` pass; `verify.ts 5` 552/552; `determinism.ts
2` deterministic, 0 failures, 0 banned API uses.

| metric | reads | target | status | note |
|---|---|---|---|---|
| `userOffers` seed-42 canary | tag 1779302491, FA 1323223106 | literal | signed 2026-11-11 | Moved with #222/#223/#225/#226. |
| `trimIdentity` seed-42 opening 2030 | 1587 cuts, rng 19218870 | literal | signed 2026-11-11 | Same re-lock. |
| `calibrate.fgPct` | 81.995 (`calibrate.ts 300`, pre-merge #222 head) | floor 82.029 | **reported red** | Not re-measured or tuned. Read it on the next panel. |
| `coherence.outlierExplainedPct` | seed 2 83.7 at `ddc62bd` | ≥ 85 per seed | noise | Per-seed floor; panel mean 87.65. |
| `staff.leagueOvrDelta` | panel mean | ≤ 1.2 mean | lock changed | Signed 2026-10-27 (#204): the cap is the panel mean, not per seed. |
| `drift.medianPayrollPct` | 96.46 at `65e1284` | 90.602 ±6 | inside | Rose ~1.1 with BUG-A spending; the NFL note is 92. |
| `careers.path2BurnInTop10PrPct` | 7/116 = 6.03% | 7–16% pooled | reported red | k-of-n noise. Left reported 2026-10-18. |
| `statcheck.rb5RushYds` | 1255.68 (100-seed, #185) | 1191 ±95 | **PASS** | Fixed 100-seed panel. |
| `tails.milestonesOff` | 11 (`tails.ts 16`, #222) | ≤ 16 | **PASS** | Primary-tackle rows recomputed 2026-11-11. |
| `drift.playerWeeksLost` | 1638.95 | 2158 ±700 | PASS, not re-locked | Measurement changed 2026-10-16. |
| `careers.survivalMae` | 5.94 (2026-08-31) | < 4 | open | R1–R3 over-survive. Not re-measured since. |
| `careers.careerLenMae` | 0.57 (2026-08-31) | < 0.5 | open | R1/R2/R4 residue; must not be shortened. |
| `conditions.coldPointsDelta` | −0.02 default seed; in band on `GG_SEED=1..4` | −2.13 ±1.6 | default seed red, noise | 2026-10-21. |
| `drift.passRecordSeasons` | 0/20 | 1–3/20 | accepted limitation | Needs pass volume without touching the mix. |
| QB availability 2nd moment | 41% at 16+ | 46% | accepted limitation | Needs a per-position duration table. |

## Finish order

### Now — a Studio panel on `main`

Run `npm run gate:full:serial` on the Mac Studio against `main` (`2b5b81e`)
and post the GATE table to `HANDOFF.md`. It is the first `main` panel since
`ddc62bd` and covers every merge since, including the BUG-A spend change
(#214), the stat-tail bend (#222), the Hall of Fame rules (#225), rookie
guarantees and the tag-window meter (#229, merged without a panel) and the
Phase 1 leftovers (#234). Read `drift`, `careers`, `calibrate.fgPct` and
`drift.medianPayrollPct` first. Protocol, unsigned:
`docs/proposal-studio-panel-and-camp-nudge-2026-11-11.md`.

The two playtest-1028 proposals (dead-if-cut on rookie deals, tag-window
re-sign cap space) were signed and built in #229, with residuals in #232.

### Then — turn on the camp nudge?

Packet B (`lib/core/campGrade.ts`) lets preseason play move who survives the
cut. It acts on `careers` survival (R6–R7, UDFA), which is already open, so
read a Studio panel with `GG_CAMP_NUDGE=1` against one without before turning
it on. Design: `docs/preseason-games-design-2026-10-20.md`.

### Then — the long tail (Phase 6)

Each item has an unsigned proposal (2026-11-11). Invariant 7 holds a build
until its rates are in `nfl-reference.md`.

| item | proposal | blocked on |
|---|---|---|
| Onside kicks, blocked kicks, fair catches | `proposal-kicking-game-events-2026-11-11.md` | **Traced** 2026-11-13 (§5.14; kickoff rates by rule era). Now Matt's decisions: kickoff era, staging, Stage 2 re-lock. |
| Special-teams tackles | `proposal-special-teams-tackles-2026-11-11.md` | **Traced** 2026-11-13 (§5.14: the 712.3 includes them; 44.6 a club-season; coverage-tackle rate 0.764 KR, 0.803 PR). Now Matt's sign. |
| Per-position injury duration table (QB availability limitation) | `proposal-injury-duration-by-position-2026-11-11.md` | **QB traced** 2026-11-13 (§6.10: spell lengths; a third of QB1 missed games are not injuries, so the target is injury-only). QB table refit 2026-11-13, corrected (risk 1.50; the first refit, #239, compared all-cause to injury-only and is withdrawn). Held-out seeds land on injury-only and all-cause. `main`'s QB1s are hurt as often as real ones but out too long (3.1 missed a season against 2.7); no drift since October. Other positions traced 2026-11-14 (§6.11: half their injury spells are one game, so the same floor applies). Now Matt's decisions. |
| Benching a passer, trick plays | `proposal-qb-benching-and-trick-plays-2026-11-11.md` | **Traced** 2026-11-14 (§5.4c: trick plays 6.0 pts, blowout relief 6.1, benching 3.6, starter hurt 3.3, gadget/one series 2.4). The sim's shape is off (too many blowout reliefs). Now Matt's decisions. |
| 6-veteran PS cap, international slot | `proposal-practice-squad-veteran-and-international-2026-11-11.md` | CBA text not cited; the sim has no accrued seasons and no international players. Not urgent. |

§5.14 also shows the engine's untraced kick constants against real rows (a
finding, not tuned): punt return share 0.55 against 0.464, punt return TD
0.004 against 0.0057, kickoff touchback 0.62 against 0.598 (2021–22).

### Phase 1 leftovers

Built 2026-11-13 (`docs/proposal-phase1-play-leftovers-2026-11-11.md`, packets
A, B, C, D1, E3): play art as a field strip (no formation drawing), the
`/play` kickoff key (the session already survived refresh, HANDOFF
2026-10-01), the opening kick shown with its kicker, **P2** (`kickerId`,
`returnerId`, defensive-TD row order) and **P5** as a one-week CPU snap log.
Still out: a formation tree (no traced formation or personnel rates), the
engine live opening kick (**D2**, with kicking-game Stage 2), and
`returnYards` (the fumble-return distance and pick-six yards are wrong today).

### Phase 5 — narration

The approved LLM use: scouting-report prose, season recaps, a press conference
after a loss. Thin proxy so keys stay off the client; fully optional so offline
play survives; never in a decision loop. Not started. Proposal:
`proposal-narration-proxy-2026-11-11.md` — needs three signatures (an
invariant 5 amendment, a monthly spend ceiling, raw HTTP or the SDK).

### Housekeeping

- `docs/playtest-1029-hall-of-fame.md` still reads UNSIGNED; the signature is
  the 2026-11-10 `HANDOFF.md` entry.
- Award weights are scaled to a league with no assist. Leave them until
  someone wants a traced voting model.
- CPU clubs carry 90 and sit over the cap until the cut; the NFL counts the
  top 51 in the offseason. Not changed.

## The bar

OOTP wins on depth of world. Football Manager wins on the feeling that the
people are real. Madden franchise wins on presentation. Nobody wins on provable
realism — a gate that can say "statistically indistinguishable from the NFL"
and mean it, and a scouting system where the CPU has beliefs rather than
answers. That is already built. Phases 1 and 2 are what let it compete on the
other two axes.
