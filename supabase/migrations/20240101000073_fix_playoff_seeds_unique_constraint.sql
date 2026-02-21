-- Fix playoff_seeds unique constraint to include save_game_id
-- This allows multiple save games to have the same season/team combo

-- Drop the old unique constraint
ALTER TABLE public.playoff_seeds 
DROP CONSTRAINT IF EXISTS playoff_seeds_unique;

-- Create new unique constraint that includes save_game_id
-- For games with save_game_id, use (save_game_id, season, team_id)
-- For legacy games without save_game_id, use (season, team_id) with NULL
CREATE UNIQUE INDEX IF NOT EXISTS playoff_seeds_save_game_unique 
ON public.playoff_seeds(save_game_id, season, team_id) 
WHERE save_game_id IS NOT NULL;

-- For legacy games without save_game_id, keep the old constraint
CREATE UNIQUE INDEX IF NOT EXISTS playoff_seeds_unique_null 
ON public.playoff_seeds(season, team_id) 
WHERE save_game_id IS NULL;


