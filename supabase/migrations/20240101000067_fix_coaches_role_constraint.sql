-- Drop the restrictive role check constraint to allow any role values
-- This allows CSV imports with abbreviated roles like 'HC', 'OC', 'DC', etc.

ALTER TABLE public.coaches 
  DROP CONSTRAINT IF EXISTS coaches_role_check;



