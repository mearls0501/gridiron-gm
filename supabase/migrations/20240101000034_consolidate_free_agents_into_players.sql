-- Migration: Consolidate free_agents table into players table
-- This moves all free agents to the players table with is_free_agent = TRUE
-- Then drops the free_agents table since it's no longer needed

-- Step 1: Temporarily disable RLS on players table to allow inserts
ALTER TABLE public.players DISABLE ROW LEVEL SECURITY;

-- Step 2: Ensure is_free_agent column exists (it should already exist)
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS is_free_agent BOOLEAN DEFAULT FALSE;

-- Step 3: Migrate all free_agents records to players table
-- Only insert free agents that don't already exist in players table (by ID)
-- Note: Only include columns that exist in both tables
INSERT INTO public.players (
  id,
  full_name,
  position,
  age,
  college,
  archetype,
  overall,
  potential,
  traits,
  is_free_agent,
  team_id
)
SELECT 
  fa.id,
  fa.full_name,
  fa.position,
  fa.age,
  fa.college,
  fa.archetype,
  fa.overall,
  fa.potential,
  fa.traits,
  TRUE as is_free_agent, -- Mark as free agent
  NULL as team_id -- Free agents have no team
FROM public.free_agents fa
WHERE NOT EXISTS (
  SELECT 1 FROM public.players p WHERE p.id = fa.id
)
ON CONFLICT (id) DO NOTHING;

-- Step 4: Update any existing players that are in free_agents to have is_free_agent = TRUE
-- This handles the case where a player might exist in both tables
UPDATE public.players p
SET is_free_agent = TRUE,
    team_id = NULL -- Ensure free agents have no team
WHERE EXISTS (
  SELECT 1 FROM public.free_agents fa WHERE fa.id = p.id
)
AND (p.is_free_agent IS NULL OR p.is_free_agent = FALSE);

-- Step 5: Verify free_agent_availability references are correct
-- Since free_agent_availability.player_id references players(id), and we're using the same IDs,
-- the foreign key relationships should remain valid. However, we should verify that all
-- free_agent_availability records point to valid players.
DO $$
DECLARE
  invalid_refs INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_refs
  FROM public.free_agent_availability faa
  WHERE faa.player_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.players p WHERE p.id = faa.player_id
  );
  
  IF invalid_refs > 0 THEN
    RAISE WARNING 'Found % free_agent_availability records with invalid player_id references', invalid_refs;
  ELSE
    RAISE NOTICE 'All free_agent_availability.player_id references are valid';
  END IF;
END $$;

-- Step 6: Re-enable RLS on players table
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- Step 7: Drop the free_agents table
-- First, check if there are any remaining dependencies
DO $$
BEGIN
  -- Check if table exists before dropping
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'free_agents'
  ) THEN
    DROP TABLE IF EXISTS public.free_agents CASCADE;
    RAISE NOTICE 'Dropped free_agents table';
  ELSE
    RAISE NOTICE 'free_agents table does not exist, skipping drop';
  END IF;
END $$;

-- Step 8: Create index on is_free_agent for performance
CREATE INDEX IF NOT EXISTS idx_players_is_free_agent ON public.players(is_free_agent);

-- Step 9: Update table comment
COMMENT ON TABLE public.players IS 'Base player data shared across all save games. Includes both players on teams and free agents (is_free_agent = TRUE). RLS enabled - only SELECT allowed after seeding. Team assignments per save game are tracked in player_team_assignments table. Contracts per save game are tracked in player_contracts_per_save_game table. Free agent availability per save game is tracked in free_agent_availability table.';

COMMENT ON COLUMN public.players.is_free_agent IS 'Indicates if this player is a free agent in the seed data. After seeding, free agent status per save game is tracked in free_agent_availability table.';

-- Step 10: Verify migration
DO $$
DECLARE
  free_agent_count INTEGER;
  player_free_agent_count INTEGER;
BEGIN
  -- Count how many free agents we had
  -- (This will fail if table is already dropped, so we'll skip if table doesn't exist)
  
  -- Count how many players now have is_free_agent = TRUE
  SELECT COUNT(*) INTO player_free_agent_count
  FROM public.players
  WHERE is_free_agent = TRUE;
  
  RAISE NOTICE 'Migration complete: % players now marked as free agents', player_free_agent_count;
END $$;

