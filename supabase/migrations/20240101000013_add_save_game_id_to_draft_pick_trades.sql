-- Migration: Add save_game_id to draft_pick_trades table for data isolation
-- This allows multiple save games to coexist with completely separate draft pick trade history

-- Add save_game_id to draft_pick_trades table
ALTER TABLE public.draft_pick_trades 
ADD COLUMN IF NOT EXISTS save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_draft_pick_trades_save_game 
ON public.draft_pick_trades(save_game_id, season);

-- Update existing records by getting save_game_id from the related draft_pick or trade
-- First try to get it from draft_picks if that table has save_game_id
DO $$
BEGIN
  -- Check if draft_picks has save_game_id column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'draft_picks' 
    AND column_name = 'save_game_id'
  ) THEN
    UPDATE public.draft_pick_trades dpt
    SET save_game_id = (
      SELECT dp.save_game_id
      FROM public.draft_picks dp
      WHERE dp.id = dpt.draft_pick_id
      LIMIT 1
    )
    WHERE dpt.save_game_id IS NULL;
  END IF;
  
  -- Also try to get it from trades table via trade_items if available
  -- This is a more reliable source since trades definitely have save_game_id
  UPDATE public.draft_pick_trades dpt
  SET save_game_id = (
    SELECT t.save_game_id
    FROM public.trades t
    JOIN public.trade_items ti ON ti.trade_id = t.id
    WHERE ti.draft_pick_id = dpt.draft_pick_id
    AND ti.from_team_id = dpt.from_team_id
    AND ti.to_team_id = dpt.to_team_id
    AND t.season = dpt.season
    LIMIT 1
  )
  WHERE dpt.save_game_id IS NULL
  AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'trades' 
    AND column_name = 'save_game_id'
  );
END $$;

-- Update unique constraint to include save_game_id if needed
-- The table doesn't have a unique constraint currently, but we can add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_draft_pick_trades_save_game_pick 
ON public.draft_pick_trades(save_game_id, draft_pick_id);

-- Add comments
COMMENT ON COLUMN public.draft_pick_trades.save_game_id IS 'Links this draft pick trade to a specific save game for data isolation';

