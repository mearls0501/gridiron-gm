-- Migration: Add prospect_id to player_contracts_per_save_game
-- This allows drafted prospects to have contracts without being in the players table
-- Draft prospects remain in draft_prospects table and are referenced via prospect_id

-- Add prospect_id column (nullable, references draft_prospects)
ALTER TABLE public.player_contracts_per_save_game
ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES public.draft_prospects(id) ON DELETE CASCADE;

-- Make player_id nullable (since drafted prospects won't have a player_id)
ALTER TABLE public.player_contracts_per_save_game
ALTER COLUMN player_id DROP NOT NULL;

-- Add constraint: either player_id OR prospect_id must be set (but not both)
-- Drop if exists first to make migration idempotent
ALTER TABLE public.player_contracts_per_save_game
DROP CONSTRAINT IF EXISTS player_contracts_player_or_prospect_check;

ALTER TABLE public.player_contracts_per_save_game
ADD CONSTRAINT player_contracts_player_or_prospect_check 
CHECK (
  (player_id IS NOT NULL AND prospect_id IS NULL) OR 
  (player_id IS NULL AND prospect_id IS NOT NULL)
);

-- Drop old unique constraint
ALTER TABLE public.player_contracts_per_save_game
DROP CONSTRAINT IF EXISTS player_contracts_per_save_game_player_id_save_game_id_key;

-- Create new unique constraint for player_id + save_game_id (when player_id is set)
CREATE UNIQUE INDEX IF NOT EXISTS player_contracts_player_unique
ON public.player_contracts_per_save_game(player_id, save_game_id)
WHERE player_id IS NOT NULL;

-- Create unique constraint for prospect_id + save_game_id (when prospect_id is set)
CREATE UNIQUE INDEX IF NOT EXISTS player_contracts_prospect_unique
ON public.player_contracts_per_save_game(prospect_id, save_game_id)
WHERE prospect_id IS NOT NULL;

-- Create index for prospect lookups
CREATE INDEX IF NOT EXISTS idx_player_contracts_prospect ON public.player_contracts_per_save_game(prospect_id);

-- Update comment
COMMENT ON COLUMN public.player_contracts_per_save_game.player_id IS 'Reference to seed player (nullable - only set for seed players, not drafted prospects)';
COMMENT ON COLUMN public.player_contracts_per_save_game.prospect_id IS 'Reference to drafted prospect (nullable - only set for drafted prospects, not seed players)';
COMMENT ON TABLE public.player_contracts_per_save_game IS 'Tracks current player/prospect contracts per save game. Either player_id (seed players) or prospect_id (drafted prospects) must be set.';

