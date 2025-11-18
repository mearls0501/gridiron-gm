-- Add season column to scouting_reports table
-- This allows filtering scouting reports by season for validation

ALTER TABLE public.scouting_reports
ADD COLUMN IF NOT EXISTS season INTEGER;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_scouting_reports_season ON public.scouting_reports(season);

-- Update existing records to set season based on prospect's season
-- This is a one-time update for existing data
UPDATE public.scouting_reports sr
SET season = (
  SELECT dp.season
  FROM public.draft_prospects dp
  WHERE dp.id = sr.prospect_id
  LIMIT 1
)
WHERE sr.season IS NULL;

-- Add comment
COMMENT ON COLUMN public.scouting_reports.season IS 'Season of the draft class being scouted. Used for filtering and validation.';

