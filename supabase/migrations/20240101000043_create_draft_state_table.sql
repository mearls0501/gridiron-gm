-- Create draft_state table to track draft progress for each season and save game
-- This allows multiple save games to coexist with completely separate draft states

CREATE TABLE IF NOT EXISTS public.draft_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started', -- 'not_started', 'in_progress', 'completed'
  current_round INTEGER,
  current_pick_overall INTEGER,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT draft_state_unique UNIQUE (save_game_id, season)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_draft_state_save_game 
ON public.draft_state(save_game_id, season);

CREATE INDEX IF NOT EXISTS idx_draft_state_status 
ON public.draft_state(status);

CREATE INDEX IF NOT EXISTS idx_draft_state_season 
ON public.draft_state(season);

-- Enable Row Level Security (RLS)
ALTER TABLE public.draft_state ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then create new ones
DROP POLICY IF EXISTS "Allow all on draft_state" ON public.draft_state;

-- Create policies to allow all operations (adjust based on your auth needs)
CREATE POLICY "Allow all on draft_state" ON public.draft_state
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.draft_state IS 'Tracks the current state of the draft for each season and save game';
COMMENT ON COLUMN public.draft_state.save_game_id IS 'Links this draft state to a specific save game for data isolation';
COMMENT ON COLUMN public.draft_state.status IS 'Draft status: not_started, in_progress, or completed';
COMMENT ON COLUMN public.draft_state.current_round IS 'Current round of the draft (1-7)';
COMMENT ON COLUMN public.draft_state.current_pick_overall IS 'Current overall pick number in the draft';


