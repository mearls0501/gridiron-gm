-- Save games system
-- Allows users to save and load their game state

CREATE TABLE IF NOT EXISTS public.save_games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT, -- For future multi-user support, can be null for now
  save_name TEXT NOT NULL,
  description TEXT,
  current_season INTEGER NOT NULL,
  current_week INTEGER NOT NULL,
  selected_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  game_state JSONB DEFAULT '{}'::jsonb, -- Store additional game state
  metadata JSONB DEFAULT '{}'::jsonb, -- Store save metadata (created date, last played, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_save_games_user ON public.save_games(user_id);
CREATE INDEX IF NOT EXISTS idx_save_games_updated ON public.save_games(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_save_games_last_played ON public.save_games(last_played_at DESC);

-- Enable Row Level Security
ALTER TABLE public.save_games ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for now, adjust based on auth needs)
DROP POLICY IF EXISTS "Allow all on save_games" ON public.save_games;
CREATE POLICY "Allow all on save_games" ON public.save_games
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.save_games IS 'Save game files for users';
COMMENT ON COLUMN public.save_games.game_state IS 'JSON object storing game state (teams, players, rosters, etc.)';
COMMENT ON COLUMN public.save_games.metadata IS 'JSON object storing save metadata (version, stats, etc.)';

