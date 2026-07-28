# Gridiron GM — Code Review & Priority Plan

Reviewed 2026-07-26 against commit `e7795ff`. ~106,000 lines across 292 TS/TSX files, 93 migrations, ~120 API routes, 45 pages.

---

## The headline

You do not have a feature shortage. You have a **connection** shortage.

- **~18,500 lines of `lib/`** (46%) are unreachable from any page or route.
- **~12,400 lines of front-office UI components** are rendered by nothing.
- The entire **scheme-fit system** (2,761 LOC), **progression/aging/retirement system** (3,258 LOC), **cap engine with dead money and proration** (670 LOC), **pro scouting** (779 LOC), **CPU scouting AI** (389 LOC), and **relationship system** (1,737 LOC) are written, documented, and imported by zero files.
- Meanwhile the game **cannot be started from a clean database**, the regular season **can only be advanced from an admin page**, and the simulation **discards its own play-by-play and fabricates the final score from a miscalculated number**.

So the priority order below is deliberately *not* "add features first." It is: close the loop, make the sim real, stop the bug factory, then turn on the depth you already paid for.

---

## P0 — Make it startable and playable at all

Nothing else matters until a person who is not you can create a game and finish a season.

### 0.1 There is no way to seed the base `players` table
`app/components/GameSetupWizard.tsx:168-173` hard-throws *"No players found in database. Please seed players first."* No route, script, admin page, or migration inserts into `players`. `sample_players_seed.csv` has ~20 rows; the wizard advertises 1,696. **On a fresh Supabase project the game cannot be started.**

Build: a `POST /api/players/seed` that generates a full ~1,700-player league using the existing `lib/player-generator.ts`, service-role, idempotent, callable from the wizard.

### 0.2 The regular season has no user-facing advance control
`grep` across all pages: `/api/simulate-week*` and `/api/simulate-advance` are called from exactly three pages — `/admin/sim`, `/preseason`, `/offseason`. Weeks 1–18 are playable **only from `/admin/sim`**.

Worse, `app/regular-season/page.tsx:221` tells the user to *"use the Advance Week button on the home page or league schedule"* — neither page has one, and `/regular-season` is itself orphaned (no nav entry; its only referrer is `PhaseNavigator.tsx`, which has zero importers).

Build: a real season hub. Put **Advance Week / Sim to Next Game** on `/teams/my-team` and `/league/schedule`, with record, next opponent, standings position, and phase state.

### 0.3 Playoffs dead-end
`app/league/playoffs/page.tsx` crowns a champion via `alert()` and stops. The only "Advance to Offseason" button is `app/admin/sim/page.tsx:1378`, gated behind a manual week spinner. Add the transition to the playoffs page.

### 0.4 A fresh database cannot be built from `supabase/migrations`
`MIGRATION_RENAME_MAP.txt` shows a bulk rename that timestamped files **in alphabetical order of the old name** — so `add_*` < `backfill_*` < `clear_*` < `create_*`. Every ALTER now sorts before the CREATE it depends on. 50+ ordering violations; `supabase db push` aborts on statement 1.

Also: **`players`, `teams`, and `free_agents` have no `CREATE TABLE` in any migration.** The schema's real source of truth is the live project, not the repo. And four `DELETE FROM public.players` one-off scripts (`…030`–`…033`) live permanently in the migration set — any replay nukes the database.

Build: one squashed baseline migration verified with `supabase db reset` on a scratch project. Delete `…030`–`…033`.

### 0.5 Unauthenticated destructive routes
- `app/api/admin/run-migration` — path-joins user input, splits on `;`, feeds to an `exec_sql` RPC. No auth.
- `app/api/admin/fix-games-save-game-id` — explicitly targets *other saves'* games, deletes collisions, reassigns the rest. No auth.
- `app/api/free-agents/seed` — builds a **service-role** client. No auth.

Delete or authenticate all three before anyone else touches the app.

### 0.6 Nav is 32% broken
13 of 41 nav destinations 404 (`/players/search`, `/draft/board`, `/actions/sign`, `/actions/cut`, `/actions/lineups`, four `/reports/*`, three `/admin/*`). There is no `not-found.tsx` or `error.tsx` anywhere. Remove the dead links or stub the pages.

---

## P1 — Make the simulation an actual simulation

This is the single highest-leverage block of work in the project. Right now every strategic decision a player makes is cosmetic, because none of it reaches the scoreboard.

### 1.1 The play-by-play has zero effect on the final score
`lib/simulation/scoring-adjuster.ts:246-251`:

```ts
export function calculateFinalScores(
  rawHomeScore: number,   // never referenced in the body
  rawAwayScore: number,   // never referenced in the body
  homeStrength: TeamStrength,
  awayStrength: TeamStrength
)
```

The function generates a game total from team strength + `Math.random()` and splits it. Every TD, FG, turnover and PAT accumulated across `lib/simulation/engine.ts:438-577` is thrown away at `:581-589`.

Consequences: box scores never reconcile with the final score. Coaching, attributes, situational logic, the whole 1,700-line `attribute-engine.ts` — all cosmetic. **Standings are a function of team strength plus RNG.**

Fix: use the accumulated `homeScore`/`awayScore`. Keep `calculateFinalScores` only as a sanity clamp, not a replacement.

### 1.2 `calculateTeamStrength` is on the wrong scale and double-counts the O-line
`lib/simulation/team-strength.ts:52-53`:

```ts
let offense = (qb * 0.25) + (oline * 0.15) + (skill * 0.20) + (oline * 0.10); // 0.70, oline twice
let defense = (dline * 0.20) + (lb * 0.15) + (secondary * 0.15);             // 0.50
```

`offense` lives on 0–70, `defense` on 0–50, `specialTeams` on 0–100 — and every consumer divides all three by 100. Defenses are systematically scored as terrible. The "elite matchup" branch at `scoring-adjuster.ts:143-150` requires `avgQuality > 70` but the max possible is 60 — **unreachable dead code**. Since this number is currently the *only* input to the score, this bug is directly distorting every result in the league.

### 1.3 Play-logic bugs that make box scores implausible
| Bug | Location | Effect |
|---|---|---|
| Yard-line convention inverted | `outcome-generator.ts:201-210` | Teams kick FGs from their own 10–35 and punt from the opponent's 1 |
| 4th-and-goal inside the 5 → punt | `attribute-engine.ts:895-903` | The coached branch falls through to `return 'punt'` |
| Phantom sacks on 40% of incompletions | `player-performance.ts:263-278` | ~10–14 sacks/team/game (NFL: 2.4) |
| Missed FGs recorded as pass/run plays | `outcome-generator.ts:308-331` | Kickers show 100% FG accuracy; punts and XPs never recorded |
| INTs thrown ≠ INTs caught | `player-performance.ts:138-160` vs `:281-291` | A play can be a TD and an INT simultaneously |
| No turnover on downs | `engine.ts:281` | Failed 4th down resets to 1st-and-10, same offense |
| Targets split by uniform random | `player-performance.ts:145` | A 99 WR and a 65 WR get identical target share |
| Defensive stats are pure dice | `player-performance.ts:218-322` | A 99 edge rusher and a 55 backup have identical sack rates |

### 1.4 The depth chart is never consulted by the simulation
`grep -rn "depth_chart" lib/simulation/` returns nothing. `getBestPlayerAtPosition` sorts by `overall`. Your entire depth-chart subsystem is decorative. Wire it — this is the cheapest way to make user decisions matter.

### 1.5 Schedule generation is broken two ways
- `lib/schedule-generator.ts:145` always assigns home to the lower-indexed team → `teams[0]` gets **14 home games**, `teams[31]` gets **3**.
- `:231-254` front-loads all 96 division games into weeks 1–6; the conflict fallback at `:274-304` can schedule a team twice in one week.

### 1.6 Playoff seeding is a coin flip from season 2 onward
`lib/playoffs/calculator.ts:71-93` prefers `team_season_stats` when rows exist. `app/api/offseason/advance-to-season/route.ts:466-480` inserts 32 rows of all zeros for the new season, and **nothing updates them during the season** — the only writer is an admin-only route that runs *after*. So every comparator falls through to `return Math.random() < 0.5 ? -1 : 1`. Division winners and all seven seeds are random. (Season 1 works only by accident.)

Also: divisional matchups are inverted (`playoffs/advance-round/route.ts:120-139` pairs the 1 seed against the *best* survivor), playoff player stats hit an FK violation and are silently discarded, and a tied playoff game deadlocks the bracket with no recovery path.

---

## P2 — Stop the bug factory

You have **33 diagnose/fix API routes and 8 admin repair pages**. They are not the problem; they are the symptom. Five root causes explain nearly all of them.

### 2.1 `save_game_id` is a convention, not a constraint
Every retrofitted `save_game_id` was added **nullable**, each with a companion `WHERE save_game_id IS NULL` "legacy" unique index. `NULL` is then treated app-wide as "belongs to every save" (`if (saveGameId) … else .is("save_game_id", null)`). `PlayerStatsTracker` doesn't set it at all — eight call sites graft it on afterward and two get it wrong.

Fix: backfill, `SET NOT NULL`, drop the legacy indexes, make it a constructor arg on the stats tracker. Then delete `fix-games-save-game-id`, `fix-stats-save-game-id`, `depth-chart/fix-assignments`, and the 125 lines of inline repair that run on **every week simulation** (`simulate-week/route.ts:61-189` — which is unreachable anyway, since the query already filters by save).

### 2.2 `player_team_assignments` has no RLS at all
No `ENABLE ROW LEVEL SECURITY`, no policy, in any of the 93 migrations. It is the central per-save roster table, and Supabase grants anon DML by default. Meanwhile 74 other tables carry `USING (true)` policies with no `TO` clause. Your recent "private save games" work protects **4 tables out of 79** — save *metadata* is private, save *data* is fully open to anonymous users with the bundled anon key.

Related: 82 of ~110 API routes import the browser anon client server-side. Only 5 routes authenticate. `saveGameId` comes from the request body with no ownership check — substituting another user's UUID gives full control of their save.

### 2.3 No transactions anywhere
Zero RPCs or stored procedures. Every multi-table mutation is independent PostgREST calls, each committing separately. Every entity has a half-written variant:

- **played game with no stats** — three sim routes mark `played=true` before inserting stats
- **rostered with no contract** — `roster-replenisher.ts:530` inserts the assignment, `:570` returns before the contract insert
- **deactivated season with no successor** — `advance-to-season:101` vs `:108`
- **deleted season stats with no reinsert** — `player-development.ts:768` vs `:815`, run after every week and from the browser
- **half-executed trade** — `trades/execute` does six independent writes, two unchecked

Fix: move each of these into a single Postgres function.

### 2.4 Two entity namespaces, one id column
Drafted prospects deliberately stay in `draft_prospects` (`draft/select-player:169-170`) and are referenced via `player_team_assignments.prospect_id`. But `player_game_stats.player_id`, `player_season_stats.player_id` and `transactions.player_id` are FK'd to `players` only. **Every rookie's season and lifetime stats fail to insert, forever.** Five places hand-roll the union; three diagnose routes exist purely to answer "which table does this UUID live in."

Fix: promote prospects into `players` on draft. This deletes an entire class of bugs.

### 2.5 The 1000-row PostgREST cap
Only 10 call sites use `.range()`. `player-development.ts:17-20` selects a full season of `player_game_stats` (~24,000 rows) with no pagination and computes progression from the first 1,000 (~4%). Same shape in `contract-processor.ts:38-50` (700 players never checked for expiry), `cpu-resign.ts`, `roster-replenisher.ts:661-682`.

### 2.6 The replenisher and the contract processor fight each other
`roster-replenisher.ts:557` writes `contract_year_2: null`. `contract-processor.ts:222` treats `contract_year_2 === null` as expiring and releases the player. The healer manufactures the wound it treats. Rookie contracts have the identical shape — **every draft pick reaches free agency after one season.**

---

## P3 — Give the franchise a time axis

Today: players never age, never develop underlying attributes, and never retire. `grep` for `age + 1` in wired code returns nothing. `retire` appears only in dead modules. Rosters are frozen; the only movement is `players.overall` drifting upward.

- `lib/progression/` — 3,258 lines of position-specific age curves, retirement, staff development, season transition. Barrel file `development-index.ts` has **zero importers.** Wire it.
- Performance ratings are pinned at 100 (`rating-calculator.ts:67` — a league-average QB scores ~108, clamped), so `calculateRatingChange` returns positive for essentially everyone. **Nobody ever declines.**
- Progression writes `players.overall` unscoped by save (`player-development.ts:128-131`) — and `migrations/…064` blocks UPDATE on `players`, so it currently matches zero rows and silently reports success. Progression is a no-op today and becomes cross-save corruption the moment RLS loosens.
- Rookies need 4-year contracts (+5th-year option) per the domain brief.

---

## P4 — The strategy layer (where the game gets good)

Ordered by (value to the player) ÷ (effort), given how much is already written.

### 4.1 Resurrect scouting — two small fixes
1. **`true_*` columns are never populated.** `scout-prospect/route.ts:120-137` reads `true_speed`, `true_leadership`, `true_durability`, `true_bust_risk`… The columns exist in `…048`; nothing writes them. So game-tape review, combine, interview and medical — the 3, 4 and 5-point actions — all return **empty objects**. Only the 1-point initial scout produces anything, via a `|| prospect.overall` fallback.
2. **The bands are centered on the exact truth.** `lib/scouting/engine.ts:328-331`: `est_overall_low = true_overall - band`, `est_overall_high = true_overall + band`. There is no estimation *error* — only a width. Midpoint is always perfect, for every scout at every quality. One line defeats the entire uncertainty premise.

Fix both and scouting goes from a points sink to the core of the draft game. Then: real combine measurables (40, 10-split, vertical, 3-cone, shuttle, bench, arm/hand), tiered boards, medical/character as low-frequency high-impact flags.

### 4.2 Close the exploits
| Exploit | Location |
|---|---|
| Sign any free agent for league minimum × 4, any phase, no checks | `app/api/sign-player/route.ts:230-267` — exposed as a button at `app/free-agents/page.tsx:656` |
| Back-load a bid: only `contract_year_1` is cap-checked, but `total_value` (all 4 years + bonus) is the sole tiebreaker → win every auction at a $750k cap hit | `free-agency/submit-bid/route.ts:92-108` |
| Trade acceptance decided **in the browser**; `acceptingTeamId` is caller-supplied and only compared to itself | `app/actions/trade/page.tsx:614-625`, `trades/execute/route.ts:37` |
| Trade cap checks read `contract_year_1` off the `players` table, where it no longer lives → always `undefined` → both checks always pass | `trades/execute/route.ts:143-151` |
| Traded players' cap hit never transfers (`contract.team_id` never updated) | `trades/execute` |
| Scouting points: `week` comes from the request body, and any unseen week creates a fresh full allocation | `scout-prospect/route.ts:83`, `weekly-points.ts:164-190` |
| Scouting gate only runs if you've already scouted ≥1 prospect — scout zero, gate skipped | `draft/select-player/route.ts:49` |
| Cut players keep counting against the cap (`roster-cut` never nulls `contract.team_id`) | `roster-cut/route.ts:84-131` |

### 4.3 Make the CPU competent
Current grades: drafting 2/10, free agency 2/10, trades 1/10 (there is **no server-side CPU trade agent at all**), re-signing 4/10, cap management 1/10, scouting 0/10.

Highest-value fixes:
- `lib/draft/cpu-drafting.ts:75-85` uses position keys `OL`, `DL`, `DB`; rosters and prospects use `OT/OG/C`, `DE/DT`, `CB/S`. **CPU teams can never draft a lineman or a defensive back** — those are permanent unfillable needs that crowd out everything else.
- `cpu-bidding.ts:333` scopes existing bids to the *current* stage, but `advance-stage:117` generates bids for a stage before any exist. So counter-bidding never fires and **the CPU makes zero stage-4 bids**.
- `cpu-bidding.ts:238-241` bids on the **user's own team** and can charge you cap you never agreed to.
- Resolution picks the highest `total_value` with no AAV normalization (4×$5M beats 1×$19M), ignores `min_acceptable_salary`, ignores the cap, and ignores roster size.
- `evaluator.ts:427-441`: trade value is linear — `#1 overall pick = 11,200 ≈ an 11-overall player`. Three 70s outvalue one 95. Make the curve convex and price picks off a real Jimmy Johnson-style chart.
- `cpu-resign.ts:53-63` double-counts expiring salary, so CPU teams look $40–80M more capped than they are and let good players walk.
- `cpu-scouting-ai.ts` (389 LOC) is dead — CPU teams read `draft_prospects.overall` directly while the user pays points for a band.

### 4.4 Real cap mechanics
`calculateTeamCapHit` is `SUM(contract_year_1)` (`lib/utils/player-contracts.ts:224-232`). `signing_bonus` is stored on every contract and never enters any calculation. Cutting is free. `$255,000,000` is hardcoded in four places with no year-over-year growth.

`lib/cap/cap-management.ts` (670 LOC) already implements dead money, restructures, cut math and multi-year projection. **Zero importers.** Wire it, then add tags/tenders, guarantees, and post-June-1.

Also: `salary-cap-fixer.ts:91` cuts your **best** players first — the salary term ranges 0.75–40 while the overall multiplier ranges only 1.0–2.0, so a $30M/95 QB scores 33 and a $2M/50 scrub scores 4. Exact inverse of the documented intent.

### 4.5 Scheme fit
2,761 lines across six files, a 41KB design doc, matrices and archetype detection — imported by nothing outside its own directory. Every front-office decision in the game runs on the single `overall` scalar instead. This is your stated differentiator; it is currently switched off.

---

## P5 — Turn on the UI you already built

12,443 lines of front-office components render nowhere:

| Component | LOC | | Component | LOC |
|---|---|---|---|---|
| TradeNegotiation | 1,056 | | WarRoom | 637 |
| ProspectComparison | 893 | | MockDraftSimulator | 596 |
| DraftGrades | 713 | | ScoutAccuracyReport | 536 |
| ScoutManagement | 675 | | ScoutDisagreements | 519 |
| ScoutingCalendar | 668 | | RosterManagement | 357 |
| BigBoard | 659 | | ScoutingReportView | 273 |
| ScoutingReportCard | 656 | | *+ 3,323 LOC relationship subtree* | |
| DraftBoard | 655 | | | |

The whole relationship system (`RelationshipHub` + 5 children) hangs off one unreferenced parent. Nav's "Draft Board" link 404s while `DraftBoard.tsx` sits unused.

Also unlinked-but-working: `/teams/contracts` (absent from nav), `/draft/summary`, `/games/[id]` box scores, `/players/compare`.

**Decision to make explicitly: for each of these, wire it or delete it.** Leaving 12k lines in an ambiguous state is itself a cost — it makes the codebase unreadable and every future estimate wrong.

---

## P6 — Genuinely new features (only after P0–P3)

In rough value order:

1. **News feed / transaction ticker.** `game_events` table exists, never queried. This is what makes a league feel alive and it is cheap.
2. **Injuries.** Table exists with RLS; `grep from("injuries")` across all pages returns nothing. The sim has no injury, fatigue or wear model at all. `/regular-season` links "Injury Report" → `/teams/roster`, which has no injury column.
3. **Practice squad, elevations, gameday 47/48 actives, the 8-OL rule.** Zero occurrences of `practice_squad` or `waiver` in the entire codebase. The domain brief calls these out as where the roster puzzle lives.
4. **Franchise/transition tags, RFA tenders, 5th-year options, comp picks.**
5. **Awards, franchise history, hall of fame, record book.** `awards` table exists, unused.
6. **In-draft trades** — trade-up/trade-down offers with a draft ticker. The brief correctly identifies board management as the real draft game.
7. **Holdouts, trade demands, agent friction** — the persona layer. Only worth it once progression and relationships are live.

---

## Suggested first four weeks

| Week | Work |
|---|---|
| **1** | Player seed route · squashed migration baseline verified with `db reset` · delete/auth the three dangerous admin routes · RLS on `player_team_assignments` · remove the 13 dead nav links |
| **2** | Season hub with Advance Week · playoffs→offseason transition · use accumulated score instead of `calculateFinalScores` · fix team-strength weights · wire the depth chart into the sim |
| **3** | `save_game_id` NOT NULL + backfill, delete the fix-\* routes · promote prospects into `players` on draft · sim commit + trade execute + roster cut as Postgres functions · pagination on the five 1000-row queries |
| **4** | Play-logic fixes (yard line, 4th-and-goal, sacks, FG misses, turnover on downs) · schedule home/away balance · `team_season_stats` updated during the season → real playoff seeding · rookie 4-year deals |

That gets you a game that can be **started, played end to end, and trusted**. P4 onward is where it becomes good.

---

## One structural recommendation

Adopt a rule: **nothing new gets written until the thing it depends on is reachable from a page.** The pattern in this repo is that each subsystem was designed thoroughly, implemented thoroughly, and then never connected — scheme fit, progression, relationships, pro scouting, the cap engine, CPU scouting, and twenty UI components all followed it. That's roughly 30,000 lines of finished work delivering zero player value, and it's also why the diagnose/fix routes keep multiplying: the wired code is the thin, rushed layer holding everything together.

The fastest path to a testable game is not more building. It's connecting, deleting, and closing the loop.
