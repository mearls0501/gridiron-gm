-- Migration: Add save_game_id to draft_picks table for data isolation
-- This allows multiple save games to coexist with completely separate draft picks

-- Add save_game_id to draft_picks table
ALTER TABLE public.draft_picks
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_draft_picks_save_game 
ON public.draft_picks(save_game_id, season);

-- Update existing records by attempting to get save_game_id from related tables
-- First try to get it from draft_prospects if a pick has been used
DO $$
BEGIN
  -- Check if both draft_prospects has save_game_id AND draft_picks has selected_player_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'draft_prospects' 
    AND column_name = 'save_game_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'draft_picks' 
    AND column_name = 'selected_player_id'
  ) THEN
    UPDATE public.draft_picks dp
    SET save_game_id = (
      SELECT dp2.save_game_id
      FROM public.draft_prospects dp2
      WHERE dp2.id = dp.selected_player_id
      LIMIT 1
    )
    WHERE dp.save_game_id IS NULL
    AND dp.selected_player_id IS NOT NULL;
  END IF;
END $$;

-- Add comments
COMMENT ON COLUMN public.draft_picks.save_game_id IS 'Links this draft pick to a specific save game for data isolation';

