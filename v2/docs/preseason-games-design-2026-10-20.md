# Preseason games — design note (2026-10-20)

Docs only. No code, no gate, no baseline. Asked for by Matt (ROADMAP Phase 6:
"Preseason games feeding camp battles into the cutdown"). **Decided
2026-10-20 (Matt):** see "Decided" at the end. Build starts after #185–#187
merge. The calibration freeze (signed 2026-10-08) applies: this is a
feature with no NFL rate behind its main mechanism, so that part is designed
to be ungated and switchable.

## What the NFL does

- **Three games.** The preseason went from four games to three in 2021, when
  the regular season went to 17 (Bears and Pro Football Rumors on the 2021
  cutdown change).
- **One cut to 53, after the last preseason week.** 2021–22 staged the cut
  (90 → 85 → 80 → 53, each on the Tuesday after a preseason game). From 2023
  there is a single cutdown date after the third preseason week (Bucs 2022
  rules; NBC Chicago 2024 cut-day explainer). Camp opens at 90.
- **Starters barely play.** In 2024, 10 starting quarterbacks threw no
  preseason pass and the average starter threw 10.1, about 30% fewer than in
  2021 (Fox Sports). Several clubs (the Rams most visibly) sit starters and key
  depth entirely. It varies by club.
- **Injuries are real.** Preseason injuries count, and players carry them into
  the season. Published rates are mixed and mostly secondary (a thesis citing
  11.5 vs 9.4 for preseason vs regular season; a COVID-era study on the
  cancelled 2020 preseason). None of these is a primary per-snap rate this
  repo could trace.
- **Camp battles.** Bubble players earn or lose spots in these games, but there
  is **no published study** of how much preseason play changes who makes the
  53 (searched: PFF UDFA grades, roster projections, a Claremont thesis on UDFA
  survival — none measures it). Under invariant 7 that mechanism has no
  traceable rate, so it stays ungated.

## What the sim does today

From a read of `claude/pro-rata-salary` (`ef12286`).

- **Calendar.** Camp is `offseason-draft` → `offseason-final` (90-man limit,
  `isCampPhase`). The cutdown to 53 happens inside `finalizeOffseason`
  (`offseason/index.ts`), *before* the calendar rolls to phase `preseason`:
  `foldPracticeSquad` → `reconcileRoster(…, ROSTER_LIMIT, true)` →
  `spendToFloor` → `upgradeRoster` for CPU clubs, then the user's club is
  auto-trimmed. Phase `preseason` is a single post-cut step; "Start the
  Season" calls `startRegularSeason`, which builds the schedule. No games.
- **Who gets cut.** Deterministic, no RNG, no game evidence:
  `cutWorstSurplus` / `moveWorstSurplus` cut the lowest
  `evaluate(...) + draftCapitalHold(...)` above `POSITION_MIN` (true OVR and
  potential, age, posture, front-office dials; extra rope for R6–R7 rookies).
  `upgradeRoster` swaps for street free agents.
- **Games.** `state.games` holds only this season; `Game` has one type flag,
  `playoffRound`. Many readers filter on it, but several do not: `weekGames`,
  `userNextGame`, `recordGame`, `seasonReview.userGames`, `briefing`
  opponent history, `statcheck` (sums every box), `verify` box checks.
- **Engine.** `simulateGame(state, game, rng, opts)` reads
  `team.depthChart`, coaches and `game.conditions`; writes in-game injuries to
  players and the log; returns a box (drives on every game, the snap log only
  on user games). `simulateWeek` folds stats into season lines, records,
  injuries (`rollWeeklyInjuries` on a hash-keyed child stream), IR, fill and
  trades.
- **Harnesses** assume preseason → regular is one `advance()` and that the
  offseason ends in phase `preseason` (`verify`, `statcheck`, `tails`,
  `calibrate`, `sweep`, `drift`). Offseason loop guards allow 12 steps.
  `drift.playerWeeksLost` reads injury/IR status at each regular-season
  kickoff, so injuries carried out of preseason games would count there.
  Save size is read at `offseason-recap`.

## Proposed design

### 1. Where the games live: inside camp, before the cut

Keep phase `offseason-final` as camp and give it three preseason weeks before
the cutdown, tracked in new optional state:
`state.preseason?: { season, week: 0..3, games: PreseasonGame[] }`.
"Start the Season" on the hub becomes, in order: *Play preseason week 1*,
*week 2*, *week 3*, then *Final cuts* (today's `finalizeOffseason`). The
existing `preseason` phase stays the post-cut step before week 1, so every
harness that expects one `advance()` from `preseason` to `regular` is
unchanged. The offseason gains three steps (well inside the 12-step guards).

### 2. Separate storage, never in `state.games`

`PreseasonGame` is its own type in its own array, so no regular-season
reader can count it: no season stat lines, no `recordGame`, no standings, no
milestones, no `statcheck`. Store a compact result (score, scoring summary)
plus a per-player **camp line** (snaps and a handful of production fields) on
`state.preseason`, not full boxes and never a snap log. Wipe it when the
regular season starts. Save size is read at `offseason-recap`, so
`drift.saveMbAtEnd` and growth are untouched.

### 3. Who plays: a preseason usage plan

Each club plays its 90 with starters mostly sitting, per the NFL trend:
default plan — starters out (or one series), second unit through the first
half, third unit after. The user can choose per game (sit / one series /
first quarter). CPU clubs use the default, with a club dial for the variance
the sources describe. The engine already picks the QB per play through `onField(ctx, pos, slot)`
and pulls him when a game is `decided`; **open question for the build:** whether the engine
can switch whole units by drive or quarter, or whether each game should be
simulated as segments with a temporary depth chart per segment. The note
does not assume either; the first build step is that read.

### 4. RNG: hash-keyed child streams only

Each preseason game draws from a child stream keyed
`(seed, season, "preseason", week, gameIndex)`, the same pattern as
`medicalChildRng` and the future-class streams. The parent `rngState` never
moves, so the draft, FA and everything up to camp are byte-identical, and the
seed-42 canary moves only through what the games change (injuries, cuts).

### 5. Injuries: real, at the engine's own rates

Use the engine's existing per-snap injury model unchanged — no preseason
multiplier, because there is no primary rate to set one from. A player hurt
in week 2 of the preseason carries it into camp decisions and possibly into
week 1. Expect `drift.playerWeeksLost` to rise; that is the NFL behaviour, not
a regression, and the panel would report it, not tune it.

### 6. Camp battles: a bounded, ungated nudge at the cut

Turn each player's camp line into a **camp grade**: production per snap
against his position's preseason average, shrunk toward zero by snap count so
a 12-snap fluke cannot swing a roster. At the cutdown,
`cutWorstSurplus` / `upgradeRoster` add a bounded term to their existing
valuation (`evaluate + draftCapitalHold + campNudge`). The nudge is a design
dial, not an NFL rate: it only reorders players already close in value, and
it is off by default in the first packet. Only players near the cut line are
affected in practice, because starters barely play.

The grade reads box production, which the engine derives from true ratings
plus game noise, so it carries real signal mixed with luck — the honest shape
of a camp battle. For the user's club it is information on their own bubble
players; for CPU clubs it adds variance to who survives the cut.

### 7. Screens

- Hub: the camp card shows "Preseason week N of 3" and the next action.
- `/schedule`: a Preseason section above week 1 (results only).
- A preseason game page: score, scoring summary, and camp lines for both
  clubs, sorted by snaps. No `/play` for preseason in the first packet.
- `/roster` during camp: a camp-grade column next to the cut controls.

## What it moves

- **Packet A (games, no nudge):** injuries carried into the season
  (`playerWeeksLost`, IR reads, inactives), the seed-42 canary, harness run
  time (+48 games a season, about +18% simulated games). Nothing in
  regular-season stats, records or save size.
- **Packet B (nudge on):** who survives the cut, so `careers` (R6–R7 and UDFA
  survival, `survivalMae`, `careerLenMae`) and the cutdown trade and waiver
  markets. This is exactly the axis where `careers` is already open
  (R1–R3 over-survive; R6–R7 near target), so the nudge must be read on a
  Studio panel before it is turned on.

Both need a Studio panel and a signed canary.

## Tests it would need

- Preseason games never appear in `state.games`, season stat lines, records,
  standings or milestones; `statcheck` and `verify` totals are unchanged on a
  league where the preseason was played.
- The parent `rngState` is identical before and after three preseason weeks
  that produce no injuries (stream isolation, as `userOffers.test.ts` does
  for inquiries).
- A preseason injury is still on the player at the cut and at week-1 kickoff.
- Usage plan: starters' preseason snaps are a small share; every rostered
  player at a position with depth gets snaps.
- With the nudge off, the cut is byte-identical to today's for the same camp
  roster; with it on, it only reorders players within a bounded value gap.
- The camp line is wiped at the regular-season start; save size at
  `offseason-recap` is unchanged.
- Harnesses: the offseason still ends in phase `preseason`, one `advance()`
  still reaches `regular`.

## Decisions for Matt

1. **Placement.** Preseason weeks inside camp (`offseason-final`) before the
   cut, as above, keeping the existing `preseason` phase as the post-cut step?
2. **Packets.** A first (games, injuries, screens; nudge off), then B (camp
   nudge) after A's panel? Or both at once?
3. **Injuries.** Engine's own per-snap rates, no preseason multiplier (no
   primary source for one)?
4. **User control.** Per-game usage choice for the user's club (sit / one
   series / first quarter), or the default plan only?
5. **Staged cuts.** The single 53 cut after week 3 (current NFL), not the
   2021–22 staged 85/80/53?

## Decided (Matt, 2026-10-20)

1. **Placement:** three preseason weeks inside camp (`offseason-final`),
   before the cut. The existing `preseason` phase stays the post-cut step, so
   harnesses that take one `advance()` from `preseason` to `regular` are
   unchanged.
2. **Packets:** A first — games, injuries, screens and the user's usage
   choice, camp nudge **off** — with its own Studio panel and signed canary.
   Then B, the camp nudge, as a separate small packet with its own panel.
3. **Injuries:** the engine's own per-snap rates, no preseason multiplier.
4. **Usage:** the default plan for CPU clubs; for the user's club a per-game
   choice (sit / one series / first quarter). No `/play` for preseason in
   packet A.
5. **Cuts:** a single cut to 53 after preseason week 3, as today.

First build step for packet A: read whether the engine can swap whole units
within a game through `onField`; if not, simulate each game in segments with a
temporary depth chart per segment.

## Engine check (2026-10-21)

Read of `lib/core/sim/game.ts` on `claude/dazzling-pasteur-02nh3y`. Answer:
**whole-unit rotation fits the engine as it is; no segmenting needed.**

- **Units are live, mutable arrays.** `mkCtx` builds `ctx.starters` once per
  club at kickoff (`buildStarters`, ROTATION players per position), and every
  selection path reads it by index during play. The engine already changes
  who is on the field mid-game: an in-game injury calls `removeFromUnits`,
  which splices the man out and pushes `nextAvailable` from the depth chart,
  then `repointCoverage` fixes the coverage map. A unit swap is the same
  operation for a whole position at once.
- **Snaps and fatigue follow automatically.** `creditSnaps` credits
  `SNAP_SHARE` by slot to whoever is in each unit on that play, and
  `fatigueMult` reads each player's own snap count, so a fresh second unit
  plays fresh. In-game injury rolls land on the players actually in the
  collision, so backups carry the risk when they play.
- **What a swap must refresh.** Three things are fixed at kickoff:
  - coverage assignments (`assignCoverage`, keyed by receiver id) — re-run it
    for both sides after a swap;
  - the per-player game script (`script.targetBoost`) — readers already
    default a missing id to 1, so newcomers play at baseline unless the swap
    draws them a value;
  - `openers` (who counts as a starter) — irrelevant here, since preseason
    lines never reach season stats.
- **Where to swap.** The play loop has clean boundaries: the quarter change
  (`quarter++`, with the second-half kickoff at `quarter === 3`) and
  `startDrive`. "Sit", "one series" and "first quarter" map to swapping at
  kickoff, after the club's first drive, or at the end of the first quarter;
  second unit to third unit at halftime.
- **Shape of the change.** One optional exhibition setting on the sim options
  (per-club usage plan), read only by preseason games. With it absent the
  engine takes no new branch and no new random draw, so every regular-season
  and playoff game stays byte-identical — the gate and the seed-42 canary
  would show it. `assignCoverage` draws from the game's rng, and a preseason
  game's rng is its own hash-keyed child stream, so a re-run costs the parent
  nothing.
- **Two details for the build.**
  - The engine plays overtime when tied after four quarters
    (`game.playoffRound === null` only stops a second period). The NFL has
    played preseason games without overtime since 2021 — to be confirmed
    against a primary source before the build; the exhibition setting would
    end a tied game after the fourth quarter.
  - In-game injuries are logged with `week: game.week`. A preseason game
    should carry its own week label (or week 0) so the log does not read as
    regular-season weeks 1–3.
