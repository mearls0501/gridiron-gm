'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { formatCurrency } from '@/lib/utils/format';
import { useGameStore } from '@/lib/store/game-store';
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
  const { saveGameId, currentSeason } = useGameStore();
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
  }, [saveGameId]);

  async function loadOffseasonData() {
    try {
      // Get active season for this save game
      let seasonQuery = supabase
        .from('seasons')
        .select('*')
        .eq('is_active', true);
      
      // Filter by save_game_id if available
      if (saveGameId) {
        seasonQuery = seasonQuery.eq('save_game_id', saveGameId);
      } else {
        seasonQuery = seasonQuery.is('save_game_id', null);
      }
      
      let { data: seasonData, error: seasonError } = await seasonQuery.maybeSingle();
      
      // If season is in playoffs but Super Bowl is complete, automatically transition to offseason
      if (seasonData && seasonData.phase === 'playoffs' && seasonData.champion_team_id) {
        console.log('[Offseason] Season is in playoffs but champion is set, transitioning to offseason...');
        try {
          const response = await fetch('/api/playoffs/crown-champion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ season: seasonData.year, saveGameId }),
          });
          
          if (response.ok) {
            // Reload season data
            const { data: updatedSeason } = await seasonQuery.maybeSingle();
            if (updatedSeason) {
              seasonData = updatedSeason;
              console.log('[Offseason] Successfully transitioned to offseason phase');
            }
          }
        } catch (err) {
          console.error('Error auto-transitioning to offseason:', err);
        }
      }
      
      // If no season found with save_game_id and we have a saveGameId,
      // try to find any offseason season with NULL save_game_id and link it
      if (!seasonData && saveGameId && !seasonError) {
        const { data: nullSeasonData } = await supabase
          .from('seasons')
          .select('*')
          .eq('is_active', true)
          .is('save_game_id', null)
          .maybeSingle();
        
        if (nullSeasonData) {
          // Update the season to have the correct save_game_id
          const updateResult = await supabase
            .from('seasons')
            .update({ save_game_id: saveGameId })
            .eq('year', nullSeasonData.year)
            .eq('is_active', true)
            .is('save_game_id', null);
          
          if (!updateResult.error) {
            seasonData = { ...nullSeasonData, save_game_id: saveGameId };
          } else {
            // If update failed, still use the null season data
            seasonData = nullSeasonData;
          }
        }
      }

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
    // Note: Contract processing is not filtered by save_game_id since players are shared
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

    // Check scouting completion (for the current season's draft)
    // During offseason, we're drafting prospects for the current season
    // These prospects were generated in preseason and scouted during regular season
    const draftSeason = season;
    let prospectsQuery = supabase
      .from('draft_prospects')
      .select('id')
      .eq('season', draftSeason);
    
    // Filter by save_game_id if available
    if (saveGameId) {
      prospectsQuery = prospectsQuery.eq('save_game_id', saveGameId);
    } else {
      prospectsQuery = prospectsQuery.is('save_game_id', null);
    }
    
    const { data: prospects } = await prospectsQuery;

    // Query scouted_prospects (new scouting system) instead of scouting_reports
    // First get all scouted prospects for this save game
    let scoutedQuery = supabase
      .from('scouted_prospects')
      .select('prospect_id');
    
    // Filter by save_game_id if available
    if (saveGameId) {
      scoutedQuery = scoutedQuery.eq('save_game_id', saveGameId);
    } else {
      scoutedQuery = scoutedQuery.is('save_game_id', null);
    }
    
    const { data: scoutedProspects } = await scoutedQuery;
    
    // Now filter to only include prospects from the draft season
    // Get prospect IDs for the draft season
    const prospectIdsForSeason = (prospects || []).map(p => p.id);
    const scoutedProspectIds = (scoutedProspects || []).map(sp => sp.prospect_id);
    
    // Count how many scouted prospects are in the draft season
    const scoutedCount = scoutedProspectIds.filter(id => prospectIdsForSeason.includes(id)).length;
    const totalCount = prospects?.length || 0;
    
    // Scouting is optional - always allow it to be marked complete
    // Users can advance even if they haven't scouted all prospects
    // If no prospects exist yet, scouting is considered "complete" (can't scout what doesn't exist)
    // Prospects will be generated when advancing to the new season
    const scoutingComplete = totalCount === 0 || totalCount > 0; // Always true - scouting is optional

    items.push({
      id: 'scouting',
      label: totalCount === 0 
        ? 'Complete scouting (Draft class will be generated when advancing)'
        : `Complete scouting (${scoutedCount}/${totalCount} prospects scouted - optional)`,
      completed: scoutingComplete,
      link: '/draft',
    });

    // Check if draft is complete by checking draft_state
    let draftStateQuery = supabase
      .from('draft_state')
      .select('status, season, save_game_id')
      .eq('season', draftSeason);
    
    // Filter by save_game_id if available
    if (saveGameId) {
      draftStateQuery = draftStateQuery.eq('save_game_id', saveGameId);
    } else {
      draftStateQuery = draftStateQuery.is('save_game_id', null);
    }
    
    const { data: draftState, error: draftStateError } = await draftStateQuery.maybeSingle();

    if (draftStateError) {
      console.error('[Offseason] Error checking draft state:', draftStateError);
    }

    // Draft is complete if draft_state exists and status is "completed"
    const draftComplete = draftState?.status === 'completed';
    
    console.log(`[Offseason] Draft check - season: ${season}, draftSeason: ${draftSeason}, saveGameId: ${saveGameId}, draftState:`, draftState, `complete: ${draftComplete}`);

    items.push({
      id: 'draft',
      label: 'Complete NFL Draft',
      completed: draftComplete,
      link: '/draft', // This now goes to the dedicated draft page
    });

    setChecklist(items);
  }

  async function loadScoutingStatus() {
    try {
      // Get current season for scouting
      let seasonQuery = supabase
        .from('seasons')
        .select('year')
        .eq('is_active', true);
      
      // Filter by save_game_id if available
      if (saveGameId) {
        seasonQuery = seasonQuery.eq('save_game_id', saveGameId);
      } else {
        seasonQuery = seasonQuery.is('save_game_id', null);
      }
      
      const { data: seasonData } = await seasonQuery.single();

      if (!seasonData) return;

      // During offseason, we're drafting prospects for the current season
      // These prospects were generated in preseason and scouted during regular season
      const draftSeason = seasonData.year;

      // Get scouting resources
      let selectedTeamId: string | null = null;
      if (typeof window !== 'undefined') {
        selectedTeamId = localStorage.getItem('selectedTeamId');
      }

      if (!selectedTeamId) {
        const { useGameStore } = await import('@/lib/store/game-store');
        selectedTeamId = useGameStore.getState().selectedTeamId;
      }

      if (!selectedTeamId) {
        console.log('[loadScoutingStatus] No selectedTeamId found');
        return;
      }

      // Note: In new system, points are per-scout in scout_priority table, not a global pool
      // This table only tracks scouting_budget for hiring scouts
      const { data: resources } = await supabase
        .from('team_scouting_resources')
        .select('scouting_budget')
        .eq('team_id', selectedTeamId)
        .single();

      // Get prospect counts for the current season's draft
      let prospectsQuery = supabase
        .from('draft_prospects')
        .select('id, season')
        .eq('season', draftSeason);
      
      // Filter by save_game_id if available
      if (saveGameId) {
        prospectsQuery = prospectsQuery.eq('save_game_id', saveGameId);
      } else {
        prospectsQuery = prospectsQuery.is('save_game_id', null);
      }
      
      const { data: prospects } = await prospectsQuery;
      console.log(`[loadScoutingStatus] Found ${prospects?.length || 0} prospects for season ${draftSeason}`);

      // Query scouted_prospects (new scouting system) instead of scouting_reports
      // First get all scouted prospects for this team and save game
      let scoutedQuery = supabase
        .from('scouted_prospects')
        .select('prospect_id')
        .eq('team_id', selectedTeamId);
      
      // Filter by save_game_id if available
      if (saveGameId) {
        scoutedQuery = scoutedQuery.eq('save_game_id', saveGameId);
      } else {
        scoutedQuery = scoutedQuery.is('save_game_id', null);
      }
      
      const { data: scoutedProspects } = await scoutedQuery;
      console.log(`[loadScoutingStatus] Found ${scoutedProspects?.length || 0} scouted prospects for team ${selectedTeamId}`);
      
      // Now filter to only include prospects from the draft season
      // Get prospect IDs for the draft season
      const prospectIdsForSeason = new Set((prospects || []).map(p => p.id));
      const scoutedProspectIds = (scoutedProspects || []).map(sp => sp.prospect_id);
      
      // Count how many scouted prospects are in the draft season
      const scoutedCount = scoutedProspectIds.filter(id => prospectIdsForSeason.has(id)).length;
      console.log(`[loadScoutingStatus] ${scoutedCount} scouted prospects match the draft season`);

      setScoutingStatus({
        totalProspects: prospects?.length || 0,
        scoutedProspects: scoutedCount,
        // Note: Points are now per-scout in scout_priority table, not a global pool
        scoutingPoints: 0, // Deprecated - points are per-scout based on priority
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
        body: JSON.stringify({ season: season.year, saveGameId }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error || data.details || "Failed to advance to new season";
        console.error("Advance error:", data);
        alert(`Error: ${errorMessage}\n\nDetails: ${JSON.stringify(data, null, 2)}`);
        return;
      }

      // Update game store
      const { useGameStore } = await import("@/lib/store/game-store");
      useGameStore.getState().setCurrentSeason(season.year + 1);
      useGameStore.getState().setCurrentWeek(0); // Preseason starts at week 0
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

  // Allow access if in offseason OR if Super Bowl is complete (should transition to offseason)
  const isSuperBowlComplete = season?.champion_team_id !== null && season?.champion_team_id !== undefined;
  const canAccessOffseason = season?.phase === 'offseason' || (season?.phase === 'playoffs' && isSuperBowlComplete);
  
  if (!season || !canAccessOffseason) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="text-center">
              <AlertCircle className="w-16 h-16 text-orange-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Not in Offseason</h2>
              <p className="text-gray-600 mb-4">
                Current phase: <strong>{season?.phase || 'Unknown'}</strong>
                {season?.phase === 'playoffs' && !isSuperBowlComplete && (
                  <span className="block mt-2 text-sm text-orange-600">
                    Complete the Super Bowl and crown a champion to access offseason.
                  </span>
                )}
              </p>
              {season?.phase === 'playoffs' && isSuperBowlComplete && (
                <button
                  onClick={async () => {
                    // Force transition to offseason
                    try {
                      const response = await fetch("/api/playoffs/crown-champion", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ season: season.year, saveGameId }),
                      });
                      if (response.ok) {
                        window.location.reload();
                      }
                    } catch (err) {
                      console.error("Error transitioning to offseason:", err);
                    }
                  }}
                  className="inline-block px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 mb-4"
                >
                  Transition to Offseason
                </button>
              )}
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
              {checklist.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {checklist.filter(item => item.completed).length} of {checklist.length} tasks complete
                </p>
              )}
            </div>
            <button
              onClick={handleAdvanceToSeason}
              disabled={advancing}
              className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {advancing ? "Advancing..." : `Advance to ${season.year + 1} Preseason`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

