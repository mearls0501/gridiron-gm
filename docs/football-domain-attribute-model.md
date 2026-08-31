# Football domain research — attribute model, archetypes, OVR/POT, scheme fit

Last updated: 2026-07-29

## Focus

Build-priority item 2: lock the player attribute model before deeper season systems, scouting, draft, roster, free agency, or cap work. This is the shared language that every other subsystem will read.

This pass reviewed authoritative/public football-rating references and the current Gridiron GM code path:

- NFL Combine public tracker/results and prospect-news framing from NFL.com.
- Football GM manual for sports-management-sim rating philosophy.
- EA Madden public ratings database and Madden archetype/scheme-fit references.
- Current root Next.js code in `lib/ratings/normalized-schema-types.ts` and `lib/team-strength/compute-team-strength.ts`.
- Current v2 browser-first engine in `v2/lib/core/types.ts`, `v2/lib/core/ratings.ts`, `v2/lib/core/generate.ts`, and `v2/lib/core/sim/game.ts`.

## Current code reality

### Root app model

The root app already has a richer conceptual model than the v2 engine:

- `PlayerTrueRatings` separates broad traits (`spd`, `str`, `agi`, `acc`, `durability`, `footballIQ`, character/work ethic/leadership/clutch) from `positionAttributes`.
- `ScoutedPlayer` supports hidden information via estimated OVR/POT ranges, per-attribute estimates, confidence, scheme-fit assessment, character assessment, and scout notes.
- `SchemeFitProfile` stores per-scheme fit modifiers.
- `computeDisplayedPlayerOverall()` uses position-specific weights and `computeEffectivePlayerOverall()` applies a scheme-fit modifier.

Gap: this model is not yet the canonical simulation model. It exists in root modules but the v2 engine has its own simpler attribute contract.

### v2 engine model

The v2 engine is cleaner and more testable:

- `Player.attrs` is the source of truth.
- `ovr` is derived via `computeOvr(attrs, pos)` and is explicitly documented as a display convenience.
- The simulation reads individual attributes in `v2/lib/core/sim/game.ts`, not OVR, which is the correct design.
- `pot` and hidden `ceiling` are split. This is important: potential is a projected ceiling; hidden ceiling determines actual development realization so potential is not destiny.
- `displayedOvr()` already hides prospect truth behind scouting bands.

Gap: v2 has no explicit scheme/archetype layer. It has position weights and positional value, but not a player archetype, scheme fit score, or per-scheme modifier. CPU/team-building can value QB/EDGE/OT differently, but a zone-run OL and power-run OL are not meaningfully different yet outside their raw attributes.

## External references — what matters for Gridiron GM

### Football GM rating philosophy

Football GM is the best browser-first comparison point. Its manual says:

- Ratings are 0-100 and the whole scale is used; 50 is a typical value.
- OVR tiers are understandable: 90+ all-time great, 80+ MVP candidate, 60+ all-league candidate, 50+ starter, 40+ backup/special teams.
- OVR is not a performance guarantee; the attribute mix and teammates matter.
- Potential does not directly drive development; it is a scouting projection. Football GM calculates potential by simulating career arcs and taking a percentile outcome.
- Displayed ratings are scout estimates, not the true ratings.
- Skill symbols are UI scanning aids, not separate mechanics.

Build implication: Gridiron GM should keep v2's principle that OVR is display-only, but should borrow Football GM's clear tier language and scout-estimate framing. POT should remain a projection with uncertainty, not a deterministic growth target.

### Madden ratings/archetypes/scheme fit

Madden's public ratings database exposes the mainstream vocabulary: OVR plus visible athletic/mental fields like SPD, STR, AGI, COD, INJ, AWR. Madden archetype references group players into football-readable roles:

- QB: strong arm, improviser, scrambler, field general.
- HB: power back, elusive back, receiving back.
- WR: playmaker/YAC, deep threat, slot, physical.
- TE: blocking, possession, vertical threat.
- OL: pass protector, power, agile/zone.
- EDGE/DL/LB/DB: speed/power rusher, run stopper, field general, man/zone/slot/hybrid/run-support.

Scheme fit is the useful design concept, not the exact Madden math: a player's archetype should align or misalign with team scheme, affecting development, coach recommendations, CPU valuation, and matchup usage.

Build implication: Gridiron GM should add an archetype label derived from attributes and position, then compute scheme fit from archetype + team scheme. Do not manually assign archetypes as static flavor text; derive them so progression, scouting, and generated players stay coherent.

### NFL Combine / scouting evidence

NFL.com Combine coverage and public tracker pages show that prospects are evaluated through position-specific measurements, drills, and role fit, not just a universal athletic score. The recurring public signals are:

- Timed speed/explosion/agility: 40-yard dash, 10-yard split, vertical, broad, shuttle, 3-cone.
- Size/length: height, weight, arm length, hand size, wingspan/length implications.
- Position movement: offensive line arm length can affect tackle/guard projection; TE/safety/WR speed creates stock movement in context.
- Combine results move stock, but do not fully define the player. Position-specific football traits still drive the evaluation.

Build implication: the attribute model should distinguish raw physical tools from football skills. Combine/pro-day values should reveal or update physical/tool attributes more accurately than football IQ, technique, character, or play diagnosis. That becomes essential when scouting and draft are built as one connected system.

## Recommended canonical attribute contract

Use v2 as the canonical engine contract because it is deterministic, serializable, and already guarded by `npm run gate`. Extend it rather than replacing it.

### 1. Attribute buckets

Keep the compact v2 `attrs` object, but define attributes in buckets for generation, UI, scouting, and progression:

**Physical/tools**
- `spd` speed
- `acc` acceleration/burst
- `agi` agility/change-of-direction
- `str` strength/play strength
- `jmp` explosiveness/catch radius
- `sta` stamina/snap endurance

**Mental/processing**
- `awr` awareness/recognition
- `dec` decision-making, especially QB and ballcarrier decisions
- `dsc` discipline/penalty avoidance/assignment reliability

**Offense skill**
- `thp` throwing power
- `tha` throwing accuracy composite for now; can split short/medium/deep later if needed
- `rte` route running/separation craft
- `cth` catching/hands
- `car` carrying/ball security
- `elu` elusiveness/YAC/open-field ability
- `pbk` pass blocking
- `rbk` run blocking

**Defense skill**
- `prs` pass rush
- `pur` pursuit/range-to-ball
- `tkl` tackling/finish
- `cov` coverage

**Special teams**
- `kpw` kick/punt power
- `kac` kick/punt accuracy/control

Do not add 40+ Madden-style attributes yet. The current compact set is enough for a management sim if archetypes and scheme fit are layered on top.

### 2. Position-specific OVR remains derived

Keep `POSITION_WEIGHTS` as the only OVR calculation source. Current strengths:

- OVR weights sum to 1.0 and are verified.
- The sim reads attributes directly.
- Position value is separate from OVR, so a 78 QB and 78 P are not equivalent.

Needed improvements:

- Add archetype-specific OVR or role score, not just one OVR per position. Example: `computeRoleScore(player, 'WR_DEEP_THREAT')` weights `spd/acc/rte/cth/jmp` differently than `WR_SLOT`, which weights `rte/cth/agi/awr` more.
- Show role scores in scouting/player UI as “best role” and “secondary role,” not as another universal number.
- Keep global OVR for sorting and accessibility, but avoid building CPU decisions solely around it.

### 3. POT should stay projection-only

The v2 `pot`/`ceiling` split is the right architecture. Preserve it.

Recommended semantics:

- `pot`: scout/projected upside, visible only as a range until highly scouted.
- `ceiling`: hidden actual development cap, never shown and never directly scoutable.
- `devSpeed`: how fast a player moves toward the hidden ceiling.
- `peakAge`: position-influenced career arc.
- `durability`: injury risk and ability to absorb usage.

Scouting should narrow the user's estimate of `pot`, but should never reveal `ceiling`. This protects surprise busts and breakouts.

### 4. Add archetype as a derived classification

Recommended initial archetypes:

| Position | Archetypes |
|---|---|
| QB | Field General, Strong Arm, Scrambler, Improviser |
| RB | Elusive, Power, Receiving, Balanced |
| WR | Deep Threat, Slot Separator, Physical/X, YAC Playmaker |
| TE | Inline Blocker, Possession, Vertical/Flex |
| OT/OG/C | Pass Protector, Power/Gap, Agile/Zone |
| EDGE | Speed Rusher, Power Rusher, Run Defender, Hybrid |
| DT | Nose/Anchor, Interior Rusher, 3-Tech, Run Stuffer |
| LB | Field General, Coverage, Run Stopper, Blitz/Edge Hybrid |
| CB | Man, Zone, Slot, Press |
| S | Deep Zone, Box/Run Support, Hybrid/Nickel |
| K/P | Power, Accuracy/Control |

Implementation should derive archetype from role scores, e.g.:

- QB Strong Arm = high `thp`, adequate `tha`, lower rush dependence.
- QB Field General = high `tha`, `dec`, `awr`.
- QB Scrambler = high `spd/acc/agi/elu`, adequate `tha`.
- OL Agile/Zone = high `agi/awr/rbk/pbk`, less dependent on `str`.
- OL Power/Gap = high `str/rbk/pbk`, lower agility requirement.
- CB Man = high `cov/spd/agi/acc`; Zone = `cov/awr/pur`; Slot = `cov/agi/tkl/awr`.

### 5. Scheme fit should be a computed modifier, not a static rating

Add a small deterministic function:

```ts
computeSchemeFit(player, teamScheme): {
  score: number;        // 0..100
  modifier: number;     // e.g. 0.94..1.06 for sim/team strength/development
  reasons: string[];    // UI/scout/coaching explanation
}
```

Use it in four places only at first:

1. Development: good fit slightly helps growth; bad fit slows growth.
2. CPU draft/free-agent board: teams prefer fits unless BPA is clearly stronger.
3. Coach/scout recommendations: explain why a player fits or conflicts with the system.
4. Team strength: small modifier to unit rating, capped tightly so scheme fit matters but does not overwhelm raw talent.

Do not wire scheme fit into every play outcome immediately. That creates too many calibration variables. Start with development/valuation/recommendation/team-strength, then tune game-sim effects later with `npm run gate`.

## Practical build sequence

1. **Document canonical attrs.** Add a short `v2/docs/attribute-model.md` or section in existing docs with attribute keys, buckets, and meaning.
2. **Create role-score module.** New file: `v2/lib/core/archetypes.ts` with pure functions:
   - `computeRoleScores(player)`
   - `deriveArchetype(player)`
   - `computeSchemeFit(player, teamScheme)`
3. **Add team schemes lightly.** Store offensive/defensive scheme strings on team/coach/front office. Start with broad schemes, not a full playbook:
   - Offense: West Coast, Vertical, Spread/RPO, Power Run, Wide Zone.
   - Defense: Press Man, Cover 3, Quarters, Tampa 2, 3-4 Pressure, 4-3 Front.
4. **Expose in UI.** Show archetype, best role, and fit reasons on player cards and scouting pages.
5. **Feed draft/scouting.** When scouting work begins, combine/pro-day inputs should reveal physical/tools first; private workouts/interviews should refine mental/technique/character estimates.
6. **Run v2 gate.** Any engine change touching ratings/generation/sim must pass `cd v2 && npm run gate`.

## Build warning

Do not make cap/contracts the next system just because player value touches money. Locking attributes means defining how players are evaluated and developed. Contract/cap logic should consume this model later; it should not drive the model now.

Next recommended implementation: add `v2/lib/core/archetypes.ts` and a deterministic unit/verify check that every generated player derives exactly one primary archetype plus optional secondary role from attributes, without changing current sim outputs yet.
