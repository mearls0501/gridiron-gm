-- Migration: Update existing scouting_reports with NULL save_game_id
-- This updates reports to have the save_game_id from their associated prospect

-- Update scouting_reports to set save_game_id from their prospect
UPDATE public.scouting_reports sr
SET save_game_id = (
  SELECT dp.save_game_id
  FROM public.draft_prospects dp
  WHERE dp.id = sr.prospect_id
  LIMIT 1
)
WHERE sr.save_game_id IS NULL
AND EXISTS (
  SELECT 1 FROM public.draft_prospects dp
  WHERE dp.id = sr.prospect_id
  AND dp.save_game_id IS NOT NULL
);

-- Add comment
COMMENT ON COLUMN public.scouting_reports.save_game_id IS 'Links this scouting report to a specific save game for data isolation. Updated from prospect save_game_id if NULL.';

