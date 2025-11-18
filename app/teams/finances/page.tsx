'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { formatCurrency } from '@/lib/utils/format';
import { DollarSign, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { SalaryCapChart } from '@/app/components/SalaryCapChart';
import { CapBreakdown } from '@/app/components/CapBreakdown';

interface Player {
  id: string;
  full_name: string;
  position: string;
  contract_year_1: number;
  contract_year_2: number;
  contract_year_3: number;
  contract_year_4: number;
  signing_bonus: number;
}

export default function FinancesPage() {
  const [team, setTeam] = useState<any>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadTeamAndFinances();
  }, []);

  async function loadTeamAndFinances() {
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
        .select('id, full_name, position, contract_year_1, contract_year_2, contract_year_3, contract_year_4, signing_bonus')
        .eq('team_id', selectedTeamId)
        .order('contract_year_1', { ascending: false });

      if (playersError) {
        console.error('Error loading players:', playersError);
      } else {
        setPlayers(playersData || []);
      }
    } catch (err) {
      console.error('Error loading finances:', err);
    } finally {
      setLoading(false);
    }
  }

  // Calculate financial metrics
  const SALARY_CAP = team?.salary_cap_total ?? 255000000;
  const currentYearCap = players.reduce((sum, p) => sum + (p.contract_year_1 || 0), 0);
  const nextYearCap = players.reduce((sum, p) => sum + (p.contract_year_2 || 0), 0);
  const year3Cap = players.reduce((sum, p) => sum + (p.contract_year_3 || 0), 0);
  const year4Cap = players.reduce((sum, p) => sum + (p.contract_year_4 || 0), 0);
  const totalSigningBonuses = players.reduce((sum, p) => sum + (p.signing_bonus || 0), 0);
  const remainingCap = SALARY_CAP - currentYearCap;
  const capPercentage = (currentYearCap / SALARY_CAP) * 100;

  // Top contracts
  const topContracts = [...players]
    .sort((a, b) => (b.contract_year_1 || 0) - (a.contract_year_1 || 0))
    .slice(0, 10);

  // Cap by position
  const capByPosition: Record<string, number> = {};
  players.forEach((p) => {
    if (!capByPosition[p.position]) {
      capByPosition[p.position] = 0;
    }
    capByPosition[p.position] += p.contract_year_1 || 0;
  });

  const capBreakdownSorted = Object.entries(capByPosition).sort(
    (a, b) => b[1] - a[1]
  );

  const chartData = capBreakdownSorted.map(([name, value]) => ({
    name,
    value,
  }));

  if (loading) {
    return (
      <div className="ootp-container">
        <div className="text-center py-12">
          <p className="text-gray-600">Loading finances...</p>
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
            <h1 className="ootp-page-title">{team.name} Finances</h1>
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

      {/* Current Year Cap Summary */}
      <div className="ootp-panel mb-8">
        <div className="ootp-panel-header flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Current Season Salary Cap
        </div>
        <div className="ootp-panel-body">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-sm text-blue-600 font-medium mb-1">Total Cap</div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(SALARY_CAP)}</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-sm text-gray-600 font-medium mb-1">Current Cap Hit</div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(currentYearCap)}</div>
              <div className="text-xs text-gray-500 mt-1">{capPercentage.toFixed(1)}% used</div>
            </div>
            <div className={`p-4 rounded-lg border ${
              remainingCap < 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
            }`}>
              <div className={`text-sm font-medium mb-1 ${
                remainingCap < 0 ? 'text-red-600' : 'text-green-600'
              }`}>
                Remaining Cap
              </div>
              <div className={`text-2xl font-bold ${
                remainingCap < 0 ? 'text-red-700' : 'text-green-700'
              }`}>
                {formatCurrency(remainingCap)}
              </div>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="text-sm text-purple-600 font-medium mb-1">Signing Bonuses</div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(totalSigningBonuses)}</div>
            </div>
          </div>

          {/* Cap Usage Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Cap Usage</span>
              <span>{capPercentage.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className={`h-4 rounded-full transition-all ${
                  capPercentage > 90 ? 'bg-red-600' : 
                  capPercentage > 75 ? 'bg-yellow-600' : 
                  'bg-green-600'
                }`}
                style={{ width: `${Math.min(capPercentage, 100)}%` }}
              />
            </div>
          </div>

          {remainingCap < 0 && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Over the Salary Cap</p>
                <p className="text-xs text-red-700 mt-1">
                  You are {formatCurrency(Math.abs(remainingCap))} over the cap. You must release players or restructure contracts.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Future Cap Commitments */}
      <div className="ootp-panel mb-8">
        <div className="ootp-panel-header">Future Cap Commitments</div>
        <div className="ootp-panel-body">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-sm text-gray-600 font-medium mb-1">Year 1 (Current)</div>
              <div className="text-xl font-bold text-gray-900">{formatCurrency(currentYearCap)}</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-sm text-gray-600 font-medium mb-1">Year 2</div>
              <div className="text-xl font-bold text-gray-900">{formatCurrency(nextYearCap)}</div>
              <div className="text-xs text-gray-500 mt-1">
                {nextYearCap > currentYearCap ? (
                  <span className="text-red-600 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {formatCurrency(nextYearCap - currentYearCap)} increase
                  </span>
                ) : (
                  <span className="text-green-600 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" />
                    {formatCurrency(currentYearCap - nextYearCap)} decrease
                  </span>
                )}
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-sm text-gray-600 font-medium mb-1">Year 3</div>
              <div className="text-xl font-bold text-gray-900">{formatCurrency(year3Cap)}</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-sm text-gray-600 font-medium mb-1">Year 4</div>
              <div className="text-xl font-bold text-gray-900">{formatCurrency(year4Cap)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Cap Distribution */}
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
            <CapBreakdown capBreakdown={capBreakdownSorted} totalCapHit={currentYearCap} />
          </div>
        </div>
      </div>

      {/* Top Contracts */}
      <div className="ootp-panel">
        <div className="ootp-panel-header">Top 10 Contracts</div>
        <div className="ootp-panel-body p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year 1</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year 2</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year 3</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year 4</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Signing Bonus</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Value</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {topContracts.map(player => {
                  const totalValue = (player.contract_year_1 || 0) + 
                                   (player.contract_year_2 || 0) + 
                                   (player.contract_year_3 || 0) + 
                                   (player.contract_year_4 || 0) + 
                                   (player.signing_bonus || 0);
                  return (
                    <tr key={player.id} className="hover:bg-blue-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link
                          href={`/players/${player.id}`}
                          className="font-semibold text-blue-600 hover:text-blue-800"
                        >
                          {player.full_name}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{player.position}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(player.contract_year_1 || 0)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(player.contract_year_2 || 0)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(player.contract_year_3 || 0)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(player.contract_year_4 || 0)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-medium">{formatCurrency(player.signing_bonus || 0)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{formatCurrency(totalValue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

