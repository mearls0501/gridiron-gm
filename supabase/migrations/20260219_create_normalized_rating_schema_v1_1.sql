-- Normalized rating schema v1.1
-- Implements true/perceived separation, relationship-first modeling,
-- and computed (not persisted) team strength inputs.

-- =====================================================
-- Enum types
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scheme_type') THEN
    CREATE TYPE public.scheme_type AS ENUM (
      'wideZone',
      'powerRun',
      'verticalPass',
      'westCoast',
      'airRaid',
      'rpo',
      'spreadOption',
      'cover1',
      'cover2',
      'cover3',
      'cover4',
      'cover6',
      'pressMan',
      'quarters',
      'Tampa2'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'player_development_tier') THEN
    CREATE TYPE public.player_development_tier AS ENUM ('superstar', 'star', 'normal', 'slow');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'player_development_arc') THEN
    CREATE TYPE public.player_development_arc AS ENUM ('rising', 'peak', 'declining');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scout_character_assessment') THEN
    CREATE TYPE public.scout_character_assessment AS ENUM ('elite', 'good', 'average', 'concern', 'red_flag');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'relationship_entity_type') THEN
    CREATE TYPE public.relationship_entity_type AS ENUM ('player', 'coach', 'coordinator', 'gm', 'owner', 'fanBase', 'media');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'relationship_trend') THEN
    CREATE TYPE public.relationship_trend AS ENUM ('improving', 'stable', 'deteriorating');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'relationship_event_type') THEN
    CREATE TYPE public.relationship_event_type AS ENUM (
      'owner_overrides_draft_pick',
      'owner_approves_draft_strategy',
      'owner_forces_fa_signing',
      'season_exceeds_expectations',
      'season_misses_expectations',
      'playoff_appearance',
      'missed_playoffs_consecutive',
      'public_criticism_of_coach',
      'player_scheme_mismatch_drafted',
      'player_development_surge',
      'player_benched',
      'coach_goes_to_bat_for_player',
      'player_traded_despite_objection',
      'team_wins_streak',
      'team_loses_streak',
      'super_bowl_win',
      'locker_room_incident'
    );
  END IF;
END $$;

-- =====================================================
-- Player true ratings (ground truth)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.player_true_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,

  potential INTEGER NOT NULL CHECK (potential BETWEEN 0 AND 100),
  injury_proneness INTEGER NOT NULL CHECK (injury_proneness BETWEEN 0 AND 100),
  durability INTEGER NOT NULL CHECK (durability BETWEEN 0 AND 100),
  football_iq INTEGER NOT NULL CHECK (football_iq BETWEEN 0 AND 100),
  character INTEGER NOT NULL CHECK (character BETWEEN 0 AND 100),
  leadership INTEGER NOT NULL CHECK (leadership BETWEEN 0 AND 100),
  work_ethic INTEGER NOT NULL CHECK (work_ethic BETWEEN 0 AND 100),
  clutch INTEGER NOT NULL CHECK (clutch BETWEEN 0 AND 100),

  spd INTEGER NOT NULL CHECK (spd BETWEEN 0 AND 100),
  str INTEGER NOT NULL CHECK (str BETWEEN 0 AND 100),
  agi INTEGER NOT NULL CHECK (agi BETWEEN 0 AND 100),
  acc INTEGER NOT NULL CHECK (acc BETWEEN 0 AND 100),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_player_true_profiles UNIQUE (player_id, save_game_id)
);

CREATE TABLE IF NOT EXISTS public.player_true_rating_attributes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  attribute_key TEXT NOT NULL,
  attribute_value INTEGER NOT NULL CHECK (attribute_value BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_player_true_rating_attributes UNIQUE (player_id, save_game_id, attribute_key)
);

CREATE INDEX IF NOT EXISTS idx_player_true_profiles_save_game ON public.player_true_profiles(save_game_id);
CREATE INDEX IF NOT EXISTS idx_player_true_attr_player ON public.player_true_rating_attributes(player_id, save_game_id);
CREATE INDEX IF NOT EXISTS idx_player_true_attr_key ON public.player_true_rating_attributes(attribute_key);

-- =====================================================
-- Player scheme fit and development
-- =====================================================
CREATE TABLE IF NOT EXISTS public.player_scheme_fit_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  offensive_scheme public.scheme_type,
  defensive_scheme public.scheme_type,
  fit_modifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_player_scheme_fit_profiles UNIQUE (player_id, save_game_id)
);

CREATE TABLE IF NOT EXISTS public.player_development_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  development_tier public.player_development_tier NOT NULL,
  peak_age INTEGER NOT NULL CHECK (peak_age BETWEEN 20 AND 40),
  current_arc public.player_development_arc NOT NULL,
  decline_rate NUMERIC(5,4) NOT NULL CHECK (decline_rate >= 0 AND decline_rate <= 1),
  breakout_probability NUMERIC(5,4) NOT NULL CHECK (breakout_probability >= 0 AND breakout_probability <= 1),
  bust_risk NUMERIC(5,4) NOT NULL CHECK (bust_risk >= 0 AND bust_risk <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_player_development_profiles UNIQUE (player_id, save_game_id)
);

CREATE INDEX IF NOT EXISTS idx_player_development_save_game ON public.player_development_profiles(save_game_id);

-- =====================================================
-- Scouted player perceptions (what org knows)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.scouted_player_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,

  scouting_confidence INTEGER NOT NULL CHECK (scouting_confidence BETWEEN 0 AND 100),
  est_overall_low INTEGER NOT NULL CHECK (est_overall_low BETWEEN 0 AND 100),
  est_overall_high INTEGER NOT NULL CHECK (est_overall_high BETWEEN 0 AND 100),
  est_potential_low INTEGER NOT NULL CHECK (est_potential_low BETWEEN 0 AND 100),
  est_potential_high INTEGER NOT NULL CHECK (est_potential_high BETWEEN 0 AND 100),
  scheme_fit_assessment public.scheme_type[] NOT NULL DEFAULT '{}',
  character_assessment public.scout_character_assessment NOT NULL,
  scout_notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_scouted_player_overall_band CHECK (est_overall_low <= est_overall_high),
  CONSTRAINT ck_scouted_player_potential_band CHECK (est_potential_low <= est_potential_high),
  CONSTRAINT uq_scouted_player_report UNIQUE (player_id, save_game_id, team_id)
);

CREATE TABLE IF NOT EXISTS public.scouted_player_report_scouts (
  report_id UUID NOT NULL REFERENCES public.scouted_player_reports(id) ON DELETE CASCADE,
  scout_id UUID NOT NULL REFERENCES public.scouts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (report_id, scout_id)
);

CREATE TABLE IF NOT EXISTS public.scouted_player_attribute_estimates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.scouted_player_reports(id) ON DELETE CASCADE,
  attribute_key TEXT NOT NULL,
  est_low INTEGER NOT NULL CHECK (est_low BETWEEN 0 AND 100),
  est_high INTEGER NOT NULL CHECK (est_high BETWEEN 0 AND 100),
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_scouted_player_attribute_band CHECK (est_low <= est_high),
  CONSTRAINT uq_scouted_player_attribute_estimate UNIQUE (report_id, attribute_key)
);

CREATE INDEX IF NOT EXISTS idx_scouted_player_reports_lookup ON public.scouted_player_reports(save_game_id, team_id, player_id);

-- =====================================================
-- Coach personnel model and sim bridge
-- =====================================================
CREATE TABLE IF NOT EXISTS public.head_coach_personnel_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,

  game_management INTEGER NOT NULL CHECK (game_management BETWEEN 0 AND 100),
  player_development INTEGER NOT NULL CHECK (player_development BETWEEN 0 AND 100),
  play_design INTEGER NOT NULL CHECK (play_design BETWEEN 0 AND 100),
  locker_room INTEGER NOT NULL CHECK (locker_room BETWEEN 0 AND 100),
  recruiting INTEGER NOT NULL CHECK (recruiting BETWEEN 0 AND 100),
  pressure_handling INTEGER NOT NULL CHECK (pressure_handling BETWEEN 0 AND 100),
  adaptability INTEGER NOT NULL CHECK (adaptability BETWEEN 0 AND 100),

  offensive_scheme public.scheme_type NOT NULL,
  defensive_scheme public.scheme_type NOT NULL,
  scheme_flexibility INTEGER NOT NULL CHECK (scheme_flexibility BETWEEN 0 AND 100),

  personality_ego_level INTEGER NOT NULL CHECK (personality_ego_level BETWEEN 0 AND 100),
  personality_player_friendly INTEGER NOT NULL CHECK (personality_player_friendly BETWEEN 0 AND 100),
  personality_media_relations INTEGER NOT NULL CHECK (personality_media_relations BETWEEN 0 AND 100),
  personality_loyalty_to_staff INTEGER NOT NULL CHECK (personality_loyalty_to_staff BETWEEN 0 AND 100),
  personality_risk_tolerance INTEGER NOT NULL CHECK (personality_risk_tolerance BETWEEN 0 AND 100),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_head_coach_personnel_profiles UNIQUE (coach_id, save_game_id)
);

CREATE TABLE IF NOT EXISTS public.coordinator_personnel_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('OC', 'DC', 'ST', 'QB', 'RB', 'WR', 'OL', 'DL', 'LB', 'DB')),
  scheme_expertise public.scheme_type[] NOT NULL DEFAULT '{}',
  player_development_bonus INTEGER NOT NULL CHECK (player_development_bonus BETWEEN 0 AND 100),
  recruiting_influence INTEGER NOT NULL CHECK (recruiting_influence BETWEEN 0 AND 100),
  head_coach_potential INTEGER NOT NULL CHECK (head_coach_potential BETWEEN 0 AND 100),
  compatibility INTEGER NOT NULL CHECK (compatibility BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_coordinator_personnel_profiles UNIQUE (coach_id, save_game_id)
);

CREATE TABLE IF NOT EXISTS public.coach_sim_attributes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  role TEXT NOT NULL,

  leadership INTEGER NOT NULL CHECK (leadership BETWEEN 0 AND 100),
  football_iq INTEGER NOT NULL CHECK (football_iq BETWEEN 0 AND 100),
  motivation INTEGER NOT NULL CHECK (motivation BETWEEN 0 AND 100),
  adaptability INTEGER NOT NULL CHECK (adaptability BETWEEN 0 AND 100),

  offensive_run_frequency NUMERIC(5,4) CHECK (offensive_run_frequency BETWEEN 0 AND 1),
  offensive_deep_pass_rate NUMERIC(5,4) CHECK (offensive_deep_pass_rate BETWEEN 0 AND 1),
  offensive_screen_rate NUMERIC(5,4) CHECK (offensive_screen_rate BETWEEN 0 AND 1),
  offensive_rpo_rate NUMERIC(5,4) CHECK (offensive_rpo_rate BETWEEN 0 AND 1),
  offensive_fourth_down_aggression NUMERIC(5,4) CHECK (offensive_fourth_down_aggression BETWEEN 0 AND 1),

  defensive_blitz_rate NUMERIC(5,4) CHECK (defensive_blitz_rate BETWEEN 0 AND 1),
  defensive_coverage_type public.scheme_type,
  defensive_press_rate NUMERIC(5,4) CHECK (defensive_press_rate BETWEEN 0 AND 1),
  defensive_safety_position TEXT CHECK (defensive_safety_position IN ('deep', 'mixed', 'box')),

  source_personnel_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_coach_sim_attributes UNIQUE (coach_id, save_game_id)
);

-- =====================================================
-- GM / Scout / Owner profiles
-- =====================================================
CREATE TABLE IF NOT EXISTS public.gm_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gm_id UUID NOT NULL,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,

  drafting INTEGER NOT NULL CHECK (drafting BETWEEN 0 AND 100),
  trading INTEGER NOT NULL CHECK (trading BETWEEN 0 AND 100),
  free_agency INTEGER NOT NULL CHECK (free_agency BETWEEN 0 AND 100),
  cap_management INTEGER NOT NULL CHECK (cap_management BETWEEN 0 AND 100),
  coach_evaluation INTEGER NOT NULL CHECK (coach_evaluation BETWEEN 0 AND 100),
  scout_management INTEGER NOT NULL CHECK (scout_management BETWEEN 0 AND 100),

  risk_tolerance INTEGER NOT NULL CHECK (risk_tolerance BETWEEN 0 AND 100),
  loyalty INTEGER NOT NULL CHECK (loyalty BETWEEN 0 AND 100),
  scheme_conviction INTEGER NOT NULL CHECK (scheme_conviction BETWEEN 0 AND 100),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_gm_profiles UNIQUE (gm_id, save_game_id)
);

CREATE TABLE IF NOT EXISTS public.scout_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scout_id UUID NOT NULL REFERENCES public.scouts(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,

  evaluation INTEGER NOT NULL CHECK (evaluation BETWEEN 0 AND 100),
  football_iq INTEGER NOT NULL CHECK (football_iq BETWEEN 0 AND 100),
  athletic_analysis INTEGER NOT NULL CHECK (athletic_analysis BETWEEN 0 AND 100),
  psych_insight INTEGER NOT NULL CHECK (psych_insight BETWEEN 0 AND 100),
  projection_ability INTEGER NOT NULL CHECK (projection_ability BETWEEN 0 AND 100),

  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  experience INTEGER NOT NULL CHECK (experience >= 0),
  overall_accuracy INTEGER GENERATED ALWAYS AS (
    ROUND((evaluation + football_iq + athletic_analysis + psych_insight + projection_ability)::numeric / 5)
  ) STORED,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_scout_profiles UNIQUE (scout_id, save_game_id)
);

CREATE TABLE IF NOT EXISTS public.scout_position_specialties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scout_profile_id UUID NOT NULL REFERENCES public.scout_profiles(id) ON DELETE CASCADE,
  position_group TEXT NOT NULL CHECK (position_group IN ('QB', 'skill', 'OL', 'DL', 'LB', 'DB', 'ST')),
  specialty_rating INTEGER NOT NULL CHECK (specialty_rating BETWEEN 0 AND 100),
  CONSTRAINT uq_scout_position_specialties UNIQUE (scout_profile_id, position_group)
);

CREATE TABLE IF NOT EXISTS public.scout_biases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scout_profile_id UUID NOT NULL REFERENCES public.scout_profiles(id) ON DELETE CASCADE,
  bias_type TEXT NOT NULL CHECK (bias_type IN ('overvalues', 'undervalues')),
  attribute TEXT NOT NULL,
  magnitude INTEGER NOT NULL CHECK (magnitude BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS public.owner_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,

  spending_willingness INTEGER NOT NULL CHECK (spending_willingness BETWEEN 0 AND 100),
  patience_level INTEGER NOT NULL CHECK (patience_level BETWEEN 0 AND 100),
  meddling_tendency INTEGER NOT NULL CHECK (meddling_tendency BETWEEN 0 AND 100),
  market_pressure INTEGER NOT NULL CHECK (market_pressure BETWEEN 0 AND 100),
  win_now_bias INTEGER NOT NULL CHECK (win_now_bias BETWEEN 0 AND 100),

  trust_in_gm INTEGER NOT NULL CHECK (trust_in_gm BETWEEN 0 AND 100),
  trust_in_hc INTEGER NOT NULL CHECK (trust_in_hc BETWEEN 0 AND 100),
  satisfaction_level INTEGER NOT NULL CHECK (satisfaction_level BETWEEN 0 AND 100),
  patience INTEGER NOT NULL CHECK (patience BETWEEN 0 AND 100),

  hot_seat_threshold INTEGER NOT NULL CHECK (hot_seat_threshold BETWEEN 0 AND 100),
  firing_threshold INTEGER NOT NULL CHECK (firing_threshold BETWEEN 0 AND 100),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_owner_profiles UNIQUE (owner_id, save_game_id)
);

-- =====================================================
-- Relationship system (first-class)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.relationships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,

  entity_a_type public.relationship_entity_type NOT NULL,
  entity_a_id UUID NOT NULL,
  entity_b_type public.relationship_entity_type NOT NULL,
  entity_b_id UUID NOT NULL,

  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  trend public.relationship_trend NOT NULL DEFAULT 'stable',
  entity_low_key TEXT NOT NULL,
  entity_high_key TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_relationship_not_self CHECK (NOT (entity_a_type = entity_b_type AND entity_a_id = entity_b_id)),
  CONSTRAINT ck_relationship_keys_sorted CHECK (entity_low_key <= entity_high_key),
  CONSTRAINT uq_relationship_pair UNIQUE (save_game_id, entity_low_key, entity_high_key)
);

CREATE OR REPLACE FUNCTION public.set_relationship_canonical_keys()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  key_a TEXT;
  key_b TEXT;
BEGIN
  key_a := NEW.entity_a_type::text || ':' || NEW.entity_a_id::text;
  key_b := NEW.entity_b_type::text || ':' || NEW.entity_b_id::text;

  IF key_a <= key_b THEN
    NEW.entity_low_key := key_a;
    NEW.entity_high_key := key_b;
  ELSE
    NEW.entity_low_key := key_b;
    NEW.entity_high_key := key_a;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS relationships_set_canonical_keys ON public.relationships;
CREATE TRIGGER relationships_set_canonical_keys
BEFORE INSERT OR UPDATE ON public.relationships
FOR EACH ROW
EXECUTE FUNCTION public.set_relationship_canonical_keys();

CREATE TABLE IF NOT EXISTS public.relationship_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  relationship_id UUID NOT NULL REFERENCES public.relationships(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  week INTEGER NOT NULL CHECK (week BETWEEN 1 AND 25),
  season INTEGER NOT NULL CHECK (season >= 1900),
  event_type public.relationship_event_type NOT NULL,
  delta_score INTEGER NOT NULL CHECK (delta_score BETWEEN -100 AND 100),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relationships_lookup_a ON public.relationships(save_game_id, entity_a_type, entity_a_id);
CREATE INDEX IF NOT EXISTS idx_relationships_lookup_b ON public.relationships(save_game_id, entity_b_type, entity_b_id);
CREATE INDEX IF NOT EXISTS idx_relationship_events_timeline ON public.relationship_events(save_game_id, season, week);

-- =====================================================
-- Optional computed snapshot storage for history (non-canonical)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.team_strength_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  season INTEGER NOT NULL CHECK (season >= 1900),
  week INTEGER NOT NULL CHECK (week BETWEEN 1 AND 25),

  offensive_rating NUMERIC(6,2) NOT NULL,
  defensive_rating NUMERIC(6,2) NOT NULL,
  special_teams_rating NUMERIC(6,2) NOT NULL,
  chemistry_modifier NUMERIC(5,4) NOT NULL,
  scheme_coherence_modifier NUMERIC(5,4) NOT NULL,
  depth_modifier NUMERIC(5,4) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_team_strength_snapshot UNIQUE (save_game_id, team_id, season, week)
);

COMMENT ON TABLE public.team_strength_snapshots IS 'Historical outputs from computeTeamStrength. Not canonical team state.';

-- =====================================================
-- RLS and permissive policies (project-default style)
-- =====================================================
ALTER TABLE public.player_true_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_true_rating_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_scheme_fit_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_development_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scouted_player_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scouted_player_report_scouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scouted_player_attribute_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.head_coach_personnel_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordinator_personnel_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_sim_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gm_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scout_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scout_position_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scout_biases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_strength_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on player_true_profiles" ON public.player_true_profiles;
CREATE POLICY "Allow all on player_true_profiles" ON public.player_true_profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on player_true_rating_attributes" ON public.player_true_rating_attributes;
CREATE POLICY "Allow all on player_true_rating_attributes" ON public.player_true_rating_attributes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on player_scheme_fit_profiles" ON public.player_scheme_fit_profiles;
CREATE POLICY "Allow all on player_scheme_fit_profiles" ON public.player_scheme_fit_profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on player_development_profiles" ON public.player_development_profiles;
CREATE POLICY "Allow all on player_development_profiles" ON public.player_development_profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scouted_player_reports" ON public.scouted_player_reports;
CREATE POLICY "Allow all on scouted_player_reports" ON public.scouted_player_reports FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scouted_player_report_scouts" ON public.scouted_player_report_scouts;
CREATE POLICY "Allow all on scouted_player_report_scouts" ON public.scouted_player_report_scouts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scouted_player_attribute_estimates" ON public.scouted_player_attribute_estimates;
CREATE POLICY "Allow all on scouted_player_attribute_estimates" ON public.scouted_player_attribute_estimates FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on head_coach_personnel_profiles" ON public.head_coach_personnel_profiles;
CREATE POLICY "Allow all on head_coach_personnel_profiles" ON public.head_coach_personnel_profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on coordinator_personnel_profiles" ON public.coordinator_personnel_profiles;
CREATE POLICY "Allow all on coordinator_personnel_profiles" ON public.coordinator_personnel_profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on coach_sim_attributes" ON public.coach_sim_attributes;
CREATE POLICY "Allow all on coach_sim_attributes" ON public.coach_sim_attributes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on gm_profiles" ON public.gm_profiles;
CREATE POLICY "Allow all on gm_profiles" ON public.gm_profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scout_profiles" ON public.scout_profiles;
CREATE POLICY "Allow all on scout_profiles" ON public.scout_profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scout_position_specialties" ON public.scout_position_specialties;
CREATE POLICY "Allow all on scout_position_specialties" ON public.scout_position_specialties FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scout_biases" ON public.scout_biases;
CREATE POLICY "Allow all on scout_biases" ON public.scout_biases FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on owner_profiles" ON public.owner_profiles;
CREATE POLICY "Allow all on owner_profiles" ON public.owner_profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on relationships" ON public.relationships;
CREATE POLICY "Allow all on relationships" ON public.relationships FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on relationship_events" ON public.relationship_events;
CREATE POLICY "Allow all on relationship_events" ON public.relationship_events FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on team_strength_snapshots" ON public.team_strength_snapshots;
CREATE POLICY "Allow all on team_strength_snapshots" ON public.team_strength_snapshots FOR ALL USING (true) WITH CHECK (true);
