'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { formatCurrency } from '@/lib/utils/format';
import { Users, Search, Filter, ArrowUpDown, X } from 'lucide-react';
import Link from 'next/link';
import { useGameStore } from '@/lib/store/game-store';

interface Player {
  id: string;
  full_name: string;
  position: string;
  age: number;
  overall: number;
  potential: number;
  college: string;
  is_prospect?: boolean;
}

interface PlayerContract {
  player_id: string | null;
  prospect_id: string | null;
  contract_year_1: number;
  contract_year_2: number | null;
  contract_year_3: number | null;
  contract_year_4: number | null;
  signing_bonus: number;
}

const positions = ['All', 'QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'DT', 'LB', 'CB', 'S', 'K', 'P'];

export default function RosterPage() {
  const { saveGameId, selectedTeamId } = useGameStore();
  const [team, setTeam] = useState<any>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [contracts, setContracts] = useState<Map<string, PlayerContract>>(new Map());
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [cutting, setCutting] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadTeamAndRoster();
  }, [saveGameId]);

  useEffect(() => {
    filterPlayers();
  }, [players, selectedPosition, searchTerm]);

  async function loadTeamAndRoster() {
    try {
      // Get selected team from localStorage
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

      // Fetch team
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
          players (*),
          draft_prospects (*)
        `)
        .eq('team_id', selectedTeamId)
        .eq('save_game_id', saveGameId);

      if (assignmentsError) {
        console.error('Error loading player assignments:', assignmentsError);
        setLoading(false);
        return;
      }

      if (!assignments || assignments.length === 0) {
        setPlayers([]);
        setContracts(new Map());
        setLoading(false);
        return;
      }

      // Map assignments to player/prospect data (without contracts)
      const playersData = assignments.map((assignment: any) => {
        // If it's a player (seed player), use players data
        if (assignment.player_id && assignment.players) {
          return {
            ...assignment.players,
            team_id: assignment.team_id,
            is_prospect: false,
          };
        }
        // If it's a prospect (drafted), use draft_prospects data
        if (assignment.prospect_id && assignment.draft_prospects) {
          return {
            ...assignment.draft_prospects,
            team_id: assignment.team_id,
            is_prospect: true,
            is_rookie: true,
          };
        }
        return null;
      }).filter(Boolean);

      // Sort players
      playersData.sort((a: any, b: any) => {
        if (a.position !== b.position) {
          return a.position.localeCompare(b.position);
        }
        return (b.overall || 0) - (a.overall || 0);
      });

      setPlayers(playersData || []);

      // Load contracts separately from player_contracts_per_save_game
      const playerIds = playersData
        .map((p: any) => p.is_prospect ? null : p.id)
        .filter(Boolean) as string[];
      const prospectIds = playersData
        .map((p: any) => p.is_prospect ? p.id : null)
        .filter(Boolean) as string[];

      const contractMap = new Map<string, PlayerContract>();

      if (playerIds.length > 0) {
        const { data: playerContracts } = await supabase
          .from('player_contracts_per_save_game')
          .select('*')
          .in('player_id', playerIds)
          .eq('save_game_id', saveGameId);

        if (playerContracts) {
          playerContracts.forEach((contract: any) => {
            if (contract.player_id) {
              contractMap.set(contract.player_id, contract);
            }
          });
        }
      }

      if (prospectIds.length > 0) {
        const { data: prospectContracts } = await supabase
          .from('player_contracts_per_save_game')
          .select('*')
          .in('prospect_id', prospectIds)
          .eq('save_game_id', saveGameId);

        if (prospectContracts) {
          prospectContracts.forEach((contract: any) => {
            if (contract.prospect_id) {
              contractMap.set(contract.prospect_id, contract);
            }
          });
        }
      }

      setContracts(contractMap);
    } catch (err) {
      console.error('Error loading roster:', err);
    } finally {
      setLoading(false);
    }
  }

  function filterPlayers() {
    let filtered = [...players];

    // Filter by position
    if (selectedPosition !== 'All') {
      filtered = filtered.filter(p => p.position === selectedPosition);
    }

    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.full_name.toLowerCase().includes(search) ||
        p.position.toLowerCase().includes(search) ||
        p.college.toLowerCase().includes(search)
      );
    }

    setFilteredPlayers(filtered);
  }

  async function handleCutPlayer(playerId: string, e: React.MouseEvent) {
    e.stopPropagation(); // Prevent row click navigation
    
    if (!confirm("Are you sure you want to cut this player? They will become a free agent.")) {
      return;
    }

    if (!selectedTeamId || !saveGameId) {
      alert("Team or save game not found. Please refresh the page.");
      return;
    }

    try {
      setCutting(playerId);

      const response = await fetch("/api/roster-cut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          teamId: selectedTeamId,
          saveGameId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(`Error: ${data.error}`);
        return;
      }

      // Reload roster data
      await loadTeamAndRoster();
    } catch (error) {
      console.error("Error cutting player:", error);
      alert("Failed to cut player. Please try again.");
    } finally {
      setCutting(null);
    }
  }

  // Group players by position
  const playersByPosition: Record<string, Player[]> = {};
  filteredPlayers.forEach(player => {
    if (!playersByPosition[player.position]) {
      playersByPosition[player.position] = [];
    }
    playersByPosition[player.position].push(player);
  });

  // Calculate roster stats
  const totalCapHit = players.reduce((sum, p) => {
    const contract = contracts.get(p.id);
    return sum + (contract?.contract_year_1 || 0);
  }, 0);
  const avgOverall = players.length > 0
    ? Math.round(players.reduce((sum, p) => sum + p.overall, 0) / players.length)
    : 0;

  if (loading) {
    return (
      <div className="ootp-container">
        <div className="text-center py-12">
          <p className="text-gray-600">Loading roster...</p>
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
            <h1 className="ootp-page-title">{team.name} Roster</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              <span>{team.conference} {team.division}</span>
              <span>•</span>
              <span>{filteredPlayers.length} players</span>
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

      {/* Stats Summary */}
      <div className="ootp-grid ootp-grid-4 mb-8">
        <div className="ootp-panel">
          <div className="ootp-panel-header">Roster Size</div>
          <div className="ootp-panel-body">
            <div className="text-3xl font-bold text-gray-900">{players.length}</div>
            <div className="text-sm text-gray-600">Total Players</div>
          </div>
        </div>
        <div className="ootp-panel">
          <div className="ootp-panel-header">Team Rating</div>
          <div className="ootp-panel-body">
            <div className="text-3xl font-bold text-gray-900">{avgOverall}</div>
            <div className="text-sm text-gray-600">Avg Overall</div>
          </div>
        </div>
        <div className="ootp-panel">
          <div className="ootp-panel-header">Total Cap Hit</div>
          <div className="ootp-panel-body">
            <div className="text-3xl font-bold text-gray-900">{formatCurrency(totalCapHit)}</div>
            <div className="text-sm text-gray-600">Current Season</div>
          </div>
        </div>
        <div className="ootp-panel">
          <div className="ootp-panel-header">Active Filters</div>
          <div className="ootp-panel-body">
            <div className="text-3xl font-bold text-gray-900">{filteredPlayers.length}</div>
            <div className="text-sm text-gray-600">Showing</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="ootp-panel mb-8">
        <div className="ootp-panel-header">Filters</div>
        <div className="ootp-panel-body">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Search className="w-5 h-5 text-gray-500" />
              <input
                type="text"
                placeholder="Search players..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-500" />
              <select
                value={selectedPosition}
                onChange={(e) => setSelectedPosition(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {positions.map(pos => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Roster by Position */}
      <div className="space-y-6">
        {Object.keys(playersByPosition).sort().map(position => (
          <div key={position} className="ootp-panel">
            <div className="ootp-panel-header">
              {position} ({playersByPosition[position].length})
            </div>
            <div className="ootp-panel-body p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Age</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OVR</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">POT</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">College</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contract</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {playersByPosition[position].map(player => (
                      <tr
                        key={player.id}
                        className="hover:bg-blue-50 cursor-pointer transition-colors"
                        onClick={() => router.push(`/players/${player.id}`)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Link
                            href={`/players/${player.id}`}
                            className="font-semibold text-blue-600 hover:text-blue-800"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {player.full_name}
                          </Link>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{player.age}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                            {player.overall}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{player.potential}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{player.college}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(contracts.get(player.id)?.contract_year_1 || 0)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleCutPlayer(player.id, e)}
                            disabled={cutting === player.id}
                            className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                            title="Cut player"
                          >
                            <X className="w-4 h-4" />
                            {cutting === player.id ? 'Cutting...' : 'Cut'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredPlayers.length === 0 && (
        <div className="ootp-panel">
          <div className="ootp-panel-body text-center py-12">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">No players found matching your filters</p>
          </div>
        </div>
      )}
    </div>
  );
}

