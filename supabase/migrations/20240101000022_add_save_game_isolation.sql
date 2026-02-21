-- Migration: Add save_game_id to all game data tables
-- This allows multiple save games to coexist with completely separate data
-- Each save game will have its own isolated world of games, stats, trades, etc.

-- Add save_game_id to games table
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_games_save_game ON public.games(save_game_id, season, week);

-- Update the unique constraint to include save_game_id
-- This allows different save games to have the same schedule
ALTER TABLE public.games 
DROP CONSTRAINT IF EXISTS unique_game;

-- Create new unique constraint that includes save_game_id for games with save_game_id
CREATE UNIQUE INDEX IF NOT EXISTS games_save_game_unique 
ON public.games(save_game_id, season, week, home_team_id, away_team_id) 
WHERE save_game_id IS NOT NULL;

-- For legacy games without save_game_id, keep the old constraint
CREATE UNIQUE INDEX IF NOT EXISTS games_unique_null 
ON public.games(season, week, home_team_id, away_team_id) 
WHERE save_game_id IS NULL;

-- Add save_game_id to playoff_games table
ALTER TABLE public.playoff_games 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_playoff_games_save_game ON public.playoff_games(save_game_id, season);

-- Add save_game_id to playoff_seeds table
ALTER TABLE public.playoff_seeds 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_playoff_seeds_save_game ON public.playoff_seeds(save_game_id, season);

-- Add save_game_id to trades table
ALTER TABLE public.trades 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_trades_save_game ON public.trades(save_game_id, season);

-- Add save_game_id to transactions table
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_transactions_save_game ON public.transactions(save_game_id, season);

-- Add save_game_id to team_season_stats table
ALTER TABLE public.team_season_stats 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_team_season_stats_save_game ON public.team_season_stats(save_game_id, season_id);

-- Add save_game_id to team_game_stats table
ALTER TABLE public.team_game_stats 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_team_game_stats_save_game ON public.team_game_stats(save_game_id, season, week);

-- Add save_game_id to player_game_stats table
ALTER TABLE public.player_game_stats 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_player_game_stats_save_game ON public.player_game_stats(save_game_id, season, week);

-- Add save_game_id to player_season_stats table
ALTER TABLE public.player_season_stats 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_player_season_stats_save_game ON public.player_season_stats(save_game_id, season);

-- Update the unique constraint to include save_game_id
-- Drop the old unique constraint if it exists (it's a constraint, not an index)
ALTER TABLE public.player_season_stats 
DROP CONSTRAINT IF EXISTS player_season_stats_player_id_season_key;

-- Drop any existing unique indexes
DROP INDEX IF EXISTS player_season_stats_save_game_unique;
DROP INDEX IF EXISTS player_season_stats_unique_null;

-- Create a full unique constraint that works for both cases
-- PostgreSQL treats NULL as distinct, so we can use COALESCE to handle NULL save_game_id
-- For NULL save_game_id, we'll use a sentinel UUID to ensure uniqueness
-- This allows the same player/season combo to exist once per save_game_id, and once for NULL
CREATE UNIQUE INDEX IF NOT EXISTS player_season_stats_unique 
ON public.player_season_stats(
  COALESCE(save_game_id, '00000000-0000-0000-0000-000000000000'::uuid),
  player_id, 
  season
);

-- Add save_game_id to seasons table
-- Note: This changes the UNIQUE constraint on 'year' - we'll need to make it (save_game_id, year) unique instead
ALTER TABLE public.seasons 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

-- Drop the old unique constraint on year and create a new one with save_game_id
ALTER TABLE public.seasons 
DROP CONSTRAINT IF EXISTS seasons_year_key;

CREATE UNIQUE INDEX IF NOT EXISTS seasons_save_game_year_unique ON public.seasons(save_game_id, year) WHERE save_game_id IS NOT NULL;
-- Also allow NULL save_game_id for backward compatibility (legacy data)
CREATE UNIQUE INDEX IF NOT EXISTS seasons_year_unique_null ON public.seasons(year) WHERE save_game_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_seasons_save_game ON public.seasons(save_game_id, year);

-- Add save_game_id to season_weeks table
ALTER TABLE public.season_weeks 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_season_weeks_save_game ON public.season_weeks(save_game_id, season_id);

-- Comments
COMMENT ON COLUMN public.games.save_game_id IS 'Links this game to a specific save game for data isolation';
COMMENT ON COLUMN public.playoff_games.save_game_id IS 'Links this playoff game to a specific save game for data isolation';
COMMENT ON COLUMN public.playoff_seeds.save_game_id IS 'Links this playoff seed to a specific save game for data isolation';
COMMENT ON COLUMN public.trades.save_game_id IS 'Links this trade to a specific save game for data isolation';
COMMENT ON COLUMN public.transactions.save_game_id IS 'Links this transaction to a specific save game for data isolation';
COMMENT ON COLUMN public.team_season_stats.save_game_id IS 'Links this team season stat to a specific save game for data isolation';
COMMENT ON COLUMN public.team_game_stats.save_game_id IS 'Links this team game stat to a specific save game for data isolation';
COMMENT ON COLUMN public.player_game_stats.save_game_id IS 'Links this player game stat to a specific save game for data isolation';
COMMENT ON COLUMN public.player_season_stats.save_game_id IS 'Links this player season stat to a specific save game for data isolation';
COMMENT ON COLUMN public.seasons.save_game_id IS 'Links this season to a specific save game for data isolation';
COMMENT ON COLUMN public.season_weeks.save_game_id IS 'Links this season week to a specific save game for data isolation';

