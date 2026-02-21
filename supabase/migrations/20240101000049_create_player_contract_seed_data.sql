-- Migration: Create player_contract_seed_data table
-- This stores immutable seed contract data for initial game setup
-- Contracts are copied from this table to player_contracts_per_save_game when creating new save games

CREATE TABLE IF NOT EXISTS public.player_contract_seed_data (
  player_id UUID PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  contract_year_1 NUMERIC(12,2) DEFAULT 0 NOT NULL,
  contract_year_2 NUMERIC(12,2) DEFAULT NULL,
  contract_year_3 NUMERIC(12,2) DEFAULT NULL,
  contract_year_4 NUMERIC(12,2) DEFAULT NULL,
  signing_bonus NUMERIC(12,2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_player_contract_seed_data_player ON public.player_contract_seed_data(player_id);

-- Enable Row Level Security
ALTER TABLE public.player_contract_seed_data ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Allow all on player_contract_seed_data" ON public.player_contract_seed_data;

-- Create policy to allow all operations (adjust based on auth needs)
CREATE POLICY "Allow all on player_contract_seed_data" ON public.player_contract_seed_data
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.player_contract_seed_data IS 'Stores immutable seed contract data for initial game setup. Contracts are copied from here to player_contracts_per_save_game when creating new save games.';
COMMENT ON COLUMN public.player_contract_seed_data.player_id IS 'Reference to seed player';
COMMENT ON COLUMN public.player_contract_seed_data.contract_year_1 IS 'Year 1 salary (required)';
COMMENT ON COLUMN public.player_contract_seed_data.contract_year_2 IS 'Year 2 salary (NULL if no contract for year 2)';
COMMENT ON COLUMN public.player_contract_seed_data.contract_year_3 IS 'Year 3 salary (NULL if no contract for year 3)';
COMMENT ON COLUMN public.player_contract_seed_data.contract_year_4 IS 'Year 4 salary (NULL if no contract for year 4)';
COMMENT ON COLUMN public.player_contract_seed_data.signing_bonus IS 'Signing bonus amount';



