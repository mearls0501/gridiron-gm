-- Update seasons table to allow current_week up to 23 (for offseason)
-- Week 1-18: Regular season
-- Week 19-22: Playoffs
-- Week 23: Offseason

ALTER TABLE public.seasons
  DROP CONSTRAINT IF EXISTS seasons_current_week_check;

ALTER TABLE public.seasons
  ADD CONSTRAINT seasons_current_week_check 
  CHECK (current_week >= 1 AND current_week <= 23);

