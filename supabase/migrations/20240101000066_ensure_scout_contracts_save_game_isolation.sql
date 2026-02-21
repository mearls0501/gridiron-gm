-- Ensure scout_contracts table has proper save_game_id isolation
-- This migration ensures all scout_contracts have save_game_id and cleans up orphaned data

-- Step 1: Make save_game_id required (if not already)
-- First check if column allows NULL
DO $$
BEGIN
  -- If save_game_id can be NULL, make it NOT NULL
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'scout_contracts' 
    AND column_name = 'save_game_id'
    AND is_nullable = 'YES'
  ) THEN
    -- Delete any contracts without save_game_id (orphaned data)
    DELETE FROM public.scout_contracts WHERE save_game_id IS NULL;
    
    -- Now make the column NOT NULL
    ALTER TABLE public.scout_contracts 
    ALTER COLUMN save_game_id SET NOT NULL;
  END IF;
END $$;

-- Step 2: Ensure the unique constraint includes save_game_id
-- Drop old constraint if it exists (without save_game_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'scout_contracts_unique' 
    AND conrelid = 'public.scout_contracts'::regclass
  ) THEN
    -- Check if constraint includes save_game_id
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.conname = 'scout_contracts_unique'
      AND c.conrelid = 'public.scout_contracts'::regclass
      AND a.attname = 'save_game_id'
    ) THEN
      -- Drop old constraint
      ALTER TABLE public.scout_contracts DROP CONSTRAINT IF EXISTS scout_contracts_unique;
      
      -- Create new constraint with save_game_id
      ALTER TABLE public.scout_contracts 
      ADD CONSTRAINT scout_contracts_unique UNIQUE(team_id, scout_id, save_game_id);
    END IF;
  ELSE
    -- Constraint doesn't exist, create it
    ALTER TABLE public.scout_contracts 
    ADD CONSTRAINT scout_contracts_unique UNIQUE(team_id, scout_id, save_game_id);
  END IF;
END $$;

-- Step 3: Ensure index exists for save_game_id filtering
CREATE INDEX IF NOT EXISTS idx_scout_contracts_save_game 
ON public.scout_contracts(save_game_id);

CREATE INDEX IF NOT EXISTS idx_scout_contracts_team_save_game 
ON public.scout_contracts(team_id, save_game_id);

-- Step 4: Add foreign key constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'scout_contracts_save_game_id_fkey' 
    AND conrelid = 'public.scout_contracts'::regclass
  ) THEN
    ALTER TABLE public.scout_contracts 
    ADD CONSTRAINT scout_contracts_save_game_id_fkey 
    FOREIGN KEY (save_game_id) 
    REFERENCES public.save_games(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Step 5: Add comment
COMMENT ON COLUMN public.scout_contracts.save_game_id IS 'Required: Links scout contract to a specific save game for data isolation. Contracts without save_game_id will be deleted.';

-- Note: The scouts table itself is intentionally GLOBAL (no save_game_id)
-- This allows scouts to be shared across all save games as a free agent pool
-- Isolation happens through scout_contracts which links scouts to teams per save game


