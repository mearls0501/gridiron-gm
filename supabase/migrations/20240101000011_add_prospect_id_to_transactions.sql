-- Add prospect_id to transactions table
-- This allows tracking transactions for draft prospects (rookies) in addition to established players

ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES public.draft_prospects(id) ON DELETE SET NULL;

-- Add index for prospect transactions
CREATE INDEX IF NOT EXISTS idx_transactions_prospect ON public.transactions(prospect_id);

-- Add comment
COMMENT ON COLUMN public.transactions.prospect_id IS 'Reference to draft prospect if transaction involves a rookie not yet in players table';



