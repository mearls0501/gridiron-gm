'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { formatCurrency } from '@/lib/utils/format';
import {
  Trophy,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  FileText,
  Target,
  ArrowRight,
  AlertCircle,
  DollarSign,
} from 'lucide-react';
import Link from 'next/link';

interface SeasonData {
  year: number;
  phase: string;
  current_week: number;
  champion_team_id: string | null;
  champion?: {
    name: string;
    abbreviation: string;
  };
}

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  link?: string;
}

export default function OffseasonPage() {
  const [season, setSeason] = useState<SeasonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [scoutingStatus, setScoutingStatus] = useState<{
    totalProspects: number;
    scoutedProspects: number;
    scoutingPoints: number;
  } | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadOffseasonData();
  }, []);

  async function loadOffseasonData() {
    try {
      // Get active season
      const { data: seasonData, error: seasonError } = await supabase
        .from('seasons')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (seasonError && seasonError.code !== 'PGRST116') {
        console.error('Error loading season:', seasonError);
      }

      if (seasonData) {
        // Get champion info if exists
        let champion = null;
        if (seasonData.champion_team_id) {
          const { data: champData } = await supabase
            .from('teams')
            .select('name, abbreviation')
            .eq('id', seasonData.champion_team_id)
            .single();
          champion = champData;
        }

        setSeason({
          year: seasonData.year,
          phase: seasonData.phase,
          current_week: seasonData.current_week,
          champion_team_id: seasonData.champion_team_id,
          champion: champion || undefined,
        });

        // Build checklist
        await buildChecklist(seasonData.year, seasonData.phase === 'offseason');
      }

      // Load scouting status
      await loadScoutingStatus();
    } catch (err) {
      console.error('Error loading offseason data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function buildChecklist(season: number, isOffseason: boolean) {
    const items: ChecklistItem[] = [];

    // Check if contracts have been processed
    const { data: expiringPlayers } = await supabase
      .from('players')
      .select('id')
      .or('contract_year_1.is.null,contract_year_1.eq.0')
      .not('team_id', 'is', null)
      .limit(1);

    items.push({
      id: 'contracts',
      label: 'Process expiring contracts',
      completed: !expiringPlayers || expiringPlayers.length === 0,
      link: '/teams/contracts',
    });

    // Check scouting completion (for next season's draft)
    const nextSeason = season + 1;
    const { data: prospects } = await supabase
      .from('draft_prospects')
      .select('id')
      .eq('season', nextSeason);

    const { data: scoutingReports } = await supabase
      .from('scouting_reports')
      .select('prospect_id')
      .eq('season', nextSeason);

    const scoutedCount = new Set(scoutingReports?.map((r) => r.prospect_id) || []).size;
    const totalCount = prospects?.length || 0;
    const scoutingComplete = totalCount > 0 && scoutedCount >= Math.min(50, totalCount * 0.3); // At least 30% or top 50

    items.push({
      id: 'scouting',
      label: `Complete scouting (${scoutedCount}/${totalCount} prospects)`,
      completed: scoutingComplete,
      link: '/draft',
    });

    // Check if draft is complete
    const { data: draftPicks } = await supabase
      .from('draft_picks')
      .select('id, selected_player_id')
      .eq('season', nextSeason)
      .limit(1);

    const hasDraftPicks = draftPicks && draftPicks.length > 0;
    const draftStarted = hasDraftPicks;
    // Draft is complete if all teams have made their first round pick (simplified check)
    const draftComplete = false; // TODO: Implement proper draft completion check

    items.push({
      id: 'draft',
      label: 'Complete NFL Draft',
      completed: draftComplete,
      link: '/draft',
    });

    setChecklist(items);
  }

  async function loadScoutingStatus() {
    try {
      // Get current season for scouting
      const { data: seasonData } = await supabase
        .from('seasons')
        .select('year')
        .eq('is_active', true)
        .single();

      if (!seasonData) return;

      const nextSeason = seasonData.year + 1;

      // Get scouting resources
      let selectedTeamId: string | null = null;
      if (typeof window !== 'undefined') {
        selectedTeamId = localStorage.getItem('selectedTeamId');
      }

      if (!selectedTeamId) {
        const { useGameStore } = await import('@/lib/store/game-store');
        selectedTeamId = useGameStore.getState().selectedTeamId;
      }

      if (!selectedTeamId) return;

      const { data: resources } = await supabase
        .from('team_scouting_resources')
        .select('scouting_points')
        .eq('team_id', selectedTeamId)
        .single();

      // Get prospect counts
      const { data: prospects } = await supabase
        .from('draft_prospects')
        .select('id')
        .eq('season', nextSeason);

      const { data: reports } = await supabase
        .from('scouting_reports')
        .select('prospect_id')
        .eq('team_id', selectedTeamId)
        .eq('season', nextSeason);

      const scoutedCount = new Set(reports?.map((r) => r.prospect_id) || []).size;

      setScoutingStatus({
        totalProspects: prospects?.length || 0,
        scoutedProspects: scoutedCount,
        scoutingPoints: resources?.scouting_points || 0,
      });
    } catch (err) {
      console.error('Error loading scouting status:', err);
    }
  }

  async function handleAdvanceToSeason() {
    if (!season) return;

    if (
      !confirm(
        `Are you sure you want to advance to the ${season.year + 1} season? This will:\n- Create a new season\n- Generate the schedule\n- Initialize rosters\n- Set up the next draft class`
      )
    ) {
      return;
    }

    setAdvancing(true);

    try {
      const response = await fetch("/api/offseason/advance-to-season", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season: season.year }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(`Error: ${data.error || "Failed to advance to new season"}`);
        return;
      }

      // Update game store
      const { useGameStore } = await import("@/lib/store/game-store");
      useGameStore.getState().setCurrentSeason(season.year + 1);
      useGameStore.getState().setCurrentWeek(1);
      useGameStore.getState().setSeasonPhase("preseason");

      // Reload page to show new season
      window.location.href = "/";
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Failed to advance to new season"}`);
    } finally {
      setAdvancing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <p className="text-gray-600">Loading offseason...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!season || season.phase !== 'offseason') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="text-center">
              <AlertCircle className="w-16 h-16 text-orange-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Not in Offseason</h2>
              <p className="text-gray-600 mb-4">
                Current phase: <strong>{season?.phase || 'Unknown'}</strong>
              </p>
              <Link
                href="/"
                className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Go to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const scoutingPercentage =
    scoutingStatus && scoutingStatus.totalProspects > 0
      ? Math.round((scoutingStatus.scoutedProspects / scoutingStatus.totalProspects) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black text-white tracking-tight mb-2">
                  {season.year} Offseason
                </h1>
                <p className="text-slate-300">Week {season.current_week} - Prepare for {season.year + 1}</p>
              </div>
              {season.champion && (
                <div className="text-right">
                  <div className="flex items-center gap-2 text-yellow-400 mb-1">
                    <Trophy className="w-6 h-6" />
                    <span className="text-sm font-semibold">Champion</span>
                  </div>
                  <p className="text-white font-bold text-lg">{season.champion.name}</p>
                  <p className="text-slate-300 text-sm">{season.champion.abbreviation}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Link
            href="/teams/contracts"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow border border-gray-200"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Contracts</h3>
                <p className="text-sm text-gray-600">Manage expiring contracts</p>
              </div>
            </div>
          </Link>

          <Link
            href="/free-agents"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow border border-gray-200"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Free Agency</h3>
                <p className="text-sm text-gray-600">Sign available players</p>
              </div>
            </div>
          </Link>

          <Link
            href="/draft"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow border border-gray-200"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Target className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Draft</h3>
                <p className="text-sm text-gray-600">Scout & draft prospects</p>
              </div>
            </div>
          </Link>

          <Link
            href="/teams/staff"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow border border-gray-200"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Coaching Staff</h3>
                <p className="text-sm text-gray-600">Manage coaches</p>
              </div>
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Checklist */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-green-600" />
              Offseason Checklist
            </h2>
            <div className="space-y-3">
              {checklist.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    item.completed
                      ? 'bg-green-50 border-green-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {item.completed ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-gray-400" />
                    )}
                    <span
                      className={item.completed ? 'text-gray-700 line-through' : 'text-gray-900 font-medium'}
                    >
                      {item.label}
                    </span>
                  </div>
                  {item.link && !item.completed && (
                    <Link
                      href={item.link}
                      className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                    >
                      Go <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Scouting Status */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Target className="w-6 h-6 text-purple-600" />
              Scouting Status
            </h2>
            {scoutingStatus ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Progress</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {scoutingStatus.scoutedProspects} / {scoutingStatus.totalProspects}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-purple-600 h-3 rounded-full transition-all"
                      style={{ width: `${scoutingPercentage}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{scoutingPercentage}% complete</p>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Scouting Points</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {scoutingStatus.scoutingPoints}
                  </span>
                </div>
                <Link
                  href="/draft"
                  className="block w-full text-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Go to Scouting Dashboard
                </Link>
              </div>
            ) : (
              <p className="text-gray-600">No scouting data available</p>
            )}
          </div>
        </div>

        {/* Advance to New Season Button */}
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Ready for {season.year + 1} Season?
              </h2>
              <p className="text-sm text-gray-600">
                Complete all offseason tasks, then advance to the new season to generate schedules and initialize rosters.
              </p>
            </div>
            <button
              onClick={handleAdvanceToSeason}
              disabled={advancing}
              className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {advancing ? "Advancing..." : `Advance to ${season.year + 1}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

