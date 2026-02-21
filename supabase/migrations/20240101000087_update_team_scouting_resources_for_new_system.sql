-- Migration: Update team_scouting_resources for new scouting system
-- The new system uses per-scout points (in scout_priority table), not a global pool
-- This table should only track the scouting budget for hiring scouts

-- Remove old fields that are no longer used:
-- - scouting_points (points are now per-scout in scout_priority.weekly_points)
-- - points_regenerated_per_week (points are per-scout, not regenerated globally)
-- - last_week (points are tracked per-scout, not globally)

-- Note: We'll keep these columns for backward compatibility but mark them as deprecated
-- They can be removed in a future migration once we confirm nothing uses them

-- Add comment to document the change
COMMENT ON TABLE public.team_scouting_resources IS 
'Team scouting resources - tracks scouting budget for hiring scouts. 
Weekly scouting points are now tracked per-scout in scout_priority table (25/15/10/5 based on priority).
The scouting_points, points_regenerated_per_week, and last_week columns are deprecated and no longer used.';

-- Add comments only for columns that exist (safe migration)
DO $$
BEGIN
  -- Comment on scouting_points if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'team_scouting_resources' 
    AND column_name = 'scouting_points'
  ) THEN
    COMMENT ON COLUMN public.team_scouting_resources.scouting_points IS 
    'DEPRECATED: Points are now tracked per-scout in scout_priority table. This field is kept for backward compatibility only.';
  END IF;

  -- Comment on points_regenerated_per_week if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'team_scouting_resources' 
    AND column_name = 'points_regenerated_per_week'
  ) THEN
    COMMENT ON COLUMN public.team_scouting_resources.points_regenerated_per_week IS 
    'DEPRECATED: Points are now per-scout and tracked in scout_priority.weekly_points. This field is kept for backward compatibility only.';
  END IF;

  -- Comment on last_week if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'team_scouting_resources' 
    AND column_name = 'last_week'
  ) THEN
    COMMENT ON COLUMN public.team_scouting_resources.last_week IS 
    'DEPRECATED: Points are now tracked per-scout, not globally. This field is kept for backward compatibility only.';
  END IF;
END $$;

-- Comment on scouting_budget (this should always exist)
COMMENT ON COLUMN public.team_scouting_resources.scouting_budget IS 
'Active: Annual scouting budget for hiring scouts. Resets each season.';

