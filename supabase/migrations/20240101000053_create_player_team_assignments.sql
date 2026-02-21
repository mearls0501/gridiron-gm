-- Migration: Create player_team_assignments table
-- This tracks which players are on which teams for each save game
-- The players table remains as base/seed data (shared across all games)
-- This table tracks changes (trades, signings, releases) per save game

CREATE TABLE IF NOT EXISTS public.player_team_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_reason TEXT, -- 'initial', 'trade', 'signing', 'release', 'draft', etc.
  season INTEGER,
  week INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- A player can only be on one team per save game at a time
  UNIQUE(player_id, save_game_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_player_team_assignments_player ON public.player_team_assignments(player_id);
CREATE INDEX IF NOT EXISTS idx_player_team_assignments_team ON public.player_team_assignments(team_id, save_game_id);
CREATE INDEX IF NOT EXISTS idx_player_team_assignments_save_game ON public.player_team_assignments(save_game_id);
CREATE INDEX IF NOT EXISTS idx_player_team_assignments_composite ON public.player_team_assignments(save_game_id, team_id);

-- Add comment
COMMENT ON TABLE public.player_team_assignments IS 'Tracks which players are on which teams for each save game. If no assignment exists, use the base team_id from players table.';
COMMENT ON COLUMN public.player_team_assignments.assigned_reason IS 'Reason for assignment: initial, trade, signing, release, draft, etc.';


