-- Migration: Remove contract columns from players table
-- Contracts are now stored in player_contract_seed_data (seed data) and player_contracts_per_save_game (per-save-game)
-- The players table should only contain immutable player attributes

-- Drop contract columns from players table
ALTER TABLE public.players
DROP COLUMN IF EXISTS contract_year_1,
DROP COLUMN IF EXISTS contract_year_2,
DROP COLUMN IF EXISTS contract_year_3,
DROP COLUMN IF EXISTS contract_year_4,
DROP COLUMN IF EXISTS signing_bonus;

-- Update table comment to clarify it's attributes-only
COMMENT ON TABLE public.players IS 'Base player attributes only (immutable seed data). Contains: id, full_name, position, age, college, archetype, overall, potential, traits, is_free_agent, team_id (seed data only). Contracts are in player_contract_seed_data (seed) and player_contracts_per_save_game (per-save-game). Team assignments per save game are in player_team_assignments. Free agent availability per save game is in free_agent_availability.';

-- Verify no foreign key constraints are broken (this is informational)
DO $$
DECLARE
  constraint_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO constraint_count
  FROM information_schema.table_constraints
  WHERE constraint_type = 'FOREIGN KEY'
    AND table_name = 'players'
    AND constraint_name LIKE '%contract%';
  
  IF constraint_count > 0 THEN
    RAISE WARNING 'Found % foreign key constraints on players table that reference contracts. Verify these are not broken.', constraint_count;
  ELSE
    RAISE NOTICE 'No foreign key constraints found that reference contract columns. Safe to proceed.';
  END IF;
END $$;



