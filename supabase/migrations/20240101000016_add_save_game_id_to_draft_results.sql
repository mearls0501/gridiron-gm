-- Migration: Add save_game_id to draft_results table for data isolation
-- This allows multiple save games to coexist with completely separate draft result history

-- Add save_game_id to draft_results table
ALTER TABLE public.draft_results 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_draft_results_save_game 
ON public.draft_results(save_game_id, season);

-- Update existing records by getting save_game_id from related tables
-- Try multiple sources in order of reliability
DO $$
BEGIN
  -- First try to get it from draft_picks (most reliable since draft_pick_id is required)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'draft_picks' 
    AND column_name = 'save_game_id'
  ) THEN
    UPDATE public.draft_results dr
    SET save_game_id = (
      SELECT dp.save_game_id
      FROM public.draft_picks dp
      WHERE dp.id = dr.draft_pick_id
      LIMIT 1
    )
    WHERE dr.save_game_id IS NULL;
  END IF;
  
  -- If still NULL, try to get it from draft_prospects (via prospect_id)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'draft_prospects' 
    AND column_name = 'save_game_id'
  ) THEN
    UPDATE public.draft_results dr
    SET save_game_id = (
      SELECT dp.save_game_id
      FROM public.draft_prospects dp
      WHERE dp.id = dr.prospect_id
      LIMIT 1
    )
    WHERE dr.save_game_id IS NULL
    AND dr.prospect_id IS NOT NULL;
  END IF;
  
  -- If still NULL, try to get it from players (via player_id)
  -- Note: players table might not have save_game_id, but if it does, use it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'players' 
    AND column_name = 'save_game_id'
  ) THEN
    UPDATE public.draft_results dr
    SET save_game_id = (
      SELECT p.save_game_id
      FROM public.players p
      WHERE p.id = dr.player_id
      LIMIT 1
    )
    WHERE dr.save_game_id IS NULL
    AND dr.player_id IS NOT NULL;
  END IF;
END $$;

-- Update unique constraint to include save_game_id
-- Drop old unique constraint if it exists
ALTER TABLE public.draft_results 
DROP CONSTRAINT IF EXISTS draft_results_draft_pick_id_key;

-- Create new unique constraint that includes save_game_id for results with save_game_id
CREATE UNIQUE INDEX IF NOT EXISTS draft_results_save_game_unique 
ON public.draft_results(save_game_id, draft_pick_id) 
WHERE save_game_id IS NOT NULL;

-- For legacy results without save_game_id, keep the old constraint
CREATE UNIQUE INDEX IF NOT EXISTS draft_results_unique_null 
ON public.draft_results(draft_pick_id) 
WHERE save_game_id IS NULL;

-- Add additional indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_draft_results_save_game_pick 
ON public.draft_results(save_game_id, draft_pick_id);

CREATE INDEX IF NOT EXISTS idx_draft_results_save_game_team 
ON public.draft_results(save_game_id, team_id, season);

-- Add comments
COMMENT ON COLUMN public.draft_results.save_game_id IS 'Links this draft result to a specific save game for data isolation';

