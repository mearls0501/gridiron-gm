-- Create games table for schedule
CREATE TABLE IF NOT EXISTS public.games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL CHECK (week >= 1 AND week <= 18),
  home_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  away_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  home_score INTEGER,
  away_score INTEGER,
  played BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure a team can't play itself
  CONSTRAINT no_self_play CHECK (home_team_id != away_team_id),
  
  -- Ensure unique games per season/week
  CONSTRAINT unique_game UNIQUE (season, week, home_team_id, away_team_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_games_season ON public.games(season);
CREATE INDEX IF NOT EXISTS idx_games_week ON public.games(season, week);
CREATE INDEX IF NOT EXISTS idx_games_home_team ON public.games(home_team_id);
CREATE INDEX IF NOT EXISTS idx_games_away_team ON public.games(away_team_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust based on your auth needs)
CREATE POLICY "Allow all operations on games" ON public.games
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.games IS 'NFL schedule games - 272 games per season (32 teams × 17 games ÷ 2)';


