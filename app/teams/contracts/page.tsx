'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { formatCurrency } from '@/lib/utils/format';
import { generateContract } from '@/lib/contract-generator';
import { FileText, DollarSign, AlertCircle, CheckCircle, X } from 'lucide-react';
import Link from 'next/link';

interface Player {
  id: string;
  full_name: string;
  position: string;
  age: number;
  overall: number;
  potential: number;
  contract_year_1: number;
  contract_year_2: number;
  contract_year_3: number;
  contract_year_4: number;
  signing_bonus: number;
  team_id: string | null;
}

interface Team {
  id: string;
  name: string;
  abbreviation: string;
  salary_cap_total: number;
}

export default function ContractsPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [expiringPlayers, setExpiringPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showResignModal, setShowResignModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [contractYears, setContractYears] = useState<number[]>([0, 0, 0, 0]);
  const [signingBonus, setSigningBonus] = useState<number>(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const positions = ['All', 'QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'DT', 'LB', 'CB', 'S', 'K', 'P'];

  useEffect(() => {
    loadTeamAndContracts();
  }, []);

  useEffect(() => {
    filterPlayers();
  }, [players, selectedPosition, searchTerm]);

  async function loadTeamAndContracts() {
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

      // Fetch all players on team
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
        // Filter for expiring contracts (contract_year_1 is 0 or null)
        const expiring = (playersData || []).filter(
          (p: Player) => !p.contract_year_1 || p.contract_year_1 === 0
        );
        setExpiringPlayers(expiring);
      }
    } catch (err) {
      console.error('Error loading contracts:', err);
    } finally {
      setLoading(false);
    }
  }

  function filterPlayers() {
    let filtered = [...expiringPlayers];

    if (selectedPosition !== 'All') {
      filtered = filtered.filter((p) => p.position === selectedPosition);
    }

    if (searchTerm) {
      filtered = filtered.filter((p) =>
        p.full_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filtered;
  }

  function calculateTotalContractValue(years: number[]): number {
    return years.reduce((sum, year) => sum + (year || 0), 0) + signingBonus;
  }

  function calculateRemainingCap(): number {
    if (!team) return 0;
    const totalCapHit = players.reduce((sum, p) => sum + (p.contract_year_1 || 0), 0);
    const SALARY_CAP = team.salary_cap_total ?? 255000000;
    return SALARY_CAP - totalCapHit;
  }

  function generateSuggestedContract(player: Player): number[] {
    const contract = generateContract(player.position, player.overall);
    return [
      contract.contract_year_1,
      contract.contract_year_2,
      contract.contract_year_3,
      contract.contract_year_4,
    ];
  }

  async function handleResign(player: Player) {
    setSelectedPlayer(player);
    const suggested = generateSuggestedContract(player);
    setContractYears(suggested);
    setSigningBonus(Math.round(suggested[0] * 0.3));
    setShowResignModal(true);
    setError(null);
  }

  async function handleExtend(player: Player) {
    setSelectedPlayer(player);
    // For extension, suggest 2-3 additional years
    const suggested = generateSuggestedContract(player);
    setContractYears([suggested[0], suggested[1], 0, 0]);
    setSigningBonus(Math.round(suggested[0] * 0.2));
    setShowExtendModal(true);
    setError(null);
  }

  async function submitResign() {
    if (!selectedPlayer || !team) return;

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/contracts/resign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: selectedPlayer.id,
          teamId: team.id,
          contractYears: contractYears.filter((y) => y > 0), // Only send non-zero years
          signingBonus,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to re-sign player');
        return;
      }

      // Reload data
      await loadTeamAndContracts();
      setShowResignModal(false);
      setSelectedPlayer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setProcessing(false);
    }
  }

  async function submitExtend() {
    if (!selectedPlayer || !team) return;

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/contracts/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: selectedPlayer.id,
          teamId: team.id,
          additionalYears: contractYears.filter((y) => y > 0),
          signingBonus,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to extend contract');
        return;
      }

      // Reload data
      await loadTeamAndContracts();
      setShowExtendModal(false);
      setSelectedPlayer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setProcessing(false);
    }
  }

  const filteredPlayers = filterPlayers();
  const remainingCap = calculateRemainingCap();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <p className="text-gray-600">Loading contracts...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <p className="text-red-600">Team not found</p>
            <Link href="/" className="text-blue-600 underline mt-4 inline-block">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black text-white tracking-tight mb-2">
                  Contract Management
                </h1>
                <p className="text-slate-300">{team.name}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-sm mb-1">Remaining Cap Space</p>
                <p className={`text-2xl font-bold ${remainingCap < 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {formatCurrency(remainingCap)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Expiring Contracts</p>
                <p className="text-2xl font-bold text-gray-900">{expiringPlayers.length}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-orange-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Players</p>
                <p className="text-2xl font-bold text-gray-900">{players.length}</p>
              </div>
              <FileText className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Cap Hit</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(players.reduce((sum, p) => sum + (p.contract_year_1 || 0), 0))}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-green-500" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex gap-4">
            <select
              value={selectedPosition}
              onChange={(e) => setSelectedPosition(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {positions.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search players..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Players Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Player
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Overall
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contract Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      {expiringPlayers.length === 0
                        ? 'No players with expiring contracts'
                        : 'No players match your filters'}
                    </td>
                  </tr>
                ) : (
                  filteredPlayers.map((player) => (
                    <tr key={player.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{player.full_name}</div>
                        <div className="text-sm text-gray-500">Age {player.age}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {player.position}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {player.overall}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                          Expiring
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleResign(player)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Re-sign
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Re-sign Modal */}
        {showResignModal && selectedPlayer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Re-sign {selectedPlayer.full_name}
                  </h2>
                  <button
                    onClick={() => setShowResignModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
              <div className="p-6">
                {error && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    {error}
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Contract Years
                    </label>
                    <div className="grid grid-cols-4 gap-4">
                      {[0, 1, 2, 3].map((index) => (
                        <div key={index}>
                          <label className="block text-xs text-gray-600 mb-1">
                            Year {index + 1}
                          </label>
                          <input
                            type="number"
                            value={contractYears[index] || 0}
                            onChange={(e) => {
                              const newYears = [...contractYears];
                              newYears[index] = parseInt(e.target.value) || 0;
                              setContractYears(newYears);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            min="0"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Signing Bonus
                    </label>
                    <input
                      type="number"
                      value={signingBonus}
                      onChange={(e) => setSigningBonus(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                    />
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-gray-600">Total Contract Value:</span>
                      <span className="text-lg font-bold text-gray-900">
                        {formatCurrency(calculateTotalContractValue(contractYears))}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Remaining Cap Space:</span>
                      <span className={`text-sm font-semibold ${remainingCap < contractYears[0] ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(remainingCap - contractYears[0])}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-gray-200 flex justify-end gap-4">
                <button
                  onClick={() => setShowResignModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={submitResign}
                  disabled={processing || contractYears[0] === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'Processing...' : 'Re-sign Player'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

