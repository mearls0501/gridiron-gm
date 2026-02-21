-- Migration: Convert contract_year_2/3/4 values of 0 to NULL
-- This makes the data model clearer: NULL = no contract for that year, any number = contract exists
-- We only convert future years (2, 3, 4) - contract_year_1 should remain as-is

-- Convert contract_year_2: 0 -> NULL (no contract for next year)
UPDATE public.player_contracts_per_save_game
SET contract_year_2 = NULL
WHERE contract_year_2 = 0;

-- Convert contract_year_3: 0 -> NULL (no contract for year 3)
UPDATE public.player_contracts_per_save_game
SET contract_year_3 = NULL
WHERE contract_year_3 = 0;

-- Convert contract_year_4: 0 -> NULL (no contract for year 4)
UPDATE public.player_contracts_per_save_game
SET contract_year_4 = NULL
WHERE contract_year_4 = 0;

-- Add comment explaining the data model
COMMENT ON COLUMN public.player_contracts_per_save_game.contract_year_2 IS 'Salary for year 2. NULL means no contract for that year (expiring after year 1).';
COMMENT ON COLUMN public.player_contracts_per_save_game.contract_year_3 IS 'Salary for year 3. NULL means no contract for that year.';
COMMENT ON COLUMN public.player_contracts_per_save_game.contract_year_4 IS 'Salary for year 4. NULL means no contract for that year.';



