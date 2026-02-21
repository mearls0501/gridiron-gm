-- Fix: Allow player_game_stats to reference both players and draft_prospects
-- The issue: Stats for drafted prospects fail because they're not in the players table yet

-- Drop the existing foreign key constraint
ALTER TABLE public.player_game_stats 
DROP CONSTRAINT IF EXISTS player_game_stats_player_id_fkey;

-- Don't add a new constraint - let player_id be a UUID that can reference either table
-- The application logic handles validation (we know the player exists because we loaded them)
-- This allows stats for both regular players and draft prospects

-- Add a comment explaining why there's no FK constraint
COMMENT ON COLUMN public.player_game_stats.player_id IS 
  'Player ID - can reference either players.id or draft_prospects.id. ' ||
  'No FK constraint to allow stats for both regular players and drafted prospects. ' ||
  'Application ensures referential integrity during simulation.';

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Removed foreign key constraint on player_game_stats.player_id to allow draft prospects';
END $$;



