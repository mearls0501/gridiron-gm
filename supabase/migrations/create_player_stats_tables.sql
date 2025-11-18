-- Create player game statistics table (individual game performance)
CREATE TABLE IF NOT EXISTS public.player_game_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  
  -- Offensive stats (QB, RB, WR, TE)
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
  
  -- Defensive stats (DE, DT, LB, CB, S)
  tackles INTEGER DEFAULT 0,
  solo_tackles INTEGER DEFAULT 0,
  sacks DECIMAL(4,1) DEFAULT 0,
  defensive_interceptions INTEGER DEFAULT 0,
  forced_fumbles INTEGER DEFAULT 0,
  fumble_recoveries INTEGER DEFAULT 0,
  passes_defended INTEGER DEFAULT 0,
  tfl INTEGER DEFAULT 0, -- tackles for loss
  
  -- Special teams (K, P)
  field_goals_made INTEGER DEFAULT 0,
  field_goals_attempted INTEGER DEFAULT 0,
  extra_points_made INTEGER DEFAULT 0,
  punts INTEGER DEFAULT 0,
  punt_yards INTEGER DEFAULT 0,
  
  -- Performance metrics (calculated)
  performance_rating DECIMAL(5,2), -- 0-100 scale based on position
  snaps_played INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(player_id, game_id)
);

-- Create player season statistics table (aggregated season stats)
CREATE TABLE IF NOT EXISTS public.player_season_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  
  -- Offensive stats (aggregated)
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
  
  -- Defensive stats (aggregated)
  tackles INTEGER DEFAULT 0,
  solo_tackles INTEGER DEFAULT 0,
  sacks DECIMAL(4,1) DEFAULT 0,
  defensive_interceptions INTEGER DEFAULT 0,
  forced_fumbles INTEGER DEFAULT 0,
  fumble_recoveries INTEGER DEFAULT 0,
  passes_defended INTEGER DEFAULT 0,
  tfl INTEGER DEFAULT 0,
  
  -- Special teams (aggregated)
  field_goals_made INTEGER DEFAULT 0,
  field_goals_attempted INTEGER DEFAULT 0,
  extra_points_made INTEGER DEFAULT 0,
  punts INTEGER DEFAULT 0,
  punt_yards INTEGER DEFAULT 0,
  
  -- Game participation
  games_played INTEGER DEFAULT 0,
  games_started INTEGER DEFAULT 0,
  
  -- Performance metrics
  avg_performance_rating DECIMAL(5,2),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(player_id, season)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_player_game_stats_player ON public.player_game_stats(player_id, season);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_game ON public.player_game_stats(game_id);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_team ON public.player_game_stats(team_id, season);
CREATE INDEX IF NOT EXISTS idx_player_season_stats_player ON public.player_season_stats(player_id, season);
CREATE INDEX IF NOT EXISTS idx_player_season_stats_team ON public.player_season_stats(team_id, season);

-- Enable Row Level Security (RLS)
ALTER TABLE public.player_game_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_season_stats ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (adjust based on your auth needs)
CREATE POLICY "Allow all operations on player_game_stats" ON public.player_game_stats
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on player_season_stats" ON public.player_season_stats
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.player_game_stats IS 'Individual game statistics for players';
COMMENT ON TABLE public.player_season_stats IS 'Aggregated season statistics for players';

