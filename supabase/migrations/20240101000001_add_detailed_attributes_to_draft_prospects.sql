-- Add all detailed attributes to draft_prospects table
-- This mirrors the players table structure for the enhanced simulation engine

-- ============================================================================
-- PHYSICAL ATTRIBUTES
-- ============================================================================
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS spd INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS acc INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS agi INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS str INTEGER;

-- ============================================================================
-- QUARTERBACK/PASSING ATTRIBUTES
-- ============================================================================
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS thp INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS sac INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS mac INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS dac INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS tup INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS pac INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS dec INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS awr INTEGER;

-- ============================================================================
-- BALL CARRIER/BLOCKING ATTRIBUTES
-- ============================================================================
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS btk INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS car INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS vsn INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS rtr INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS pblk INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS rblk INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS iblk INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS agg INTEGER;

-- ============================================================================
-- RECEIVING ATTRIBUTES
-- ============================================================================
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS rls INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS rte INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS cth INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS cit INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS yac INTEGER;

-- ============================================================================
-- DEFENSIVE LINE/PASS RUSH ATTRIBUTES
-- ============================================================================
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS pmv INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS fmv INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS bsh INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS pur INTEGER;

-- ============================================================================
-- LINEBACKER/DEFENSIVE ATTRIBUTES
-- ============================================================================
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS tak INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS cov INTEGER;

-- ============================================================================
-- COVERAGE ATTRIBUTES
-- ============================================================================
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS mcv INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS zcv INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS prs INTEGER;

-- ============================================================================
-- KICKING ATTRIBUTES
-- ============================================================================
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS kpw INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS kac INTEGER;

-- ============================================================================
-- TECHNICAL SKILLS
-- ============================================================================
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS footwork INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS hand_placement INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS release_tech INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS hand_tech INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS mechanics INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS decision_time INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS leverage INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS move_set INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS backpedal INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS ball_skills INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS play_recognition INTEGER;

-- ============================================================================
-- MENTAL/CHARACTER ATTRIBUTES
-- ============================================================================
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS football_iq INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS motor INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS work_ethic INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS coachability INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS leadership INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS durability INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS consistency INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS injury_risk INTEGER;

-- ============================================================================
-- PROJECTION/SCOUTING ATTRIBUTES
-- ============================================================================
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS athletic_ceiling INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS technique_ceiling INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS mental_ceiling INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS breakout_probability INTEGER;
ALTER TABLE public.draft_prospects ADD COLUMN IF NOT EXISTS bust_probability INTEGER;

-- ============================================================================
-- CLEANUP: Remove deprecated traits JSONB column
-- ============================================================================
ALTER TABLE public.draft_prospects DROP COLUMN IF EXISTS traits;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE public.draft_prospects IS 'Draft prospects for each season, isolated by save game. Now includes all 71 detailed attributes for enhanced simulation engine.';

-- Physical attributes
COMMENT ON COLUMN public.draft_prospects.spd IS 'Speed rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.acc IS 'Acceleration rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.agi IS 'Agility rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.str IS 'Strength rating (0-99)';

-- QB/Passing attributes
COMMENT ON COLUMN public.draft_prospects.thp IS 'Throw Power (0-99)';
COMMENT ON COLUMN public.draft_prospects.sac IS 'Short Accuracy (0-99)';
COMMENT ON COLUMN public.draft_prospects.mac IS 'Medium Accuracy (0-99)';
COMMENT ON COLUMN public.draft_prospects.dac IS 'Deep Accuracy (0-99)';
COMMENT ON COLUMN public.draft_prospects.tup IS 'Throw Under Pressure (0-99)';
COMMENT ON COLUMN public.draft_prospects.pac IS 'Play Action (0-99)';
COMMENT ON COLUMN public.draft_prospects.dec IS 'Decision Making (0-99)';
COMMENT ON COLUMN public.draft_prospects.awr IS 'Awareness (0-99)';

-- Ball carrier/blocking
COMMENT ON COLUMN public.draft_prospects.btk IS 'Break Tackle (0-99)';
COMMENT ON COLUMN public.draft_prospects.car IS 'Carrying (0-99)';
COMMENT ON COLUMN public.draft_prospects.vsn IS 'Vision (0-99)';
COMMENT ON COLUMN public.draft_prospects.rtr IS 'Route Running (0-99)';
COMMENT ON COLUMN public.draft_prospects.pblk IS 'Pass Block (0-99)';
COMMENT ON COLUMN public.draft_prospects.rblk IS 'Run Block (0-99)';
COMMENT ON COLUMN public.draft_prospects.iblk IS 'Impact Block (0-99)';
COMMENT ON COLUMN public.draft_prospects.agg IS 'Aggression (0-99)';

-- Receiving
COMMENT ON COLUMN public.draft_prospects.rls IS 'Release (0-99)';
COMMENT ON COLUMN public.draft_prospects.rte IS 'Route Running (0-99)';
COMMENT ON COLUMN public.draft_prospects.cth IS 'Catching (0-99)';
COMMENT ON COLUMN public.draft_prospects.cit IS 'Catch In Traffic (0-99)';
COMMENT ON COLUMN public.draft_prospects.yac IS 'Yards After Catch (0-99)';

-- Defensive line
COMMENT ON COLUMN public.draft_prospects.pmv IS 'Power Moves (0-99)';
COMMENT ON COLUMN public.draft_prospects.fmv IS 'Finesse Moves (0-99)';
COMMENT ON COLUMN public.draft_prospects.bsh IS 'Block Shedding (0-99)';
COMMENT ON COLUMN public.draft_prospects.pur IS 'Pursuit (0-99)';

-- Linebacker/defensive
COMMENT ON COLUMN public.draft_prospects.tak IS 'Tackling (0-99)';
COMMENT ON COLUMN public.draft_prospects.cov IS 'Coverage (0-99)';

-- Coverage
COMMENT ON COLUMN public.draft_prospects.mcv IS 'Man Coverage (0-99)';
COMMENT ON COLUMN public.draft_prospects.zcv IS 'Zone Coverage (0-99)';
COMMENT ON COLUMN public.draft_prospects.prs IS 'Press (0-99)';

-- Kicking
COMMENT ON COLUMN public.draft_prospects.kpw IS 'Kick Power (0-99)';
COMMENT ON COLUMN public.draft_prospects.kac IS 'Kick Accuracy (0-99)';

-- Technical skills
COMMENT ON COLUMN public.draft_prospects.footwork IS 'Footwork rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.hand_placement IS 'Hand Placement rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.release_tech IS 'Release Technique rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.hand_tech IS 'Hand Technique rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.mechanics IS 'Mechanics rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.decision_time IS 'Decision Time rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.leverage IS 'Leverage rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.move_set IS 'Move Set rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.backpedal IS 'Backpedal rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.ball_skills IS 'Ball Skills rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.play_recognition IS 'Play Recognition rating (0-99)';

-- Mental/character
COMMENT ON COLUMN public.draft_prospects.football_iq IS 'Football IQ rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.motor IS 'Motor rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.work_ethic IS 'Work Ethic rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.coachability IS 'Coachability rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.leadership IS 'Leadership rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.durability IS 'Durability rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.consistency IS 'Consistency rating (0-99)';
COMMENT ON COLUMN public.draft_prospects.injury_risk IS 'Injury Risk rating (0-99, higher = more risk)';

-- Projection/scouting
COMMENT ON COLUMN public.draft_prospects.athletic_ceiling IS 'Athletic Ceiling projection (0-99)';
COMMENT ON COLUMN public.draft_prospects.technique_ceiling IS 'Technique Ceiling projection (0-99)';
COMMENT ON COLUMN public.draft_prospects.mental_ceiling IS 'Mental Ceiling projection (0-99)';
COMMENT ON COLUMN public.draft_prospects.breakout_probability IS 'Breakout Probability percentage (0-100)';
COMMENT ON COLUMN public.draft_prospects.bust_probability IS 'Bust Probability percentage (0-100)';



