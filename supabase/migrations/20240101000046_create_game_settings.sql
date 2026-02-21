-- Create game settings table for AUTO/MANUAL preferences
CREATE TABLE IF NOT EXISTS game_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  save_game_id UUID NOT NULL REFERENCES save_games(id) ON DELETE CASCADE,
  
  -- Task automation settings
  injury_management TEXT NOT NULL DEFAULT 'manual' CHECK (injury_management IN ('auto', 'manual')),
  depth_chart_management TEXT NOT NULL DEFAULT 'manual' CHECK (depth_chart_management IN ('auto', 'manual')),
  scouting_management TEXT NOT NULL DEFAULT 'manual' CHECK (scouting_management IN ('auto', 'manual')),
  contract_management TEXT NOT NULL DEFAULT 'manual' CHECK (contract_management IN ('auto', 'manual')),
  roster_management TEXT NOT NULL DEFAULT 'manual' CHECK (roster_management IN ('auto', 'manual')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one setting per save game
  UNIQUE(save_game_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_game_settings_save_game_id ON game_settings(save_game_id);

-- Create phase progress tracking table
CREATE TABLE IF NOT EXISTS phase_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  save_game_id UUID NOT NULL REFERENCES save_games(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('preseason', 'regular_season', 'playoffs', 'offseason')),
  
  -- Offseason week tracking (0, 1, 2 for the three offseason weeks)
  offseason_week INTEGER DEFAULT NULL CHECK (offseason_week IS NULL OR offseason_week BETWEEN 0 AND 2),
  
  -- Task completion tracking (JSONB for flexibility)
  tasks JSONB NOT NULL DEFAULT '[]',
  
  -- Progress tracking
  required_tasks_completed BOOLEAN NOT NULL DEFAULT false,
  can_advance BOOLEAN NOT NULL DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one progress record per phase per season per save game
  UNIQUE(save_game_id, season, phase, offseason_week)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_phase_progress_save_game_season ON phase_progress(save_game_id, season);
CREATE INDEX IF NOT EXISTS idx_phase_progress_phase ON phase_progress(phase);

-- Create roster validation table to track teams that need to cut players
CREATE TABLE IF NOT EXISTS roster_validation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  save_game_id UUID NOT NULL REFERENCES save_games(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  
  -- Current roster size
  current_roster_size INTEGER NOT NULL DEFAULT 0,
  max_roster_size INTEGER NOT NULL DEFAULT 53,
  
  -- Validation status
  is_valid BOOLEAN NOT NULL DEFAULT true,
  must_cut_count INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one validation per team per season per save game
  UNIQUE(save_game_id, team_id, season)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_roster_validation_save_game_season ON roster_validation(save_game_id, season);
CREATE INDEX IF NOT EXISTS idx_roster_validation_is_valid ON roster_validation(is_valid);

-- Add comments for documentation
COMMENT ON TABLE game_settings IS 'Stores user preferences for task automation (AUTO vs MANUAL mode)';
COMMENT ON TABLE phase_progress IS 'Tracks completion of required tasks for each phase of the season';
COMMENT ON TABLE roster_validation IS 'Tracks teams that need to cut players to meet roster size requirements';

COMMENT ON COLUMN game_settings.injury_management IS 'AUTO: CPU handles injuries automatically, MANUAL: User must manage injuries';
COMMENT ON COLUMN game_settings.depth_chart_management IS 'AUTO: CPU reorders depth charts, MANUAL: User must manage depth charts';
COMMENT ON COLUMN game_settings.scouting_management IS 'AUTO: CPU scouts players automatically, MANUAL: User must scout manually';
COMMENT ON COLUMN game_settings.contract_management IS 'AUTO: CPU handles contract decisions, MANUAL: User must manage contracts';
COMMENT ON COLUMN game_settings.roster_management IS 'AUTO: CPU cuts players to meet roster limits, MANUAL: User must cut players';

COMMENT ON COLUMN phase_progress.tasks IS 'JSON array of task objects: [{id: string, name: string, completed: boolean, required: boolean}]';
COMMENT ON COLUMN phase_progress.offseason_week IS 'NULL for non-offseason phases, 0-2 for offseason weeks';

