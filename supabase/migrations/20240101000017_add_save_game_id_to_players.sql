-- Migration: Add save_game_id to players table
-- This allows players to be isolated per save game, preventing roster bleeding between games

-- Add save_game_id to players table
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_players_save_game ON public.players(save_game_id, team_id);

-- Create index for filtering by save_game_id and team_id (common query pattern)
CREATE INDEX IF NOT EXISTS idx_players_save_game_team ON public.players(save_game_id, team_id) WHERE save_game_id IS NOT NULL;

-- Create index for legacy players (NULL save_game_id)
CREATE INDEX IF NOT EXISTS idx_players_team_legacy ON public.players(team_id) WHERE save_game_id IS NULL;

-- Add comment
COMMENT ON COLUMN public.players.save_game_id IS 'Links this player to a specific save game for data isolation';


