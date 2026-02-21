"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/store/game-store";

interface TeamContractStats {
  teamId: string;
  teamName: string;
  playersOnRoster: number;
  playersWithContracts: number;
  playersMissingContracts: number;
  totalCapHit: number;
  missingPlayerIds: string[];
}

export default function DiagnoseContractsPage() {
  const { saveGameId } = useGameStore();
  const [loading, setLoading] = useState(false);
  const [globalStats, setGlobalStats] = useState<{
    totalPlayersOnTeams: number;
    totalContracts: number;
    seedContractsAvailable: number;
    missingContracts: number;
  } | null>(null);
  const [teamStats, setTeamStats] = useState<TeamContractStats[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamContractStats | null>(null);

  const handleDiagnose = async () => {
    if (!saveGameId) {
      alert("No save game loaded. Please load a game first.");
      return;
    }

    setLoading(true);
    setGlobalStats(null);
    setTeamStats([]);
    setSelectedTeam(null);

    try {
      const { supabase } = await import("@/lib/supabase-client");

      // Get all players on teams using pagination
      console.log("[Diagnose] Fetching all players...");
      let allPlayers: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: page } = await supabase
          .from("players")
          .select("id, full_name, position, overall, team_id")
          .not("team_id", "is", null)
          .range(offset, offset + pageSize - 1);

        if (page && page.length > 0) {
          allPlayers = [...allPlayers, ...page];
          offset += pageSize;
          hasMore = page.length === pageSize;
          console.log(`[Diagnose] Fetched ${allPlayers.length} players so far...`);
        } else {
          hasMore = false;
        }
      }

      console.log(`[Diagnose] Total players fetched: ${allPlayers.length}`);

      // Get seed contract data using pagination
      console.log("[Diagnose] Fetching seed contracts...");
      let allSeedContracts: any[] = [];
      offset = 0;
      hasMore = true;

      while (hasMore) {
        const { data: page } = await supabase
          .from("player_contract_seed_data")
          .select("player_id")
          .range(offset, offset + pageSize - 1);

        if (page && page.length > 0) {
          allSeedContracts = [...allSeedContracts, ...page];
          offset += pageSize;
          hasMore = page.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      console.log(`[Diagnose] Total seed contracts: ${allSeedContracts.length}`);

      // Get contracts for this specific save game using pagination
      console.log("[Diagnose] Fetching save game contracts...");
      let allSaveGameContracts: any[] = [];
      offset = 0;
      hasMore = true;

      while (hasMore) {
        const { data: page } = await supabase
          .from("player_contracts_per_save_game")
          .select("player_id, team_id, contract_year_1")
          .eq("save_game_id", saveGameId)
          .not("player_id", "is", null)
          .range(offset, offset + pageSize - 1);

        if (page && page.length > 0) {
          allSaveGameContracts = [...allSaveGameContracts, ...page];
          offset += pageSize;
          hasMore = page.length === pageSize;
          console.log(`[Diagnose] Fetched ${allSaveGameContracts.length} save game contracts so far...`);
        } else {
          hasMore = false;
        }
      }

      console.log(`[Diagnose] Total save game contracts: ${allSaveGameContracts.length}`);

      // Get all teams
      const { data: teams } = await supabase
        .from("teams")
        .select("id, name")
        .order("name");

      const players = allPlayers;
      const seedContracts = allSeedContracts;
      const saveGameContracts = allSaveGameContracts;

      const playerIds = new Set((players || []).map((p) => p.id));
      const seedContractPlayerIds = new Set((seedContracts || []).map((c) => c.player_id));
      const saveGameContractPlayerIds = new Set((saveGameContracts || []).map((c) => c.player_id));

      // Global stats
      const missingFromSaveGame = (players || []).filter(
        (p) => !saveGameContractPlayerIds.has(p.id)
      );

      setGlobalStats({
        totalPlayersOnTeams: players?.length || 0,
        totalContracts: saveGameContracts?.length || 0,
        seedContractsAvailable: seedContracts?.length || 0,
        missingContracts: missingFromSaveGame.length,
      });

      // Per-team stats
      const teamStatsMap: Record<string, TeamContractStats> = {};

      (teams || []).forEach((team) => {
        teamStatsMap[team.id] = {
          teamId: team.id,
          teamName: team.name,
          playersOnRoster: 0,
          playersWithContracts: 0,
          playersMissingContracts: 0,
          totalCapHit: 0,
          missingPlayerIds: [],
        };
      });

      (players || []).forEach((player) => {
        if (player.team_id && teamStatsMap[player.team_id]) {
          teamStatsMap[player.team_id].playersOnRoster++;

          if (saveGameContractPlayerIds.has(player.id)) {
            teamStatsMap[player.team_id].playersWithContracts++;
            // Add to cap hit
            const contract = (saveGameContracts || []).find((c) => c.player_id === player.id);
            if (contract) {
              teamStatsMap[player.team_id].totalCapHit += contract.contract_year_1 || 0;
            }
          } else {
            teamStatsMap[player.team_id].playersMissingContracts++;
            teamStatsMap[player.team_id].missingPlayerIds.push(player.id);
          }
        }
      });

      const stats = Object.values(teamStatsMap).sort(
        (a, b) => b.playersMissingContracts - a.playersMissingContracts
      );

      setTeamStats(stats);
    } catch (error) {
      console.error("Error diagnosing:", error);
      alert("Error running diagnostics. Check console.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Contract Diagnostics</h1>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-bold text-blue-900 mb-2">📊 What This Does</h2>
        <p className="text-blue-900">
          This tool checks your save game to see which teams and players are missing contracts.
          It will show you exactly which teams are affected and how many players on each team
          don't have salary data.
        </p>
      </div>

      {saveGameId && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-600">
            <strong>Current Save Game:</strong> {saveGameId}
          </p>
        </div>
      )}

      <button
        onClick={handleDiagnose}
        disabled={loading || !saveGameId}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-bold mb-6"
      >
        {loading ? "Running Diagnostics..." : "Run Diagnostics"}
      </button>

      {globalStats && (
        <div className="mb-6 p-6 rounded-lg border bg-white border-gray-300 shadow-sm">
          <h3 className="text-xl font-bold mb-4">🌐 Global Statistics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 p-4 rounded">
              <p className="text-sm text-gray-600">Total Players on Teams</p>
              <p className="text-2xl font-bold">{globalStats.totalPlayersOnTeams}</p>
            </div>
            <div className="bg-green-50 p-4 rounded">
              <p className="text-sm text-green-700">Players with Contracts</p>
              <p className="text-2xl font-bold text-green-700">{globalStats.totalContracts}</p>
            </div>
            <div className={globalStats.missingContracts > 0 ? "bg-red-50 p-4 rounded" : "bg-gray-50 p-4 rounded"}>
              <p className={globalStats.missingContracts > 0 ? "text-sm text-red-700" : "text-sm text-gray-600"}>
                Missing Contracts
              </p>
              <p className={globalStats.missingContracts > 0 ? "text-2xl font-bold text-red-700" : "text-2xl font-bold"}>
                {globalStats.missingContracts}
              </p>
            </div>
            <div className="bg-blue-50 p-4 rounded">
              <p className="text-sm text-blue-700">Seed Contracts Available</p>
              <p className="text-2xl font-bold text-blue-700">{globalStats.seedContractsAvailable}</p>
            </div>
          </div>
        </div>
      )}

      {teamStats.length > 0 && (
        <div className="bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <h3 className="text-xl font-bold">📋 Team-by-Team Breakdown</h3>
            <p className="text-sm text-gray-600 mt-1">
              Showing all teams - click to view missing player details
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Team
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Roster Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    With Contracts
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Missing
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Cap Hit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {teamStats.map((team) => (
                  <tr
                    key={team.teamId}
                    onClick={() => setSelectedTeam(team)}
                    className={`cursor-pointer hover:bg-gray-50 ${
                      team.playersMissingContracts > 0 ? "bg-red-50" : ""
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {team.teamName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {team.playersOnRoster}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                      {team.playersWithContracts}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${
                      team.playersMissingContracts > 0 ? "text-red-600" : "text-gray-400"
                    }`}>
                      {team.playersMissingContracts}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${(team.totalCapHit / 1000000).toFixed(2)}M
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {team.playersMissingContracts === 0 ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          OK
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                          Issues
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedTeam && selectedTeam.playersMissingContracts > 0 && (
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="font-bold text-yellow-900 mb-2">
            {selectedTeam.teamName} - Missing Player IDs
          </h4>
          <div className="max-h-60 overflow-y-auto bg-white rounded p-3">
            {selectedTeam.missingPlayerIds.map((playerId) => (
              <p key={playerId} className="text-xs text-gray-700 font-mono">
                {playerId}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

