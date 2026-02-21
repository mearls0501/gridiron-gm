-- Migration: Ensure player stats tables have save_game_id column
-- This fixes the issue where stats are being saved but the save_game_id column might be missing

-- Check and add save_game_id to player_game_stats if missing
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'player_game_stats' 
        AND column_name = 'save_game_id'
    ) THEN
        ALTER TABLE public.player_game_stats 
        ADD COLUMN save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;
        
        RAISE NOTICE 'Added save_game_id column to player_game_stats';
    ELSE
        RAISE NOTICE 'save_game_id column already exists in player_game_stats';
    END IF;
END $$;

-- Check and add save_game_id to player_season_stats if missing
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'player_season_stats' 
        AND column_name = 'save_game_id'
    ) THEN
        ALTER TABLE public.player_season_stats 
        ADD COLUMN save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;
        
        RAISE NOTICE 'Added save_game_id column to player_season_stats';
    ELSE
        RAISE NOTICE 'save_game_id column already exists in player_season_stats';
    END IF;
END $$;

-- Check and add save_game_id to player_lifetime_stats if missing and table exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'player_lifetime_stats'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'player_lifetime_stats' 
            AND column_name = 'save_game_id'
        ) THEN
            -- save_game_id should already exist in player_lifetime_stats from creation
            -- But if not, this will add it
            ALTER TABLE public.player_lifetime_stats 
            ADD COLUMN save_game_id UUID REFERENCES public.save_games(id) ON DELETE CASCADE;
            
            RAISE NOTICE 'Added save_game_id column to player_lifetime_stats';
        ELSE
            RAISE NOTICE 'save_game_id column already exists in player_lifetime_stats';
        END IF;
    END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_player_game_stats_save_game 
ON public.player_game_stats(save_game_id, season, week);

CREATE INDEX IF NOT EXISTS idx_player_season_stats_save_game 
ON public.player_season_stats(save_game_id, season);

CREATE INDEX IF NOT EXISTS idx_player_lifetime_stats_save_game 
ON public.player_lifetime_stats(save_game_id) 
WHERE EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'player_lifetime_stats'
);

-- Update the unique constraint on player_season_stats to include save_game_id
-- Drop the old unique constraint if it exists
DO $$
BEGIN
    -- Drop old constraint
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'player_season_stats_player_id_season_key'
    ) THEN
        ALTER TABLE public.player_season_stats 
        DROP CONSTRAINT player_season_stats_player_id_season_key;
        
        RAISE NOTICE 'Dropped old unique constraint player_season_stats_player_id_season_key';
    END IF;
END $$;

-- Drop any existing unique indexes
DROP INDEX IF EXISTS player_season_stats_save_game_unique;
DROP INDEX IF EXISTS player_season_stats_unique_null;
DROP INDEX IF EXISTS player_season_stats_unique;

-- Create a full unique constraint that works for both cases
-- PostgreSQL treats NULL as distinct, so we can use COALESCE to handle NULL save_game_id
CREATE UNIQUE INDEX IF NOT EXISTS player_season_stats_unique 
ON public.player_season_stats(
  COALESCE(save_game_id, '00000000-0000-0000-0000-000000000000'::uuid),
  player_id, 
  season
);

-- Add comments
COMMENT ON COLUMN public.player_game_stats.save_game_id IS 'Links this player game stat to a specific save game for data isolation';
COMMENT ON COLUMN public.player_season_stats.save_game_id IS 'Links this player season stat to a specific save game for data isolation';

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration completed: player stats tables now have save_game_id column with proper indexes';
END $$;



