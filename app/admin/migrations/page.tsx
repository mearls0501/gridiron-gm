"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";

const MIGRATION_SQL = `-- Migration: Create Free Agency Bidding System
-- Copy this entire SQL and paste it into your Supabase SQL Editor

-- Table to track player contract preferences (what they're asking for)
CREATE TABLE IF NOT EXISTS public.free_agency_player_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  
  -- Player (can be either player or prospect)
  player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES public.draft_prospects(id) ON DELETE CASCADE,
  
  -- Contract preferences
  preferred_annual_salary INTEGER NOT NULL CHECK (preferred_annual_salary >= 750000),
  preferred_contract_years INTEGER NOT NULL CHECK (preferred_contract_years BETWEEN 1 AND 4),
  preferred_signing_bonus INTEGER DEFAULT 0,
  min_acceptable_salary INTEGER NOT NULL CHECK (min_acceptable_salary >= 750000),
  
  -- Metadata
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint and check
  UNIQUE(save_game_id, season, player_id, prospect_id),
  CHECK ((player_id IS NOT NULL AND prospect_id IS NULL) OR (player_id IS NULL AND prospect_id IS NOT NULL))
);

-- Table to track the current free agency stage for each save game
CREATE TABLE IF NOT EXISTS public.free_agency_stage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  current_stage INTEGER NOT NULL DEFAULT 1 CHECK (current_stage BETWEEN 1 AND 4),
  stage_status TEXT NOT NULL DEFAULT 'active' CHECK (stage_status IN ('active', 'processing', 'completed')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Unique constraint: one stage record per save game per season
  UNIQUE(save_game_id, season)
);

-- Table to track bids from all teams (CPU and user) for free agents
CREATE TABLE IF NOT EXISTS public.free_agency_bids (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  stage INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 4),
  
  -- Player being bid on (can be either player or prospect)
  player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES public.draft_prospects(id) ON DELETE CASCADE,
  
  -- Team making the bid
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Bid details
  contract_year_1 INTEGER NOT NULL CHECK (contract_year_1 >= 750000),
  contract_year_2 INTEGER DEFAULT 0,
  contract_year_3 INTEGER DEFAULT 0,
  contract_year_4 INTEGER DEFAULT 0,
  signing_bonus INTEGER DEFAULT 0,
  total_value INTEGER NOT NULL,
  
  -- Bid metadata
  is_cpu_bid BOOLEAN NOT NULL DEFAULT false,
  bid_priority INTEGER DEFAULT 0,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Status tracking
  is_active BOOLEAN NOT NULL DEFAULT true,
  was_outbid BOOLEAN DEFAULT false,
  is_winning BOOLEAN DEFAULT false,
  
  -- Check constraint to ensure either player_id or prospect_id is set
  CHECK ((player_id IS NOT NULL AND prospect_id IS NULL) OR (player_id IS NULL AND prospect_id IS NOT NULL))
);

-- Table to track bid history and notifications for users
CREATE TABLE IF NOT EXISTS public.free_agency_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  save_game_id UUID NOT NULL REFERENCES public.save_games(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  stage INTEGER NOT NULL,
  
  -- Team receiving the notification
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Player involved
  player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES public.draft_prospects(id) ON DELETE CASCADE,
  
  -- Notification details
  notification_type TEXT NOT NULL CHECK (notification_type IN ('outbid', 'winning', 'signed', 'lost')),
  message TEXT NOT NULL,
  
  -- Metadata
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Check constraint
  CHECK ((player_id IS NOT NULL AND prospect_id IS NULL) OR (player_id IS NULL AND prospect_id IS NOT NULL))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_free_agency_player_preferences_save_game ON public.free_agency_player_preferences(save_game_id, season);
CREATE INDEX IF NOT EXISTS idx_free_agency_player_preferences_player ON public.free_agency_player_preferences(player_id);
CREATE INDEX IF NOT EXISTS idx_free_agency_player_preferences_prospect ON public.free_agency_player_preferences(prospect_id);
CREATE INDEX IF NOT EXISTS idx_free_agency_stage_save_game ON public.free_agency_stage(save_game_id, season);
CREATE INDEX IF NOT EXISTS idx_free_agency_bids_save_game ON public.free_agency_bids(save_game_id, season, stage);
CREATE INDEX IF NOT EXISTS idx_free_agency_bids_player ON public.free_agency_bids(player_id);
CREATE INDEX IF NOT EXISTS idx_free_agency_bids_prospect ON public.free_agency_bids(prospect_id);
CREATE INDEX IF NOT EXISTS idx_free_agency_bids_team ON public.free_agency_bids(team_id);
CREATE INDEX IF NOT EXISTS idx_free_agency_bids_active ON public.free_agency_bids(is_active, is_winning);
CREATE INDEX IF NOT EXISTS idx_free_agency_notifications_team ON public.free_agency_notifications(team_id, is_read);

-- Enable Row Level Security
ALTER TABLE public.free_agency_player_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_agency_stage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_agency_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_agency_notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow all operations on free_agency_player_preferences" ON public.free_agency_player_preferences;
DROP POLICY IF EXISTS "Allow all operations on free_agency_stage" ON public.free_agency_stage;
DROP POLICY IF EXISTS "Allow all operations on free_agency_bids" ON public.free_agency_bids;
DROP POLICY IF EXISTS "Allow all operations on free_agency_notifications" ON public.free_agency_notifications;

-- Create policies to allow all operations
CREATE POLICY "Allow all operations on free_agency_player_preferences" ON public.free_agency_player_preferences
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on free_agency_stage" ON public.free_agency_stage
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on free_agency_bids" ON public.free_agency_bids
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on free_agency_notifications" ON public.free_agency_notifications
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.free_agency_player_preferences IS 'Tracks each player''s contract preferences and asking price for free agency';
COMMENT ON TABLE public.free_agency_stage IS 'Tracks the current free agency bidding stage (1-4) for each save game';
COMMENT ON TABLE public.free_agency_bids IS 'Tracks all bids from all teams (CPU and user) for free agents across all stages';
COMMENT ON TABLE public.free_agency_notifications IS 'Tracks bidding notifications for user teams (outbid, winning, etc)';
`;

export default function MigrationsPage() {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(MIGRATION_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Run Free Agency Migration</h1>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-bold text-yellow-900 mb-2">
          📋 Instructions
        </h2>
        <ol className="list-decimal list-inside space-y-2 text-yellow-900">
          <li>Click the "Copy SQL" button below</li>
          <li>
            Open your{" "}
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              Supabase Dashboard
              <ExternalLink className="w-3 h-3" />
            </a>
          </li>
          <li>Navigate to: SQL Editor (left sidebar)</li>
          <li>Click "+ New Query"</li>
          <li>Paste the SQL you copied</li>
          <li>Click "Run" (or press Cmd/Ctrl + Enter)</li>
          <li>Refresh your Free Agents page to see player preferences!</li>
        </ol>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Free Agency Bidding System SQL</h2>
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy SQL
              </>
            )}
          </button>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded p-4 overflow-x-auto">
          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
            {MIGRATION_SQL}
          </pre>
        </div>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h2 className="text-lg font-bold text-green-900 mb-2">
          ✅ What This Creates
        </h2>
        <ul className="list-disc list-inside space-y-1 text-green-900">
          <li>
            <code>free_agency_player_preferences</code> - Player asking prices
          </li>
          <li>
            <code>free_agency_stage</code> - Current bidding stage (1-4)
          </li>
          <li>
            <code>free_agency_bids</code> - All team bids
          </li>
          <li>
            <code>free_agency_notifications</code> - Bidding alerts
          </li>
        </ul>
      </div>
    </div>
  );
}



