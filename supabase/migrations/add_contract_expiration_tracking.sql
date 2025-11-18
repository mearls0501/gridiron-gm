-- Add contract expiration tracking to players table
-- This allows tracking when contracts expire and helps with offseason processing

-- Add contract_expires_season column to players table
ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS contract_expires_season INTEGER;

-- Create index for efficient queries of expiring contracts
CREATE INDEX IF NOT EXISTS idx_players_contract_expires_season ON public.players(contract_expires_season);

-- Ensure free_agents.entered_free_agency_season is properly indexed (should already exist from previous migration)
CREATE INDEX IF NOT EXISTS idx_free_agents_entered_season ON public.free_agents(entered_free_agency_season);

-- Add comment for documentation
COMMENT ON COLUMN public.players.contract_expires_season IS 'Season when the player''s contract expires. NULL if contract has multiple years remaining. Set during offseason processing.';

