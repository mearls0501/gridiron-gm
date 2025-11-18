-- Add missing columns to scouting_reports table
-- This migration is idempotent and can be run multiple times safely

DO $$ 
BEGIN
  -- Add total_points_invested column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'scouting_reports' 
    AND column_name = 'total_points_invested'
  ) THEN
    ALTER TABLE public.scouting_reports 
    ADD COLUMN total_points_invested INTEGER DEFAULT 0 CHECK (total_points_invested >= 0);
    
    -- Update existing rows
    UPDATE public.scouting_reports 
    SET total_points_invested = 0 
    WHERE total_points_invested IS NULL;
  END IF;

  -- Add scouting_progress column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'scouting_reports' 
    AND column_name = 'scouting_progress'
  ) THEN
    ALTER TABLE public.scouting_reports 
    ADD COLUMN scouting_progress INTEGER DEFAULT 0 CHECK (scouting_progress >= 0 AND scouting_progress <= 100);
    
    -- Update existing rows
    UPDATE public.scouting_reports 
    SET scouting_progress = 0 
    WHERE scouting_progress IS NULL;
  END IF;

  -- Add methods_used column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'scouting_reports' 
    AND column_name = 'methods_used'
  ) THEN
    ALTER TABLE public.scouting_reports 
    ADD COLUMN methods_used TEXT[] DEFAULT '{}';
    
    -- Update existing rows to have empty array instead of NULL
    UPDATE public.scouting_reports 
    SET methods_used = '{}' 
    WHERE methods_used IS NULL;
  END IF;
END $$;

-- Add comments
COMMENT ON COLUMN public.scouting_reports.total_points_invested IS 'Total scouting points invested in this prospect';
COMMENT ON COLUMN public.scouting_reports.scouting_progress IS 'Scouting progress percentage (0-100)';
COMMENT ON COLUMN public.scouting_reports.methods_used IS 'Array of scouting methods used for this prospect';

