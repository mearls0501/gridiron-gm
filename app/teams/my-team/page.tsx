'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { formatCurrency } from '@/lib/utils/format';
import { SalaryCapChart } from '@/app/components/SalaryCapChart';
import { CapBreakdown } from '@/app/components/CapBreakdown';
import { DollarSign, Users, TrendingUp, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useGameStore } from '@/lib/store/game-store';

interface Team {
  id: string;
  name: string;
  abbreviation: string;
  conference: string;
  division: string;
  salary_cap_total: number;
  owner_goal: string;
  owner_expected_wins: number;
}

interface Player {
  id: string;
  full_name: string;
  position: string;
  age: number;
  overall: number;
  potential: number;
  is_prospect?: boolean;
}

interface PlayerContract {
  player_id: string | null;
  prospect_id: string | null;
  contract_year_1: number;
}

export default function MyTeamPage() {
  const { saveGameId } = useGameStore();
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [contracts, setContracts] = useState<Map<string, PlayerContract>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadTeamData();
  }, []);

  async function loadTeamData() {
    try {
      // Get selected team from localStorage (only in browser)
      let selectedTeamId: string | null = null;
      if (typeof window !== 'undefined') {
        selectedTeamId = localStorage.getItem('selectedTeamId');
      }
      
      if (!selectedTeamId) {
        // Try to get from game store
        const { useGameStore } = await import('@/lib/store/game-store');
        const storeTeamId = useGameStore.getState().selectedTeamId;
        
        if (!storeTeamId) {
          setError('No team selected. Please start a new game and select a team.');
          setLoading(false);
          return;
        }
        
        // Use store team ID and save to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem('selectedTeamId', storeTeamId);
        }
        await loadTeam(storeTeamId);
      } else {
        await loadTeam(selectedTeamId);
      }
    } catch (err) {
      console.error('Error loading team data:', err);
      setError('Failed to load team data. Please try again.');
      setLoading(false);
    }
  }

  async function loadTeam(teamId: string) {
    try {
      // Fetch team info
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

      if (teamError || !teamData) {
        throw new Error('Team not found');
      }

      setTeam(teamData);

      // CRITICAL: saveGameId is required - no legacy support
      if (!saveGameId) {
        setError('saveGameId is required. Cannot load roster without save game context.');
        setLoading(false);
        return;
      }

      // Fetch players from player_team_assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from('player_team_assignments')
        .select(`
          player_id,
          prospect_id,
          team_id,
          players (*),
          draft_prospects (*)
        `)
        .eq('team_id', teamId)
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
        if (assignment.player_id && assignment.players) {
          return {
            ...assignment.players,
            is_prospect: false,
          };
        }
        if (assignment.prospect_id && assignment.draft_prospects) {
          return {
            ...assignment.draft_prospects,
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
          .select('player_id, contract_year_1')
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
          .select('prospect_id, contract_year_1')
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
      throw err;
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading your team...</p>
        </div>
      </div>
    );
  }

  if (error || !team) {
    return (
      <div className="ootp-container">
        <div className="max-w-2xl mx-auto mt-12">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-600" />
              <h2 className="text-xl font-bold text-red-900">Team Not Found</h2>
            </div>
            <p className="text-red-700 mb-4">{error || 'Your selected team could not be found.'}</p>
            <div className="flex gap-3">
              <Link
                href="/"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Start New Game
              </Link>
              <Link
                href="/teams"
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Browse Teams
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate salary cap info
  const totalCapHit = players.reduce((sum, p) => {
    const contract = contracts.get(p.id);
    return sum + (contract?.contract_year_1 || 0);
  }, 0);
  const SALARY_CAP = team.salary_cap_total ?? 255000000;
  const remainingCap = SALARY_CAP - totalCapHit;
  const capPercentage = (totalCapHit / SALARY_CAP) * 100;

  // Group players by position
  const playersByPosition: Record<string, Player[]> = {};
  players.forEach((p) => {
    if (!playersByPosition[p.position]) {
      playersByPosition[p.position] = [];
    }
    playersByPosition[p.position].push(p);
  });

  // Calculate cap by position
  const capByPosition: Record<string, number> = {};
  players.forEach((p) => {
    const contract = contracts.get(p.id);
    const capHit = contract?.contract_year_1 || 0;
    if (!capByPosition[p.position]) {
      capByPosition[p.position] = 0;
    }
    capByPosition[p.position] += capHit;
  });

  const capBreakdownSorted = Object.entries(capByPosition).sort(
    (a, b) => b[1] - a[1]
  );

  const chartData = capBreakdownSorted.map(([name, value]) => ({
    name,
    value,
  })) || [];

  // Calculate team average overall
  const avgOverall = players.length > 0
    ? Math.round(players.reduce((sum, p) => sum + p.overall, 0) / players.length)
    : 0;

  return (
    <div className="ootp-container">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="ootp-page-title">{team.name}</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              <span>{team.conference} {team.division}</span>
              <span>•</span>
              <span>{team.abbreviation}</span>
            </div>
          </div>
          <Link
            href={`/teams/${team.id}`}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            View Full Team Page
          </Link>
        </div>
        <div className="h-1 w-24 bg-gradient-to-r from-blue-600 to-blue-400"></div>
      </div>

      {/* Key Stats Grid */}
      <div className="ootp-grid ootp-grid-4 mb-8">
        <div className="ootp-panel">
          <div className="ootp-panel-header">Roster Size</div>
          <div className="ootp-panel-body">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-blue-600" />
              <div>
                <div className="text-3xl font-bold text-gray-900">{players.length}</div>
                <div className="text-sm text-gray-600">Players</div>
              </div>
            </div>
          </div>
        </div>

        <div className="ootp-panel">
          <div className="ootp-panel-header">Team Rating</div>
          <div className="ootp-panel-body">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-green-600" />
              <div>
                <div className="text-3xl font-bold text-gray-900">{avgOverall}</div>
                <div className="text-sm text-gray-600">Avg Overall</div>
              </div>
            </div>
          </div>
        </div>

        <div className="ootp-panel">
          <div className="ootp-panel-header">Salary Cap</div>
          <div className="ootp-panel-body">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-amber-600" />
              <div>
                <div className="text-3xl font-bold text-gray-900">{formatCurrency(remainingCap)}</div>
                <div className="text-sm text-gray-600">Remaining</div>
              </div>
            </div>
          </div>
        </div>

        <div className="ootp-panel">
          <div className="ootp-panel-header">Cap Usage</div>
          <div className="ootp-panel-body">
            <div>
              <div className="text-3xl font-bold text-gray-900">{capPercentage.toFixed(1)}%</div>
              <div className="text-sm text-gray-600 mt-1">
                {formatCurrency(totalCapHit)} / {formatCurrency(SALARY_CAP)}
              </div>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    capPercentage > 90 ? 'bg-red-600' : capPercentage > 75 ? 'bg-yellow-600' : 'bg-green-600'
                  }`}
                  style={{ width: `${Math.min(capPercentage, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Owner Goals */}
      <div className="ootp-grid ootp-grid-2 mb-8">
        <div className="ootp-panel">
          <div className="ootp-panel-header">Owner Expectations</div>
          <div className="ootp-panel-body">
            <div className="space-y-3">
              <div>
                <div className="text-sm text-gray-600 mb-1">Owner Goal</div>
                <div className="font-semibold text-gray-900">{team.owner_goal}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Expected Wins</div>
                <div className="font-semibold text-gray-900">{team.owner_expected_wins} games</div>
              </div>
            </div>
          </div>
        </div>

        <div className="ootp-panel">
          <div className="ootp-panel-header">Quick Actions</div>
          <div className="ootp-panel-body">
            <div className="space-y-2">
              <Link
                href="/free-agents"
                className="block px-4 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-blue-700 font-medium transition-colors"
              >
                Browse Free Agents
              </Link>
              <Link
                href="/draft"
                className="block px-4 py-2 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg text-green-700 font-medium transition-colors"
              >
                View Draft Class
              </Link>
              <Link
                href={`/teams/${team.id}`}
                className="block px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-gray-700 font-medium transition-colors"
              >
                Full Roster
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Salary Cap Breakdown */}
      <div className="ootp-grid ootp-grid-2 mb-8">
        <div className="ootp-panel">
          <div className="ootp-panel-header">Salary Cap Distribution</div>
          <div className="ootp-panel-body">
            <SalaryCapChart chartData={chartData} />
          </div>
        </div>

        <div className="ootp-panel">
          <div className="ootp-panel-header">Cap by Position</div>
          <div className="ootp-panel-body">
            <CapBreakdown capBreakdown={capBreakdownSorted} totalCapHit={totalCapHit} />
          </div>
        </div>
      </div>

      {/* Roster Preview */}
      <div className="ootp-panel">
        <div className="ootp-panel-header">Roster Overview</div>
        <div className="ootp-panel-body">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(playersByPosition).map(([position, positionPlayers]) => (
              <div key={position} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="font-semibold text-gray-900 mb-2">{position}</div>
                <div className="text-2xl font-bold text-blue-600 mb-1">{positionPlayers.length}</div>
                <div className="text-sm text-gray-600">
                  Avg: {Math.round(positionPlayers.reduce((sum, p) => sum + p.overall, 0) / positionPlayers.length)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {formatCurrency(capByPosition[position] || 0)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

