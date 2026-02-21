-- Drop the old coaching_staff table
-- This table is being replaced by the new coaching system:
-- - coaches (seed data)
-- - coach_team_assignments (tracks which coach is with which team)
-- - coach_contracts (tracks contract details)

DROP TABLE IF EXISTS public.coaching_staff CASCADE;



