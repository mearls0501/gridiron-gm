-- New Scouting System Migration
-- Complete rebuild with archetype-based scouts, hiring system, and priority assignments
-- This replaces the old scouting_staff system

-- Drop old scouting_staff table if it exists (we're starting fresh)
DROP TABLE IF EXISTS public.scouting_staff CASCADE;

-- 1. Create scouts table (GLOBAL POOL - NO save_game_id)
CREATE TABLE IF NOT EXISTS public.scouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  archetype TEXT NOT NULL CHECK (archetype IN ('evaluator', 'tape_grinder', 'character_coach', 'athletic_analyst')),
  
  -- Core attributes (0-100)
  evaluation INTEGER NOT NULL CHECK (evaluation >= 0 AND evaluation <= 100),
  football_iq INTEGER NOT NULL CHECK (football_iq >= 0 AND football_iq <= 100),
  athletic_analysis INTEGER NOT NULL CHECK (athletic_analysis >= 0 AND athletic_analysis <= 100),
  psych_insight INTEGER NOT NULL CHECK (psych_insight >= 0 AND psych_insight <= 100),
  medical_read INTEGER NOT NULL CHECK (medical_read >= 0 AND medical_read <= 100),
  analytics INTEGER NOT NULL CHECK (analytics >= 0 AND analytics <= 100),
  confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  experience INTEGER NOT NULL DEFAULT 0 CHECK (experience >= 0),
  communication INTEGER NOT NULL CHECK (communication >= 0 AND communication <= 100),
  
  -- Position specialties (0-100, 0 means no specialty)
  qb_specialist INTEGER DEFAULT 0 CHECK (qb_specialist >= 0 AND qb_specialist <= 100),
  wr_specialist INTEGER DEFAULT 0 CHECK (wr_specialist >= 0 AND wr_specialist <= 100),
  ol_specialist INTEGER DEFAULT 0 CHECK (ol_specialist >= 0 AND ol_specialist <= 100),
  dl_specialist INTEGER DEFAULT 0 CHECK (dl_specialist >= 0 AND dl_specialist <= 100),
  db_specialist INTEGER DEFAULT 0 CHECK (db_specialist >= 0 AND db_specialist <= 100),
  rb_specialist INTEGER DEFAULT 0 CHECK (rb_specialist >= 0 AND rb_specialist <= 100),
  
  -- Market attributes
  salary DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (salary >= 0),
  reputation INTEGER NOT NULL DEFAULT 50 CHECK (reputation >= 0 AND reputation <= 100),
  loyalty INTEGER NOT NULL DEFAULT 50 CHECK (loyalty >= 0 AND loyalty <= 100),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scouts_archetype ON public.scouts(archetype);
CREATE INDEX IF NOT EXISTS idx_scouts_reputation ON public.scouts(reputation DESC);

-- 2. Create scout_contracts table (REQUIRES save_game_id)
CREATE TABLE IF NOT EXISTS public.scout_contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  scout_id UUID NOT NULL REFERENCES public.scouts(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  
  salary DECIMAL(10, 2) NOT NULL CHECK (salary >= 0),
  contract_years INTEGER NOT NULL DEFAULT 1 CHECK (contract_years >= 1 AND contract_years <= 5),
  loyalty INTEGER NOT NULL DEFAULT 50 CHECK (loyalty >= 0 AND loyalty <= 100),
  reputation INTEGER NOT NULL DEFAULT 50 CHECK (reputation >= 0 AND reputation <= 100),
  role TEXT NOT NULL CHECK (role IN ('evaluator', 'tape_grinder', 'character_coach', 'athletic_analyst')),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Same scout can be hired by different teams in different save games
  CONSTRAINT scout_contracts_unique UNIQUE(team_id, scout_id, save_game_id)
);

CREATE INDEX IF NOT EXISTS idx_scout_contracts_team ON public.scout_contracts(team_id, save_game_id);
CREATE INDEX IF NOT EXISTS idx_scout_contracts_scout ON public.scout_contracts(scout_id);
CREATE INDEX IF NOT EXISTS idx_scout_contracts_save_game ON public.scout_contracts(save_game_id);

-- 3. Create scout_priority table (REQUIRES save_game_id)
CREATE TABLE IF NOT EXISTS public.scout_priority (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  scout_id UUID NOT NULL REFERENCES public.scouts(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  
  priority INTEGER NOT NULL CHECK (priority >= 1 AND priority <= 4),
  weekly_points INTEGER NOT NULL CHECK (weekly_points IN (25, 15, 10, 5)),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- One priority slot per team per save game per season
  CONSTRAINT scout_priority_unique UNIQUE(team_id, priority, save_game_id, season)
);

CREATE INDEX IF NOT EXISTS idx_scout_priority_team ON public.scout_priority(team_id, save_game_id, season);
CREATE INDEX IF NOT EXISTS idx_scout_priority_scout ON public.scout_priority(scout_id);

-- 4. Create scouted_prospects table (REQUIRES save_game_id)
CREATE TABLE IF NOT EXISTS public.scouted_prospects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES public.draft_prospects(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  
  -- Estimated ranges
  est_overall_low INTEGER CHECK (est_overall_low >= 0 AND est_overall_low <= 100),
  est_overall_high INTEGER CHECK (est_overall_high >= 0 AND est_overall_high <= 100),
  est_potential_low INTEGER CHECK (est_potential_low >= 0 AND est_potential_low <= 100),
  est_potential_high INTEGER CHECK (est_potential_high >= 0 AND est_potential_high <= 100),
  
  -- Revealed information (JSONB)
  trait_reveals JSONB DEFAULT '{}'::jsonb,
  athletic_bands JSONB DEFAULT '{}'::jsonb,
  psych_reveals JSONB DEFAULT '{}'::jsonb,
  
  -- Other reveals
  scheme_fit TEXT,
  confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100),
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- One scouting report per team per prospect per save game
  CONSTRAINT scouted_prospects_unique UNIQUE(team_id, prospect_id, save_game_id),
  
  -- Ensure ranges are valid
  CONSTRAINT scouted_prospects_range_check CHECK (
    (est_overall_low IS NULL AND est_overall_high IS NULL) OR
    (est_overall_low IS NOT NULL AND est_overall_high IS NOT NULL AND est_overall_low <= est_overall_high)
  ),
  CONSTRAINT scouted_prospects_potential_range_check CHECK (
    (est_potential_low IS NULL AND est_potential_high IS NULL) OR
    (est_potential_low IS NOT NULL AND est_potential_high IS NOT NULL AND est_potential_low <= est_potential_high)
  )
);

CREATE INDEX IF NOT EXISTS idx_scouted_prospects_team ON public.scouted_prospects(team_id, save_game_id);
CREATE INDEX IF NOT EXISTS idx_scouted_prospects_prospect ON public.scouted_prospects(prospect_id);
CREATE INDEX IF NOT EXISTS idx_scouted_prospects_save_game ON public.scouted_prospects(save_game_id);

-- 5. Create scouting_actions table (REQUIRES save_game_id)
CREATE TABLE IF NOT EXISTS public.scouting_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES public.draft_prospects(id) ON DELETE CASCADE,
  scout_id UUID NOT NULL REFERENCES public.scouts(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  
  action_type TEXT NOT NULL CHECK (action_type IN ('initial', 'game_tape', 'combine', 'interview', 'medical')),
  points_used INTEGER NOT NULL CHECK (points_used >= 0),
  revealed JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scouting_actions_team ON public.scouting_actions(team_id, save_game_id);
CREATE INDEX IF NOT EXISTS idx_scouting_actions_prospect ON public.scouting_actions(prospect_id);
CREATE INDEX IF NOT EXISTS idx_scouting_actions_scout ON public.scouting_actions(scout_id);
CREATE INDEX IF NOT EXISTS idx_scouting_actions_save_game ON public.scouting_actions(save_game_id);
CREATE INDEX IF NOT EXISTS idx_scouting_actions_created ON public.scouting_actions(created_at DESC);

-- 6. Update draft_prospects table - Add true attributes
DO $$ 
BEGIN
  -- Add true overall and potential (if they don't exist)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_overall') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_overall INTEGER CHECK (true_overall >= 0 AND true_overall <= 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_potential') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_potential INTEGER CHECK (true_potential >= 0 AND true_potential <= 100);
  END IF;
  
  -- Add true physical attributes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_speed') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_speed INTEGER CHECK (true_speed >= 0 AND true_speed <= 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_acceleration') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_acceleration INTEGER CHECK (true_acceleration >= 0 AND true_acceleration <= 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_agility') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_agility INTEGER CHECK (true_agility >= 0 AND true_agility <= 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_strength') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_strength INTEGER CHECK (true_strength >= 0 AND true_strength <= 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_awareness') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_awareness INTEGER CHECK (true_awareness >= 0 AND true_awareness <= 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_instincts') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_instincts INTEGER CHECK (true_instincts >= 0 AND true_instincts <= 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_technique') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_technique INTEGER CHECK (true_technique >= 0 AND true_technique <= 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_burst') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_burst INTEGER CHECK (true_burst >= 0 AND true_burst <= 100);
  END IF;
  
  -- Add true mental/character attributes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_mental_iq') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_mental_iq INTEGER CHECK (true_mental_iq >= 0 AND true_mental_iq <= 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_competitiveness') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_competitiveness INTEGER CHECK (true_competitiveness >= 0 AND true_competitiveness <= 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_coachability') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_coachability INTEGER CHECK (true_coachability >= 0 AND true_coachability <= 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_leadership') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_leadership INTEGER CHECK (true_leadership >= 0 AND true_leadership <= 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_durability') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_durability INTEGER CHECK (true_durability >= 0 AND true_durability <= 100);
  END IF;
  
  -- Add true risk/scheme attributes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_bust_risk') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_bust_risk TEXT CHECK (true_bust_risk IN ('low', 'medium', 'high'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_scheme_fit') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_scheme_fit TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draft_prospects' AND column_name = 'true_playstyle') THEN
    ALTER TABLE public.draft_prospects ADD COLUMN true_playstyle TEXT;
  END IF;
END $$;

-- 7. Ensure team_scouting_resources has save_game_id
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_scouting_resources' AND column_name = 'save_game_id') THEN
    ALTER TABLE public.team_scouting_resources ADD COLUMN save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update unique constraint to include save_game_id
DO $$ 
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_scouting_resources_unique') THEN
    ALTER TABLE public.team_scouting_resources DROP CONSTRAINT team_scouting_resources_unique;
  END IF;
  
  -- Add new constraint with save_game_id
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_scouting_resources_unique_new') THEN
    ALTER TABLE public.team_scouting_resources ADD CONSTRAINT team_scouting_resources_unique_new UNIQUE(team_id, save_game_id, season);
  END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE public.scouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scout_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scout_priority ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scouted_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scouting_actions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all for now, adjust based on auth needs)
DROP POLICY IF EXISTS "Allow all on scouts" ON public.scouts;
CREATE POLICY "Allow all on scouts" ON public.scouts
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scout_contracts" ON public.scout_contracts;
CREATE POLICY "Allow all on scout_contracts" ON public.scout_contracts
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scout_priority" ON public.scout_priority;
CREATE POLICY "Allow all on scout_priority" ON public.scout_priority
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scouted_prospects" ON public.scouted_prospects;
CREATE POLICY "Allow all on scouted_prospects" ON public.scouted_prospects
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scouting_actions" ON public.scouting_actions;
CREATE POLICY "Allow all on scouting_actions" ON public.scouting_actions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.scouts IS 'Global free agent scout pool (shared across all save games)';
COMMENT ON TABLE public.scout_contracts IS 'Team-scout hiring contracts (per save game)';
COMMENT ON TABLE public.scout_priority IS 'Scout priority assignments for weekly point allocation (per save game/season)';
COMMENT ON TABLE public.scouted_prospects IS 'What teams know about prospects (per save game)';
COMMENT ON TABLE public.scouting_actions IS 'Log of all scouting actions performed (per save game)';

