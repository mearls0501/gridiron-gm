-- Migration: Create free_agent_availability table
-- This tracks which free agents are available in which save game
-- The free_agents table remains as base/seed data (shared across all games)
-- This table tracks changes (players added to FA, cut, etc.) per save game

CREATE TABLE IF NOT EXISTS public.free_agent_availability (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  entered_free_agency_season INTEGER,
  entered_free_agency_week INTEGER,
  reason TEXT, -- 'contract_expired', 'cut', 'released', 'draft_undrafted', 'initial', etc.
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- A player can only be available once per save game
  UNIQUE(player_id, save_game_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_free_agent_availability_player ON public.free_agent_availability(player_id);
CREATE INDEX IF NOT EXISTS idx_free_agent_availability_save_game ON public.free_agent_availability(save_game_id);
CREATE INDEX IF NOT EXISTS idx_free_agent_availability_archived ON public.free_agent_availability(archived);
CREATE INDEX IF NOT EXISTS idx_free_agent_availability_composite ON public.free_agent_availability(save_game_id, archived);

-- Enable Row Level Security (RLS)
ALTER TABLE public.free_agent_availability ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then create new ones
DROP POLICY IF EXISTS "Allow all operations on free_agent_availability" ON public.free_agent_availability;

-- Policy to allow all operations (adjust based on your auth needs)
CREATE POLICY "Allow all operations on free_agent_availability" ON public.free_agent_availability
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.free_agent_availability IS 'Tracks which free agents are available in which save game. Base free_agents table contains initial seed data.';
COMMENT ON COLUMN public.free_agent_availability.reason IS 'Reason player entered free agency: contract_expired, cut, released, draft_undrafted, initial, etc.';
COMMENT ON COLUMN public.free_agent_availability.archived IS 'Whether the player has been archived (unsigned for 3+ seasons)';


