-- Force fix seasons current_week constraint to ensure it allows 0-23
-- This migration ensures the constraint is correct even if previous migrations didn't apply

-- Drop any existing constraint with this name
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

-- Add the correct constraint that allows 0-23
ALTER TABLE public.seasons
  ADD CONSTRAINT seasons_current_week_check 
  CHECK (current_week >= 0 AND current_week <= 23);

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

