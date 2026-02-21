-- Drop draft_classes table (redundant - data can be derived from draft_prospects)
-- The csv_url can be constructed as draft_${season}.csv
-- The prospect_count can be calculated by counting rows in draft_prospects
DROP TABLE IF EXISTS public.draft_classes;

