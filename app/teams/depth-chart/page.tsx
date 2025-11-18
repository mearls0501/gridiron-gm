'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { Users, ArrowUp, ArrowDown } from 'lucide-react';
import Link from 'next/link';

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
  const [team, setTeam] = useState<any>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [depthChart, setDepthChart] = useState<DepthChartPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadTeamAndRoster();
  }, []);

  useEffect(() => {
    buildDepthChart();
  }, [players]);

  async function loadTeamAndRoster() {
    try {
      let selectedTeamId: string | null = null;
      if (typeof window !== 'undefined') {
        selectedTeamId = localStorage.getItem('selectedTeamId');
      }

      if (!selectedTeamId) {
        const { useGameStore } = await import('@/lib/store/game-store');
        selectedTeamId = useGameStore.getState().selectedTeamId;
      }

      if (!selectedTeamId) {
        router.push('/');
        return;
      }

      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('id', selectedTeamId)
        .single();

      if (teamError || !teamData) {
        console.error('Error loading team:', teamError);
        return;
      }

      setTeam(teamData);

      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select('id, full_name, position, age, overall, potential')
        .eq('team_id', selectedTeamId)
        .order('position', { ascending: true })
        .order('overall', { ascending: false });

      if (playersError) {
        console.error('Error loading players:', playersError);
      } else {
        setPlayers(playersData || []);
      }
    } catch (err) {
      console.error('Error loading depth chart:', err);
    } finally {
      setLoading(false);
    }
  }

  function buildDepthChart() {
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

  if (loading) {
    return (
      <div className="ootp-container">
        <div className="text-center py-12">
          <p className="text-gray-600">Loading depth chart...</p>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="ootp-container">
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">Team not found</p>
          <Link href="/" className="text-blue-600 hover:underline">Go to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ootp-container">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="ootp-page-title">{team.name} Depth Chart</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              <span>{team.conference} {team.division}</span>
            </div>
          </div>
          <Link
            href="/teams/my-team"
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Back to My Team
          </Link>
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
                <strong>Depth Chart:</strong> Players are automatically sorted by overall rating. 
                Use the arrows to adjust player order. Changes are saved automatically.
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

