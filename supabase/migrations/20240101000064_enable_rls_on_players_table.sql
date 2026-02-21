-- Migration: Enable RLS on players table to prevent modifications
-- The players table is base/seed data and should only be read
-- All player movement is tracked in player_team_assignments table

-- Enable Row Level Security
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Allow read on players" ON public.players;
DROP POLICY IF EXISTS "Allow insert on players" ON public.players;
DROP POLICY IF EXISTS "Block inserts on players" ON public.players;
DROP POLICY IF EXISTS "Block updates on players" ON public.players;
DROP POLICY IF EXISTS "Block deletes on players" ON public.players;

-- Policy 1: Allow SELECT (read) operations
CREATE POLICY "Allow read on players" ON public.players
  FOR SELECT
  USING (true);

-- Policy 2: Block INSERT operations
-- Draft prospects should NOT be inserted into players table
-- They should remain in draft_prospects table and be tracked separately
-- The players table is seed data only - no new players should be created
CREATE POLICY "Block inserts on players" ON public.players
  FOR INSERT
  WITH CHECK (false);

-- Policy 3: Block UPDATE operations
-- This prevents modifications to seed data that would bleed between games
-- Note: If you need to update player attributes (ratings, stats) in the future,
-- you can create a more specific policy that allows updates to non-game-specific fields
CREATE POLICY "Block updates on players" ON public.players
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

-- Policy 4: Block DELETE operations
-- This prevents deletion of seed data
-- Seed players should never be deleted - only draft prospects (which are inserted) can be removed if needed
CREATE POLICY "Block deletes on players" ON public.players
  FOR DELETE
  USING (false);

-- Add comment to clarify the table's protection
COMMENT ON TABLE public.players IS 'Base player data shared across all save games. RLS enabled - only SELECT allowed. INSERT, UPDATE, and DELETE blocked to protect seed data. Draft prospects remain in draft_prospects table and should NOT be inserted here. Team assignments per save game are tracked in player_team_assignments table. Contracts per save game are tracked in player_contracts_per_save_game table.';

