-- Add save_game_id to draft_prospects table for data isolation
ALTER TABLE public.draft_prospects 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_draft_prospects_save_game ON public.draft_prospects(save_game_id, season);

-- Update unique constraint to include save_game_id
-- Drop old unique constraint if it exists
ALTER TABLE public.draft_prospects 
DROP CONSTRAINT IF EXISTS draft_prospects_season_full_name_position_key;

-- Create new unique constraint that includes save_game_id
CREATE UNIQUE INDEX IF NOT EXISTS draft_prospects_save_game_unique 
ON public.draft_prospects(save_game_id, season, full_name, position) 
WHERE save_game_id IS NOT NULL;

-- For legacy data without save_game_id, keep the old constraint
CREATE UNIQUE INDEX IF NOT EXISTS draft_prospects_unique_null 
ON public.draft_prospects(season, full_name, position) 
WHERE save_game_id IS NULL;

COMMENT ON COLUMN public.draft_prospects.save_game_id IS 'Links this draft prospect to a specific save game for data isolation';


