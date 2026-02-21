-- Fix stats that have wrong player_ids (assignment IDs instead of actual player/prospect IDs)
-- This happened because the JOIN was returning the assignment ID instead of player_id/prospect_id

-- Delete stats with player_ids that don't exist in either players or draft_prospects
-- This will clean up all bad stats across all save games
DO $$
DECLARE
  game_stats_deleted INTEGER;
  season_stats_deleted INTEGER;
BEGIN
  -- Delete bad game stats
  DELETE FROM player_game_stats 
  WHERE player_id NOT IN (
    SELECT id FROM players
    UNION
    SELECT id FROM draft_prospects
  );
  
  GET DIAGNOSTICS game_stats_deleted = ROW_COUNT;
  
  -- Delete bad season stats
  DELETE FROM player_season_stats 
  WHERE player_id NOT IN (
    SELECT id FROM players
    UNION
    SELECT id FROM draft_prospects
  );
  
  GET DIAGNOSTICS season_stats_deleted = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % game stats with invalid player_ids', game_stats_deleted;
  RAISE NOTICE 'Deleted % season stats with invalid player_ids', season_stats_deleted;
  RAISE NOTICE 'Stats will be regenerated correctly on next simulation';
END $$;

