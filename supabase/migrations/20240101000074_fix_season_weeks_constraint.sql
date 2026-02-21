-- Fix season_weeks constraint to allow weeks 0-23
-- Week 0: Preseason
-- Weeks 1-18: Regular season
-- Weeks 19-22: Playoffs
-- Week 23: Offseason

-- Drop the old constraint
ALTER TABLE public.season_weeks
  DROP CONSTRAINT IF EXISTS season_weeks_week_number_check;

-- Add new constraint allowing weeks 0-23
ALTER TABLE public.season_weeks
  ADD CONSTRAINT season_weeks_week_number_check 
  CHECK (week_number >= 0 AND week_number <= 23);

-- Drop the old unique constraint
ALTER TABLE public.season_weeks
  DROP CONSTRAINT IF EXISTS season_weeks_unique;

-- Create new unique constraint that includes save_game_id for proper isolation
-- Use COALESCE pattern like other tables to handle NULL save_game_id
CREATE UNIQUE INDEX IF NOT EXISTS season_weeks_save_game_unique 
ON public.season_weeks(
  COALESCE(save_game_id, '00000000-0000-0000-0000-000000000000'::uuid),
  season_id, 
  week_number
);

