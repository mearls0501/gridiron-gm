-- Add save_game_id to scouts table for per-save-game isolation
-- This changes scouts from a global pool to per-save-game pools

-- Step 1: Add save_game_id column (nullable initially to handle existing data)
ALTER TABLE public.scouts 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

-- Step 2: Create index for save_game_id filtering
CREATE INDEX IF NOT EXISTS idx_scouts_save_game ON public.scouts(save_game_id);

-- Step 3: Update unique constraint to include save_game_id
-- First, drop old unique constraints/indexes if they exist
DROP INDEX IF EXISTS idx_scouts_archetype;
DROP INDEX IF EXISTS idx_scouts_reputation;

-- Create new indexes with save_game_id
CREATE INDEX IF NOT EXISTS idx_scouts_archetype_save_game ON public.scouts(save_game_id, archetype);
CREATE INDEX IF NOT EXISTS idx_scouts_reputation_save_game ON public.scouts(save_game_id, reputation DESC);

-- Step 4: For existing scouts without save_game_id, we have two options:
-- Option A: Delete them (clean slate for new games)
-- Option B: Assign them to a default/legacy save game
-- We'll delete them since they're orphaned data
DELETE FROM public.scouts WHERE save_game_id IS NULL;

-- Step 5: Now make save_game_id required
ALTER TABLE public.scouts 
ALTER COLUMN save_game_id SET NOT NULL;

-- Step 6: Update comments
COMMENT ON TABLE public.scouts IS 'Scout pool per save game. Each save game has its own pool of available scouts.';
COMMENT ON COLUMN public.scouts.save_game_id IS 'Required: Links scout to a specific save game for data isolation. Scouts are now per-save-game, not global.';

-- Step 7: Ensure scout_contracts also properly references save_game_id
-- (This should already be in place, but we'll verify)
-- Delete any contracts without save_game_id first
DELETE FROM public.scout_contracts WHERE save_game_id IS NULL;

-- Make save_game_id NOT NULL if it's currently nullable
-- Check if column exists and is nullable, then alter it
DO $block1$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'scout_contracts' 
    AND column_name = 'save_game_id'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.scout_contracts 
    ALTER COLUMN save_game_id SET NOT NULL;
  END IF;
END $block1$;

-- Step 8: Ensure unique constraint exists on scout_contracts
-- (This should already be in place from create_new_scouting_system.sql)
DO $block2$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'scout_contracts_unique' 
    AND conrelid = 'public.scout_contracts'::regclass
  ) THEN
    ALTER TABLE public.scout_contracts 
    ADD CONSTRAINT scout_contracts_unique UNIQUE(team_id, scout_id, save_game_id);
  END IF;
END $block2$;

