-- Migration: Create undrafted_prospects table
-- This tracks prospects who went undrafted and are available as free agents
-- Separate from the seed free_agents table which is locked with RLS

CREATE TABLE IF NOT EXISTS public.undrafted_prospects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES public.draft_prospects(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  entered_free_agency_season INTEGER NOT NULL,
  entered_free_agency_week INTEGER,
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- A prospect can only be undrafted once per save game
  UNIQUE(prospect_id, save_game_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_undrafted_prospects_prospect ON public.undrafted_prospects(prospect_id);
CREATE INDEX IF NOT EXISTS idx_undrafted_prospects_save_game ON public.undrafted_prospects(save_game_id);
CREATE INDEX IF NOT EXISTS idx_undrafted_prospects_season ON public.undrafted_prospects(season);
CREATE INDEX IF NOT EXISTS idx_undrafted_prospects_archived ON public.undrafted_prospects(archived);
CREATE INDEX IF NOT EXISTS idx_undrafted_prospects_composite ON public.undrafted_prospects(save_game_id, archived);

-- Enable Row Level Security (RLS)
ALTER TABLE public.undrafted_prospects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then create new ones
DROP POLICY IF EXISTS "Allow all operations on undrafted_prospects" ON public.undrafted_prospects;

-- Policy to allow all operations (adjust based on your auth needs)
CREATE POLICY "Allow all operations on undrafted_prospects" ON public.undrafted_prospects
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.undrafted_prospects IS 'Tracks prospects who went undrafted and are available as free agents. Separate from seed free_agents table.';
COMMENT ON COLUMN public.undrafted_prospects.prospect_id IS 'Reference to the draft_prospects table entry';
COMMENT ON COLUMN public.undrafted_prospects.entered_free_agency_season IS 'Season when prospect became available as free agent after going undrafted';


