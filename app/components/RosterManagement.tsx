"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import {
  Users,
  AlertCircle,
  CheckCircle,
  Trash2,
  Loader2,
  TrendingDown,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  overall_rating: number;
  age: number;
  team_id: string;
  is_prospect?: boolean;
}

interface PlayerContract {
  player_id: string | null;
  prospect_id: string | null;
  contract_year_1: number;
}

interface RosterValidation {
  current_roster_size: number;
  max_roster_size: number;
  is_valid: boolean;
  must_cut_count: number;
}

export default function RosterManagement() {
  const { saveGameId, selectedTeamId, currentSeason } = useGameStore();
  const [loading, setLoading] = useState(true);
  const [validation, setValidation] = useState<RosterValidation | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [contracts, setContracts] = useState<Map<string, PlayerContract>>(new Map());
  const [cutting, setCutting] = useState<string | null>(null);

  const loadRosterData = useCallback(async () => {
    if (!saveGameId || !selectedTeamId || !currentSeason) return;

    try {
      setLoading(true);

      // Get roster validation
      const validationResponse = await fetch(
        `/api/roster-validation?saveGameId=${saveGameId}&season=${currentSeason}&teamId=${selectedTeamId}`
      );
      const validationData = await validationResponse.json();
      setValidation(validationData.validation);

      // Get team roster (includes both players and prospects)
      const { data: assignments, error: assignmentsError } = await supabase
        .from("player_team_assignments")
        .select(
          `
          player_id,
          prospect_id,
          players (*),
          draft_prospects (*)
        `
        )
        .eq("team_id", selectedTeamId)
        .eq("save_game_id", saveGameId);

      if (assignmentsError) {
        console.error("Error loading player assignments:", assignmentsError);
        setPlayers([]);
        return;
      }

      if (!assignments || assignments.length === 0) {
        setPlayers([]);
        return;
      }

      const playersList = assignments.map((a: any) => {
        // If it's a player (seed player), use players data
        if (a.player_id && a.players) {
          return { ...a.players, is_prospect: false };
        }
        // If it's a prospect (drafted), use draft_prospects data
        if (a.prospect_id && a.draft_prospects) {
          return { ...a.draft_prospects, is_prospect: true, is_rookie: true };
        }
        return null;
      }).filter(Boolean) as Player[];
      
      // Sort by overall rating (lowest first for easier cutting)
      playersList.sort((a: Player, b: Player) => (a.overall_rating || 0) - (b.overall_rating || 0));
      setPlayers(playersList);

      // Load contracts separately from player_contracts_per_save_game
      const playerIds = playersList
        .map((p) => p.is_prospect ? null : p.id)
        .filter(Boolean) as string[];
      const prospectIds = playersList
        .map((p) => p.is_prospect ? p.id : null)
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
    } catch (error) {
      console.error("Error loading roster data:", error);
    } finally {
      setLoading(false);
    }
  }, [saveGameId, selectedTeamId, currentSeason]);

  useEffect(() => {
    loadRosterData();
  }, [loadRosterData]);

  const handleCutPlayer = async (playerId: string) => {
    if (!confirm("Are you sure you want to cut this player? They will become a free agent.")) {
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
      await loadRosterData();
    } catch (error) {
      console.error("Error cutting player:", error);
      alert("Failed to cut player. Please try again.");
    } finally {
      setCutting(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Loading roster...</span>
        </div>
      </div>
    );
  }

  if (!validation) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">Unable to load roster validation data.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-600" />
              Roster Management
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Current roster size: {validation.current_roster_size} / {validation.max_roster_size}
            </p>
          </div>
          {validation.is_valid ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold">Roster Valid</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-orange-600">
              <AlertCircle className="w-5 h-5" />
              <span className="font-semibold">
                Must cut {validation.must_cut_count} player{validation.must_cut_count > 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Alert if over roster limit */}
      {!validation.is_valid && (
        <div className="bg-orange-50 border-b border-orange-200 px-6 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
            <div>
              <p className="text-orange-900 font-semibold">
                Roster size exceeds limit
              </p>
              <p className="text-orange-800 text-sm mt-1">
                You must cut {validation.must_cut_count} player{validation.must_cut_count > 1 ? "s" : ""} before you can
                advance. Players are sorted by overall rating (lowest first).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Player List */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Player
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Position
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Age
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rating
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Salary
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {players.map((player) => (
              <tr key={player.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {player.first_name} {player.last_name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {player.position}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {player.age}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <span
                      className={`text-sm font-semibold ${
                        player.overall_rating >= 80
                          ? "text-green-600"
                          : player.overall_rating >= 70
                            ? "text-blue-600"
                            : player.overall_rating >= 60
                              ? "text-gray-600"
                              : "text-orange-600"
                      }`}
                    >
                      {player.overall_rating}
                    </span>
                    {player.overall_rating < 60 && (
                      <TrendingDown className="w-4 h-4 text-orange-500 ml-1" />
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {formatCurrency(contracts.get(player.id)?.contract_year_1 || 0)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => handleCutPlayer(player.id)}
                    disabled={cutting === player.id}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {cutting === player.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Cutting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        Cut Player
                      </>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {players.length === 0 && (
        <div className="px-6 py-12 text-center">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No players on roster</p>
        </div>
      )}
    </div>
  );
}

