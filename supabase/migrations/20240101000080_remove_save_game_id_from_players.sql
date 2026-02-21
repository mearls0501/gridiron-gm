-- Migration: Remove save_game_id from players table
-- The players table is now base/seed data shared across all games
-- Team assignments per save game are tracked in player_team_assignments table

-- Drop indexes that reference save_game_id
DROP INDEX IF EXISTS idx_players_save_game;
DROP INDEX IF EXISTS idx_players_save_game_team;
DROP INDEX IF EXISTS idx_players_team_legacy;

-- Remove the save_game_id column
ALTER TABLE public.players 
DROP COLUMN IF EXISTS save_game_id;

-- Add comment to clarify the table's purpose
COMMENT ON TABLE public.players IS 'Base player data shared across all save games. Team assignments per save game are tracked in player_team_assignments table.';


