-- Add personality and regional fields to scouts table
ALTER TABLE scouts
ADD COLUMN IF NOT EXISTS personality_type TEXT CHECK (personality_type IN ('optimistic', 'pessimistic', 'cautious', 'bold', 'analytical', 'old_school')),
ADD COLUMN IF NOT EXISTS personality_bias INTEGER DEFAULT 0 CHECK (personality_bias >= -10 AND personality_bias <= 10),
ADD COLUMN IF NOT EXISTS personality_risk_tolerance INTEGER DEFAULT 50 CHECK (personality_risk_tolerance >= 0 AND personality_risk_tolerance <= 100),
ADD COLUMN IF NOT EXISTS personality_verbosity TEXT DEFAULT 'normal' CHECK (personality_verbosity IN ('terse', 'normal', 'verbose')),
ADD COLUMN IF NOT EXISTS region TEXT CHECK (region IN ('SEC', 'Big Ten', 'Pac-12', 'ACC', 'Big 12', 'Independent')),
ADD COLUMN IF NOT EXISTS avatar_seed TEXT;

-- Add college_conference to draft_prospects for regional scouting bonus
ALTER TABLE draft_prospects
ADD COLUMN IF NOT EXISTS college_conference TEXT CHECK (college_conference IN ('SEC', 'Big Ten', 'Pac-12', 'ACC', 'Big 12', 'Independent', 'Other'));

-- Create team_big_boards table for storing player rankings
CREATE TABLE IF NOT EXISTS team_big_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES save_games(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  name TEXT DEFAULT 'Default Board',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, save_game_id, season, name)
);

-- Create big_board_entries table for individual prospect rankings
CREATE TABLE IF NOT EXISTS big_board_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES team_big_boards(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES draft_prospects(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  tier INTEGER CHECK (tier >= 1 AND tier <= 5),
  notes TEXT,
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(board_id, prospect_id)
);

-- Create scout_accuracy_history for tracking scout performance
CREATE TABLE IF NOT EXISTS scout_accuracy_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scout_id UUID NOT NULL REFERENCES scouts(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES save_games(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  prospect_id UUID NOT NULL REFERENCES draft_prospects(id) ON DELETE CASCADE,

  -- What the scout predicted
  predicted_overall_low INTEGER,
  predicted_overall_high INTEGER,
  predicted_potential_low INTEGER,
  predicted_potential_high INTEGER,
  predicted_bust_risk TEXT,

  -- What actually happened (filled in after rookie season)
  actual_overall INTEGER,
  actual_potential INTEGER,
  was_bust BOOLEAN,
  was_breakout BOOLEAN,

  -- Calculated accuracy
  overall_accuracy INTEGER, -- How close was the prediction (0-100)
  potential_accuracy INTEGER,
  bust_prediction_correct BOOLEAN,

  evaluated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  verified_at TIMESTAMP WITH TIME ZONE, -- When actual stats were recorded

  UNIQUE(scout_id, save_game_id, season, prospect_id)
);

-- Create scouting_notes table for storing detailed scout opinions
CREATE TABLE IF NOT EXISTS scouting_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  scout_id UUID NOT NULL REFERENCES scouts(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES draft_prospects(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES save_games(id) ON DELETE CASCADE,

  -- The generated content
  headline TEXT, -- "Future Star", "Bust Risk", etc.
  note TEXT NOT NULL, -- The actual scout quote
  action_type TEXT NOT NULL, -- What scouting action generated this note

  -- Rating at time of note
  rating_estimate INTEGER,
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, scout_id, prospect_id, save_game_id, action_type)
);

-- Create scout_disagreements table for tracking conflicting opinions
CREATE TABLE IF NOT EXISTS scout_disagreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES draft_prospects(id) ON DELETE CASCADE,
  save_game_id UUID NOT NULL REFERENCES save_games(id) ON DELETE CASCADE,

  scout_1_id UUID NOT NULL REFERENCES scouts(id) ON DELETE CASCADE,
  scout_1_rating INTEGER NOT NULL,
  scout_1_headline TEXT,

  scout_2_id UUID NOT NULL REFERENCES scouts(id) ON DELETE CASCADE,
  scout_2_rating INTEGER NOT NULL,
  scout_2_headline TEXT,

  disagreement_level TEXT NOT NULL CHECK (disagreement_level IN ('minor', 'major')),
  rating_difference INTEGER NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE,
  resolution_notes TEXT,

  UNIQUE(team_id, prospect_id, save_game_id, scout_1_id, scout_2_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_big_board_entries_board ON big_board_entries(board_id);
CREATE INDEX IF NOT EXISTS idx_big_board_entries_rank ON big_board_entries(board_id, rank);
CREATE INDEX IF NOT EXISTS idx_scout_accuracy_scout ON scout_accuracy_history(scout_id, save_game_id);
CREATE INDEX IF NOT EXISTS idx_scout_accuracy_season ON scout_accuracy_history(save_game_id, season);
CREATE INDEX IF NOT EXISTS idx_scouting_notes_prospect ON scouting_notes(prospect_id, save_game_id);
CREATE INDEX IF NOT EXISTS idx_scouting_notes_scout ON scouting_notes(scout_id, save_game_id);
CREATE INDEX IF NOT EXISTS idx_scout_disagreements_team ON scout_disagreements(team_id, save_game_id);

-- RLS Policies
ALTER TABLE team_big_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE big_board_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_accuracy_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE scouting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_disagreements ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (you can restrict based on user auth later)
CREATE POLICY "Allow all on team_big_boards" ON team_big_boards FOR ALL USING (true);
CREATE POLICY "Allow all on big_board_entries" ON big_board_entries FOR ALL USING (true);
CREATE POLICY "Allow all on scout_accuracy_history" ON scout_accuracy_history FOR ALL USING (true);
CREATE POLICY "Allow all on scouting_notes" ON scouting_notes FOR ALL USING (true);
CREATE POLICY "Allow all on scout_disagreements" ON scout_disagreements FOR ALL USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_team_big_boards_updated_at ON team_big_boards;
CREATE TRIGGER update_team_big_boards_updated_at
  BEFORE UPDATE ON team_big_boards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_big_board_entries_updated_at ON big_board_entries;
CREATE TRIGGER update_big_board_entries_updated_at
  BEFORE UPDATE ON big_board_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
