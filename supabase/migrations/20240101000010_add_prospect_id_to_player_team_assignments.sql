-- Migration: Add prospect_id to player_team_assignments
-- This allows drafted prospects to be tracked without inserting them into the players table
-- Draft prospects remain in draft_prospects table and are referenced via prospect_id

-- Add prospect_id column (nullable, references draft_prospects)
ALTER TABLE public.player_team_assignments
ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES public.draft_prospects(id) ON DELETE CASCADE;

-- Make player_id nullable (since drafted prospects won't have a player_id)
ALTER TABLE public.player_team_assignments
ALTER COLUMN player_id DROP NOT NULL;

-- Add constraint: either player_id OR prospect_id must be set (but not both)
-- Drop if exists first to make migration idempotent
ALTER TABLE public.player_team_assignments
DROP CONSTRAINT IF EXISTS player_team_assignments_player_or_prospect_check;

ALTER TABLE public.player_team_assignments
ADD CONSTRAINT player_team_assignments_player_or_prospect_check 
CHECK (
  (player_id IS NOT NULL AND prospect_id IS NULL) OR 
  (player_id IS NULL AND prospect_id IS NOT NULL)
);

-- Drop old unique constraint
ALTER TABLE public.player_team_assignments
DROP CONSTRAINT IF EXISTS player_team_assignments_player_id_save_game_id_key;

-- Drop any existing partial indexes
DROP INDEX IF EXISTS player_team_assignments_player_unique;
DROP INDEX IF EXISTS player_team_assignments_prospect_unique;

-- Create unique constraint for player_id + save_game_id (when player_id is set)
-- Using a unique constraint with a partial index for better ON CONFLICT support
-- We'll create a unique constraint that works with ON CONFLICT
CREATE UNIQUE INDEX player_team_assignments_player_unique
ON public.player_team_assignments(player_id, save_game_id)
WHERE player_id IS NOT NULL;

-- Create unique constraint for prospect_id + save_game_id (when prospect_id is set)
CREATE UNIQUE INDEX player_team_assignments_prospect_unique
ON public.player_team_assignments(prospect_id, save_game_id)
WHERE prospect_id IS NOT NULL;

-- Note: ON CONFLICT with partial indexes requires using the index name
-- For Supabase client, we'll need to handle conflicts manually or use a different approach

-- Create index for prospect lookups
CREATE INDEX IF NOT EXISTS idx_player_team_assignments_prospect ON public.player_team_assignments(prospect_id);

-- Update comment
COMMENT ON COLUMN public.player_team_assignments.player_id IS 'Reference to seed player (nullable - only set for seed players, not drafted prospects)';
COMMENT ON COLUMN public.player_team_assignments.prospect_id IS 'Reference to drafted prospect (nullable - only set for drafted prospects, not seed players)';
COMMENT ON TABLE public.player_team_assignments IS 'Tracks which players/prospects are on which teams for each save game. Either player_id (seed players) or prospect_id (drafted prospects) must be set.';

