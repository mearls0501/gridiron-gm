-- Migration: Enable RLS on free_agents table to prevent modifications
-- The free_agents table is base/seed data and should only be read
-- All free agent availability is tracked in free_agent_availability table

-- Enable Row Level Security
ALTER TABLE public.free_agents ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Allow read on free_agents" ON public.free_agents;
DROP POLICY IF EXISTS "Block inserts on free_agents" ON public.free_agents;
DROP POLICY IF EXISTS "Block updates on free_agents" ON public.free_agents;
DROP POLICY IF EXISTS "Block deletes on free_agents" ON public.free_agents;

-- Policy 1: Allow SELECT (read) operations
CREATE POLICY "Allow read on free_agents" ON public.free_agents
  FOR SELECT
  USING (true);

-- Policy 2: Block INSERT operations
-- Free agents should be seeded once and never modified
-- New free agents (from contract expiration, cuts, etc.) should be tracked via free_agent_availability
CREATE POLICY "Block inserts on free_agents" ON public.free_agents
  FOR INSERT
  WITH CHECK (false);

-- Policy 3: Block UPDATE operations
-- This prevents modifications to seed data that would bleed between games
CREATE POLICY "Block updates on free_agents" ON public.free_agents
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

-- Policy 4: Block DELETE operations
-- This prevents deletion of seed data
CREATE POLICY "Block deletes on free_agents" ON public.free_agents
  FOR DELETE
  USING (false);

-- Add comment to clarify the table's protection
COMMENT ON TABLE public.free_agents IS 'Base free agent data shared across all save games. RLS enabled - only SELECT allowed. INSERT, UPDATE, and DELETE blocked to protect seed data. Free agent availability per save game is tracked in free_agent_availability table. Undrafted prospects should remain in draft_prospects table.';


