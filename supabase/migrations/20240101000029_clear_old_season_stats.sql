-- Clear old player_season_stats to allow regeneration from player_game_stats
-- This fixes the issue where old stats with NULL save_game_id conflict with new stats

-- Delete all season stats for the current season
-- They will be regenerated automatically from player_game_stats
DELETE FROM player_season_stats WHERE season = 2025;

-- Optional: If you want to keep other seasons, you can be more specific:
-- DELETE FROM player_season_stats 
-- WHERE season = 2025 
--   AND (save_game_id IS NULL OR save_game_id = '00000000-0000-0000-0000-000000000000'::uuid);


