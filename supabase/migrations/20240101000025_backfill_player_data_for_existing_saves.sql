-- Migration: Backfill player_team_assignments and free_agent_availability for existing save games
-- This should be run after new player seed data has been uploaded
-- It creates initial team assignments and free agent availability for all existing save games

DO $$
DECLARE
  save_game_record RECORD;
  player_record RECORD;
  free_agent_record RECORD;
  assignments_created INTEGER := 0;
  availability_created INTEGER := 0;
BEGIN
  -- Check if required tables exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'player_team_assignments'
  ) THEN
    RAISE NOTICE 'player_team_assignments table does not exist, skipping assignment backfill';
  ELSE
    -- Loop through all save games
    FOR save_game_record IN 
      SELECT id FROM public.save_games
    LOOP
      -- Create player_team_assignments for all players with a team_id
      FOR player_record IN 
        SELECT id, team_id 
        FROM public.players
        WHERE team_id IS NOT NULL
      LOOP
        INSERT INTO public.player_team_assignments (
          player_id,
          team_id,
          save_game_id,
          assigned_reason,
          season,
          week
        )
        VALUES (
          player_record.id,
          player_record.team_id,
          save_game_record.id,
          'initial',
          2025, -- Default season, adjust if needed
          0 -- Preseason
        )
        ON CONFLICT (player_id, save_game_id) DO NOTHING;
        
        assignments_created := assignments_created + 1;
      END LOOP;
      
      RAISE NOTICE 'Created player assignments for save game %', save_game_record.id;
    END LOOP;
    
    RAISE NOTICE 'Total player_team_assignments created: %', assignments_created;
  END IF;

  -- Check if free_agent_availability table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'free_agent_availability'
  ) THEN
    RAISE NOTICE 'free_agent_availability table does not exist, skipping availability backfill';
  ELSE
    -- Check if free_agents table exists and has data
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'free_agents'
    ) THEN
      -- Loop through all save games
      FOR save_game_record IN 
        SELECT id FROM public.save_games
      LOOP
        -- Create free_agent_availability for all non-archived free agents
        FOR free_agent_record IN 
          SELECT id, entered_free_agency_season, archived
          FROM public.free_agents
          WHERE archived = false OR archived IS NULL
        LOOP
          INSERT INTO public.free_agent_availability (
            player_id,
            save_game_id,
            entered_free_agency_season,
            reason,
            archived
          )
          VALUES (
            free_agent_record.id,
            save_game_record.id,
            COALESCE(free_agent_record.entered_free_agency_season, 2025),
            'initial',
            COALESCE(free_agent_record.archived, false)
          )
          ON CONFLICT (player_id, save_game_id) DO NOTHING;
          
          availability_created := availability_created + 1;
        END LOOP;
        
        RAISE NOTICE 'Created free agent availability for save game %', save_game_record.id;
      END LOOP;
      
      RAISE NOTICE 'Total free_agent_availability records created: %', availability_created;
    ELSE
      RAISE NOTICE 'free_agents table does not exist or is empty, skipping availability backfill';
    END IF;
  END IF;

  RAISE NOTICE 'Backfill complete!';
END $$;


