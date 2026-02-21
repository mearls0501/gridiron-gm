-- Comprehensive league history & operations tables

-- Seasons master table
CREATE TABLE IF NOT EXISTS public.seasons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL UNIQUE,
  phase TEXT NOT NULL DEFAULT 'preseason',
  current_week INTEGER NOT NULL DEFAULT 0 CHECK (current_week >= 0 AND current_week <= 23),
  is_active BOOLEAN NOT NULL DEFAULT true,
  champion_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seasons_active ON public.seasons(is_active);

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on seasons" ON public.seasons;
CREATE POLICY "Allow all on seasons" ON public.seasons
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Week-by-week tracking
CREATE TABLE IF NOT EXISTS public.season_weeks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 21),
  status TEXT NOT NULL DEFAULT 'scheduled',
  lock_reason TEXT,
  simulated_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT season_weeks_unique UNIQUE (season_id, week_number)
);

CREATE INDEX IF NOT EXISTS idx_season_weeks_status ON public.season_weeks(status);

ALTER TABLE public.season_weeks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on season_weeks" ON public.season_weeks;
CREATE POLICY "Allow all on season_weeks" ON public.season_weeks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Team season standings & aggregates
CREATE TABLE IF NOT EXISTS public.team_season_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  ties INTEGER NOT NULL DEFAULT 0,
  points_for INTEGER NOT NULL DEFAULT 0,
  points_against INTEGER NOT NULL DEFAULT 0,
  yards_for INTEGER NOT NULL DEFAULT 0,
  yards_against INTEGER NOT NULL DEFAULT 0,
  turnover_diff INTEGER NOT NULL DEFAULT 0,
  streak TEXT,
  clinched TEXT,
  playoff_seed INTEGER,
  last_played_week INTEGER,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT team_season_stats_unique UNIQUE (season_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_team_season_stats_seed ON public.team_season_stats(season_id, playoff_seed);

ALTER TABLE public.team_season_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on team_season_stats" ON public.team_season_stats;
CREATE POLICY "Allow all on team_season_stats" ON public.team_season_stats
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Team level game stats (box score aggregates)
CREATE TABLE IF NOT EXISTS public.team_game_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  opponent_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  is_home BOOLEAN NOT NULL DEFAULT false,
  points_for INTEGER DEFAULT 0,
  points_against INTEGER DEFAULT 0,
  total_yards INTEGER DEFAULT 0,
  passing_yards INTEGER DEFAULT 0,
  rushing_yards INTEGER DEFAULT 0,
  turnovers INTEGER DEFAULT 0,
  takeaways INTEGER DEFAULT 0,
  sacks INTEGER DEFAULT 0,
  third_down_attempts INTEGER DEFAULT 0,
  third_down_conversions INTEGER DEFAULT 0,
  time_of_possession_seconds INTEGER DEFAULT 0,
  penalties INTEGER DEFAULT 0,
  penalty_yards INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(game_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_team_game_stats_team ON public.team_game_stats(team_id, season, week);

ALTER TABLE public.team_game_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on team_game_stats" ON public.team_game_stats;
CREATE POLICY "Allow all on team_game_stats" ON public.team_game_stats
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Transaction audit trail
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  from_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  to_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL,
  season INTEGER,
  week INTEGER,
  details TEXT,
  metadata JSONB,
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_player ON public.transactions(player_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(transaction_type, season);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on transactions" ON public.transactions;
CREATE POLICY "Allow all on transactions" ON public.transactions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Normalized contract snapshots
CREATE TABLE IF NOT EXISTS public.player_contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  season INTEGER NOT NULL,
  contract_year INTEGER,
  base_salary NUMERIC(12,2) DEFAULT 0,
  signing_bonus NUMERIC(12,2) DEFAULT 0,
  roster_bonus NUMERIC(12,2) DEFAULT 0,
  cap_hit NUMERIC(12,2) DEFAULT 0,
  guaranteed_money NUMERIC(12,2) DEFAULT 0,
  contract_length_years INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT player_contracts_unique UNIQUE (player_id, season, contract_year)
);

CREATE INDEX IF NOT EXISTS idx_player_contracts_team ON public.player_contracts(team_id, season);

ALTER TABLE public.player_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on player_contracts" ON public.player_contracts;
CREATE POLICY "Allow all on player_contracts" ON public.player_contracts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Persisted depth chart ordering
CREATE TABLE IF NOT EXISTS public.depth_chart_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  position TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot >= 1),
  player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT depth_chart_unique UNIQUE (team_id, season, position, slot)
);

CREATE INDEX IF NOT EXISTS idx_depth_chart_team_position ON public.depth_chart_slots(team_id, position);

ALTER TABLE public.depth_chart_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on depth_chart_slots" ON public.depth_chart_slots;
CREATE POLICY "Allow all on depth_chart_slots" ON public.depth_chart_slots
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Injury tracking
CREATE TABLE IF NOT EXISTS public.injuries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  season INTEGER,
  week INTEGER,
  status TEXT NOT NULL DEFAULT 'questionable',
  injury_type TEXT,
  description TEXT,
  expected_return_week INTEGER,
  placed_on_ir BOOLEAN DEFAULT false,
  occurred_in_game_id UUID REFERENCES public.games(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_injuries_player ON public.injuries(player_id);
CREATE INDEX IF NOT EXISTS idx_injuries_status ON public.injuries(status);

ALTER TABLE public.injuries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on injuries" ON public.injuries;
CREATE POLICY "Allow all on injuries" ON public.injuries
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Draft capital tracking
CREATE TABLE IF NOT EXISTS public.draft_picks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season INTEGER NOT NULL,
  round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 7),
  pick_overall INTEGER NOT NULL,
  pick_in_round INTEGER NOT NULL,
  owning_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  original_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'owned',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT draft_picks_unique UNIQUE (season, pick_overall)
);

CREATE INDEX IF NOT EXISTS idx_draft_picks_team ON public.draft_picks(owning_team_id, season);

ALTER TABLE public.draft_picks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on draft_picks" ON public.draft_picks;
CREATE POLICY "Allow all on draft_picks" ON public.draft_picks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Draft results (selection history)
CREATE TABLE IF NOT EXISTS public.draft_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_pick_id UUID NOT NULL REFERENCES public.draft_picks(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES public.draft_prospects(id) ON DELETE SET NULL,
  player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  contract_id UUID REFERENCES public.player_contracts(id) ON DELETE SET NULL,
  signed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(draft_pick_id)
);

ALTER TABLE public.draft_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on draft_results" ON public.draft_results;
CREATE POLICY "Allow all on draft_results" ON public.draft_results
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Play-by-play event archive
CREATE TABLE IF NOT EXISTS public.game_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  play_number INTEGER NOT NULL,
  quarter INTEGER DEFAULT 1 CHECK (quarter BETWEEN 1 AND 5),
  clock TEXT,
  offense_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  defense_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  down INTEGER,
  distance INTEGER,
  yard_line INTEGER,
  play_type TEXT,
  yards INTEGER,
  points INTEGER DEFAULT 0,
  turnover BOOLEAN DEFAULT false,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT game_events_unique UNIQUE (game_id, play_number)
);

CREATE INDEX IF NOT EXISTS idx_game_events_game ON public.game_events(game_id);

ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on game_events" ON public.game_events;
CREATE POLICY "Allow all on game_events" ON public.game_events
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Salary cap ledger for auditing adjustments
CREATE TABLE IF NOT EXISTS public.salary_cap_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  week INTEGER,
  delta NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2),
  reason TEXT,
  reference_type TEXT,
  reference_id UUID,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_cap_ledger_team ON public.salary_cap_ledger(team_id, season);

ALTER TABLE public.salary_cap_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on salary_cap_ledger" ON public.salary_cap_ledger;
CREATE POLICY "Allow all on salary_cap_ledger" ON public.salary_cap_ledger
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Awards / accolades
CREATE TABLE IF NOT EXISTS public.awards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season INTEGER NOT NULL,
  award_type TEXT NOT NULL,
  player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(season, award_type, player_id)
);

CREATE INDEX IF NOT EXISTS idx_awards_season ON public.awards(season, award_type);

ALTER TABLE public.awards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on awards" ON public.awards;
CREATE POLICY "Allow all on awards" ON public.awards
  FOR ALL
  USING (true)
  WITH CHECK (true);

