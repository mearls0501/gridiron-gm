'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { formatCurrency } from '@/lib/utils/format';
import { Users, Search, Filter, ArrowUpDown } from 'lucide-react';
import Link from 'next/link';

interface Player {
  id: string;
  full_name: string;
  position: string;
  age: number;
  overall: number;
  potential: number;
  college: string;
  contract_year_1: number;
  contract_year_2: number;
  contract_year_3: number;
  contract_year_4: number;
  signing_bonus: number;
}

const positions = ['All', 'QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'DT', 'LB', 'CB', 'S', 'K', 'P'];

export default function RosterPage() {
  const [team, setTeam] = useState<any>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();

  useEffect(() => {
    loadTeamAndRoster();
  }, []);

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

      // Fetch players
      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select('*')
        .eq('team_id', selectedTeamId)
        .order('position', { ascending: true })
        .order('overall', { ascending: false });

      if (playersError) {
        console.error('Error loading players:', playersError);
      } else {
        setPlayers(playersData || []);
      }
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

  // Group players by position
  const playersByPosition: Record<string, Player[]> = {};
  filteredPlayers.forEach(player => {
    if (!playersByPosition[player.position]) {
      playersByPosition[player.position] = [];
    }
    playersByPosition[player.position].push(player);
  });

  // Calculate roster stats
  const totalCapHit = players.reduce((sum, p) => sum + (p.contract_year_1 || 0), 0);
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
                          {formatCurrency(player.contract_year_1 || 0)}
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

