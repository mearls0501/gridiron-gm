# Scouting + draft end-to-end — build plan, 2026-07-30

The active build. Takes the design settled 2026-07-28 (`front-office-design-2026-07-28.md`)
and the research pass of 2026-07-30 (`../../docs/football-domain-scouting-draft.md`) and
turns them into one testable loop: scout a class through the season → run a war-room board
→ draft against 31 clubs that each know different things → trade on the clock → chase
priority UDFAs → live with what you bought.

## Reconciliation against the standing docs

- `football-domain-scouting-draft.md` (2026-07-30) — **adopted**, with one narrowing: it
  proposes a stored `ProspectIntel` row per (team, prospect). CPU intel here is **derived,
  not stored** (see below) — same observable behaviour, zero save growth, zero extra RNG
  stream consumption.
- `front-office-design-2026-07-28.md` decision 5 says belief should eventually be
  UNIVERSAL — `(evaluator, player)` covering veterans, FA and trades. **Deliberately out
  of scope here.** Rewiring `evaluate()` league-wide moves every trade/FA/re-sign metric at
  once and cannot be verified in the same pass as a feature build. The prospect intel
  layer is shaped so it extends to veterans later without rework.
- `football-domain-save-load-ownership.md` recommends Supabase auth/RLS work — **v1 only.**
  It contradicts v2 invariant 5 (no backend). Not actioned here.
- `football-domain-attribute-model.md` (archetypes/scheme-fit layer) — not this pass;
  scheme fit stays stubbed at 1.0 per decision 7 of the design doc.

## What is wrong today (verified at 6b3e171)

1. `cpuBoardValue` reads true `p.pot` in three places — on the dimension that decides a
   draft the CPU has perfect information and the user has none.
2. One shared board: the CPU reads the same `p.scoutedOvrLow/High` the user paid to
   sharpen, and its per-call `rng.normal(0, 3.5)` jitter means no club holds an opinion.
3. Scouting is one undifferentiated point-spend that narrows one OVR band. No methods, no
   potential estimate, no medical/character, no measurements.
4. A prospect's true ability leaks: `app/player/[id]` renders all ~40 true attributes, from
   which true OVR is exactly recoverable via position weights.
5. Draft-day trading is one CPU-only burst before pick 1. Nobody moves on the clock, the
   user never gets a move-up/move-down decision, and ~70 of the real ~90 annual trades are
   missing exactly here (funnel analysis, HANDOFF 2026-07-29).
6. Undrafted prospects silently become free agents. No priority-UDFA chase.
7. No war-room board: no tiers, no watchlist, no notes, no rank overrides.

## The model

### Public layer (everyone sees the same thing, costs nothing)

- `Player.prospectProfile` — college, class year, height/weight/arm/hand, combine and
  pro-day numbers, plus hidden `medicalRisk`/`characterRisk`/`coachability` that scouting
  can reveal. Generated deterministically on the class's own child RNG stream (the
  stream-position lesson of 2026-07-28 — the parent advances by exactly one draw).
- Combine numbers derive from true physical attributes + noise, so a 4.31 forty genuinely
  means speed — the public data is real but partial: tools, not football.
- A public **consensus board** — the media's big board. Derived rank from true OVR + a
  stable seeded hash noise keyed (season, player). Same for every club, gives the draft
  page its default order, replaces "sorted by the user's own band" as the anonymous prior.

### User intel (stored, the thing you pay for)

`state.scouting = { season, intel: {playerId: UserIntel}, board: {playerId: BoardNote} }`

- `UserIntel` — OVR band **and potential band**, both centred on genuinely wrong
  estimates that tighten with effort; which methods have been run; revealed
  medical/character grades.
- Methods spend the season's scouting points (the staff-budget bucket, unchanged):
  film study (OVR band), pro day (technical + coachability), private workout (big
  OVR+POT tightening, per-prospect), medical (risk grade), interview (character +
  mental read). Combine data is free and public.
- Runs all season — the class is seeded at the rollover already; this build just gives
  the points somewhere to go every week, not only in the draft phase.
- Pruned at `finalizeOffseason` — intel on a spent class is dead weight.
- Legacy `p.scouted*` fields remain as a fallback so old saves display; first user spend
  migrates that prospect into intel.

### CPU intel (derived, never stored)

`cpuProspectView(state, teamId, p)` → `{ ovr, pot }`: true value + stable noise from a
pure integer hash of (seed, season, teamId, playerId). No storage, no RNG draws, fully
deterministic, survives save/load by construction — and every club holds a durable,
different opinion, which is what "scouting is competitive information" means mechanically.

- Error sd scales with the club's staff scouting share (`share(team, "scouting")`) — a
  club that funds scouting genuinely sees the class better.
- `frontOffice.risk` leans the pot estimate optimistic/pessimistic; the existing archetype
  dials keep doing their job through it.
- Aggregate error is tuned to match the old model's effective error (old: shared band with
  ~10-pt midpoint error + 3.5 jitter on OVR, **zero** error on pot), so league-wide draft
  quality — which `careers` grades — moves as little as possible while the *shape* of who
  knows what changes completely.
- `cpuBoardValue` loses every direct read of `p.pot` and of the user's band.

### The war room

- Board notes per prospect: tier (1-5), watchlist, avoid flag, free-text note, explicit
  rank override. Persisted per save, pruned with the class.
- Draft page renders from user intel + consensus, never from truth; board tab surfaces
  "best available in my tiers", tier breaks, and flags inline on the clock.
- Player page for prospects shows attribute *ranges* per bucket — physical tight once
  combine data exists, technical after film/pro day, mental after interview — centred on
  stable hash noise, so nothing on any page reconstructs true OVR.

### Draft weekend

- **CPU↔CPU on-the-clock trading**: before a CPU pick, clubs that just watched their
  board tier collapse can move up; the club on the clock prices the slot with its own
  board. Bounded per draft; targets the real shape (~35 trades, day-3 heavy, ~5 R1).
- **User on the clock**: incoming trade-down offers appear in the draft room when CPU
  clubs have a live target; a move-up panel lets the user call the club on the clock and
  offer picks. Both paths price through the existing asymmetric `packageValue` machinery.
- The pre-draft burst (`runDraftDayTrades`) shrinks to a small early-window pass so total
  volume lands near the real ~35 rather than double-counting.

### Priority UDFA

After pick 224, board-grade undrafted prospects enter a short priority-FA chase: the user
signs up to a small number against CPU clubs bidding from their own boards; the rest
convert as today. Headless runs resolve it automatically inside the same
`advanceOffseason("offseason-draft")` step — the phase count harnesses loop on is
unchanged.

## What this deliberately does not do

- No scout entities with names/XP/regions (design decision 4: front-office archetype only).
- No veteran/FA belief rewiring (decision 5's full scope) — next pass.
- No scheme-fit activation, no combine *event* ceremony, no draft ticker theatrics.
- True `ceiling` stays unscoutable forever. A fully scouted prospect is decision-grade,
  not certain.

## Verification

- `npm run gate` after every stage; `careers` re-run (reduced seasons on 2 cores) after
  the `cpuBoardValue` rewrite, since draft-order quality is exactly what it grades.
- New `scoutcheck` harness (lead change, flagged for Matt): asserts user spend tightens
  user bands only, CPU boards are stable across calls and differ across clubs, no
  rendered surface can reconstruct true OVR for an unscouted prospect, and an even staff
  budget leaves CPU intel error at its neutral level (invariant 6).
- Stream-shift honesty: generation changes move the PRNG stream, so single-league metrics
  in `conditions`/`tails`/`statcheck` will re-roll. Anything red there gets the
  class-size A/B check from `gate_stream_sensitivity` before it is believed, and the
  matched-seed evidence goes in the handoff either way.
- Browser: both e2e suites, plus draft-room interaction extended to cover a scout action,
  a board note, and a UDFA signing.
