# Football domain: scouting + draft connected system

Last updated: 2026-07-30

> **STATUS: BUILT — 2026-07-30, branch `task/301-scouting-draft-e2e`.** The
> recommended system below shipped with one deliberate narrowing: CPU intel is
> DERIVED from a stable seeded hash (durable per-club opinions at zero save
> cost) rather than stored `ProspectIntel` rows; the user's intel and war-room
> board are stored as recommended (`state.scouting`). See
> `v2/docs/scouting-draft-plan-2026-07-30.md` for the reconciliation,
> `v2/docs/HANDOFF.md` for what shipped and the honest caveats, and
> `v2/scripts/scoutcheck.ts` for the guards. The remaining unbuilt item from
> this doc is durable draft-class review / re-draft analysis pages.

## Topic researched

Build-priority item 4: **scouting + draft as one connected system** — fog-of-war scouting, big board, combine/pro day/private workout inputs, draft state, CPU drafting, pick trades, draft ticker, and rookie conversion into the franchise loop.

This comes after setup/save/load, the attribute contract, and the calendar/advancement spine. Cap/contracts should not lead this phase; rookie deals can remain simplified until the draft loop is fun, deterministic, and inspectable.

## Sources used

- NFL Football Operations — College Player Development / College Advisory Committee.
- NFLPA — Pipeline to the Pros.
- NFL.com — 2026 NFL Scouting Combine schedule, invite count, drills, and public results/tracker framing.
- Football GM manual — player/prospect customization and draft-class size behavior.
- Gridiron GM v2 code: `v2/lib/core/offseason/draft.ts`, `v2/lib/core/types.ts`, `v2/app/draft/page.tsx`, `v2/docs/nfl-reference.md`, `v2/docs/audit-2026-07-27.md`.

## Current Gridiron GM v2 reality

What is already strong:

- `v2/lib/core/offseason/draft.ts` now generates a draftable board (`DRAFT_BOARD = 258`) plus a large weaker camp/UDFA pool (`CAMP_POOL = 420`), matching the earlier calibration direction.
- Prospects live in the single `state.players` array with `prospect: true`; drafting flips the flag and assigns `teamId`, avoiding a parallel player namespace.
- The visible scouting range is not just a cosmetic wrapper around truth. `scoutProspect()` centers the range on a noisy estimate and tightens both error and band width as effort increases.
- `app/draft/page.tsx` explicitly avoids rendering true `ovr`/`pot` for undrafted prospects and sorts from scouted-band midpoint.
- CPU boards use noisy perception, front-office risk, positional value, roster quality, team posture, and BPA/need bias rather than pure true OVR.
- `docs/nfl-reference.md` has high-quality draft outcome baselines from primary datasets: pick-band starter outcomes, survival by round, R1 positional composition, late-emergence rates, and UDFA realities.

Current gaps to address before adding more realism:

- Scouting is still only a generic point spend that narrows projected OVR. It does not yet model **method-specific information**: combine, pro day, private workout, medical, interview, school visit, all-star game.
- `Player` has no prospect metadata fields for college, class year, height/weight, arm/hand, combine numbers, injury flag, character/work ethic/readiness, or scout notes.
- The draft board has no user-owned persistent ordering, tiers, watchlist, tags, or “do not draft” list. The player can sort, but not manage a war-room board.
- CPU scouting is implicit, not team-specific. CPU teams do not carry their own confidence/read models; `cpuBoardValue()` adds independent noise per pick, which creates variation but not a durable scouting department.
- There is no explicit draft-day pick-trade UX in the draft room yet, even though trade calibration work shows modern NFL draft weekends average ~35 trades and ~115 picks moved.
- Draft history is mostly log text. There is no durable draft class review page showing consensus rank, pick value, scheme fit, team need, rookie year outcome, and re-draft style analysis.

## 5-8 takeaways

1. **Scouting should reveal different truths by channel, not just shrink one OVR band.** The NFL/NFLPA process has distinct evaluation surfaces: College Advisory Committee projections, all-star games, Combine, pro days, medicals, interviews, and school/background work. In-game, these should map to different attribute buckets: combine = athletic/tools; pro day = position workout/tool confirmation; private workout = scheme-specific skills; medical = durability/risk; interview/background = mental/character/readiness.

2. **The Combine is a measurement event, not the whole evaluation.** NFL.com lists 319 invited prospects in 2026 and highlights 40, bench, vertical, broad, three-cone, 20-yard shuttle, 60-yard shuttle, plus position-specific drills. Build implication: combine data should be broad, public, and relatively accurate for physical traits, but it should not reveal route running, play recognition, decision-making, work ethic, or true ceiling.

3. **Pro days are the “second look” with instruction signal.** NFLPA frames pro days as a more personal setting where coaches have more time to work with players and observe skill, work ethic, and how well they take instruction. Build implication: pro days should improve confidence on technical traits and coachability, especially for prospects who missed/underperformed at the Combine.

4. **The draft game needs a board-management layer, not just a sorted table.** Real war rooms operate in tiers, flags, fallback groups, positional scarcity, and trade-down zones. Gridiron should store a user board per save: rank overrides, tiers, watchlist, medical/character flags, scheme-fit notes, and “take if available after pick X.” Without this, scouting produces data but no decision workflow.

5. **CPU draft intelligence should have durable team-specific information.** The current CPU noise is useful, but the next step is giving CPU teams scouting confidence profiles: a good scouting department should identify safer floors; a risk-seeking front office should overweight upside; a scheme-heavy club should move fit players up. This must stay deterministic and save-serializable.

6. **Draft trades should be connected to board pressure.** The trade research in `v2/docs/nfl-reference.md` shows draft weekend is the peak trade window: typical modern draft is ~35 trades, ~115 picks moved, with rounds 5-7 making up most traded picks and only ~5 first-round trades. In-game offers should trigger when a team’s tier is depleted, a CPU’s target is near, or the user is on a tier break — not randomly every pick.

7. **Rookie conversion must preserve uncertainty.** Once drafted, the game currently clears scouted bands and the player becomes normal. That is okay mechanically, but the UI should not immediately tell the player “true POT/ceiling.” The user should learn through camp, preseason, practice reps, and regular-season usage. Draft day should answer “what did we buy?” not “exactly what will he become?”

8. **UDFA should be a post-draft mini-phase, not a silent conversion.** v2 correctly creates a large camp pool and converts undrafted prospects into free agents, but the player should get a priority-UDFA chase after Round 7: limited offers, roster/camp capacity, promises, scheme opportunity, and competition from CPU teams. That creates value for scouting late-round and small-school players.

## Recommended canonical scouting model

Add a save-serializable prospect intel layer without changing the one-array player invariant.

### Prospect metadata on `Player`

Add optional fields only; old saves must load:

```ts
interface ProspectProfile {
  college?: string;
  classYear?: "RS_SO" | "JR" | "RS_JR" | "SR" | "RS_SR";
  hometown?: string;
  heightIn?: number;
  weightLb?: number;
  armIn?: number;
  handIn?: number;
  combine?: Partial<Record<CombineMetric, number>>;
  proDay?: Partial<Record<CombineMetric, number>>;
  medicalRisk?: "clean" | "minor" | "moderate" | "major" | "unknown";
  characterRisk?: "clean" | "minor" | "moderate" | "major" | "unknown";
  readiness: number;      // 0..100; early playability, not ceiling
  coachability: number;   // 0..100; visible only through interview/pro day reads
  notes: string[];
}

type CombineMetric =
  | "forty" | "tenSplit" | "bench" | "vertical" | "broad"
  | "threeCone" | "shortShuttle" | "sixtyShuttle";
```

Implementation note: because v2 has a strict no-new-dependency/no-backend invariant, this must stay inside the existing `Player` JSON. Do not create a second `draft_prospects` collection.

### Team-specific scouting intel

Do **not** store one global `scoutedOvrLow/scoutedOvrHigh` as the long-term model. That leaks the user’s work into CPU boards and prevents team-specific misses. Add save-scoped team intel:

```ts
interface ProspectIntel {
  teamId: number;
  playerId: number;
  season: number;
  effort: number;
  methods: Partial<Record<ScoutingMethod, number>>;
  ovrLow: number;
  ovrHigh: number;
  potLow?: number;
  potHigh?: number;
  readinessLow?: number;
  readinessHigh?: number;
  medicalKnown: boolean;
  characterKnown: boolean;
  updatedWeek: number;
}

type ScoutingMethod =
  | "film" | "allStar" | "combine" | "proDay" | "privateWorkout" | "medical" | "interview";
```

Transition path: keep current `Player.scouted*` fields as a compatibility/display fallback, but make the draft page read `state.prospectIntel` for `state.userTeamId` when available.

## Practical build sequence

1. **Create prospect profile fields and generation.** Extend `Player` with optional `prospectProfile`; generate college/class/measurements/combine metrics deterministically in `generateDraftClass()`. Keep old saves compatible.
2. **Add team-specific intel state.** Add `prospectIntel` to `GameState`, migrate old saves to seed user intel from current `Player.scouted*`, and update `spendScouting()` to write per-team intel.
3. **Split scouting methods.** Replace generic `Scout` clicks with method choices: film, combine review, pro day, private workout, medical, interview. Each method tightens different fields.
4. **Build the war-room board.** Add saved user board rows: rank, tier, watchlist, flags, notes. The draft page should surface tier breaks and “best remaining in my tier.”
5. **Connect draft trades to board pressure.** When the user is on the clock, generate trade-down offers if CPU teams have a target inside their next tier and the user’s tier depth supports moving down. Prioritize Day 2/3 volume; do not make first-round blockbusters the default.
6. **Add post-draft/UDFA phase.** After Round 7, expose priority UDFA targets from the same scouting board, with limited roster/camp capacity and CPU competition.
7. **Run gates.** Any engine change touching draft generation, scouting, CPU boards, or rookie conversion must pass `cd /Users/mearls/Projects/gridiron-gm/v2 && npm run gate`.

## Build warning

Do not make scouting omniscient. A fully scouted prospect should become **decision-grade**, not guaranteed truth. True `ceiling`, exact development speed, and exact long-term outcome should remain hidden. The fun is making a defensible decision under uncertainty, then living with it across seasons.

## Next recommended build implication

Build the **team-specific prospect intel + war-room board foundation** before adding more draft ceremony. Concretely: extend v2 `GameState` with `prospectIntel` and `draftBoardNotes`, migrate current global scouted bands into user-specific intel, update the draft page to render from user intel, and only then add combine/pro-day/private-workout method buttons. This preserves fog of war, prevents user scouting from improving CPU boards, and turns scouting into an actual management loop instead of repeated OVR-band clicks.
