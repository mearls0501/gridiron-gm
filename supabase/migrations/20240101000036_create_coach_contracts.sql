-- Migration: Create coach_contracts table
-- This tracks current coaching contracts per save game
-- Prevents contract data from bleeding between games
-- The coaches table does not contain contract information

CREATE TABLE IF NOT EXISTS public.coach_contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
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
  
  -- One contract record per coach per save game
  UNIQUE(coach_id, save_game_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_coach_contracts_save_game ON public.coach_contracts(save_game_id);
CREATE INDEX IF NOT EXISTS idx_coach_contracts_coach ON public.coach_contracts(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_contracts_team ON public.coach_contracts(team_id, save_game_id);
CREATE INDEX IF NOT EXISTS idx_coach_contracts_expires ON public.coach_contracts(contract_expires_season) WHERE contract_expires_season IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.coach_contracts ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Allow all on coach_contracts" ON public.coach_contracts;

-- Create policy to allow all operations
CREATE POLICY "Allow all on coach_contracts" ON public.coach_contracts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.coach_contracts IS 'Tracks current coach contracts per save game. Prevents contract data from bleeding between games.';
COMMENT ON COLUMN public.coach_contracts.contract_year_1 IS 'Current season salary (year 1 of contract)';
COMMENT ON COLUMN public.coach_contracts.contract_year_2 IS 'Next season salary (year 2 of contract)';
COMMENT ON COLUMN public.coach_contracts.contract_year_3 IS 'Year 3 salary';
COMMENT ON COLUMN public.coach_contracts.contract_year_4 IS 'Year 4 salary';
COMMENT ON COLUMN public.coach_contracts.contract_expires_season IS 'Season when contract expires';



