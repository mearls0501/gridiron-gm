-- Playoff system tables

-- Playoff games table
CREATE TABLE IF NOT EXISTS public.playoff_games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL CHECK (week BETWEEN 19 AND 22),
  round TEXT NOT NULL CHECK (round IN ('wild_card', 'divisional', 'conference_championship', 'super_bowl')),
  conference TEXT, -- NULL for Super Bowl
  home_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  away_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  home_team_seed INTEGER,
  away_team_seed INTEGER,
  home_score INTEGER,
  away_score INTEGER,
  played BOOLEAN DEFAULT false,
  winner_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT playoff_games_unique UNIQUE (season, week, round, conference, home_team_seed, away_team_seed)
);

CREATE INDEX IF NOT EXISTS idx_playoff_games_season ON public.playoff_games(season);
CREATE INDEX IF NOT EXISTS idx_playoff_games_week ON public.playoff_games(season, week);
CREATE INDEX IF NOT EXISTS idx_playoff_games_round ON public.playoff_games(season, round);
CREATE INDEX IF NOT EXISTS idx_playoff_games_teams ON public.playoff_games(home_team_id, away_team_id);

ALTER TABLE public.playoff_games ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on playoff_games" ON public.playoff_games;
CREATE POLICY "Allow all on playoff_games" ON public.playoff_games
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Playoff seeds table (stores playoff teams and seeds)
CREATE TABLE IF NOT EXISTS public.playoff_seeds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season INTEGER NOT NULL,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  conference TEXT NOT NULL CHECK (conference IN ('AFC', 'NFC')),
  seed INTEGER NOT NULL CHECK (seed BETWEEN 1 AND 7),
  division TEXT NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  ties INTEGER NOT NULL DEFAULT 0,
  win_percentage NUMERIC(5,3) NOT NULL DEFAULT 0,
  points_for INTEGER NOT NULL DEFAULT 0,
  points_against INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT playoff_seeds_unique UNIQUE (season, team_id)
);

CREATE INDEX IF NOT EXISTS idx_playoff_seeds_season ON public.playoff_seeds(season);
CREATE INDEX IF NOT EXISTS idx_playoff_seeds_conference ON public.playoff_seeds(season, conference, seed);

ALTER TABLE public.playoff_seeds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on playoff_seeds" ON public.playoff_seeds;
CREATE POLICY "Allow all on playoff_seeds" ON public.playoff_seeds
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.playoff_games IS 'NFL playoff games (Wild Card, Divisional, Conference Championship, Super Bowl)';
COMMENT ON TABLE public.playoff_seeds IS 'Playoff team seeds for each season';

