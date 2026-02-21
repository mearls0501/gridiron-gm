-- Migration to standardize season identifiers from INTEGER to UUID
-- This ensures all tables reference the seasons table via UUID for referential integrity
-- and accuracy

-- Step 1: Add season_id UUID columns to all tables that currently use season INTEGER
-- We'll populate these columns in Step 2, then update constraints in Step 3

-- Games table
ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

-- Player stats tables
ALTER TABLE public.player_game_stats
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

ALTER TABLE public.player_season_stats
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

-- Schedules table
ALTER TABLE public.schedules
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

-- Draft tables
ALTER TABLE public.draft_picks
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

ALTER TABLE public.draft_prospects
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

ALTER TABLE public.draft_state
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

-- Phase progress (game_settings doesn't have a season column)
-- Check if table exists before adding column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'phase_progress'
  ) THEN
    EXECUTE 'ALTER TABLE public.phase_progress ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE';
  END IF;
END $$;

-- Scouting tables
ALTER TABLE public.scout_weekly_points
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

ALTER TABLE public.scouting_reports
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

-- League history tables
ALTER TABLE public.team_game_stats
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

ALTER TABLE public.player_contracts
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

ALTER TABLE public.depth_chart_slots
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

ALTER TABLE public.injuries
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

ALTER TABLE public.draft_results
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

ALTER TABLE public.game_events
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

ALTER TABLE public.salary_cap_ledger
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

ALTER TABLE public.awards
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

-- Playoff tables
ALTER TABLE public.playoff_games
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

ALTER TABLE public.playoff_seeds
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

-- Trade tables
ALTER TABLE public.trades
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

ALTER TABLE public.draft_pick_trades
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

-- Other tables
ALTER TABLE public.undrafted_prospects
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

ALTER TABLE public.player_team_assignments
ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

-- Note: free_agent_availability.entered_free_agency_season and 
-- player_contracts_per_save_game.contract_expires_season are year references, not season IDs
-- These can stay as INTEGER since they reference years, not specific season records

-- Step 2: Populate season_id columns by joining with seasons table
-- We need to match on both year and save_game_id for accuracy

-- Games table
UPDATE public.games g
SET season_id = s.id
FROM public.seasons s
WHERE g.season = s.year
  AND (
    (g.save_game_id IS NULL AND s.save_game_id IS NULL)
    OR (g.save_game_id = s.save_game_id)
  )
  AND g.season_id IS NULL;

-- Player game stats
UPDATE public.player_game_stats pgs
SET season_id = s.id
FROM public.seasons s
WHERE pgs.season = s.year
  AND (
    (pgs.save_game_id IS NULL AND s.save_game_id IS NULL)
    OR (pgs.save_game_id = s.save_game_id)
  )
  AND pgs.season_id IS NULL;

-- Player season stats
UPDATE public.player_season_stats pss
SET season_id = s.id
FROM public.seasons s
WHERE pss.season = s.year
  AND (
    (pss.save_game_id IS NULL AND s.save_game_id IS NULL)
    OR (pss.save_game_id = s.save_game_id)
  )
  AND pss.season_id IS NULL;

-- Schedules
UPDATE public.schedules sch
SET season_id = s.id
FROM public.seasons s
WHERE sch.season = s.year
  AND (
    (sch.save_game_id IS NULL AND s.save_game_id IS NULL)
    OR (sch.save_game_id = s.save_game_id)
  )
  AND sch.season_id IS NULL;

-- Draft picks
UPDATE public.draft_picks dp
SET season_id = s.id
FROM public.seasons s
WHERE dp.season = s.year
  AND (
    (dp.save_game_id IS NULL AND s.save_game_id IS NULL)
    OR (dp.save_game_id = s.save_game_id)
  )
  AND dp.season_id IS NULL;

-- Draft prospects
UPDATE public.draft_prospects dpr
SET season_id = s.id
FROM public.seasons s
WHERE dpr.season = s.year
  AND (
    (dpr.save_game_id IS NULL AND s.save_game_id IS NULL)
    OR (dpr.save_game_id = s.save_game_id)
  )
  AND dpr.season_id IS NULL;

-- Draft state
UPDATE public.draft_state ds
SET season_id = s.id
FROM public.seasons s
WHERE ds.season = s.year
  AND (
    (ds.save_game_id IS NULL AND s.save_game_id IS NULL)
    OR (ds.save_game_id = s.save_game_id)
  )
  AND ds.season_id IS NULL;

-- Phase progress
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'phase_progress'
  ) THEN
    EXECUTE '
      UPDATE public.phase_progress pp
      SET season_id = s.id
      FROM public.seasons s
      WHERE pp.season = s.year
        AND (
          (pp.save_game_id IS NULL AND s.save_game_id IS NULL)
          OR (pp.save_game_id = s.save_game_id)
        )
        AND pp.season_id IS NULL
    ';
  END IF;
END $$;

-- Scout weekly points
UPDATE public.scout_weekly_points swp
SET season_id = s.id
FROM public.seasons s
WHERE swp.season = s.year
  AND (
    (swp.save_game_id IS NULL AND s.save_game_id IS NULL)
    OR (swp.save_game_id = s.save_game_id)
  )
  AND swp.season_id IS NULL;

-- Scouting reports (get season from prospect if season column doesn't exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'scouting_reports' 
    AND column_name = 'season'
  ) THEN
    -- Use season column if it exists
    UPDATE public.scouting_reports sr
    SET season_id = s.id
    FROM public.seasons s
    WHERE sr.season = s.year
      AND (
        (sr.save_game_id IS NULL AND s.save_game_id IS NULL)
        OR (sr.save_game_id = s.save_game_id)
      )
      AND sr.season_id IS NULL
      AND sr.season IS NOT NULL;
  ELSE
    -- Get season from prospect's season
    UPDATE public.scouting_reports sr
    SET season_id = s.id
    FROM public.draft_prospects dp
    JOIN public.seasons s ON dp.season = s.year
    WHERE sr.prospect_id = dp.id
      AND (
        -- Match save_game_id: either both NULL, or both match
        (
          (COALESCE(sr.save_game_id, dp.save_game_id) IS NULL AND s.save_game_id IS NULL)
          OR (COALESCE(sr.save_game_id, dp.save_game_id) = s.save_game_id)
        )
      )
      AND sr.season_id IS NULL;
  END IF;
END $$;

-- Team game stats
UPDATE public.team_game_stats tgs
SET season_id = s.id
FROM public.seasons s
WHERE tgs.season = s.year
  AND (
    (tgs.save_game_id IS NULL AND s.save_game_id IS NULL)
    OR (tgs.save_game_id = s.save_game_id)
  )
  AND tgs.season_id IS NULL;

-- Transactions (has save_game_id from add_save_game_isolation)
UPDATE public.transactions t
SET season_id = s.id
FROM public.seasons s
WHERE t.season = s.year
  AND (
    (t.save_game_id IS NULL AND s.save_game_id IS NULL)
    OR (t.save_game_id = s.save_game_id)
  )
  AND t.season_id IS NULL
  AND t.season IS NOT NULL;

-- Player contracts (check if save_game_id exists - may not have it)
-- First try with save_game_id if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'player_contracts' 
    AND column_name = 'save_game_id'
  ) THEN
    UPDATE public.player_contracts pc
    SET season_id = s.id
    FROM public.seasons s
    WHERE pc.season = s.year
      AND (
        (pc.save_game_id IS NULL AND s.save_game_id IS NULL)
        OR (pc.save_game_id = s.save_game_id)
      )
      AND pc.season_id IS NULL;
  ELSE
    -- No save_game_id column, match on year and NULL save_game_id in seasons
    UPDATE public.player_contracts pc
    SET season_id = s.id
    FROM public.seasons s
    WHERE pc.season = s.year
      AND s.save_game_id IS NULL
      AND pc.season_id IS NULL;
  END IF;
END $$;

-- Depth chart slots (check if save_game_id exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'depth_chart_slots' 
    AND column_name = 'save_game_id'
  ) THEN
    UPDATE public.depth_chart_slots dcs
    SET season_id = s.id
    FROM public.seasons s
    WHERE dcs.season = s.year
      AND (
        (dcs.save_game_id IS NULL AND s.save_game_id IS NULL)
        OR (dcs.save_game_id = s.save_game_id)
      )
      AND dcs.season_id IS NULL;
  ELSE
    UPDATE public.depth_chart_slots dcs
    SET season_id = s.id
    FROM public.seasons s
    WHERE dcs.season = s.year
      AND s.save_game_id IS NULL
      AND dcs.season_id IS NULL;
  END IF;
END $$;

-- Injuries (check if save_game_id exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'injuries' 
    AND column_name = 'save_game_id'
  ) THEN
    UPDATE public.injuries i
    SET season_id = s.id
    FROM public.seasons s
    WHERE i.season = s.year
      AND (
        (i.save_game_id IS NULL AND s.save_game_id IS NULL)
        OR (i.save_game_id = s.save_game_id)
      )
      AND i.season_id IS NULL
      AND i.season IS NOT NULL;
  ELSE
    UPDATE public.injuries i
    SET season_id = s.id
    FROM public.seasons s
    WHERE i.season = s.year
      AND s.save_game_id IS NULL
      AND i.season_id IS NULL
      AND i.season IS NOT NULL;
  END IF;
END $$;

-- Draft results (has save_game_id from add_save_game_id_to_draft_results)
UPDATE public.draft_results dr
SET season_id = s.id
FROM public.seasons s
WHERE dr.season = s.year
  AND (
    (dr.save_game_id IS NULL AND s.save_game_id IS NULL)
    OR (dr.save_game_id = s.save_game_id)
  )
  AND dr.season_id IS NULL;

-- Game events (get season_id from games table since game_events doesn't have season column)
UPDATE public.game_events ge
SET season_id = g.season_id
FROM public.games g
WHERE ge.game_id = g.id
  AND ge.season_id IS NULL
  AND g.season_id IS NOT NULL;

-- Salary cap ledger (check if save_game_id exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'salary_cap_ledger' 
    AND column_name = 'save_game_id'
  ) THEN
    UPDATE public.salary_cap_ledger scl
    SET season_id = s.id
    FROM public.seasons s
    WHERE scl.season = s.year
      AND (
        (scl.save_game_id IS NULL AND s.save_game_id IS NULL)
        OR (scl.save_game_id = s.save_game_id)
      )
      AND scl.season_id IS NULL;
  ELSE
    UPDATE public.salary_cap_ledger scl
    SET season_id = s.id
    FROM public.seasons s
    WHERE scl.season = s.year
      AND s.save_game_id IS NULL
      AND scl.season_id IS NULL;
  END IF;
END $$;

-- Awards (check if save_game_id exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'awards' 
    AND column_name = 'save_game_id'
  ) THEN
    UPDATE public.awards a
    SET season_id = s.id
    FROM public.seasons s
    WHERE a.season = s.year
      AND (
        (a.save_game_id IS NULL AND s.save_game_id IS NULL)
        OR (a.save_game_id = s.save_game_id)
      )
      AND a.season_id IS NULL;
  ELSE
    UPDATE public.awards a
    SET season_id = s.id
    FROM public.seasons s
    WHERE a.season = s.year
      AND s.save_game_id IS NULL
      AND a.season_id IS NULL;
  END IF;
END $$;

-- Playoff games
UPDATE public.playoff_games pg
SET season_id = s.id
FROM public.seasons s
WHERE pg.season = s.year
  AND (
    (pg.save_game_id IS NULL AND s.save_game_id IS NULL)
    OR (pg.save_game_id = s.save_game_id)
  )
  AND pg.season_id IS NULL;

-- Playoff seeds
UPDATE public.playoff_seeds ps
SET season_id = s.id
FROM public.seasons s
WHERE ps.season = s.year
  AND (
    (ps.save_game_id IS NULL AND s.save_game_id IS NULL)
    OR (ps.save_game_id = s.save_game_id)
  )
  AND ps.season_id IS NULL;

-- Trades
UPDATE public.trades tr
SET season_id = s.id
FROM public.seasons s
WHERE tr.season = s.year
  AND (
    (tr.save_game_id IS NULL AND s.save_game_id IS NULL)
    OR (tr.save_game_id = s.save_game_id)
  )
  AND tr.season_id IS NULL;

-- Draft pick trades
UPDATE public.draft_pick_trades dpt
SET season_id = s.id
FROM public.seasons s
WHERE dpt.season = s.year
  AND (
    (dpt.save_game_id IS NULL AND s.save_game_id IS NULL)
    OR (dpt.save_game_id = s.save_game_id)
  )
  AND dpt.season_id IS NULL;

-- Undrafted prospects
UPDATE public.undrafted_prospects up
SET season_id = s.id
FROM public.seasons s
WHERE up.season = s.year
  AND (
    (up.save_game_id IS NULL AND s.save_game_id IS NULL)
    OR (up.save_game_id = s.save_game_id)
  )
  AND up.season_id IS NULL;

-- Player team assignments
UPDATE public.player_team_assignments pta
SET season_id = s.id
FROM public.seasons s
WHERE pta.season = s.year
  AND (
    (pta.save_game_id IS NULL AND s.save_game_id IS NULL)
    OR (pta.save_game_id = s.save_game_id)
  )
  AND pta.season_id IS NULL
  AND pta.season IS NOT NULL;

-- Step 3: Create indexes on the new season_id columns for performance
CREATE INDEX IF NOT EXISTS idx_games_season_id ON public.games(season_id);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_season_id ON public.player_game_stats(season_id);
CREATE INDEX IF NOT EXISTS idx_player_season_stats_season_id ON public.player_season_stats(season_id);
CREATE INDEX IF NOT EXISTS idx_schedules_season_id ON public.schedules(season_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_season_id ON public.draft_picks(season_id);
CREATE INDEX IF NOT EXISTS idx_draft_prospects_season_id ON public.draft_prospects(season_id);
CREATE INDEX IF NOT EXISTS idx_draft_state_season_id ON public.draft_state(season_id);
-- Phase progress index (only if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'phase_progress'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_phase_progress_season_id ON public.phase_progress(season_id)';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_scout_weekly_points_season_id ON public.scout_weekly_points(season_id);
CREATE INDEX IF NOT EXISTS idx_scouting_reports_season_id ON public.scouting_reports(season_id);
CREATE INDEX IF NOT EXISTS idx_team_game_stats_season_id ON public.team_game_stats(season_id);
CREATE INDEX IF NOT EXISTS idx_transactions_season_id ON public.transactions(season_id);
CREATE INDEX IF NOT EXISTS idx_player_contracts_season_id ON public.player_contracts(season_id);
CREATE INDEX IF NOT EXISTS idx_depth_chart_slots_season_id ON public.depth_chart_slots(season_id);
CREATE INDEX IF NOT EXISTS idx_injuries_season_id ON public.injuries(season_id);
CREATE INDEX IF NOT EXISTS idx_draft_results_season_id ON public.draft_results(season_id);
CREATE INDEX IF NOT EXISTS idx_game_events_season_id ON public.game_events(season_id);
CREATE INDEX IF NOT EXISTS idx_salary_cap_ledger_season_id ON public.salary_cap_ledger(season_id);
CREATE INDEX IF NOT EXISTS idx_awards_season_id ON public.awards(season_id);
CREATE INDEX IF NOT EXISTS idx_playoff_games_season_id ON public.playoff_games(season_id);
CREATE INDEX IF NOT EXISTS idx_playoff_seeds_season_id ON public.playoff_seeds(season_id);
CREATE INDEX IF NOT EXISTS idx_trades_season_id ON public.trades(season_id);
CREATE INDEX IF NOT EXISTS idx_draft_pick_trades_season_id ON public.draft_pick_trades(season_id);
CREATE INDEX IF NOT EXISTS idx_undrafted_prospects_season_id ON public.undrafted_prospects(season_id);
CREATE INDEX IF NOT EXISTS idx_player_team_assignments_season_id ON public.player_team_assignments(season_id);

-- Step 4: Update composite indexes to include season_id where appropriate
-- These are in addition to existing indexes, not replacements

-- Games: season_id + week
CREATE INDEX IF NOT EXISTS idx_games_season_id_week ON public.games(season_id, week);

-- Player game stats: season_id + player_id
CREATE INDEX IF NOT EXISTS idx_player_game_stats_season_id_player ON public.player_game_stats(season_id, player_id);

-- Player season stats: season_id + player_id
CREATE INDEX IF NOT EXISTS idx_player_season_stats_season_id_player ON public.player_season_stats(season_id, player_id);

-- Schedules: season_id + save_game_id
CREATE INDEX IF NOT EXISTS idx_schedules_season_id_save_game ON public.schedules(season_id, save_game_id);

-- Draft picks: season_id + owning_team_id
CREATE INDEX IF NOT EXISTS idx_draft_picks_season_id_team ON public.draft_picks(season_id, owning_team_id);

-- Team game stats: season_id + team_id
CREATE INDEX IF NOT EXISTS idx_team_game_stats_season_id_team ON public.team_game_stats(season_id, team_id);

-- Player contracts: season_id + team_id
CREATE INDEX IF NOT EXISTS idx_player_contracts_season_id_team ON public.player_contracts(season_id, team_id);

-- Depth chart slots: season_id + team_id
CREATE INDEX IF NOT EXISTS idx_depth_chart_slots_season_id_team ON public.depth_chart_slots(season_id, team_id);

-- Transactions: season_id + transaction_type
CREATE INDEX IF NOT EXISTS idx_transactions_season_id_type ON public.transactions(season_id, transaction_type);

-- Add comments
COMMENT ON COLUMN public.games.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.player_game_stats.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.player_season_stats.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.schedules.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.draft_picks.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.draft_prospects.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.draft_state.season_id IS 'References the seasons table UUID for referential integrity';
-- Phase progress comment (only if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'phase_progress'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN public.phase_progress.season_id IS ''References the seasons table UUID for referential integrity''';
  END IF;
END $$;
COMMENT ON COLUMN public.scout_weekly_points.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.scouting_reports.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.team_game_stats.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.transactions.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.player_contracts.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.depth_chart_slots.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.injuries.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.draft_results.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.game_events.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.salary_cap_ledger.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.awards.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.playoff_games.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.playoff_seeds.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.trades.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.draft_pick_trades.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.undrafted_prospects.season_id IS 'References the seasons table UUID for referential integrity';
COMMENT ON COLUMN public.player_team_assignments.season_id IS 'References the seasons table UUID for referential integrity';

-- Note: The old 'season INTEGER' columns are kept for backward compatibility.
-- In a future migration, we can make season_id NOT NULL and drop the old columns
-- after updating all application code to use season_id instead of season.

