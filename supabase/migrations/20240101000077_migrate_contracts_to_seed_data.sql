-- Migration: Migrate contract data from players table to player_contract_seed_data
-- This preserves existing seed contract data before removing columns from players table

-- Copy all contract data from players table to seed data table
-- Only copy players with contract data (contract_year_1 is not null or other years exist)
INSERT INTO public.player_contract_seed_data (
  player_id,
  contract_year_1,
  contract_year_2,
  contract_year_3,
  contract_year_4,
  signing_bonus,
  created_at,
  updated_at
)
SELECT 
  id as player_id,
  COALESCE(contract_year_1, 0) as contract_year_1,
  CASE 
    WHEN contract_year_2 IS NOT NULL AND contract_year_2 > 0 THEN contract_year_2
    ELSE NULL
  END as contract_year_2,
  CASE 
    WHEN contract_year_3 IS NOT NULL AND contract_year_3 > 0 THEN contract_year_3
    ELSE NULL
  END as contract_year_3,
  CASE 
    WHEN contract_year_4 IS NOT NULL AND contract_year_4 > 0 THEN contract_year_4
    ELSE NULL
  END as contract_year_4,
  COALESCE(signing_bonus, 0) as signing_bonus,
  NOW() as created_at,
  NOW() as updated_at
FROM public.players
WHERE 
  contract_year_1 IS NOT NULL 
  OR contract_year_2 IS NOT NULL 
  OR contract_year_3 IS NOT NULL 
  OR contract_year_4 IS NOT NULL
  OR signing_bonus IS NOT NULL
ON CONFLICT (player_id) DO NOTHING;

-- Log migration results
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count FROM public.player_contract_seed_data;
  RAISE NOTICE 'Migrated % player contracts to seed data table', migrated_count;
END $$;



