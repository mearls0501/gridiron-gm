-- Migration: Add save_game_id to scouting tables for data isolation
-- This allows multiple save games to coexist with completely separate scouting data

-- Add save_game_id to scouting_reports table
ALTER TABLE public.scouting_reports 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_scouting_reports_save_game 
ON public.scouting_reports(save_game_id, team_id, prospect_id);

-- Update existing reports to set save_game_id from their prospect
UPDATE public.scouting_reports sr
SET save_game_id = (
  SELECT dp.save_game_id
  FROM public.draft_prospects dp
  WHERE dp.id = sr.prospect_id
  LIMIT 1
)
WHERE sr.save_game_id IS NULL;

-- Update unique constraint to include save_game_id
DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'scouting_reports_unique'
  ) THEN
    ALTER TABLE public.scouting_reports 
    DROP CONSTRAINT scouting_reports_unique;
  END IF;
END $$;

-- Create new unique constraint that includes save_game_id for reports with save_game_id
CREATE UNIQUE INDEX IF NOT EXISTS scouting_reports_save_game_unique 
ON public.scouting_reports(save_game_id, team_id, prospect_id) 
WHERE save_game_id IS NOT NULL;

-- For legacy reports without save_game_id, keep the old constraint
CREATE UNIQUE INDEX IF NOT EXISTS scouting_reports_unique_null 
ON public.scouting_reports(team_id, prospect_id) 
WHERE save_game_id IS NULL;

-- Add save_game_id to scouting_history table (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'scouting_history'
  ) THEN
    ALTER TABLE public.scouting_history 
    ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

    CREATE INDEX IF NOT EXISTS idx_scouting_history_save_game 
    ON public.scouting_history(save_game_id, team_id, prospect_id);

    -- Update existing history records
    UPDATE public.scouting_history sh
    SET save_game_id = (
      SELECT dp.save_game_id
      FROM public.draft_prospects dp
      WHERE dp.id = sh.prospect_id
      LIMIT 1
    )
    WHERE sh.save_game_id IS NULL;
  END IF;
END $$;

-- Add save_game_id to scouting_priorities table (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'scouting_priorities'
  ) THEN
    ALTER TABLE public.scouting_priorities 
    ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

    CREATE INDEX IF NOT EXISTS idx_scouting_priorities_save_game 
    ON public.scouting_priorities(save_game_id, team_id, prospect_id);

    -- Update existing priorities
    UPDATE public.scouting_priorities sp
    SET save_game_id = (
      SELECT dp.save_game_id
      FROM public.draft_prospects dp
      WHERE dp.id = sp.prospect_id
      LIMIT 1
    )
    WHERE sp.save_game_id IS NULL;

    -- Update unique constraint for priorities
    IF EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'scouting_priorities_unique'
    ) THEN
      ALTER TABLE public.scouting_priorities 
      DROP CONSTRAINT scouting_priorities_unique;
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS scouting_priorities_save_game_unique 
    ON public.scouting_priorities(save_game_id, team_id, prospect_id) 
    WHERE save_game_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS scouting_priorities_unique_null 
    ON public.scouting_priorities(team_id, prospect_id) 
    WHERE save_game_id IS NULL;
  END IF;
END $$;

-- Add comments
COMMENT ON COLUMN public.scouting_reports.save_game_id IS 'Links this scouting report to a specific save game for data isolation';

