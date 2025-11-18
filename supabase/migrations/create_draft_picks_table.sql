-- Draft picks table
-- Tracks all draft picks for current and future seasons
-- Supports trading of draft picks between teams

CREATE TABLE IF NOT EXISTS public.draft_picks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season INTEGER NOT NULL,
  round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 7),
  pick_overall INTEGER NOT NULL,
  pick_in_round INTEGER NOT NULL,
  owning_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  original_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'owned',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT draft_picks_unique UNIQUE (season, pick_overall)
);

CREATE INDEX IF NOT EXISTS idx_draft_picks_team ON public.draft_picks(owning_team_id, season);
CREATE INDEX IF NOT EXISTS idx_draft_picks_season ON public.draft_picks(season);
CREATE INDEX IF NOT EXISTS idx_draft_picks_original_team ON public.draft_picks(original_team_id);

ALTER TABLE public.draft_picks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on draft_picks" ON public.draft_picks;
CREATE POLICY "Allow all on draft_picks" ON public.draft_picks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.draft_picks IS 'Tracks all draft picks for current and future seasons. Supports trading picks between teams.';
COMMENT ON COLUMN public.draft_picks.owning_team_id IS 'Current owner of the draft pick';
COMMENT ON COLUMN public.draft_picks.original_team_id IS 'Original team that had this pick (before any trades)';
COMMENT ON COLUMN public.draft_picks.status IS 'Status of the pick: owned, traded, used, etc.';

