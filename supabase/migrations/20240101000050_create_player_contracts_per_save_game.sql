-- Migration: Create player_contracts_per_save_game table
-- This tracks current contracts per save game, preventing contract data from bleeding between games
-- The players table contract_year_1-4 fields are now read-only seed data

CREATE TABLE IF NOT EXISTS public.player_contracts_per_save_game (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  
  -- Contract years (current year salary)
  contract_year_1 NUMERIC(12,2) DEFAULT 0,
  contract_year_2 NUMERIC(12,2) DEFAULT 0,
  contract_year_3 NUMERIC(12,2) DEFAULT 0,
  contract_year_4 NUMERIC(12,2) DEFAULT 0,
  signing_bonus NUMERIC(12,2) DEFAULT 0,
  contract_expires_season INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- One contract record per player per save game
  UNIQUE(player_id, save_game_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_player_contracts_save_game ON public.player_contracts_per_save_game(save_game_id);
CREATE INDEX IF NOT EXISTS idx_player_contracts_player ON public.player_contracts_per_save_game(player_id);
CREATE INDEX IF NOT EXISTS idx_player_contracts_team ON public.player_contracts_per_save_game(team_id, save_game_id);
CREATE INDEX IF NOT EXISTS idx_player_contracts_expires ON public.player_contracts_per_save_game(contract_expires_season) WHERE contract_expires_season IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.player_contracts_per_save_game ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Allow all on player_contracts_per_save_game" ON public.player_contracts_per_save_game;

-- Create policy to allow all operations (adjust based on auth needs)
CREATE POLICY "Allow all on player_contracts_per_save_game" ON public.player_contracts_per_save_game
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.player_contracts_per_save_game IS 'Tracks current player contracts per save game. Prevents contract data from bleeding between games.';
COMMENT ON COLUMN public.player_contracts_per_save_game.contract_year_1 IS 'Current season salary (year 1 of contract)';
COMMENT ON COLUMN public.player_contracts_per_save_game.contract_year_2 IS 'Next season salary (year 2 of contract)';
COMMENT ON COLUMN public.player_contracts_per_save_game.contract_year_3 IS 'Year 3 salary';
COMMENT ON COLUMN public.player_contracts_per_save_game.contract_year_4 IS 'Year 4 salary';
COMMENT ON COLUMN public.player_contracts_per_save_game.contract_expires_season IS 'Season when contract expires (if contract_year_2 is 0)';


