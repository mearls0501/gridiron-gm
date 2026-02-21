-- Migration: Clear players table for seed data reload
-- This safely clears all player data while preserving RLS policies
-- Run this before reloading initial seed data

-- Temporarily disable RLS to allow deletion
ALTER TABLE public.players DISABLE ROW LEVEL SECURITY;

-- Delete related data first (in order to respect foreign key constraints)
-- 1. Delete from player_contracts_per_save_game (new contracts table)
DELETE FROM public.player_contracts_per_save_game;

-- 2. Delete from player_team_assignments (has ON DELETE CASCADE, but delete explicitly for clarity)
DELETE FROM public.player_team_assignments;

-- 3. Delete from free_agent_availability (has ON DELETE CASCADE)
DELETE FROM public.free_agent_availability;

-- 4. Delete from player_game_stats (has ON DELETE CASCADE)
DELETE FROM public.player_game_stats;

-- 5. Delete from player_season_stats (has ON DELETE CASCADE)
DELETE FROM public.player_season_stats;

-- 6. Delete trade_items that reference players
DELETE FROM public.trade_items WHERE item_type = 'player' AND player_id IS NOT NULL;

-- 7. Delete from free_agents table
DELETE FROM public.free_agents;

-- 8. Now delete all players (this will cascade to any remaining CASCADE relationships)
DELETE FROM public.players;

-- Re-enable RLS
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- Verify the table is empty
DO $$
DECLARE
  player_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO player_count FROM public.players;
  IF player_count > 0 THEN
    RAISE EXCEPTION 'Players table still contains % rows after deletion', player_count;
  ELSE
    RAISE NOTICE 'Successfully cleared players table. Ready for seed data reload.';
  END IF;
END $$;

-- Add comment
COMMENT ON TABLE public.players IS 'Base player data shared across all save games. RLS enabled - only SELECT and INSERT allowed. Team assignments per save game are tracked in player_team_assignments table. Contracts per save game are tracked in player_contracts_per_save_game table.';

