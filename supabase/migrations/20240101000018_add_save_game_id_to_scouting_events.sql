-- Migration: Add save_game_id to scouting_events table for data isolation
-- This allows multiple save games to coexist with completely separate scouting events

-- Add save_game_id to scouting_events table
ALTER TABLE public.scouting_events 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_scouting_events_save_game 
ON public.scouting_events(save_game_id, season);

-- Update existing records - set to NULL for now (events are global by nature, but can be isolated per save game)
-- If you want to populate existing records, you can do so based on season or other criteria
-- For now, we'll leave them NULL to allow legacy data to coexist

-- Update unique constraint to include save_game_id if needed
-- The table doesn't have a unique constraint currently, but we can add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_scouting_events_save_game_season 
ON public.scouting_events(save_game_id, season, event_type);

-- Add comments
COMMENT ON COLUMN public.scouting_events.save_game_id IS 'Links this scouting event to a specific save game for data isolation';

