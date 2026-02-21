-- Migration: Fix contracts for drafted players (prospects)
-- Drafted players should only have contract_year_1, with years 2-4 as NULL
-- This updates existing contracts that have 0 values for years 2-4 to NULL

-- Update contracts for drafted prospects (prospect_id is not null)
-- Set contract_year_2, contract_year_3, contract_year_4 to NULL if they are 0
-- These are rookie contracts - they should only have year 1
UPDATE public.player_contracts_per_save_game
SET 
  contract_year_2 = NULL,
  contract_year_3 = NULL,
  contract_year_4 = NULL
WHERE 
  prospect_id IS NOT NULL  -- Only drafted prospects
  AND (
    contract_year_2 = 0 OR
    contract_year_3 = 0 OR
    contract_year_4 = 0
  )
  AND contract_year_1 > 0;  -- Only if they have a valid year 1 contract

-- Add comment explaining the data model for drafted players
COMMENT ON COLUMN public.player_contracts_per_save_game.prospect_id IS 'For drafted players: prospect_id is set, player_id is NULL. Rookie contracts should only have contract_year_1, with years 2-4 as NULL.';



