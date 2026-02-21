-- Migration: Fix unique constraints for free_agent_availability to support ON CONFLICT
-- This adds named unique constraints that Supabase can use with upsert onConflict
-- 
-- Note: PostgreSQL unique constraints on nullable columns allow multiple NULLs.
-- Combined with our check constraint (only one of player_id or prospect_id can be NULL),
-- this ensures:
-- - Each (save_game_id, player_id) combination is unique when player_id IS NOT NULL
-- - Each (save_game_id, prospect_id) combination is unique when prospect_id IS NOT NULL
-- - Multiple rows can have NULL in either column, but the check constraint ensures
--   we can't have both NULL, so uniqueness is properly enforced

-- For player_id: Create a unique constraint
-- This allows multiple rows with player_id=NULL but enforces uniqueness for non-NULL values
-- Using (save_game_id, player_id) order to match most common usage
DO $$
BEGIN
  -- Check if constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'free_agent_availability_save_game_player_unique'
  ) THEN
    ALTER TABLE public.free_agent_availability
    ADD CONSTRAINT free_agent_availability_save_game_player_unique 
    UNIQUE (save_game_id, player_id);
    
    RAISE NOTICE 'Created unique constraint: free_agent_availability_save_game_player_unique';
  ELSE
    RAISE NOTICE 'Constraint free_agent_availability_save_game_player_unique already exists';
  END IF;
END $$;

-- For prospect_id: Create a unique constraint  
-- This allows multiple rows with prospect_id=NULL but enforces uniqueness for non-NULL values
-- Using (save_game_id, prospect_id) order to match contract-processor usage
-- Note: Some code uses (prospect_id, save_game_id) - we'll need to update those to match
DO $$
BEGIN
  -- Check if constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'free_agent_availability_save_game_prospect_unique'
  ) THEN
    ALTER TABLE public.free_agent_availability
    ADD CONSTRAINT free_agent_availability_save_game_prospect_unique 
    UNIQUE (save_game_id, prospect_id);
    
    RAISE NOTICE 'Created unique constraint: free_agent_availability_save_game_prospect_unique';
  ELSE
    RAISE NOTICE 'Constraint free_agent_availability_save_game_prospect_unique already exists';
  END IF;
END $$;

-- Note: The partial unique indexes (idx_free_agent_availability_player_unique and 
-- idx_free_agent_availability_prospect_unique) are still useful for query performance.
-- The named constraints above are what Supabase uses for ON CONFLICT operations.

