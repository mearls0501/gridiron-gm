-- Update scouting system to use weekly budget of 15 points
-- Points reset to 15 each week when advancing

-- Add last_week field to track which week points were last reset for
ALTER TABLE public.team_scouting_resources 
ADD COLUMN IF NOT EXISTS last_week INTEGER DEFAULT 1 CHECK (last_week >= 1 AND last_week <= 21);

-- Update default scouting points from 200 to 15
ALTER TABLE public.team_scouting_resources 
ALTER COLUMN scouting_points SET DEFAULT 15;

-- Update existing records to have 15 points and set last_week to 1
UPDATE public.team_scouting_resources 
SET scouting_points = 15, last_week = 1 
WHERE last_week IS NULL OR scouting_points > 15;

-- Update points_regenerated_per_week to 15 (already correct, but ensure it)
ALTER TABLE public.team_scouting_resources 
ALTER COLUMN points_regenerated_per_week SET DEFAULT 15;

