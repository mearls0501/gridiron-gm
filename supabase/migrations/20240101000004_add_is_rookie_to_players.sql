-- Migration: Add is_rookie column to players table
-- This flag indicates whether a player is a rookie (first year in the league)

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS is_rookie BOOLEAN DEFAULT FALSE;

-- Create index for performance (useful for filtering rookies)
CREATE INDEX IF NOT EXISTS idx_players_is_rookie ON public.players(is_rookie);

-- Add comment
COMMENT ON COLUMN public.players.is_rookie IS 'Indicates whether the player is a rookie (first year in the league). Set to true for newly drafted players.';


