-- Create schedules table to track schedule generation and history
-- This separates schedule metadata from game results, making it easier to
-- track which seasons have schedules, when they were generated, etc.

CREATE TABLE IF NOT EXISTS public.schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season INTEGER NOT NULL,
  save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE,
  total_games INTEGER NOT NULL DEFAULT 272, -- 32 teams × 17 games ÷ 2
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  generated_by TEXT, -- Optional: track who/what generated it
  notes TEXT, -- Optional: any notes about the schedule
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one schedule per season per save game
  CONSTRAINT unique_schedule UNIQUE (save_game_id, season)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_schedules_season ON public.schedules(season);
CREATE INDEX IF NOT EXISTS idx_schedules_save_game ON public.schedules(save_game_id, season);
CREATE INDEX IF NOT EXISTS idx_schedules_save_game_season ON public.schedules(save_game_id, season);

-- For legacy schedules without save_game_id, allow one per season
CREATE UNIQUE INDEX IF NOT EXISTS schedules_unique_null 
ON public.schedules(season) 
WHERE save_game_id IS NULL;

-- Enable Row Level Security (RLS)
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations
CREATE POLICY "Allow all operations on schedules" ON public.schedules
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.schedules IS 'Tracks schedule generation for each season and save game. Separates schedule metadata from game results.';
COMMENT ON COLUMN public.schedules.season IS 'The season year (e.g., 2025, 2026)';
COMMENT ON COLUMN public.schedules.save_game_id IS 'Links this schedule to a specific save game for data isolation';
COMMENT ON COLUMN public.schedules.total_games IS 'Expected number of games in this schedule (typically 272 for NFL)';
COMMENT ON COLUMN public.schedules.generated_at IS 'When the schedule was generated';
COMMENT ON COLUMN public.schedules.generated_by IS 'Optional: who or what generated this schedule';

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_schedules_updated_at
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_schedules_updated_at();



