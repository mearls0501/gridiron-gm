-- Migration: Ensure players table has all necessary columns for seed data
-- This migration is idempotent and ensures all expected columns exist

-- ============================================================================
-- BASIC PLAYER INFO
-- ============================================================================
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT 'Unknown Player';

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS position TEXT;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS age INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS college TEXT;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS archetype TEXT;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS overall INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS potential INTEGER;

-- Status columns
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS is_free_agent BOOLEAN DEFAULT FALSE;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS is_rookie BOOLEAN DEFAULT FALSE;

-- Team assignment (for seed data only - actual assignments in player_team_assignments)
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

-- ============================================================================
-- PHYSICAL ATTRIBUTES
-- ============================================================================
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS spd INTEGER; -- Speed

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS acc INTEGER; -- Acceleration

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS agi INTEGER; -- Agility

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS str INTEGER; -- Strength

-- ============================================================================
-- QUARTERBACK/PASSING ATTRIBUTES
-- ============================================================================
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS thp INTEGER; -- Throw Power

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS sac INTEGER; -- Short Accuracy

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS mac INTEGER; -- Medium Accuracy

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS dac INTEGER; -- Deep Accuracy

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS tup INTEGER; -- Throw Under Pressure

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS pac INTEGER; -- Play Action

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS dec INTEGER; -- Decision Making

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS awr INTEGER; -- Awareness

-- ============================================================================
-- BALL CARRIER/BLOCKING ATTRIBUTES
-- ============================================================================
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS btk INTEGER; -- Break Tackle

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS car INTEGER; -- Carrying

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS vsn INTEGER; -- Vision

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS rtr INTEGER; -- Route Running

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS pblk INTEGER; -- Pass Block

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS rblk INTEGER; -- Run Block

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS iblk INTEGER; -- Impact Block

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS agg INTEGER; -- Aggression

-- ============================================================================
-- RECEIVING ATTRIBUTES
-- ============================================================================
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS rls INTEGER; -- Release

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS rte INTEGER; -- Route Running (alternate)

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS cth INTEGER; -- Catching

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS cit INTEGER; -- Catch In Traffic

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS yac INTEGER; -- Yards After Catch

-- ============================================================================
-- DEFENSIVE LINE/PASS RUSH ATTRIBUTES
-- ============================================================================
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS pmv INTEGER; -- Power Moves

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS fmv INTEGER; -- Finesse Moves

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS bsh INTEGER; -- Block Shedding

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS pur INTEGER; -- Pursuit

-- ============================================================================
-- LINEBACKER/DEFENSIVE ATTRIBUTES
-- ============================================================================
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS tak INTEGER; -- Tackling

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS cov INTEGER; -- Coverage

-- ============================================================================
-- COVERAGE ATTRIBUTES
-- ============================================================================
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS mcv INTEGER; -- Man Coverage

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS zcv INTEGER; -- Zone Coverage

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS prs INTEGER; -- Press

-- ============================================================================
-- KICKING ATTRIBUTES
-- ============================================================================
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS kpw INTEGER; -- Kick Power

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS kac INTEGER; -- Kick Accuracy

-- ============================================================================
-- TECHNICAL SKILLS (lowercase for these ones as they seem to be text/descriptive)
-- ============================================================================
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS footwork INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS hand_placement INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS release_tech INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS hand_tech INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS mechanics INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS decision_time INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS leverage INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS move_set INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS backpedal INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS ball_skills INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS play_recognition INTEGER;

-- ============================================================================
-- MENTAL/CHARACTER ATTRIBUTES
-- ============================================================================
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS football_iq INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS motor INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS work_ethic INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS coachability INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS leadership INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS durability INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS consistency INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS injury_risk INTEGER;

-- ============================================================================
-- PROJECTION/SCOUTING ATTRIBUTES
-- ============================================================================
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS athletic_ceiling INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS technique_ceiling INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS mental_ceiling INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS breakout_probability INTEGER;

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS bust_probability INTEGER;

-- ============================================================================
-- CLEANUP: Remove deprecated columns
-- ============================================================================
-- Remove save_game_id if it exists (this was removed in a separate migration)
ALTER TABLE public.players 
DROP COLUMN IF EXISTS save_game_id;

-- Remove contract columns if they exist (these are now in player_contracts tables)
ALTER TABLE public.players 
DROP COLUMN IF EXISTS contract_year_1,
DROP COLUMN IF EXISTS contract_year_2,
DROP COLUMN IF EXISTS contract_year_3,
DROP COLUMN IF EXISTS contract_year_4,
DROP COLUMN IF EXISTS signing_bonus;

-- Remove old generic traits column if it exists
ALTER TABLE public.players 
DROP COLUMN IF EXISTS traits;

-- ============================================================================
-- INDEXES for common queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_players_position ON public.players(position);
CREATE INDEX IF NOT EXISTS idx_players_team ON public.players(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_players_free_agent ON public.players(is_free_agent) WHERE is_free_agent = TRUE;
CREATE INDEX IF NOT EXISTS idx_players_rookie ON public.players(is_rookie) WHERE is_rookie = TRUE;
CREATE INDEX IF NOT EXISTS idx_players_overall ON public.players(overall);
CREATE INDEX IF NOT EXISTS idx_players_potential ON public.players(potential);
CREATE INDEX IF NOT EXISTS idx_players_age ON public.players(age);

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================
COMMENT ON TABLE public.players IS 'Base player seed data shared across all save games. Contains immutable player attributes including physical, mental, and technical ratings. Contracts are in player_contract_seed_data (seed) and player_contracts_per_save_game (per-save-game). Team assignments per save game are in player_team_assignments table. Free agent availability per save game is in free_agent_availability table.';

-- Basic info comments
COMMENT ON COLUMN public.players.full_name IS 'Player full name';
COMMENT ON COLUMN public.players.position IS 'Player position (QB, RB, WR, TE, OT, OG, C, DE, DT, LB, CB, S, K, P)';
COMMENT ON COLUMN public.players.age IS 'Player age';
COMMENT ON COLUMN public.players.college IS 'College the player attended';
COMMENT ON COLUMN public.players.archetype IS 'Player archetype/play style';
COMMENT ON COLUMN public.players.overall IS 'Overall rating (0-99)';
COMMENT ON COLUMN public.players.potential IS 'Potential rating (0-99)';
COMMENT ON COLUMN public.players.is_free_agent IS 'Whether the player is a free agent in seed data (actual FA status per game is in free_agent_availability table)';
COMMENT ON COLUMN public.players.is_rookie IS 'Whether the player is a rookie';
COMMENT ON COLUMN public.players.team_id IS 'Seed data team assignment (actual team per save game is in player_team_assignments table)';

-- Physical attributes comments
COMMENT ON COLUMN public.players.spd IS 'Speed rating (0-99)';
COMMENT ON COLUMN public.players.acc IS 'Acceleration rating (0-99)';
COMMENT ON COLUMN public.players.agi IS 'Agility rating (0-99)';
COMMENT ON COLUMN public.players.str IS 'Strength rating (0-99)';

-- Passing attributes comments
COMMENT ON COLUMN public.players.thp IS 'Throw Power (0-99)';
COMMENT ON COLUMN public.players.sac IS 'Short Accuracy (0-99)';
COMMENT ON COLUMN public.players.mac IS 'Medium Accuracy (0-99)';
COMMENT ON COLUMN public.players.dac IS 'Deep Accuracy (0-99)';
COMMENT ON COLUMN public.players.tup IS 'Throw Under Pressure (0-99)';
COMMENT ON COLUMN public.players.pac IS 'Play Action (0-99)';
COMMENT ON COLUMN public.players.dec IS 'Decision Making (0-99)';
COMMENT ON COLUMN public.players.awr IS 'Awareness (0-99)';

-- Ball carrier/blocking comments
COMMENT ON COLUMN public.players.btk IS 'Break Tackle (0-99)';
COMMENT ON COLUMN public.players.car IS 'Carrying (0-99)';
COMMENT ON COLUMN public.players.vsn IS 'Vision (0-99)';
COMMENT ON COLUMN public.players.rtr IS 'Route Running (0-99)';
COMMENT ON COLUMN public.players.pblk IS 'Pass Block (0-99)';
COMMENT ON COLUMN public.players.rblk IS 'Run Block (0-99)';
COMMENT ON COLUMN public.players.iblk IS 'Impact Block (0-99)';
COMMENT ON COLUMN public.players.agg IS 'Aggression (0-99)';

-- Receiving comments
COMMENT ON COLUMN public.players.rls IS 'Release (0-99)';
COMMENT ON COLUMN public.players.rte IS 'Route Running (0-99)';
COMMENT ON COLUMN public.players.cth IS 'Catching (0-99)';
COMMENT ON COLUMN public.players.cit IS 'Catch In Traffic (0-99)';
COMMENT ON COLUMN public.players.yac IS 'Yards After Catch (0-99)';

-- Defensive line comments
COMMENT ON COLUMN public.players.pmv IS 'Power Moves (0-99)';
COMMENT ON COLUMN public.players.fmv IS 'Finesse Moves (0-99)';
COMMENT ON COLUMN public.players.bsh IS 'Block Shedding (0-99)';
COMMENT ON COLUMN public.players.pur IS 'Pursuit (0-99)';

-- Linebacker/defensive comments
COMMENT ON COLUMN public.players.tak IS 'Tackling (0-99)';
COMMENT ON COLUMN public.players.cov IS 'Coverage (0-99)';

-- Coverage comments
COMMENT ON COLUMN public.players.mcv IS 'Man Coverage (0-99)';
COMMENT ON COLUMN public.players.zcv IS 'Zone Coverage (0-99)';
COMMENT ON COLUMN public.players.prs IS 'Press (0-99)';

-- Kicking comments
COMMENT ON COLUMN public.players.kpw IS 'Kick Power (0-99)';
COMMENT ON COLUMN public.players.kac IS 'Kick Accuracy (0-99)';

-- Technical skills comments
COMMENT ON COLUMN public.players.footwork IS 'Footwork rating (0-99)';
COMMENT ON COLUMN public.players.hand_placement IS 'Hand Placement rating (0-99)';
COMMENT ON COLUMN public.players.release_tech IS 'Release Technique rating (0-99)';
COMMENT ON COLUMN public.players.hand_tech IS 'Hand Technique rating (0-99)';
COMMENT ON COLUMN public.players.mechanics IS 'Mechanics rating (0-99)';
COMMENT ON COLUMN public.players.decision_time IS 'Decision Time rating (0-99)';
COMMENT ON COLUMN public.players.leverage IS 'Leverage rating (0-99)';
COMMENT ON COLUMN public.players.move_set IS 'Move Set rating (0-99)';
COMMENT ON COLUMN public.players.backpedal IS 'Backpedal rating (0-99)';
COMMENT ON COLUMN public.players.ball_skills IS 'Ball Skills rating (0-99)';
COMMENT ON COLUMN public.players.play_recognition IS 'Play Recognition rating (0-99)';

-- Mental/character comments
COMMENT ON COLUMN public.players.football_iq IS 'Football IQ rating (0-99)';
COMMENT ON COLUMN public.players.motor IS 'Motor rating (0-99)';
COMMENT ON COLUMN public.players.work_ethic IS 'Work Ethic rating (0-99)';
COMMENT ON COLUMN public.players.coachability IS 'Coachability rating (0-99)';
COMMENT ON COLUMN public.players.leadership IS 'Leadership rating (0-99)';
COMMENT ON COLUMN public.players.durability IS 'Durability rating (0-99)';
COMMENT ON COLUMN public.players.consistency IS 'Consistency rating (0-99)';
COMMENT ON COLUMN public.players.injury_risk IS 'Injury Risk rating (0-99, higher = more risk)';

-- Projection/scouting comments
COMMENT ON COLUMN public.players.athletic_ceiling IS 'Athletic Ceiling projection (0-99)';
COMMENT ON COLUMN public.players.technique_ceiling IS 'Technique Ceiling projection (0-99)';
COMMENT ON COLUMN public.players.mental_ceiling IS 'Mental Ceiling projection (0-99)';
COMMENT ON COLUMN public.players.breakout_probability IS 'Breakout Probability percentage (0-100)';
COMMENT ON COLUMN public.players.bust_probability IS 'Bust Probability percentage (0-100)';
