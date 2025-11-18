-- Comprehensive trades system
-- Supports trading players and draft picks between teams

-- Trades table (main trade proposals and executed trades)
CREATE TABLE IF NOT EXISTS public.trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  to_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'executed')),
  season INTEGER NOT NULL,
  week INTEGER,
  proposed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE,
  executed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  from_team_evaluation JSONB DEFAULT '{}'::jsonb, -- Trade evaluation from from_team's perspective
  to_team_evaluation JSONB DEFAULT '{}'::jsonb, -- Trade evaluation from to_team's perspective
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trade items (players and draft picks being traded)
CREATE TABLE IF NOT EXISTS public.trade_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('player', 'draft_pick')),
  player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  draft_pick_id UUID REFERENCES public.draft_picks(id) ON DELETE SET NULL,
  from_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  to_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT trade_items_type_check CHECK (
    (item_type = 'player' AND player_id IS NOT NULL AND draft_pick_id IS NULL) OR
    (item_type = 'draft_pick' AND draft_pick_id IS NOT NULL AND player_id IS NULL)
  )
);

-- Trade history (audit trail of all trade actions)
CREATE TABLE IF NOT EXISTS public.trade_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('proposed', 'accepted', 'rejected', 'cancelled', 'executed', 'modified')),
  performed_by_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  details TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trades_from_team ON public.trades(from_team_id, status, season);
CREATE INDEX IF NOT EXISTS idx_trades_to_team ON public.trades(to_team_id, status, season);
CREATE INDEX IF NOT EXISTS idx_trades_status ON public.trades(status, season);
CREATE INDEX IF NOT EXISTS idx_trade_items_trade ON public.trade_items(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_items_player ON public.trade_items(player_id);
CREATE INDEX IF NOT EXISTS idx_trade_items_pick ON public.trade_items(draft_pick_id);
CREATE INDEX IF NOT EXISTS idx_trade_history_trade ON public.trade_history(trade_id);

-- Row Level Security
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on trades" ON public.trades;
CREATE POLICY "Allow all on trades" ON public.trades
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on trade_items" ON public.trade_items;
CREATE POLICY "Allow all on trade_items" ON public.trade_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on trade_history" ON public.trade_history;
CREATE POLICY "Allow all on trade_history" ON public.trade_history
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE public.trades IS 'Trade proposals and executed trades between teams';
COMMENT ON TABLE public.trade_items IS 'Individual items (players or draft picks) in a trade';
COMMENT ON TABLE public.trade_history IS 'Complete audit trail of all trade actions';
COMMENT ON COLUMN public.trades.from_team_evaluation IS 'JSON object storing trade evaluation metrics from the proposing team';
COMMENT ON COLUMN public.trades.to_team_evaluation IS 'JSON object storing trade evaluation metrics from the receiving team';

