-- Create draft_prospects table to store draft class prospects
CREATE TABLE IF NOT EXISTS public.draft_prospects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season INTEGER NOT NULL,
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
  
  -- Ensure unique prospects per season (by name and position as identifier)
  UNIQUE(season, full_name, position)
);

-- Create draft_classes table to track draft class metadata
CREATE TABLE IF NOT EXISTS public.draft_classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season INTEGER NOT NULL,
  csv_url TEXT,
  prospect_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT draft_classes_season_unique UNIQUE(season)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_draft_prospects_season ON public.draft_prospects(season);
CREATE INDEX IF NOT EXISTS idx_draft_prospects_position ON public.draft_prospects(position);
CREATE INDEX IF NOT EXISTS idx_draft_prospects_overall ON public.draft_prospects(overall DESC);
CREATE INDEX IF NOT EXISTS idx_draft_prospects_potential ON public.draft_prospects(potential DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.draft_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_classes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then create new ones
DROP POLICY IF EXISTS "Allow all operations on draft_prospects" ON public.draft_prospects;
DROP POLICY IF EXISTS "Allow all operations on draft_classes" ON public.draft_classes;

-- Create policies to allow all operations (adjust based on your auth needs)
CREATE POLICY "Allow all operations on draft_prospects" ON public.draft_prospects
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on draft_classes" ON public.draft_classes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.draft_prospects IS 'Draft prospects for each season';
COMMENT ON TABLE public.draft_classes IS 'Metadata for draft classes';

