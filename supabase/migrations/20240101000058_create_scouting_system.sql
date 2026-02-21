-- Comprehensive scouting system tables
-- This migration creates all tables needed for the scouting system

-- Drop constraint if it exists (for idempotency when re-running migration)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'scouting_staff'
  ) THEN
    ALTER TABLE public.scouting_staff DROP CONSTRAINT IF EXISTS scouting_staff_role_check;
  END IF;
END $$;

-- Scouting staff table
CREATE TABLE IF NOT EXISTS public.scouting_staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('director', 'national', 'regional', 'position')),
  scouting_accuracy INTEGER NOT NULL CHECK (scouting_accuracy >= 0 AND scouting_accuracy <= 100),
  experience INTEGER DEFAULT 0 CHECK (experience >= 0),
  specialty TEXT, -- position or region for specialized scouts
  region TEXT CHECK (region IN ('northeast', 'southeast', 'midwest', 'southwest', 'west_coast')),
  salary DECIMAL(10,2) NOT NULL DEFAULT 0,
  trait_evaluation INTEGER CHECK (trait_evaluation >= 0 AND trait_evaluation <= 100),
  character_evaluation INTEGER CHECK (character_evaluation >= 0 AND character_evaluation <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add constraint if it doesn't exist (for idempotency)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'scouting_staff_role_check'
  ) THEN
    ALTER TABLE public.scouting_staff ADD CONSTRAINT scouting_staff_role_check CHECK (
      (role = 'regional' AND region IS NOT NULL) OR
      (role != 'regional')
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_scouting_staff_team ON public.scouting_staff(team_id);
CREATE INDEX IF NOT EXISTS idx_scouting_staff_region ON public.scouting_staff(region);

-- Scouting reports table (aggregated per prospect, not per method)
CREATE TABLE IF NOT EXISTS public.scouting_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES public.draft_prospects(id) ON DELETE CASCADE,
  scouted_by UUID REFERENCES public.scouting_staff(id) ON DELETE SET NULL,
  total_points_invested INTEGER DEFAULT 0 CHECK (total_points_invested >= 0),
  scouting_progress INTEGER DEFAULT 0 CHECK (scouting_progress >= 0 AND scouting_progress <= 100),
  overall_min INTEGER CHECK (overall_min >= 0 AND overall_min <= 100),
  overall_max INTEGER CHECK (overall_max >= 0 AND overall_max <= 100),
  overall_estimate INTEGER CHECK (overall_estimate >= 0 AND overall_estimate <= 100),
  potential_min INTEGER CHECK (potential_min >= 0 AND potential_min <= 100),
  potential_max INTEGER CHECK (potential_max >= 0 AND potential_max <= 100),
  potential_estimate INTEGER CHECK (potential_estimate >= 0 AND potential_estimate <= 100),
  accuracy_percentage INTEGER CHECK (accuracy_percentage >= 0 AND accuracy_percentage <= 100),
  confidence_level TEXT CHECK (confidence_level IN ('high', 'medium', 'low')),
  traits_scouted JSONB DEFAULT '{}'::jsonb,
  character_assessment JSONB DEFAULT '{}'::jsonb,
  injury_risk TEXT CHECK (injury_risk IN ('low', 'medium', 'high')),
  scheme_fit TEXT,
  scout_notes TEXT,
  methods_used TEXT[] DEFAULT '{}',
  scouted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT scouting_reports_unique UNIQUE(team_id, prospect_id),
  CONSTRAINT scouting_reports_range_check CHECK (
    (overall_min IS NULL AND overall_max IS NULL AND overall_estimate IS NULL) OR
    (overall_min IS NOT NULL AND overall_max IS NOT NULL AND overall_min <= overall_max)
  )
);

-- Scouting history table (tracks individual scouting sessions)
CREATE TABLE IF NOT EXISTS public.scouting_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES public.draft_prospects(id) ON DELETE CASCADE,
  scouted_by UUID REFERENCES public.scouting_staff(id) ON DELETE SET NULL,
  scouting_method TEXT NOT NULL CHECK (scouting_method IN ('initial', 'tape', 'combine', 'pro_day', 'workout', 'medical', 'character')),
  points_spent INTEGER DEFAULT 0 CHECK (points_spent >= 0),
  scouted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scouting_history_team_prospect ON public.scouting_history(team_id, prospect_id);

CREATE INDEX IF NOT EXISTS idx_scouting_reports_team ON public.scouting_reports(team_id);
CREATE INDEX IF NOT EXISTS idx_scouting_reports_prospect ON public.scouting_reports(prospect_id);
CREATE INDEX IF NOT EXISTS idx_scouting_reports_confidence ON public.scouting_reports(confidence_level);
CREATE INDEX IF NOT EXISTS idx_scouting_reports_progress ON public.scouting_reports(scouting_progress);

-- Team scouting resources table
CREATE TABLE IF NOT EXISTS public.team_scouting_resources (
  team_id UUID PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  scouting_points INTEGER DEFAULT 200 CHECK (scouting_points >= 0),
  scouting_budget DECIMAL(12,2) DEFAULT 5000000 CHECK (scouting_budget >= 0),
  points_regenerated_per_week INTEGER DEFAULT 15 CHECK (points_regenerated_per_week >= 0),
  last_regeneration TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT team_scouting_resources_unique UNIQUE(team_id, season)
);

CREATE INDEX IF NOT EXISTS idx_team_scouting_resources_season ON public.team_scouting_resources(season);

-- Scouting events (combine, pro days, etc.)
CREATE TABLE IF NOT EXISTS public.scouting_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('combine', 'pro_day', 'senior_bowl', 'shrine_bowl')),
  event_date DATE NOT NULL,
  location TEXT,
  college TEXT, -- for pro days
  prospects_attending UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scouting_events_season ON public.scouting_events(season);
CREATE INDEX IF NOT EXISTS idx_scouting_events_type ON public.scouting_events(event_type);
CREATE INDEX IF NOT EXISTS idx_scouting_events_date ON public.scouting_events(event_date);

-- Scouting priorities (team-specific prospect watchlists)
CREATE TABLE IF NOT EXISTS public.scouting_priorities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES public.draft_prospects(id) ON DELETE CASCADE,
  priority_level TEXT NOT NULL CHECK (priority_level IN ('high', 'medium', 'low', 'ignore')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT scouting_priorities_unique UNIQUE(team_id, prospect_id)
);

CREATE INDEX IF NOT EXISTS idx_scouting_priorities_team ON public.scouting_priorities(team_id);
CREATE INDEX IF NOT EXISTS idx_scouting_priorities_prospect ON public.scouting_priorities(prospect_id);
CREATE INDEX IF NOT EXISTS idx_scouting_priorities_level ON public.scouting_priorities(priority_level);

-- Enable Row Level Security
ALTER TABLE public.scouting_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scouting_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scouting_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_scouting_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scouting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scouting_priorities ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for now, adjust based on auth needs)
DROP POLICY IF EXISTS "Allow all on scouting_staff" ON public.scouting_staff;
CREATE POLICY "Allow all on scouting_staff" ON public.scouting_staff
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scouting_reports" ON public.scouting_reports;
CREATE POLICY "Allow all on scouting_reports" ON public.scouting_reports
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scouting_history" ON public.scouting_history;
CREATE POLICY "Allow all on scouting_history" ON public.scouting_history
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on team_scouting_resources" ON public.team_scouting_resources;
CREATE POLICY "Allow all on team_scouting_resources" ON public.team_scouting_resources
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scouting_events" ON public.scouting_events;
CREATE POLICY "Allow all on scouting_events" ON public.scouting_events
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scouting_priorities" ON public.scouting_priorities;
CREATE POLICY "Allow all on scouting_priorities" ON public.scouting_priorities
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.scouting_staff IS 'Scouting staff members for each team';
COMMENT ON TABLE public.scouting_reports IS 'Aggregated scouting reports per prospect (one per team/prospect)';
COMMENT ON TABLE public.scouting_history IS 'Individual scouting sessions/history';
COMMENT ON TABLE public.team_scouting_resources IS 'Scouting points and budget tracking per team per season';
COMMENT ON TABLE public.scouting_events IS 'Scouting events like combine, pro days, etc.';
COMMENT ON TABLE public.scouting_priorities IS 'Team-specific prospect priority/watchlist';

