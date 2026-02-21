-- Backfill season_weeks for all existing seasons
-- Creates 24 weeks (0-23) for each season that doesn't already have them

-- Use INSERT ... ON CONFLICT to avoid duplicates
-- This will create all 24 weeks for each season, respecting save_game_id isolation

INSERT INTO public.season_weeks (season_id, week_number, status, save_game_id)
SELECT 
  s.id AS season_id,
  week_num AS week_number,
  'scheduled' AS status,
  s.save_game_id
FROM 
  public.seasons s
CROSS JOIN 
  generate_series(0, 23) AS week_num
WHERE NOT EXISTS (
  -- Only insert if this week doesn't already exist for this season
  SELECT 1 
  FROM public.season_weeks sw
  WHERE sw.season_id = s.id 
    AND sw.week_number = week_num
    AND COALESCE(sw.save_game_id, '00000000-0000-0000-0000-000000000000'::uuid) = 
        COALESCE(s.save_game_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
ON CONFLICT DO NOTHING;

-- Update status for weeks that have already been simulated based on season phase and current_week
-- This is a best-effort update based on the season's current state

UPDATE public.season_weeks sw
SET status = CASE
  WHEN sw.week_number < s.current_week THEN 'completed'
  WHEN sw.week_number = s.current_week THEN 'in_progress'
  ELSE 'scheduled'
END,
processed_at = CASE
  WHEN sw.week_number < s.current_week THEN NOW()
  ELSE NULL
END
FROM public.seasons s
WHERE sw.season_id = s.id
  AND COALESCE(sw.save_game_id, '00000000-0000-0000-0000-000000000000'::uuid) = 
      COALESCE(s.save_game_id, '00000000-0000-0000-0000-000000000000'::uuid)
  AND sw.week_number < s.current_week;

