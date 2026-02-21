-- Update seasons table to allow current_week from 0 to 23
-- Week 0: Preseason
-- Week 1-18: Regular season
-- Week 19-22: Playoffs
-- Week 23: Offseason

ALTER TABLE public.seasons
  DROP CONSTRAINT IF EXISTS seasons_current_week_check;

ALTER TABLE public.seasons
  ADD CONSTRAINT seasons_current_week_check 
  CHECK (current_week >= 0 AND current_week <= 23);

