-- Backfill schedules table from existing games
-- This migration creates schedule records for any seasons that have games
-- but don't have a corresponding schedule record

INSERT INTO public.schedules (season, save_game_id, total_games, generated_at, generated_by)
SELECT 
  g.season,
  g.save_game_id,
  COUNT(*) as total_games,
  MIN(g.created_at) as generated_at,
  'backfill-migration' as generated_by
FROM public.games g
WHERE NOT EXISTS (
  -- Only insert if a schedule doesn't already exist for this season/save_game_id combo
  SELECT 1 
  FROM public.schedules s
  WHERE s.season = g.season
    AND (
      (s.save_game_id IS NULL AND g.save_game_id IS NULL)
      OR (s.save_game_id = g.save_game_id)
    )
)
GROUP BY g.season, g.save_game_id
ON CONFLICT (save_game_id, season) DO NOTHING;

-- Also handle the case where save_game_id is NULL (legacy data)
-- The unique constraint allows one schedule per season when save_game_id is NULL
INSERT INTO public.schedules (season, save_game_id, total_games, generated_at, generated_by)
SELECT 
  g.season,
  NULL as save_game_id,
  COUNT(*) as total_games,
  MIN(g.created_at) as generated_at,
  'backfill-migration' as generated_by
FROM public.games g
WHERE g.save_game_id IS NULL
  AND NOT EXISTS (
    SELECT 1 
    FROM public.schedules s
    WHERE s.season = g.season
      AND s.save_game_id IS NULL
  )
GROUP BY g.season
ON CONFLICT DO NOTHING;

-- Log the results
DO $$
DECLARE
  schedule_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO schedule_count FROM public.schedules;
  RAISE NOTICE 'Backfilled schedules: % schedule records created', schedule_count;
END $$;



