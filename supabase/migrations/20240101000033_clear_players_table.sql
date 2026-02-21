-- Migration: Clear all players from the players table
-- This will cascade delete related records in tables with ON DELETE CASCADE
-- For tables with ON DELETE SET NULL, those references will be set to NULL

-- WARNING: This will delete ALL players and cascade to related tables
-- Make sure you have backups if needed!

-- Delete in order to respect foreign key constraints
-- Tables with ON DELETE CASCADE will be automatically cleaned up when we delete players
-- But we'll delete them explicitly first for clarity and to avoid potential issues

-- 1. Delete from player_game_stats (has ON DELETE CASCADE)
DELETE FROM public.player_game_stats;

-- 2. Delete from player_season_stats (has ON DELETE CASCADE)
DELETE FROM public.player_season_stats;

-- 3. Delete from player_team_assignments (has ON DELETE CASCADE)
DELETE FROM public.player_team_assignments;

-- 4. Delete from free_agent_availability (has ON DELETE CASCADE)
DELETE FROM public.free_agent_availability;

-- 5. Delete trade_items that reference players
-- This must be done BEFORE deleting players because trade_items has a check constraint
-- that requires player_id IS NOT NULL when item_type = 'player'
DELETE FROM public.trade_items WHERE item_type = 'player' AND player_id IS NOT NULL;

-- 6. Handle other tables with ON DELETE SET NULL (these will automatically set player_id to NULL)
-- - transactions (player_id will be set to NULL)
-- - draft_picks (selected_player_id references draft_prospects, not players directly)

-- 6. Now delete all players
-- This will cascade to any remaining CASCADE relationships
DELETE FROM public.players;

-- Verify the table is empty
DO $$
DECLARE
  player_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO player_count FROM public.players;
  IF player_count > 0 THEN
    RAISE EXCEPTION 'Players table still contains % rows after deletion', player_count;
  ELSE
    RAISE NOTICE 'Successfully cleared players table';
  END IF;
END $$;

