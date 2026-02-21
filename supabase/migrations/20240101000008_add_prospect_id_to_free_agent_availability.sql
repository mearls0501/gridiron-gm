-- Migration: Add prospect_id to free_agent_availability table
-- This allows tracking undrafted prospects as free agents
-- The table can now reference either players (via player_id) or prospects (via prospect_id)

-- Make player_id nullable (since we can have prospects without player records)
ALTER TABLE public.free_agent_availability
ALTER COLUMN player_id DROP NOT NULL;

-- Add prospect_id column
ALTER TABLE public.free_agent_availability
ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES public.draft_prospects(id) ON DELETE CASCADE;

-- Update unique constraint to allow either player_id or prospect_id per save game
-- Drop the old constraint
ALTER TABLE public.free_agent_availability
DROP CONSTRAINT IF EXISTS free_agent_availability_player_id_save_game_id_key;

-- Add unique constraints that ensure uniqueness per save game for either player or prospect
-- A player can only be available once per save game
-- A prospect can only be available once per save game
-- Using partial unique indexes for better performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_free_agent_availability_player_unique 
ON public.free_agent_availability(save_game_id, player_id) 
WHERE player_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_free_agent_availability_prospect_unique 
ON public.free_agent_availability(save_game_id, prospect_id) 
WHERE prospect_id IS NOT NULL;

-- Also create a composite unique constraint for upsert operations
-- This allows Supabase to use onConflict properly
-- Note: We'll handle conflicts manually in code since we have two separate unique constraints

-- Add check constraint to ensure at least one of player_id or prospect_id is set
ALTER TABLE public.free_agent_availability
ADD CONSTRAINT check_player_or_prospect 
CHECK ((player_id IS NOT NULL AND prospect_id IS NULL) OR (player_id IS NULL AND prospect_id IS NOT NULL));

-- Create index for prospect_id
CREATE INDEX IF NOT EXISTS idx_free_agent_availability_prospect ON public.free_agent_availability(prospect_id);

-- Update comments
COMMENT ON COLUMN public.free_agent_availability.player_id IS 'Reference to players table (nullable - can be null if prospect_id is set)';
COMMENT ON COLUMN public.free_agent_availability.prospect_id IS 'Reference to draft_prospects table (nullable - can be null if player_id is set)';

