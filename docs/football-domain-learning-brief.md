# Gridiron GM football domain learning brief

Purpose: turn NFL/front-office domain knowledge and football-management-game market research into build guidance for Gridiron GM.

Last updated: 2026-07-30

## Latest focused research

- 2026-07-30 (evening) — **The scouting + draft system is BUILT** on branch `task/301-scouting-draft-e2e`: per-team beliefs (CPU derived from a stable hash, user stored per-method intel with OVR + potential bands), method-based scouting, war-room board, the attribute-panel leak closed, on-the-clock draft trades, and a priority-UDFA phase. Guarded by `v2/scripts/scoutcheck.ts` in the gate. See `v2/docs/HANDOFF.md`. Note: `docs/football-domain-save-load-ownership.md` is v1-only and must not be actioned against v2 (no-backend invariant).
- 2026-07-30 — Scouting + draft connected system: see `docs/football-domain-scouting-draft.md`. Bottom line: build team-specific prospect intel and a saved war-room board before adding draft ceremony; scouting should reveal different truths by method, preserve uncertainty, and stop user scouting from improving CPU draft boards.
- 2026-07-29 — Attribute model / position archetypes / OVR-POT / scheme fit: see `docs/football-domain-attribute-model.md`. Bottom line: keep v2's compact deterministic attribute engine and display-only OVR, preserve the POT vs hidden-ceiling split, then add a derived archetype + computed scheme-fit layer before scouting/draft/roster systems depend on player evaluation.
- 2026-07-28 — Draft outcome calibration / rounds 1-7 / UDFA outcomes: see `docs/draft-outcome-research-2026-07-28.md`. Bottom line: use pick-band and position-specific outcome curves, split draftable prospects from a large UDFA/camp pool, lower late-round/UDFA floors, and tune roster churn before adding more draft-day UI.
- 2026-07-28 — Game setup / save / load / auth ownership / save-game isolation: see `docs/football-domain-save-load-ownership.md`. Bottom line: build a server-side franchise setup + save manifest contract before more football realism; the user must be able to create, resume, autosave, and isolate a franchise reliably before deeper systems matter.
- 2026-07-27 — Season progression spine / calendar / weekly advancement / stats / offseason transitions: see `docs/football-domain-season-progression-spine.md`. Bottom line: build a save-scoped calendar/advancement service before adding more realism systems; it should atomically simulate weeks, persist durable run logs, update standings/playoff state, and unlock the next calendar event.

## Bottom line for the build

Gridiron GM should not try to win by cloning Madden on-field presentation. It should win by making the NFL front-office loop deep, legible, and consequential: roster math, contracts, scouting uncertainty, player/staff personalities, scheme fit, cap pressure, and league-wide events that force weekly decisions.

The best reference stack is:

- Football Manager / OOTP for long-horizon sim depth and history.
- Football GM for free browser-first analysis tools and customization.
- Front Office Football / Draft Day Sports Pro Football for pro-football GM expectations.
- Madden Franchise and NFL Head Coach for player drama, coach/staff framing, weekly decisions, and mainstream UX expectations.
- Real NFL operations/CBA rules as the model for constraints, not as exhaustive legal simulation on day one.

## Build implications

### 1. The core game loop should be calendar-driven

The real NFL calendar gives the game its natural structure:

1. End of season: retirements, staff changes, performance review, owner confidence.
2. Franchise/transition tag window.
3. Combine/pro days/private workouts.
4. Free agency/legal tampering.
5. Draft.
6. Rookie signings and UDFA chase.
7. Training camp and preseason cuts.
8. Regular season weekly loop.
9. Trade deadline.
10. Playoffs.

Design principle: every calendar phase should have one or two hard decisions, not just screens to visit.

### 2. Roster rules create the strategy

Authoritative NFL Ops rules to model early:

- 53-man active/inactive roster for regular season and playoffs.
- 47 or 48 gameday active players; 48 requires at least eight active offensive linemen.
- Practice squad is 16 players in 2026; can be 17 with an International Pathway player.
- Standard elevations let practice-squad players move up for a game and revert after, with per-player limits.
- Players with fewer than four credited seasons are generally waiver-eligible when released; vested veterans have different waiver/free-agent treatment depending on timing.

Game abstraction: start with roster compliance gates and practice-squad/elevation choices. Do not implement every waiver nuance before the player has a working roster puzzle.

### 3. Contract/cap mechanics should be simplified but real enough

NFL Ops contract language highlights that matter for a GM game:

- Base salary: regular-season salary; game checks are 1/18 in a 17-game season.
- Signing bonus: prorated against cap for the contract life, up to five seasons.
- Roster bonus: counts in the season earned unless handled as guaranteed/prorated bonus.
- Guarantees split into skill, cap, and injury; fully guaranteed means all three.
- LTBE incentives count on current-year cap; NLTBE generally hit next year if earned.
- Dead money accelerates when a player is cut/traded; post-June 1 treatment can split future bonus proration.
- Drafted rookies get four-year contracts; first-rounders have fifth-year options; UDFAs get three-year contracts.

Current project gap: SALARY-CAP-VALIDATION.md uses a simple sum of contract_year_1 and a cut-value algorithm. That is useful as a guardrail, but the next cap step should split cap hit into base salary, prorated bonus, guarantees, and dead money. Without dead money, cutting expensive players is too easy and roster building loses realism.

### 4. Draft/scouting should be uncertainty-first

The existing SCOUTING-SYSTEM.md is directionally right: hidden true ratings, scouting points, staff quality, regional/position bonuses, combine/pro day/private workout/medical/character methods.

What to add from the real draft process:

- Prospect grades should be ranges and confidence intervals, not just exact OVR after enough scouting.
- Combine measurements/drills should inform traits differently by position: 40-yard dash, 10-yard split, vertical, broad jump, 3-cone, short shuttle, bench, height/weight/arm/hand measurements.
- Medical and character should be asymmetric information: low-frequency, high-impact risk flags.
- Early-declare and eligibility rules matter less than creating draft-class variance, but should exist in generation: most prospects are three years removed from high school; age/experience should shape upside and readiness.
- Board management is the real game: positional value, team need, scheme fit, risk, contract value, trade-down opportunity.

Recommended draft UX:

- Big board with tiers, not only rankings.
- Draft ticker/league picks visible while user is on the clock.
- Trade-down/up offers generated contextually.
- Post-draft grades that explain value, need, and risk misses.

### 5. Front office/personnel should be an operating system, not flavor text

Useful roles to model:

- Owner: budget, patience, long-term demands.
- President/football operations: strategic direction and organizational philosophy.
- General manager: roster, contracts, staff, draft, trades.
- Head coach: scheme, depth chart preferences, development priorities, gameplan.
- Offensive/defensive/special teams coordinators: scheme execution and player development modifiers.
- Director of player personnel/pro personnel: existing NFL player evaluation, free agency, trade targets.
- Director of college scouting/national/regional/position scouts: draft evaluation.
- Cap/contracts lead: structure, restructures, dead-money visibility.
- Medical/training staff: injury recovery, durability reads, wear management.

Build implication: staff should affect information quality and decision automation, not just ratings boosts. The player should be able to delegate with visibility into what staff plan to do.

### 6. Attributes need position-specific skill maps

Base attribute groups:

- Athletic: speed, acceleration, agility, burst, strength, stamina, jumping.
- Technical: route running, catching, release, pass block, run block, block shedding, tackling, coverage, pass-rush moves, throwing power/accuracy, ball security, kick power/accuracy.
- Mental: awareness, play recognition, decision making, discipline, leadership, work ethic, coachability, competitiveness, clutch/composure.
- Medical/durability: injury risk, recovery, fatigue, wear tolerance.
- Development: potential, volatility, learning rate, peak age, decline rate.
- Personality/relationship: role expectation, money motivation, ring chasing, loyalty, market preference, patience, agent difficulty.

Avoid a single universal OVR driving everything. Use position-specific weighted archetypes and scheme-fit multipliers. OVR is a UI convenience, not the engine.

### 7. Roster composition should force tradeoffs

Typical 53-man roster construction should be flexible but constrained:

- QB: 2-3
- RB/FB: 3-5
- WR: 5-7
- TE: 3-4
- OL: 8-10, with active gameday OL threshold affecting 48th active player
- DL/EDGE: 8-10 depending front
- LB: 5-7
- CB: 5-6
- S: 4-5
- K/P/LS: 3

Game gates should enforce minimum viable position counts while allowing philosophical differences. A team running heavier personnel should feel different from a spread team. Special teams value should be a reason to keep the 51st-53rd player.

### 8. Competitor feature map

Football GM:

- Free, browser-first, no account required.
- Deep customization, stats, graphs, league history, Hall of Fame, advanced search, play-by-play box scores.
- Lesson: Gridiron GM needs analysis tools and history early. This is where web can beat console games.

Draft Day Sports Pro Football:

- GM/head coach/coordinator/position-coach role play.
- Custom leagues, imports from college football universe, play analysis, adaptive playbooks, strategy shifts, improved trade AI, free-agency rumors, milestones, expanded draft pick monitoring.
- Lesson: staff role identity, league customization, and linked amateur-to-pro universe are differentiators.

Madden Franchise:

- Living league, persona engine, holdouts, trade demands, emergent weekly actions, news center/ticker, draft ticker, interactive negotiations, modern contract tools, tags/tenders, free-agent frenzy, UDFA, coach mode, real coordinators, improved wear and tear, smarter CPU trade logic.
- Lesson: the market expects human-feeling player behavior now. Gridiron GM can implement the same design principle more deeply because it is not spending budget on 3D gameplay.

Front Office Football / NFL Head Coach / older pro football sims:

- Audience expects depth chart control, drafting, contracts, staff, gameplanning, player development, and long-term history.
- Lesson: the hardcore segment values believable simulation and data export more than animation.

### 9. Recommended Gridiron GM priority order

Correction from Matt, 2026-07-26: cap/contracts are not the first build focus. They are a realism layer, not the foundation. The priority order should be driven by what lets a user start, persist, simulate, and understand a franchise loop.

1. Stabilize game setup/save/load/auth ownership: create league, select team, save, reload, resume phase, and verify all data is save-game isolated.
2. Lock the attribute model: position-specific ratings, archetypes, OVR/POT calculation, player-generation ranges, and scheme-fit hooks.
3. Build the season progression spine: calendar phases, weekly advancement, schedule/results/stats, offseason transitions, retirements, aging/development, and phase gates.
4. Upgrade scouting and draft together: scouting uncertainty, big board, combine/pro day/private workout inputs, draft state, CPU drafting, pick trades, draft ticker, and rookie conversion into players/contracts.
5. Make roster/depth-chart management reliable: position minimums, depth chart validation, cuts, practice squad/elevations, injuries/wear, and special teams value.
6. Add free agency/contracts/cap as the financial constraint layer: tags/tenders, market bidding, cap hit, bonus proration, guarantees, dead money, restructures, and CPU cap logic.
7. Add staff/front-office systems that affect information quality, development, negotiation, and delegation.
8. Add player/team personality events: holdouts, trade demands, role complaints, agent friction, ring-chaser/free-agent preferences.
9. Add league news ticker, transaction feed, and historical stat/transaction analytics so the world feels alive.
10. Improve CPU logic around window state: rebuilding, contending, cap-clearing, deadline buyers/sellers.

## Source notes used in this first pass

- NFL Football Operations: contract language, roster sizes, practice squads, elevations, waivers, rookie contracts, fifth-year options, incentives, dead money, roster bonuses, guarantees.
- NFL Football Operations: 2026 rulebook overview and 2026 rule changes.
- NFL.com combine participant/tracker pages: grade display and public prospect-card conventions.
- NFLPA Pipeline to the Pros: combine/pro day/agent/draft pathway framing.
- Football GM homepage: browser-first GM gameplay, cap planning, advanced stats, customization, history, play-by-play box scores.
- Wolverine Studios Draft Day Sports Pro Football page: role play, customization, adaptive strategy, college-football import, trade AI, free-agency rumors.
- EA Madden NFL 27 Franchise Deep Dive: persona engine, holdouts/trade demands, emergent actions, news center, draft ticker, negotiations, contract overhaul, free-agent frenzy, coach mode, coordinators, wear/tear, CPU trade logic.

## Open research queue

- Full NFL CBA cap implementation: restructures, post-June 1, minimum salary benefit, proven performance escalator, restricted free agency, compensatory picks.
- Position-by-position scouting templates from public draft scouting reports.
- NFL front-office org charts from multiple teams.
- Play-calling/scheme archetypes: offensive personnel groups, defensive fronts/coverages, coaching tree effects.
- Injury/wear modeling and realistic recovery timelines.
- Competitive teardown of Football GM gameplay screens and data model.
- Competitive teardown of Front Office Football Nine and Football Coach: College Dynasty from reliable non-Steam sources.
- Historical roster construction benchmarks by position group and team style.
