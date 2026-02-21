-- Create scout_weekly_points table to track spent points per scout per week
-- This enables proper point tracking and regeneration

CREATE TABLE IF NOT EXISTS public.scout_weekly_points (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  scout_id UUID NOT NULL REFERENCES public.scouts(id) ON DELETE CASCADE,
  save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL CHECK (week >= 0 AND week <= 23),
  weekly_allocation INTEGER NOT NULL CHECK (weekly_allocation >= 0),
  points_spent INTEGER NOT NULL DEFAULT 0 CHECK (points_spent >= 0),
  points_available INTEGER NOT NULL GENERATED ALWAYS AS (weekly_allocation - points_spent) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one record per scout per week per save game
  CONSTRAINT scout_weekly_points_unique UNIQUE (team_id, scout_id, save_game_id, season, week)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_scout_weekly_points_team_season_week 
ON public.scout_weekly_points(team_id, save_game_id, season, week);

CREATE INDEX IF NOT EXISTS idx_scout_weekly_points_scout 
ON public.scout_weekly_points(scout_id, save_game_id, season, week);

-- Enable Row Level Security
ALTER TABLE public.scout_weekly_points ENABLE ROW LEVEL SECURITY;

-- Create policy (allow all for now, adjust based on auth needs)
DROP POLICY IF EXISTS "Allow all on scout_weekly_points" ON public.scout_weekly_points;
CREATE POLICY "Allow all on scout_weekly_points" ON public.scout_weekly_points
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.scout_weekly_points IS 'Tracks weekly scouting points allocation and spending per scout';
COMMENT ON COLUMN public.scout_weekly_points.weekly_allocation IS 'Total points allocated to this scout for this week (based on priority: 25/15/10/5)';
COMMENT ON COLUMN public.scout_weekly_points.points_spent IS 'Points spent by this scout this week';
COMMENT ON COLUMN public.scout_weekly_points.points_available IS 'Calculated available points (allocation - spent)';

