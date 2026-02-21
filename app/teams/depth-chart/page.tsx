'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { Users, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useGameStore } from '@/lib/store/game-store';

interface Player {
  id: string;
  full_name: string;
  position: string;
  age: number;
  overall: number;
  potential: number;
}

interface DepthChartPosition {
  position: string;
  players: Player[];
}

// Define depth chart structure
const depthChartPositions = [
  { position: 'QB', slots: 3 },
  { position: 'RB', slots: 4 },
  { position: 'WR', slots: 6 },
  { position: 'TE', slots: 3 },
  { position: 'OT', slots: 4 },
  { position: 'OG', slots: 4 },
  { position: 'C', slots: 2 },
  { position: 'DE', slots: 4 },
  { position: 'DT', slots: 4 },
  { position: 'LB', slots: 6 },
  { position: 'CB', slots: 5 },
  { position: 'S', slots: 4 },
  { position: 'K', slots: 1 },
  { position: 'P', slots: 1 },
];

export default function DepthChartPage() {
  const { saveGameId, currentSeason } = useGameStore();
  const [team, setTeam] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [depthChart, setDepthChart] = useState<DepthChartPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadAllTeams();
  }, []);

  useEffect(() => {
    if (selectedTeamId) {
      loadTeamAndRoster(selectedTeamId);
    }
  }, [selectedTeamId, saveGameId]);

  useEffect(() => {
    if (players.length > 0 && selectedTeamId && saveGameId && currentSeason) {
      loadDepthChartFromDatabase();
    } else if (players.length === 0 && selectedTeamId && saveGameId) {
      // No players loaded yet, just build empty chart
      buildDepthChartClientSide();
    }
  }, [players, selectedTeamId, saveGameId, currentSeason]);

  async function loadAllTeams() {
    try {
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('*')
        .order('conference')
        .order('division')
        .order('name');

      if (teamsError) {
        console.error('Error loading teams:', teamsError);
        return;
      }

      setTeams(teamsData || []);

      // Initialize selected team from localStorage or game store
      let initialTeamId: string | null = null;
      if (typeof window !== 'undefined') {
        initialTeamId = localStorage.getItem('selectedTeamId');
      }

      if (!initialTeamId) {
        const { useGameStore } = await import('@/lib/store/game-store');
        initialTeamId = useGameStore.getState().selectedTeamId;
      }

      if (initialTeamId) {
        setSelectedTeamId(initialTeamId);
      } else if (teamsData && teamsData.length > 0) {
        // Default to first team if no team is selected
        setSelectedTeamId(teamsData[0].id);
      }
    } catch (err) {
      console.error('Error loading teams:', err);
    }
  }

  async function loadTeamAndRoster(teamId: string) {
    try {
      console.log('[DepthChart] loadTeamAndRoster called for team:', teamId);
      setLoading(true);
      
      if (!teamId) {
        router.push('/');
        return;
      }

      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

      if (teamError || !teamData) {
        console.error('[DepthChart] Error loading team:', teamError);
        return;
      }

      console.log('[DepthChart] Team loaded:', teamData.name);
      setTeam(teamData);

      // CRITICAL: saveGameId is required - no legacy support
      if (!saveGameId) {
        setLoading(false);
        return;
      }

      // Fetch players using player_team_assignments for save game isolation
      const { data: assignments, error: assignmentsError } = await supabase
        .from('player_team_assignments')
        .select(`
          player_id,
          prospect_id,
          team_id,
          players (id, full_name, position, age, overall, potential),
          draft_prospects (id, full_name, position, age, overall, potential)
        `)
        .eq('team_id', teamId)
        .eq('save_game_id', saveGameId);

      if (assignmentsError) {
        console.error('[DepthChart] Error loading player assignments:', assignmentsError);
        setLoading(false);
        return;
      }

      console.log('[DepthChart] Loaded', assignments?.length || 0, 'player assignments');

      if (!assignments || assignments.length === 0) {
        console.warn('[DepthChart] No player assignments found for team');
        setPlayers([]);
        setLoading(false);
        return;
      }

      // Map assignments to player/prospect data
      const playersData = assignments.map((assignment: any) => {
        if (assignment.player_id && assignment.players) {
          return {
            ...assignment.players,
            team_id: assignment.team_id,
          };
        }
        if (assignment.prospect_id && assignment.draft_prospects) {
          return {
            ...assignment.draft_prospects,
            team_id: assignment.team_id,
          };
        }
        return null;
      }).filter(Boolean);
      
      // Sort players
      playersData.sort((a, b) => {
        if (a.position !== b.position) {
          return a.position.localeCompare(b.position);
        }
        return (b.overall || 0) - (a.overall || 0);
      });
      
      console.log('[DepthChart] Setting players state with', playersData.length, 'players');
      setPlayers(playersData || []);
    } catch (err) {
      console.error('[DepthChart] Error loading roster:', err);
    } finally {
      console.log('[DepthChart] loadTeamAndRoster complete');
      setLoading(false);
    }
  }

  async function loadDepthChartFromDatabase() {
    if (!saveGameId || !selectedTeamId || !currentSeason) {
      // Fall back to client-side sort if no save game
      buildDepthChartClientSide();
      return;
    }

    try {
      // Get season_id
      const { data: seasonData } = await supabase
        .from('seasons')
        .select('id')
        .eq('year', currentSeason)
        .eq('save_game_id', saveGameId)
        .single();

      if (!seasonData) {
        buildDepthChartClientSide();
        return;
      }

      // Load depth chart from database
      const { data: slots, error } = await supabase
        .from('depth_chart_slots')
        .select('position, slot, player_id')
        .eq('team_id', selectedTeamId)
        .eq('season_id', seasonData.id)
        .eq('save_game_id', saveGameId)
        .order('position')
        .order('slot');

      if (error || !slots || slots.length === 0) {
        // No saved depth chart, use client-side sort
        console.log('[DepthChart] No saved depth chart found, using client-side sort');
        buildDepthChartClientSide();
        return;
      }

      // Build chart from database slots
      const chart: DepthChartPosition[] = [];
      
      console.log('[DepthChart] Database slots loaded:', slots.length);
      console.log('[DepthChart] Sample slot:', slots[0]);
      console.log('[DepthChart] Players array size:', players.length);
      console.log('[DepthChart] Sample player:', players[0]);
      
      depthChartPositions.forEach(({ position, slots: maxSlots }) => {
        const positionSlots = slots.filter(s => s.position === position);
        const positionPlayers: Player[] = [];

        // Map slot player_ids to actual player objects
        positionSlots.forEach(slot => {
          const player = players.find(p => p.id === slot.player_id);
          if (player) {
            positionPlayers.push(player);
          } else {
            console.warn(`[DepthChart] Could not find player with id ${slot.player_id} for position ${slot.position}`);
          }
        });

        // Add any players not in depth chart (sorted by overall)
        const playersNotInDepthChart = players
          .filter(p => p.position === position && !positionPlayers.find(dp => dp.id === p.id))
          .sort((a, b) => b.overall - a.overall);

        console.log(`[DepthChart] Position ${position}: ${positionPlayers.length} from slots, ${playersNotInDepthChart.length} not in depth chart`);

        // Combine: depth chart players first, then others
        const allPositionPlayers = [...positionPlayers, ...playersNotInDepthChart].slice(0, maxSlots);

        chart.push({
          position,
          players: allPositionPlayers,
        });
      });

      console.log('[DepthChart] Loaded depth chart from database:', chart.length, 'positions');
      console.log('[DepthChart] Sample position chart:', chart[0]);
      setDepthChart(chart);
    } catch (err) {
      console.error('[DepthChart] Error loading from database:', err);
      buildDepthChartClientSide();
    }
  }

  function buildDepthChartClientSide() {
    const chart: DepthChartPosition[] = [];

    depthChartPositions.forEach(({ position, slots }) => {
      const positionPlayers = players
        .filter(p => p.position === position)
        .sort((a, b) => b.overall - a.overall)
        .slice(0, slots);

      chart.push({
        position,
        players: positionPlayers,
      });
    });

    console.log('[DepthChart] Built depth chart client-side');
    setDepthChart(chart);
  }

  function movePlayerUp(position: string, playerIndex: number) {
    if (playerIndex === 0) return;
    
    const positionData = depthChart.find(p => p.position === position);
    if (!positionData) return;

    const newPlayers = [...positionData.players];
    [newPlayers[playerIndex - 1], newPlayers[playerIndex]] = [newPlayers[playerIndex], newPlayers[playerIndex - 1]];

    setDepthChart(prev => prev.map(p => 
      p.position === position ? { ...p, players: newPlayers } : p
    ));
  }

  function movePlayerDown(position: string, playerIndex: number) {
    const positionData = depthChart.find(p => p.position === position);
    if (!positionData || playerIndex >= positionData.players.length - 1) return;

    const newPlayers = [...positionData.players];
    [newPlayers[playerIndex], newPlayers[playerIndex + 1]] = [newPlayers[playerIndex + 1], newPlayers[playerIndex]];

    setDepthChart(prev => prev.map(p => 
      p.position === position ? { ...p, players: newPlayers } : p
    ));
  }

  async function autoGenerateDepthChart() {
    if (!saveGameId || !selectedTeamId) {
      alert('Please select a team first');
      return;
    }
    
    console.log('[DepthChart] Auto-generating for team:', selectedTeamId);
    setIsRegenerating(true);
    try {
      const response = await fetch('/api/depth-chart/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          season: currentSeason || 2025,
          saveGameId: saveGameId,
          teamId: selectedTeamId, // Only update THIS team
        }),
      });
      
      console.log('[DepthChart] API response status:', response.status);
      
      const result = await response.json();
      console.log('[DepthChart] API result:', result);
      
      if (result.success) {
        // Reload roster AND depth chart from database
        if (selectedTeamId) {
          console.log('[DepthChart] Reloading team and roster...');
          await loadTeamAndRoster(selectedTeamId);
          console.log('[DepthChart] Reload complete, players loaded:', players.length);
          
          // Give React a moment to update state, then force reload depth chart
          setTimeout(() => {
            loadDepthChartFromDatabase();
          }, 500);
        }
        alert(`Depth chart generated successfully for this team!\n${result.totalSlots} slots created for ${result.teamsUpdated} team(s).`);
      } else {
        console.error('Failed to auto-generate depth chart:', result.error);
        
        // If error is "No players found", offer to diagnose
        if (result.error?.includes('No players found')) {
          const diagnose = confirm(
            `No players found for this team.\n\n` +
            `This usually happens with older save games.\n\n` +
            `Would you like to run diagnostics to find the issue?`
          );
          
          if (diagnose) {
            await runDiagnostics();
          }
        } else {
          alert(`Failed to generate depth chart: ${result.error}`);
        }
      }
    } catch (err) {
      console.error('Failed to auto-generate depth chart:', err);
      alert('Failed to generate depth chart. Please try again.');
    } finally {
      setIsRegenerating(false);
    }
  }

  async function runDiagnostics() {
    if (!saveGameId || !selectedTeamId) return;
    
    try {
      const response = await fetch('/api/depth-chart/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: selectedTeamId,
          saveGameId,
        }),
      });
      
      const result = await response.json();
      console.log('Depth Chart Diagnostics:', result);
      
      if (result.recommendation) {
        const needsFix = result.summary?.hasNullAssignments && !result.summary?.hasAssignments;
        
        if (needsFix) {
          const fix = confirm(
            `Diagnosis: ${result.recommendation}\n\n` +
            `Found ${result.summary.nullAssignmentCount} player assignments that need to be migrated.\n\n` +
            `Would you like to automatically fix this now?`
          );
          
          if (fix) {
            await fixAssignments();
          }
        } else {
          alert(`Diagnosis: ${result.recommendation}\n\nSee console for full diagnostics.`);
        }
      }
    } catch (err) {
      console.error('Failed to run diagnostics:', err);
      alert('Failed to run diagnostics. Check console for errors.');
    }
  }

  async function fixAssignments() {
    if (!saveGameId) return;
    
    setIsRegenerating(true);
    try {
      const response = await fetch('/api/depth-chart/fix-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saveGameId,
          teamId: selectedTeamId,
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        alert(`Fixed ${result.updated} player assignments!\n\nNow try generating the depth chart again.`);
        // Try generating depth chart again
        await autoGenerateDepthChart();
      } else {
        alert(`Failed to fix assignments: ${result.error}`);
      }
    } catch (err) {
      console.error('Failed to fix assignments:', err);
      alert('Failed to fix assignments. Check console for errors.');
    } finally {
      setIsRegenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="ootp-container">
        <div className="text-center py-12">
          <p className="text-gray-600">Loading depth chart...</p>
        </div>
      </div>
    );
  }

  if (!team && !loading) {
    return (
      <div className="ootp-container">
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">Team not found</p>
          <Link href="/" className="text-blue-600 hover:underline">Go to Home</Link>
        </div>
      </div>
    );
  }

  if (!team) {
    return null; // Will show loading state
  }

  return (
    <div className="ootp-container">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <h1 className="ootp-page-title">Depth Chart</h1>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-2">
                <label htmlFor="team-select" className="text-sm font-medium text-gray-700">
                  Team:
                </label>
                <select
                  id="team-select"
                  value={selectedTeamId || ''}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.abbreviation}) - {t.conference} {t.division}
                    </option>
                  ))}
                </select>
              </div>
              {team && (
                <span className="text-sm text-gray-600">
                  {team.conference} {team.division}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={autoGenerateDepthChart}
              disabled={isRegenerating || !selectedTeamId}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              title="Auto-generate depth chart based on player overall ratings"
            >
              <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} />
              {isRegenerating ? 'Generating...' : 'Auto-Generate'}
            </button>
            <Link
              href="/teams/my-team"
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Back to My Team
            </Link>
          </div>
        </div>
        <div className="h-1 w-24 bg-gradient-to-r from-blue-600 to-blue-400"></div>
      </div>

      {/* Info Banner */}
      <div className="ootp-panel mb-8">
        <div className="ootp-panel-body">
          <div className="flex items-start gap-3">
            <Users className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm text-gray-700">
                <strong>Depth Chart:</strong> Click "Auto-Generate" to automatically rank players by overall rating, 
                or use the arrows to manually adjust player order. Depth charts are automatically updated weekly when 
                "Auto Depth Chart" is enabled in game settings.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Depth Chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Offense */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Offense</h2>
          
          {depthChart.filter(p => ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C'].includes(p.position)).map(({ position, players: positionPlayers }) => (
            <div key={position} className="ootp-panel">
              <div className="ootp-panel-header">{position}</div>
              <div className="ootp-panel-body p-0">
                <div className="divide-y divide-gray-200">
                  {positionPlayers.length > 0 ? (
                    positionPlayers.map((player, index) => (
                      <div
                        key={player.id}
                        className={`p-4 flex items-center justify-between ${
                          index === 0 ? 'bg-blue-50' : index === 1 ? 'bg-gray-50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => movePlayerUp(position, index)}
                              disabled={index === 0}
                              className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label="Move up"
                            >
                              <ArrowUp className="w-4 h-4 text-gray-600" />
                            </button>
                            <button
                              onClick={() => movePlayerDown(position, index)}
                              disabled={index >= positionPlayers.length - 1}
                              className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label="Move down"
                            >
                              <ArrowDown className="w-4 h-4 text-gray-600" />
                            </button>
                          </div>
                          <div className="flex-1">
                            <Link
                              href={`/players/${player.id}`}
                              className="font-semibold text-blue-600 hover:text-blue-800"
                            >
                              {player.full_name}
                            </Link>
                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                              <span>OVR: <strong className="text-gray-900">{player.overall}</strong></span>
                              <span>POT: <strong className="text-gray-900">{player.potential}</strong></span>
                              <span>Age: {player.age}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            index === 0 ? 'bg-blue-600 text-white' : 
                            index === 1 ? 'bg-gray-400 text-white' : 
                            'bg-gray-200 text-gray-700'
                          }`}>
                            {index === 0 ? 'Starter' : index === 1 ? 'Backup' : `#${index + 1}`}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      No players at this position
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Defense & Special Teams */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Defense & Special Teams</h2>
          
          {depthChart.filter(p => ['DE', 'DT', 'LB', 'CB', 'S', 'K', 'P'].includes(p.position)).map(({ position, players: positionPlayers }) => (
            <div key={position} className="ootp-panel">
              <div className="ootp-panel-header">{position}</div>
              <div className="ootp-panel-body p-0">
                <div className="divide-y divide-gray-200">
                  {positionPlayers.length > 0 ? (
                    positionPlayers.map((player, index) => (
                      <div
                        key={player.id}
                        className={`p-4 flex items-center justify-between ${
                          index === 0 ? 'bg-blue-50' : index === 1 ? 'bg-gray-50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => movePlayerUp(position, index)}
                              disabled={index === 0}
                              className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label="Move up"
                            >
                              <ArrowUp className="w-4 h-4 text-gray-600" />
                            </button>
                            <button
                              onClick={() => movePlayerDown(position, index)}
                              disabled={index >= positionPlayers.length - 1}
                              className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label="Move down"
                            >
                              <ArrowDown className="w-4 h-4 text-gray-600" />
                            </button>
                          </div>
                          <div className="flex-1">
                            <Link
                              href={`/players/${player.id}`}
                              className="font-semibold text-blue-600 hover:text-blue-800"
                            >
                              {player.full_name}
                            </Link>
                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                              <span>OVR: <strong className="text-gray-900">{player.overall}</strong></span>
                              <span>POT: <strong className="text-gray-900">{player.potential}</strong></span>
                              <span>Age: {player.age}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            index === 0 ? 'bg-blue-600 text-white' : 
                            index === 1 ? 'bg-gray-400 text-white' : 
                            'bg-gray-200 text-gray-700'
                          }`}>
                            {index === 0 ? 'Starter' : index === 1 ? 'Backup' : `#${index + 1}`}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      No players at this position
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

