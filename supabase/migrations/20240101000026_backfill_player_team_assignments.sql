-- Migration: Backfill player_team_assignments for existing save games
-- This creates initial assignments for all existing save games based on players' base team_id
-- Only runs if player_team_assignments table exists and has no data yet

DO $$
DECLARE
  save_game_record RECORD;
  player_record RECORD;
  assignment_count INTEGER;
BEGIN
  -- Check if player_team_assignments table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'player_team_assignments'
  ) THEN
    -- Get count of existing assignments
    SELECT COUNT(*) INTO assignment_count FROM public.player_team_assignments;
    
    -- Only backfill if no assignments exist yet
    IF assignment_count = 0 THEN
      -- Loop through all save games
      FOR save_game_record IN 
        SELECT id FROM public.save_games
      LOOP
        -- For each save game, create assignments for all players based on their base team_id
        INSERT INTO public.player_team_assignments (
          player_id,
          team_id,
          save_game_id,
          assigned_reason,
          season,
          week
        )
        SELECT 
          p.id as player_id,
          p.team_id,
          save_game_record.id as save_game_id,
          'initial' as assigned_reason,
          2025 as season, -- Default season, adjust if needed
          0 as week -- Preseason
        FROM public.players p
        WHERE p.team_id IS NOT NULL
        ON CONFLICT (player_id, save_game_id) DO NOTHING;
        
        RAISE NOTICE 'Created initial assignments for save game %', save_game_record.id;
      END LOOP;
      
      RAISE NOTICE 'Backfill complete: Created initial assignments for all existing save games';
    ELSE
      RAISE NOTICE 'Assignments already exist (% total), skipping backfill', assignment_count;
    END IF;
  ELSE
    RAISE NOTICE 'player_team_assignments table does not exist yet, skipping backfill';
  END IF;
END $$;


