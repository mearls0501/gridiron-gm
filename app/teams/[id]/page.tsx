'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase-client";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils/format";
import { DollarSign } from "lucide-react";
import { SalaryCapChart } from "@/app/components/SalaryCapChart";
import { CapBreakdown } from "@/app/components/CapBreakdown";
import { useGameStore } from "@/lib/store/game-store";

interface PlayerContract {
  player_id: string | null;
  prospect_id: string | null;
  contract_year_1: number;
  contract_year_2: number | null;
  contract_year_3: number | null;
  contract_year_4: number | null;
  signing_bonus: number;
}

export default function TeamRosterPage({ params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { saveGameId } = useGameStore();
  const [team, setTeam] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [contracts, setContracts] = useState<Map<string, PlayerContract>>(new Map());
  const [loading, setLoading] = useState(true);
  const [teamError, setTeamError] = useState<any>(null);
  const [playersError, setPlayersError] = useState<any>(null);
  const [teamId, setTeamId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      // Handle both sync and async params (Next.js 15+ uses async params)
      const resolvedParams = await Promise.resolve(params);
      const id = resolvedParams.id;
      setTeamId(id);

      // 1. Fetch team info - use the ID directly (could be UUID or numeric)
      const { data: teamData, error: teamErr } = await supabase
        .from("teams")
        .select("*")
        .eq("id", id)
        .single();

      if (teamErr) {
        setTeamError(teamErr);
      } else {
        setTeam(teamData);
      }

      // CRITICAL: saveGameId is required - no legacy support
      if (!saveGameId) {
        setPlayersError(new Error("saveGameId is required. Cannot load roster without save game context."));
        setLoading(false);
        return;
      }

      // 2. Fetch players using player_team_assignments for save game isolation
      const { data: assignments, error: assignmentsError } = await supabase
        .from("player_team_assignments")
        .select(`
          player_id,
          prospect_id,
          team_id,
          players (*),
          draft_prospects (*)
        `)
        .eq("team_id", id)
        .eq("save_game_id", saveGameId);

      if (assignmentsError) {
        setPlayersError(assignmentsError);
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

      setPlayers(playersData);

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

      setLoading(false);
    }

    loadData();
  }, [params, saveGameId]);

  // Salary Cap Calculations
  let totalCapHit = 0;
  const capByPosition: Record<string, number> = {};

  players?.forEach((p) => {
    const contract = contracts.get(p.id);
    const capHit = contract?.contract_year_1 || 0;
    totalCapHit += capHit;

    if (!capByPosition[p.position]) {
      capByPosition[p.position] = 0;
    }
    capByPosition[p.position] += capHit;
  });

  const SALARY_CAP = team?.salary_cap_total ?? 255000000;
  const remainingCap = SALARY_CAP - totalCapHit;

  const capBreakdownSorted = Object.entries(capByPosition).sort(
    (a, b) => b[1] - a[1]
  );

  // Prepare data for chart
  const chartData = capBreakdownSorted.map(([name, value]) => ({
    name,
    value,
  }));

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12 pb-20">
        <div className="text-center py-12">
          <p className="text-gray-600">Loading team roster...</p>
        </div>
      </div>
    );
  }

  if (teamError) {
    console.error("Team fetch error:", teamError);
    return (
      <div className="max-w-4xl mx-auto mt-12 p-10">
        <div className="text-red-600">
          <h2 className="text-2xl font-bold mb-2">Team not found</h2>
          <p className="text-sm">Error: {teamError.message}</p>
          <p className="text-sm mt-2">Team ID: {teamId || "unknown"}</p>
        </div>
        <Link href="/teams" className="text-blue-600 underline mt-4 inline-block">
          ← Back to Teams
        </Link>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="max-w-4xl mx-auto mt-12 p-10">
        <div className="text-red-600">
          <h2 className="text-2xl font-bold mb-2">Team not found</h2>
          <p className="text-sm">No team found with ID: {teamId}</p>
        </div>
        <Link href="/teams" className="text-blue-600 underline mt-4 inline-block">
          ← Back to Teams
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 pb-20">
      <Link 
        href="/teams" 
        className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-6 transition-colors"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Teams
      </Link>

      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 text-gray-900">
          {team.name} <span className="text-2xl text-gray-600">({team.abbreviation})</span>
        </h1>
        <div className="flex items-center gap-4 text-gray-600">
          <span className="font-medium">{team.conference}</span>
          <span>•</span>
          <span>{team.division}</span>
          <span>•</span>
          <span>Expected Wins: <strong className="text-gray-900">{team.owner_expected_wins}</strong></span>
        </div>
      </div>

      {/* Salary Cap Summary */}
      <div className="mb-10 p-6 bg-white rounded-lg border shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <DollarSign className="w-8 h-8 text-blue-600" />
          <h2 className="text-3xl font-bold">Salary Cap Summary</h2>
        </div>

        {/* Cap Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-sm text-blue-600 font-medium mb-1">Total Cap</div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(SALARY_CAP)}
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600 font-medium mb-1">Current Cap Hit</div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(totalCapHit)}
            </div>
          </div>
          <div className={`p-4 rounded-lg border ${
            remainingCap < 0 
              ? "bg-red-50 border-red-200" 
              : "bg-green-50 border-green-200"
          }`}>
            <div className={`text-sm font-medium mb-1 ${
              remainingCap < 0 ? "text-red-600" : "text-green-600"
            }`}>
              Remaining Cap
            </div>
            <div className={`text-2xl font-bold ${
              remainingCap < 0 ? "text-red-700" : "text-green-700"
            }`}>
              {formatCurrency(remainingCap)}
            </div>
          </div>
        </div>

        {/* Chart and Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <SalaryCapChart chartData={chartData} />

          {/* Position Breakdown */}
          <CapBreakdown 
            capBreakdown={capBreakdownSorted} 
            totalCapHit={totalCapHit}
          />
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-3xl font-bold mb-2 text-gray-900">Roster</h2>
        <p className="text-gray-600">{players?.length || 0} players</p>
      </div>

      {playersError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-6">
          Error loading players: {playersError.message}
        </div>
      )}

      {(!players || players.length === 0) && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          No players found for this team.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {players?.map((p) => (
          <Link
            key={p.id}
            href={`/players/${p.id}`}
            className="block bg-white rounded-lg shadow-md p-5 border border-gray-200 hover:shadow-lg hover:border-blue-300 transition-all group"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-bold text-lg text-gray-900 group-hover:text-blue-600">
                    {p.full_name}
                  </h3>
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm font-medium">
                    {p.position}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                  <span>OVR: <strong className="text-gray-900">{p.overall}</strong></span>
                  <span>POT: <strong className="text-gray-900">{p.potential}</strong></span>
                  <span>Age: <strong className="text-gray-900">{p.age}</strong></span>
                </div>
                <p className="text-sm text-gray-500">College: {p.college}</p>
              </div>

              <div className="text-right ml-6">
                <p className="text-xs text-gray-500 mb-1">Contract</p>
                <div className="space-y-1 text-sm">
                  {(() => {
                    const contract = contracts.get(p.id);
                    return (
                      <>
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-600">Y1:</span>
                          <span className="font-medium text-gray-900">${(contract?.contract_year_1 || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-600">Y2:</span>
                          <span className="font-medium text-gray-900">${(contract?.contract_year_2 || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-600">Y3:</span>
                          <span className="font-medium text-gray-900">${(contract?.contract_year_3 || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-600">Y4:</span>
                          <span className="font-medium text-gray-900">${(contract?.contract_year_4 || 0).toLocaleString()}</span>
                        </div>
                        <div className="pt-1 mt-1 border-t border-gray-200">
                          <div className="flex justify-between gap-4">
                            <span className="text-gray-600">Bonus:</span>
                            <span className="font-semibold text-blue-600">${(contract?.signing_bonus || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
