-- Update seasons table to allow current_week from 0 to 25
-- Week 0: Preseason
-- Week 1-18: Regular season
-- Week 19-22: Playoffs
-- Week 23-25: Offseason (Resign, Free Agency, Draft)

-- Drop any existing constraint
ALTER TABLE public.seasons
  DROP CONSTRAINT IF EXISTS seasons_current_week_check;

-- Also try to drop any constraint that might have a different name
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Try to find and drop any check constraint on current_week
  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.seasons'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%current_week%'
  ) LOOP
    EXECUTE 'ALTER TABLE public.seasons DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- Add the correct constraint that allows 0-25
ALTER TABLE public.seasons
  ADD CONSTRAINT seasons_current_week_check 
  CHECK (current_week >= 0 AND current_week <= 25);

-- Verify the constraint
DO $$
DECLARE
  constraint_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO constraint_def
  FROM pg_constraint
  WHERE conrelid = 'public.seasons'::regclass
  AND conname = 'seasons_current_week_check';
  
  IF constraint_def IS NULL THEN
    RAISE EXCEPTION 'Constraint seasons_current_week_check was not created';
  END IF;
  
  -- Log the constraint definition
  RAISE NOTICE 'Constraint seasons_current_week_check created: %', constraint_def;
END $$;


