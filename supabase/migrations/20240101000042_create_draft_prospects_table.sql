-- Create draft_prospects table to store draft class prospects
CREATE TABLE IF NOT EXISTS public.draft_prospects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season INTEGER NOT NULL,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  position TEXT NOT NULL,
  age INTEGER NOT NULL,
  college TEXT,
  archetype TEXT,
  overall INTEGER NOT NULL,
  potential INTEGER NOT NULL,
  traits JSONB,
  is_free_agent BOOLEAN DEFAULT FALSE,
  contract_year_1 DECIMAL(10, 2),
  contract_year_2 DECIMAL(10, 2),
  contract_year_3 DECIMAL(10, 2),
  contract_year_4 DECIMAL(10, 2),
  signing_bonus DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique prospects per season and save game (by name and position as identifier)
  UNIQUE(save_game_id, season, full_name, position)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_draft_prospects_season ON public.draft_prospects(season);
CREATE INDEX IF NOT EXISTS idx_draft_prospects_save_game ON public.draft_prospects(save_game_id, season);
CREATE INDEX IF NOT EXISTS idx_draft_prospects_position ON public.draft_prospects(position);
CREATE INDEX IF NOT EXISTS idx_draft_prospects_overall ON public.draft_prospects(overall DESC);
CREATE INDEX IF NOT EXISTS idx_draft_prospects_potential ON public.draft_prospects(potential DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.draft_prospects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then create new ones
DROP POLICY IF EXISTS "Allow all operations on draft_prospects" ON public.draft_prospects;

-- Create policies to allow all operations (adjust based on your auth needs)
CREATE POLICY "Allow all operations on draft_prospects" ON public.draft_prospects
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.draft_prospects IS 'Draft prospects for each season, isolated by save game';
COMMENT ON COLUMN public.draft_prospects.save_game_id IS 'Links this draft prospect to a specific save game for data isolation';

