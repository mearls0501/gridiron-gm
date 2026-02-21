"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/store/game-store";

export default function FixContractsPage() {
  const { saveGameId } = useGameStore();
  const [loading, setLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<{
    totalPlayers?: number;
    playersWithContracts?: number;
    playersMissingContracts?: number;
    teamsAffected?: string[];
  } | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    seedContractsCreated?: number;
    contractsCreated?: number;
    message?: string;
    error?: string;
  } | null>(null);

  const handleDiagnose = async () => {
    if (!saveGameId) {
      setDiagnostics({
        totalPlayers: 0,
        playersWithContracts: 0,
        playersMissingContracts: 0,
      });
      return;
    }

    setLoading(true);
    setDiagnostics(null);

    try {
      // Import supabase client dynamically
      const { supabase } = await import("@/lib/supabase-client");

      // Get all players on teams using pagination
      let allPlayers: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: page } = await supabase
          .from("players")
          .select("id, team_id")
          .not("team_id", "is", null)
          .range(offset, offset + pageSize - 1);

        if (page && page.length > 0) {
          allPlayers = [...allPlayers, ...page];
          offset += pageSize;
          hasMore = page.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      // Get contracts for this save game using pagination
      let allContracts: any[] = [];
      offset = 0;
      hasMore = true;

      while (hasMore) {
        const { data: page } = await supabase
          .from("player_contracts_per_save_game")
          .select("player_id, team_id")
          .eq("save_game_id", saveGameId)
          .not("player_id", "is", null)
          .range(offset, offset + pageSize - 1);

        if (page && page.length > 0) {
          allContracts = [...allContracts, ...page];
          offset += pageSize;
          hasMore = page.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      const players = allPlayers;
      const contracts = allContracts;

      const playerIds = new Set((players || []).map((p) => p.id));
      const contractPlayerIds = new Set((contracts || []).map((c) => c.player_id));

      const playersMissing = (players || []).filter(
        (p) => !contractPlayerIds.has(p.id)
      );

      // Group missing players by team
      const teamCounts: Record<string, number> = {};
      playersMissing.forEach((p) => {
        if (p.team_id) {
          teamCounts[p.team_id] = (teamCounts[p.team_id] || 0) + 1;
        }
      });

      const teamsAffected = Object.entries(teamCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([teamId, count]) => `${teamId} (${count} players)`);

      setDiagnostics({
        totalPlayers: players?.length || 0,
        playersWithContracts: contractPlayerIds.size,
        playersMissingContracts: playersMissing.length,
        teamsAffected,
      });
    } catch (error) {
      console.error("Error diagnosing:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFix = async () => {
    if (!saveGameId) {
      setResult({
        success: false,
        error: "No save game loaded. Please load a game first.",
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/fix-missing-contracts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ saveGameId }),
      });

      const data = await response.json();
      setResult(data);

      // Re-run diagnostics after fix
      if (data.success) {
        setTimeout(() => handleDiagnose(), 1000);
      }
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Fix Missing Contracts</h1>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-bold text-yellow-900 mb-2">⚠️ Problem</h2>
        <p className="text-yellow-900">
          Some teams have players with $0 salaries. This means contracts weren't properly
          copied from the seed data when your save game was created.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-bold text-blue-900 mb-2">🔧 Solution</h2>
        <p className="text-blue-900 mb-3">
          This tool will:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-blue-900 ml-4">
          <li>Check which players are missing contracts in your save game</li>
          <li>Copy missing contracts from seed data to your save game</li>
          <li>Preserve any existing contracts (won't duplicate)</li>
        </ol>
        <p className="text-blue-900 mt-3 text-sm italic">
          💡 Tip: Use /admin/diagnose-contracts to see exactly which teams are affected
        </p>
      </div>

      {saveGameId && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-600">
            <strong>Current Save Game:</strong> {saveGameId}
          </p>
        </div>
      )}

      <div className="flex gap-4 mb-6">
        <button
          onClick={handleDiagnose}
          disabled={loading || !saveGameId}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-bold"
        >
          {loading ? "Checking..." : "Diagnose Contract Issues"}
        </button>

        <button
          onClick={handleFix}
          disabled={loading || !saveGameId}
          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-bold"
        >
          {loading ? "Fixing Contracts..." : "Fix Missing Contracts"}
        </button>
      </div>

      {diagnostics && (
        <div className="mb-6 p-4 rounded-lg border bg-white border-gray-200">
          <h3 className="font-bold mb-3">📊 Diagnostic Results</h3>
          <div className="space-y-2 text-sm">
            <p>
              <strong>Total Players on Teams:</strong> {diagnostics.totalPlayers}
            </p>
            <p>
              <strong>Players with Contracts:</strong> {diagnostics.playersWithContracts}
            </p>
            <p className={diagnostics.playersMissingContracts && diagnostics.playersMissingContracts > 0 ? "text-red-600 font-bold" : "text-green-600"}>
              <strong>Players Missing Contracts:</strong> {diagnostics.playersMissingContracts}
            </p>
            {diagnostics.teamsAffected && diagnostics.teamsAffected.length > 0 && (
              <div className="mt-3">
                <p className="font-bold mb-1">Teams Affected:</p>
                <div className="max-h-40 overflow-y-auto bg-gray-50 rounded p-2">
                  {diagnostics.teamsAffected.slice(0, 10).map((team, idx) => (
                    <p key={idx} className="text-xs">• {team}</p>
                  ))}
                  {diagnostics.teamsAffected.length > 10 && (
                    <p className="text-xs text-gray-500 mt-1">
                      ... and {diagnostics.teamsAffected.length - 10} more teams
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {result && (
        <div
          className={`mt-6 p-4 rounded-lg border ${
            result.success
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200"
          }`}
        >
          <h3
            className={`font-bold mb-2 ${
              result.success ? "text-green-900" : "text-red-900"
            }`}
          >
            {result.success ? "✅ Success!" : "❌ Error"}
          </h3>
          {result.success ? (
            <div className={result.success ? "text-green-900" : "text-red-900"}>
              <p>{result.message}</p>
              {result.contractsCreated !== undefined && result.contractsCreated > 0 && (
                <p className="mt-2 text-lg">
                  ✅ Created {result.contractsCreated} missing contracts
                </p>
              )}
              {result.contractsCreated === 0 && (
                <p className="mt-2 text-lg">
                  ✅ All contracts are already present - nothing to fix!
                </p>
              )}
              <p className="mt-4 font-bold">
                Refresh your team pages to see the updated contracts and salary cap!
              </p>
            </div>
          ) : (
            <p className={result.success ? "text-green-900" : "text-red-900"}>
              {result.error || "An unknown error occurred"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

