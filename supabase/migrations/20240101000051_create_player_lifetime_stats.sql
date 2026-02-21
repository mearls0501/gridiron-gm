-- Create player lifetime statistics table (cumulative career stats)
CREATE TABLE IF NOT EXISTS public.player_lifetime_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE,
  
  -- Offensive stats (cumulative)
  passing_yards INTEGER DEFAULT 0,
  passing_tds INTEGER DEFAULT 0,
  interceptions INTEGER DEFAULT 0,
  completions INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  rushing_yards INTEGER DEFAULT 0,
  rushing_tds INTEGER DEFAULT 0,
  rushing_attempts INTEGER DEFAULT 0,
  receiving_yards INTEGER DEFAULT 0,
  receiving_tds INTEGER DEFAULT 0,
  receptions INTEGER DEFAULT 0,
  targets INTEGER DEFAULT 0,
  fumbles INTEGER DEFAULT 0,
  
  -- Defensive stats (cumulative)
  tackles INTEGER DEFAULT 0,
  solo_tackles INTEGER DEFAULT 0,
  sacks DECIMAL(4,1) DEFAULT 0,
  defensive_interceptions INTEGER DEFAULT 0,
  forced_fumbles INTEGER DEFAULT 0,
  fumble_recoveries INTEGER DEFAULT 0,
  passes_defended INTEGER DEFAULT 0,
  tfl INTEGER DEFAULT 0,
  
  -- Special teams (cumulative)
  field_goals_made INTEGER DEFAULT 0,
  field_goals_attempted INTEGER DEFAULT 0,
  extra_points_made INTEGER DEFAULT 0,
  punts INTEGER DEFAULT 0,
  punt_yards INTEGER DEFAULT 0,
  
  -- Career metadata
  seasons_played INTEGER DEFAULT 0,
  first_season INTEGER,
  last_season INTEGER,
  total_games_played INTEGER DEFAULT 0,
  total_games_started INTEGER DEFAULT 0,
  
  -- Performance metrics (career average)
  avg_performance_rating DECIMAL(5,2),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(player_id, save_game_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_player_lifetime_stats_player ON public.player_lifetime_stats(player_id, save_game_id);
CREATE INDEX IF NOT EXISTS idx_player_lifetime_stats_save_game ON public.player_lifetime_stats(save_game_id);
-- Indexes for career records queries (most common record types)
CREATE INDEX IF NOT EXISTS idx_player_lifetime_stats_rushing_yards ON public.player_lifetime_stats(save_game_id, rushing_yards DESC);
CREATE INDEX IF NOT EXISTS idx_player_lifetime_stats_passing_yards ON public.player_lifetime_stats(save_game_id, passing_yards DESC);
CREATE INDEX IF NOT EXISTS idx_player_lifetime_stats_receiving_yards ON public.player_lifetime_stats(save_game_id, receiving_yards DESC);
CREATE INDEX IF NOT EXISTS idx_player_lifetime_stats_tackles ON public.player_lifetime_stats(save_game_id, tackles DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.player_lifetime_stats ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations
DROP POLICY IF EXISTS "Allow all operations on player_lifetime_stats" ON public.player_lifetime_stats;
CREATE POLICY "Allow all operations on player_lifetime_stats" ON public.player_lifetime_stats
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.player_lifetime_stats IS 'Cumulative career statistics for players across all seasons';
COMMENT ON COLUMN public.player_lifetime_stats.seasons_played IS 'Number of distinct seasons the player has played';
COMMENT ON COLUMN public.player_lifetime_stats.first_season IS 'Earliest season the player played';
COMMENT ON COLUMN public.player_lifetime_stats.last_season IS 'Most recent season the player played';



