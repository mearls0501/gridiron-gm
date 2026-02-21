-- Draft pick trade history tracking
-- Tracks all trades involving draft picks for complete audit trail

CREATE TABLE IF NOT EXISTS public.draft_pick_trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_pick_id UUID NOT NULL REFERENCES public.draft_picks(id) ON DELETE CASCADE,
  from_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  to_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  week INTEGER,
  trade_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb, -- Store additional trade details (other picks/players involved, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_draft_pick_trades_pick ON public.draft_pick_trades(draft_pick_id);
CREATE INDEX IF NOT EXISTS idx_draft_pick_trades_from_team ON public.draft_pick_trades(from_team_id, season);
CREATE INDEX IF NOT EXISTS idx_draft_pick_trades_to_team ON public.draft_pick_trades(to_team_id, season);
CREATE INDEX IF NOT EXISTS idx_draft_pick_trades_season ON public.draft_pick_trades(season);

ALTER TABLE public.draft_pick_trades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on draft_pick_trades" ON public.draft_pick_trades;
CREATE POLICY "Allow all on draft_pick_trades" ON public.draft_pick_trades
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.draft_pick_trades IS 'Complete history of all draft pick trades';
COMMENT ON COLUMN public.draft_pick_trades.metadata IS 'JSON object storing additional trade details (other picks, players, etc. involved in the trade)';

