-- Migration: Add save_game_id to team_scouting_resources table for data isolation
-- This allows multiple save games to coexist with completely separate scouting resources

-- Add save_game_id to team_scouting_resources table
ALTER TABLE public.team_scouting_resources 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_team_scouting_resources_save_game 
ON public.team_scouting_resources(save_game_id, team_id, season);

-- Update existing records - set to NULL for legacy data
-- New records should always have save_game_id

-- Update primary key structure
-- Since primary keys can't include NULL values, we need to handle this carefully
-- Option 1: Add an ID column and make it the primary key
-- Option 2: Make save_game_id NOT NULL and update existing records
-- We'll go with Option 1 to support legacy data

-- First, check if there's already an ID column
DO $$
BEGIN
  -- Add ID column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'team_scouting_resources' 
    AND column_name = 'id'
  ) THEN
    -- Add ID column
    ALTER TABLE public.team_scouting_resources 
    ADD COLUMN id UUID DEFAULT gen_random_uuid();
    
    -- Drop old primary key
    ALTER TABLE public.team_scouting_resources 
    DROP CONSTRAINT IF EXISTS team_scouting_resources_pkey;
    
    -- Set ID as primary key
    ALTER TABLE public.team_scouting_resources 
    ADD PRIMARY KEY (id);
    
    -- Make ID NOT NULL
    ALTER TABLE public.team_scouting_resources 
    ALTER COLUMN id SET NOT NULL;
  END IF;
END $$;

-- Drop old unique constraint if it exists
ALTER TABLE public.team_scouting_resources 
DROP CONSTRAINT IF EXISTS team_scouting_resources_unique;

-- Create new unique constraint that includes save_game_id for resources with save_game_id
CREATE UNIQUE INDEX IF NOT EXISTS team_scouting_resources_save_game_unique 
ON public.team_scouting_resources(save_game_id, team_id, season) 
WHERE save_game_id IS NOT NULL;

-- For legacy resources without save_game_id, keep the old constraint
CREATE UNIQUE INDEX IF NOT EXISTS team_scouting_resources_unique_null 
ON public.team_scouting_resources(team_id, season) 
WHERE save_game_id IS NULL;

-- Fix any resources that have 0 points - set them to 15 (default weekly budget)
-- Only update if last_week column exists (from update_scouting_weekly_budget.sql migration)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'team_scouting_resources' 
    AND column_name = 'last_week'
  ) THEN
    UPDATE public.team_scouting_resources 
    SET scouting_points = 15 
    WHERE scouting_points = 0 
    AND (last_week IS NULL OR last_week < 21);
  ELSE
    -- If last_week doesn't exist, just fix all resources with 0 points
    UPDATE public.team_scouting_resources 
    SET scouting_points = 15 
    WHERE scouting_points = 0;
  END IF;
END $$;

-- Add comments
COMMENT ON COLUMN public.team_scouting_resources.save_game_id IS 'Links this scouting resource to a specific save game for data isolation';

