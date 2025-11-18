-- Remove old scouting_method column from scouting_reports table
-- This was used in the old schema (one report per method)
-- Now we use methods_used array (one report per prospect)
-- This migration is idempotent and can be run multiple times safely

DO $$ 
BEGIN
  -- First, drop any unique constraint that includes scouting_method
  IF EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'scouting_reports_team_prospect_method_unique'
  ) THEN
    ALTER TABLE public.scouting_reports 
    DROP CONSTRAINT scouting_reports_team_prospect_method_unique;
  END IF;

  -- Check if scouting_method column exists, if so remove it
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'scouting_reports' 
    AND column_name = 'scouting_method'
  ) THEN
    -- Drop the column
    ALTER TABLE public.scouting_reports 
    DROP COLUMN scouting_method;
    
    RAISE NOTICE 'Removed old scouting_method column from scouting_reports';
  ELSE
    RAISE NOTICE 'scouting_method column does not exist, skipping';
  END IF;

  -- Ensure the correct unique constraint exists (team_id, prospect_id only)
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'scouting_reports_unique'
  ) THEN
    ALTER TABLE public.scouting_reports 
    ADD CONSTRAINT scouting_reports_unique UNIQUE(team_id, prospect_id);
    
    RAISE NOTICE 'Added scouting_reports_unique constraint';
  END IF;
END $$;

