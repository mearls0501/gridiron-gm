-- Create coaches seed table (immutable master data)
-- Similar to players table - used as the initial pool of coaches
-- Coach movement (hired, fired, resigned) is tracked via coach_team_assignments
-- Coach contracts are tracked via coach_contracts table

CREATE TABLE IF NOT EXISTS public.coaches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  
  -- Initial team assignment (seed data only, actual assignments in coach_team_assignments)
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  
  -- Role and archetype
  role TEXT NOT NULL,
  archetype TEXT,
  
  -- Core coaching attributes (0-100 scale)
  leadership NUMERIC CHECK (leadership >= 0 AND leadership <= 100),
  football_iq NUMERIC CHECK (football_iq >= 0 AND football_iq <= 100),
  motivation NUMERIC CHECK (motivation >= 0 AND motivation <= 100),
  adaptability NUMERIC CHECK (adaptability >= 0 AND adaptability <= 100),
  aggressiveness NUMERIC CHECK (aggressiveness >= 0 AND aggressiveness <= 100),
  talent_dev NUMERIC CHECK (talent_dev >= 0 AND talent_dev <= 100),
  scheme_fit NUMERIC CHECK (scheme_fit >= 0 AND scheme_fit <= 100),
  
  -- Offensive attributes
  run_bias NUMERIC CHECK (run_bias >= 0 AND run_bias <= 100),
  pass_bias NUMERIC CHECK (pass_bias >= 0 AND pass_bias <= 100),
  tempo NUMERIC CHECK (tempo >= 0 AND tempo <= 100),
  creativity NUMERIC CHECK (creativity >= 0 AND creativity <= 100),
  red_zone_iq NUMERIC CHECK (red_zone_iq >= 0 AND red_zone_iq <= 100),
  
  -- Defensive attributes
  man_bias NUMERIC CHECK (man_bias >= 0 AND man_bias <= 100),
  zone_bias NUMERIC CHECK (zone_bias >= 0 AND zone_bias <= 100),
  blitz_rate NUMERIC CHECK (blitz_rate >= 0 AND blitz_rate <= 100),
  turnover_focus NUMERIC CHECK (turnover_focus >= 0 AND turnover_focus <= 100),
  bend_break NUMERIC CHECK (bend_break >= 0 AND bend_break <= 100),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_coaches_role ON public.coaches(role);
CREATE INDEX IF NOT EXISTS idx_coaches_archetype ON public.coaches(archetype);
CREATE INDEX IF NOT EXISTS idx_coaches_leadership ON public.coaches(leadership DESC);
CREATE INDEX IF NOT EXISTS idx_coaches_football_iq ON public.coaches(football_iq DESC);
CREATE INDEX IF NOT EXISTS idx_coaches_team ON public.coaches(team_id);

-- Enable Row Level Security
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Allow all on coaches" ON public.coaches;

-- Create policy to allow all operations
CREATE POLICY "Allow all on coaches" ON public.coaches
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.coaches IS 'Seed data for all coaches. This table is immutable after initial seeding. Coach assignments and contracts are tracked separately.';
COMMENT ON COLUMN public.coaches.full_name IS 'Full name of the coach';
COMMENT ON COLUMN public.coaches.team_id IS 'Initial team assignment (seed data only, actual assignments in coach_team_assignments)';
COMMENT ON COLUMN public.coaches.role IS 'Coaching role: head_coach, coordinators, or position coaches';
COMMENT ON COLUMN public.coaches.archetype IS 'Coaching archetype/style';
COMMENT ON COLUMN public.coaches.leadership IS 'Leadership ability (0-100)';
COMMENT ON COLUMN public.coaches.football_iq IS 'Football IQ and strategic thinking (0-100)';
COMMENT ON COLUMN public.coaches.motivation IS 'Ability to motivate players (0-100)';
COMMENT ON COLUMN public.coaches.adaptability IS 'Adaptability to changing situations (0-100)';
COMMENT ON COLUMN public.coaches.aggressiveness IS 'Coaching aggressiveness level (0-100)';
COMMENT ON COLUMN public.coaches.talent_dev IS 'Talent development ability (0-100)';
COMMENT ON COLUMN public.coaches.scheme_fit IS 'How well coach fits team scheme (0-100)';
COMMENT ON COLUMN public.coaches.run_bias IS 'Preference for running plays (0-100)';
COMMENT ON COLUMN public.coaches.pass_bias IS 'Preference for passing plays (0-100)';
COMMENT ON COLUMN public.coaches.tempo IS 'Preferred tempo of play (0-100, low=slow, high=fast)';
COMMENT ON COLUMN public.coaches.creativity IS 'Play-calling creativity (0-100)';
COMMENT ON COLUMN public.coaches.red_zone_iq IS 'Red zone strategy ability (0-100)';
COMMENT ON COLUMN public.coaches.man_bias IS 'Preference for man coverage (0-100)';
COMMENT ON COLUMN public.coaches.zone_bias IS 'Preference for zone coverage (0-100)';
COMMENT ON COLUMN public.coaches.blitz_rate IS 'Tendency to call blitzes (0-100)';
COMMENT ON COLUMN public.coaches.turnover_focus IS 'Focus on creating turnovers (0-100)';
COMMENT ON COLUMN public.coaches.bend_break IS 'Bend-but-don''t-break defensive philosophy (0-100)';

