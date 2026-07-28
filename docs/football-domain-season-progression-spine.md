# Football domain: season progression spine

Last updated: 2026-07-27 07:01 EDT

## Topic researched

Build-priority item 3: **season progression / calendar / weekly advancement / stats / offseason transitions**.

This follows Matt's priority correction: cap/contracts are not the first focus. The immediate goal is a playable, understandable franchise spine where a user can advance from setup through weekly games, playoffs, offseason transition, and next season without losing state or wondering what to do next.

## Sources used

- NFL Football Operations — 2026-2027 NFL Important Dates: official league calendar, training camp, roster cutdown, regular-season weekends, trade deadline, playoff weeks, franchise/transition tag window, free agency opening, offseason workouts, draft dates.
- NFL.com — official tiebreaking procedures: division/wild-card seeding, tied-game handling, draft-order selection meeting rules.
- NFL Football Operations — Creating the NFL Schedule: 17 regular-season games, one bye week, 272 total games over 18 weeks, home/away alternation constraints.
- NFL Football Operations — 2025 rules changes: regular-season and postseason overtime alignment, with both teams receiving a possession opportunity subject to regular-season 10-minute overtime.
- Football GM manual: proven sports-management UX pattern where a central Play Menu owns all context-dependent advancement across Preseason → Regular Season → Playoffs → Draft → Re-sign Players → Free Agency.
- Current Gridiron GM code inspected: `lib/seasons/season-manager.ts`, `lib/schedule-generator.ts`, `lib/playoffs/tiebreakers.ts`, `lib/progression/season-transition.ts`, `lib/progression/types.ts`, `app/regular-season/page.tsx`.

## 5-8 takeaways

1. **The franchise loop needs a canonical phase machine, not scattered week numbers.** Gridiron currently has `phase` and `current_week` on seasons, but the week model is overloaded: `0` preseason, `1-18` regular season, `19-22` playoffs, `23-25` offseason. That is workable as a display shorthand, but it should not be the source of truth for phase transitions. Build a `phase_events`/`league_calendar` model where each save has explicit events: `preseason_week_1`, `final_cutdown`, `regular_week_1`, `trade_deadline`, `wild_card`, `divisional`, `conference_championship`, `super_bowl`, `retirements`, `tag_window`, `free_agency_open`, `draft`, `rookie_signing`, `training_camp`.

2. **Weekly advancement should be atomic and resumable.** A click on “Advance Week” should run a deterministic transaction-like pipeline: validate blocking tasks → simulate unplayed games for the current week → write game results/stats/injuries/news → update standings/playoff picture → award scouting/progression points → advance calendar cursor → persist phase progress. If any step fails, the user should remain on the same calendar event with a visible failure reason, not halfway advanced.

3. **The real NFL calendar gives the game natural gates.** Official league dates create obvious decision points: preseason camp opens, 53-man roster cutdown before the season, practice squad setup, weekly injury reports, trade deadline after Week 9/10 timing, Week 18 regular-season close, Wild Card/Divisional/Conference/Super Bowl weekends, franchise-tag window, legal tampering/free agency, offseason workouts, draft. Gridiron does not need exact dates at first, but it does need these gates in the same order.

4. **The schedule generator hits the 272-game target but is too loose for a franchise spine.** `lib/schedule-generator.ts` guarantees 32 teams × 17 games by greedily filling non-division matchups, assigns bye weeks across weeks 6-14, then force-schedules conflicts if necessary. For MVP, that is acceptable only if tests prove: 272 games, no team has two games in a week, one bye per team, every team has 17 games, every division rival pair plays twice, and all games are scoped to `save_game_id` + season. The current fallback allowing two games in a week should become a hard validation failure before this becomes the main progression engine.

5. **Tiebreakers must be trustworthy because they affect both playoffs and draft order.** NFL.com states ties count as half a win/loss, division tiebreakers use head-to-head, division record, common games, conference record, strength of victory, strength of schedule, combined ranking, net points, touchdowns, then coin toss. Gridiron’s `lib/playoffs/tiebreakers.ts` implements win percentage, head-to-head, division/conference record, point differential, points scored, random coin flip. That is close enough for early UX, but it skips common games, strength of victory, strength of schedule, and the multi-team restart rules. The early build should at least make skipped tiebreakers explicit in UI/debug output so odd seedings are explainable.

6. **Football GM has the right UX pattern: one context-aware advancement control.** Its Play Menu owns every action that moves time forward. Gridiron should copy the design principle, not the UI: one persistent `Advance` control should say exactly what will happen next: “Sim Week 7,” “Process Trade Deadline,” “Start Wild Card Round,” “Run Retirements,” “Open Free Agency,” “Start Draft.” Screens can still exist, but time movement should not be hidden across many pages.

7. **Season transition is already conceptually present but needs binding to the calendar.** `lib/progression/season-transition.ts` can process player/staff development, retirements, firings, hiring needs, and headlines. The next step is not inventing a new transition engine; it is wiring this into a single end-of-season calendar event with durable output tables: player rating deltas, retirements, staff moves, generated headlines, and user-facing review summaries.

8. **Stats and news should be written during advancement, not calculated only on page load.** A franchise sim feels alive when each week leaves permanent artifacts: box scores, player game logs, injuries, standings snapshots, awards/watchlists, transactions, and news. This also supports future analytics/history, but the immediate value is debugging and user trust: Matt can inspect exactly what happened during Week 8 after reloading the save.

## Practical implementation guidance for Gridiron GM

### Recommended data model additions / cleanup

Prefer explicit save-scoped progression tables over deriving everything from `current_week`:

```sql
-- conceptual shape, not a ready migration
league_calendar_events (
  id uuid primary key,
  save_game_id uuid not null,
  season_year int not null,
  sequence_index int not null,
  phase text not null,
  event_key text not null,
  week_number int null,
  status text not null default 'locked', -- locked | available | running | complete | failed
  started_at timestamptz null,
  completed_at timestamptz null,
  result_summary jsonb not null default '{}',
  unique(save_game_id, season_year, sequence_index)
)

season_advancement_runs (
  id uuid primary key,
  save_game_id uuid not null,
  season_year int not null,
  event_key text not null,
  status text not null,
  steps jsonb not null default '[]',
  error text null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null
)
```

The existing `phase_progress` table can hold task/checklist completion, but the game needs an immutable run log too. When the user says “why did my team miss the playoffs?” the app should have the data to answer.

### Advancement pipeline MVP

1. Load active save + owner-scoped Supabase client.
2. Load current `league_calendar_event` by `save_game_id` where `status = 'available'`.
3. Load phase checklist from `phase_progress` / validators.
4. Block if required tasks are incomplete, and return exact task IDs.
5. Create `season_advancement_runs` row with `running` status.
6. Execute event handler:
   - `regular_week_N`: simulate unplayed games, write stats, update standings, update injuries/news, award weekly scouting/progression resources.
   - `trade_deadline`: lock trade UI after completion.
   - `playoff_round`: seed if first round, simulate selected games, advance bracket.
   - `season_transition`: run `processSeasonTransition`, write retirements/development/firings/headlines.
   - `offseason_phase`: open next actionable phase.
7. Mark current event complete, unlock next event, update `seasons.phase/current_week` as denormalized display state.
8. Mark run complete with counts: games simulated, injuries generated, stat rows written, standings updated, headlines created.

### Near-term acceptance tests

- New save creates a full calendar for season 1 and resumes the same next event after reload.
- Advancing regular Week 1 simulates only Week 1 games and never changes Week 2+ games.
- Re-running advance after a successful Week 1 does not duplicate game logs or stats.
- If a required checklist task is incomplete, advancement returns a blocking reason and writes no game results.
- Schedule validation fails if any team has more than one game in a week or not exactly one bye.
- End of Week 18 creates playoff seeds with explainable tiebreak output.
- End-of-season transition writes a permanent summary: development deltas, retirements, staff moves, and league headlines.

## Next recommended build implication

Build a **save-scoped calendar/advancement service** before adding more realism systems. Concretely: create `lib/seasons/calendar.ts` and `lib/seasons/advance.ts`, add durable advancement run logging, and make the home/regular-season UI call one API route (`POST /api/seasons/advance`) that returns the exact next event plus what changed. This is the spine that makes attributes, scouting, roster rules, and later cap/contracts testable in the actual game loop.
