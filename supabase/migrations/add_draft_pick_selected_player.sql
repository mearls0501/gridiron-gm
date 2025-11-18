-- Add selected_player_id to draft_picks table to track which player was selected
ALTER TABLE public.draft_picks
ADD COLUMN IF NOT EXISTS selected_player_id UUID REFERENCES public.draft_prospects(id) ON DELETE SET NULL;

-- Update status to 'used' when a player is selected
-- Status values: 'owned', 'traded', 'used'
-- When selected_player_id is set, status should be 'used'

CREATE INDEX IF NOT EXISTS idx_draft_picks_selected_player ON public.draft_picks(selected_player_id);

COMMENT ON COLUMN public.draft_picks.selected_player_id IS 'The prospect/player selected with this draft pick. NULL if pick has not been used yet.';

