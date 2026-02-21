-- Migration: Create coach_team_assignments table
-- This tracks which coaches are with which teams for each save game
-- The coaches table remains as base/seed data (shared across all games)
-- This table tracks changes (hired, fired, resigned) per save game

CREATE TABLE IF NOT EXISTS public.coach_team_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_reason TEXT, -- 'initial', 'hired', 'fired', 'resigned', etc.
  season INTEGER,
  week INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- A coach can only be with one team per save game at a time
  UNIQUE(coach_id, save_game_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_coach_team_assignments_coach ON public.coach_team_assignments(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_team_assignments_team ON public.coach_team_assignments(team_id, save_game_id);
CREATE INDEX IF NOT EXISTS idx_coach_team_assignments_save_game ON public.coach_team_assignments(save_game_id);
CREATE INDEX IF NOT EXISTS idx_coach_team_assignments_composite ON public.coach_team_assignments(save_game_id, team_id);

-- Enable Row Level Security
ALTER TABLE public.coach_team_assignments ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Allow all on coach_team_assignments" ON public.coach_team_assignments;

-- Create policy to allow all operations
CREATE POLICY "Allow all on coach_team_assignments" ON public.coach_team_assignments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.coach_team_assignments IS 'Tracks which coaches are with which teams for each save game. If no assignment exists, use the base team_id from coaches table.';
COMMENT ON COLUMN public.coach_team_assignments.assigned_reason IS 'Reason for assignment: initial, hired, fired, resigned, etc.';



