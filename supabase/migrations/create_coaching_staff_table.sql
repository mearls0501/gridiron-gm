-- Create coaching_staff table for managing team coaching staff
-- Supports head coaches, coordinators, and position coaches with contracts

CREATE TABLE IF NOT EXISTS public.coaching_staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN (
    'head_coach',
    'offensive_coordinator',
    'defensive_coordinator',
    'special_teams_coordinator',
    'qb_coach',
    'rb_coach',
    'wr_coach',
    'te_coach',
    'ol_coach',
    'dl_coach',
    'lb_coach',
    'db_coach'
  )),
  rating INTEGER NOT NULL CHECK (rating >= 0 AND rating <= 100),
  specialty TEXT,
  experience INTEGER DEFAULT 0 CHECK (experience >= 0),
  contract_year_1 DECIMAL(10,2) DEFAULT 0,
  contract_year_2 DECIMAL(10,2) DEFAULT 0,
  contract_year_3 DECIMAL(10,2) DEFAULT 0,
  contract_year_4 DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_coaching_staff_team ON public.coaching_staff(team_id);
CREATE INDEX IF NOT EXISTS idx_coaching_staff_role ON public.coaching_staff(role);
CREATE INDEX IF NOT EXISTS idx_coaching_staff_rating ON public.coaching_staff(rating DESC);

-- Enable Row Level Security
ALTER TABLE public.coaching_staff ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Allow all on coaching_staff" ON public.coaching_staff;

-- Create policy to allow all operations (adjust based on your auth needs)
CREATE POLICY "Allow all on coaching_staff" ON public.coaching_staff
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.coaching_staff IS 'Coaching staff for each team with contracts and ratings';
COMMENT ON COLUMN public.coaching_staff.role IS 'Coaching role: head_coach, coordinators, or position coaches';
COMMENT ON COLUMN public.coaching_staff.rating IS 'Overall coaching rating (0-100)';

