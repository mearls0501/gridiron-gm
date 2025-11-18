-- Add archiving fields to free_agents table
-- This allows tracking when players entered free agency and archiving them after 3 seasons

-- Add entered_free_agency_season to track when player became a free agent
ALTER TABLE public.free_agents
ADD COLUMN IF NOT EXISTS entered_free_agency_season INTEGER;

-- Add archived flag
ALTER TABLE public.free_agents
ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;

-- Set entered_free_agency_season for existing free agents based on created_at
-- If created_at exists, estimate season (assuming 2025 as base)
UPDATE public.free_agents
SET entered_free_agency_season = 2025
WHERE entered_free_agency_season IS NULL;

-- Create index for archiving queries
CREATE INDEX IF NOT EXISTS idx_free_agents_archived ON public.free_agents(archived);
CREATE INDEX IF NOT EXISTS idx_free_agents_entered_season ON public.free_agents(entered_free_agency_season);

-- Add comment
COMMENT ON COLUMN public.free_agents.entered_free_agency_season IS 'Season when player entered free agency. Players are archived after 3 seasons unsigned.';
COMMENT ON COLUMN public.free_agents.archived IS 'Whether the player has been archived (unsigned for 3+ seasons)';

