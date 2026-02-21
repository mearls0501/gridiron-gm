-- Direct SQL script to clear players table
-- Run this in Supabase SQL Editor if you need to clear players immediately
-- WARNING: This will delete ALL players and cascade to related tables!

-- Step 1: Delete related records first
DELETE FROM public.player_game_stats;
DELETE FROM public.player_season_stats;
DELETE FROM public.player_team_assignments;
DELETE FROM public.free_agent_availability;

-- Step 2: Delete trade_items that reference players
-- IMPORTANT: Must do this before deleting players because trade_items has a check constraint
-- that requires player_id IS NOT NULL when item_type = 'player'
DELETE FROM public.trade_items WHERE item_type = 'player' AND player_id IS NOT NULL;

-- Step 3: Delete all players
DELETE FROM public.players;

-- Verify
SELECT COUNT(*) as remaining_players FROM public.players;

