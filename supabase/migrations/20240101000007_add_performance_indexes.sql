-- Add performance indexes for frequently queried columns
-- This migration improves query performance for player stats, players, and games tables

-- Index for player_game_stats queries by player and season
CREATE INDEX IF NOT EXISTS idx_player_game_stats_player_season 
  ON public.player_game_stats(player_id, season, save_game_id);

-- Index for player_game_stats queries by game
CREATE INDEX IF NOT EXISTS idx_player_game_stats_game 
  ON public.player_game_stats(game_id, save_game_id);

-- Index for players queries by team and position (with overall for sorting)
CREATE INDEX IF NOT EXISTS idx_players_team_position 
  ON public.players(team_id, position, overall DESC);

-- Index for games queries by season, week, and played status
CREATE INDEX IF NOT EXISTS idx_games_season_week_played 
  ON public.games(season, week, played, save_game_id);


