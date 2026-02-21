-- Fix playoff_games unique constraint to include save_game_id
-- This allows multiple save games to have the same playoff bracket structure

-- Drop the old unique constraint
ALTER TABLE public.playoff_games 
DROP CONSTRAINT IF EXISTS playoff_games_unique;

-- Create new unique constraint that includes save_game_id
-- For games with save_game_id, use (save_game_id, season, week, round, conference, home_team_seed, away_team_seed)
CREATE UNIQUE INDEX IF NOT EXISTS playoff_games_save_game_unique 
ON public.playoff_games(save_game_id, season, week, round, conference, home_team_seed, away_team_seed) 
WHERE save_game_id IS NOT NULL;

-- For legacy games without save_game_id, keep the old constraint
CREATE UNIQUE INDEX IF NOT EXISTS playoff_games_unique_null 
ON public.playoff_games(season, week, round, conference, home_team_seed, away_team_seed) 
WHERE save_game_id IS NULL;


