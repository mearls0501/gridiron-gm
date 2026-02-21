-- Add save_game_id to depth_chart_slots for proper game isolation
-- This ensures depth charts are unique per save game

-- Add save_game_id column if it doesn't exist
ALTER TABLE public.depth_chart_slots
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

-- Make the old season column nullable since we're using season_id now
ALTER TABLE public.depth_chart_slots
ALTER COLUMN season DROP NOT NULL;

-- Update unique constraint to include save_game_id
-- First drop the old constraint if it exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'depth_chart_unique'
    ) THEN
        ALTER TABLE public.depth_chart_slots
        DROP CONSTRAINT depth_chart_unique;
    END IF;
END $$;

-- Add new constraint that includes save_game_id and uses season_id
ALTER TABLE public.depth_chart_slots
ADD CONSTRAINT depth_chart_unique UNIQUE (team_id, season_id, position, slot, save_game_id);

-- Create index for faster lookups by save_game_id
CREATE INDEX IF NOT EXISTS idx_depth_chart_slots_save_game ON public.depth_chart_slots(save_game_id);

-- Create composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_depth_chart_slots_save_game_team ON public.depth_chart_slots(save_game_id, team_id);

-- Add comments
COMMENT ON COLUMN public.depth_chart_slots.save_game_id IS 'References the save game for proper isolation of depth charts across different games';
COMMENT ON COLUMN public.depth_chart_slots.season IS 'Deprecated: Use season_id instead. Kept for backwards compatibility but nullable.';

