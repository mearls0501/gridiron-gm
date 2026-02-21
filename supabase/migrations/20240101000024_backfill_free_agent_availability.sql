-- Migration: Backfill free_agent_availability for existing save games
-- This creates initial availability records for all existing save games based on free_agents table
-- Only runs if free_agent_availability table exists and has no data yet

DO $$
DECLARE
  save_game_record RECORD;
  free_agent_record RECORD;
  availability_count INTEGER;
BEGIN
  -- Check if free_agent_availability table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'free_agent_availability'
  ) THEN
    -- Get count of existing availability records
    SELECT COUNT(*) INTO availability_count FROM public.free_agent_availability;
    
    -- Only backfill if no availability records exist yet
    IF availability_count = 0 THEN
      -- Loop through all save games
      FOR save_game_record IN 
        SELECT id FROM public.save_games
      LOOP
        -- For each save game, create availability records for all non-archived free agents
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
            free_agent_record.entered_free_agency_season,
            'initial',
            COALESCE(free_agent_record.archived, false)
          )
          ON CONFLICT (player_id, save_game_id) DO NOTHING;
        END LOOP;
        
        RAISE NOTICE 'Created initial free agent availability for save game %', save_game_record.id;
      END LOOP;
      
      RAISE NOTICE 'Backfill complete: Created initial free agent availability for all existing save games';
    ELSE
      RAISE NOTICE 'Free agent availability already exists (% total), skipping backfill', availability_count;
    END IF;
  ELSE
    RAISE NOTICE 'free_agent_availability table does not exist yet, skipping backfill';
  END IF;
END $$;


