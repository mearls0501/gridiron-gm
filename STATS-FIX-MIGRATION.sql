-- =====================================================================
-- FIX: Remove foreign key constraints from stats tables
-- 
-- Problem: Stats tables had FK constraints to players.id only
-- Solution: Remove FK to allow both players.id and draft_prospects.id
-- Reason: player_team_assignments is source of truth, can reference either
-- =====================================================================

-- 1. Fix player_game_stats
ALTER TABLE public.player_game_stats 
DROP CONSTRAINT IF EXISTS player_game_stats_player_id_fkey;

COMMENT ON COLUMN public.player_game_stats.player_id IS 
  'Player ID - references either players.id (seed data) or draft_prospects.id (drafted). ' ||
  'Source of truth is player_team_assignments. No FK to allow both tables.';

-- 2. Fix player_season_stats
ALTER TABLE public.player_season_stats 
DROP CONSTRAINT IF EXISTS player_season_stats_player_id_fkey;

COMMENT ON COLUMN public.player_season_stats.player_id IS 
  'Player ID - references either players.id (seed data) or draft_prospects.id (drafted). ' ||
  'Source of truth is player_team_assignments. No FK to allow both tables.';

-- 3. Fix player_lifetime_stats (if table exists)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'player_lifetime_stats'
    ) THEN
        ALTER TABLE public.player_lifetime_stats 
        DROP CONSTRAINT IF EXISTS player_lifetime_stats_player_id_fkey;
        
        COMMENT ON COLUMN public.player_lifetime_stats.player_id IS 
          'Player ID - references either players.id (seed data) or draft_prospects.id (drafted). ' ||
          'Source of truth is player_team_assignments. No FK to allow both tables.';
    END IF;
END $$;

-- Verify the constraints are removed
DO $$
DECLARE
    constraint_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO constraint_count
    FROM pg_constraint con
    WHERE con.conname IN (
        'player_game_stats_player_id_fkey',
        'player_season_stats_player_id_fkey', 
        'player_lifetime_stats_player_id_fkey'
    );
    
    IF constraint_count > 0 THEN
        RAISE WARNING 'Some constraints still exist! Check manually.';
    ELSE
        RAISE NOTICE '✅ All player_id foreign key constraints successfully removed!';
    END IF;
END $$;



