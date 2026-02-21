"use client";

import { useState, useEffect } from "react";
import { useGameStore } from "@/lib/store/game-store";

export default function TestGameStatsPage() {
  const { saveGameId } = useGameStore();
  const [gameId, setGameId] = useState("");
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const runDiagnostic = async () => {
    if (!gameId) {
      alert("Please enter a game ID");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/diagnose-game-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, saveGameId }),
      });

      const data = await response.json();
      setDiagnostics(data);
    } catch (error) {
      console.error("Error running diagnostic:", error);
      alert("Error running diagnostic: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/diagnose-game-stats?saveGameId=${saveGameId || ""}`
      );
      const data = await response.json();
      setSummary(data);
    } catch (error) {
      console.error("Error loading summary:", error);
      alert("Error loading summary: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Prevent hydration mismatch by not rendering until client-side
  if (!mounted) {
    return (
      <div className="container mx-auto p-8">
        <h1 className="text-3xl font-bold mb-6">Game Stats Diagnostic Tool</h1>
        <div className="bg-gray-50 border rounded p-4">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Game Stats Diagnostic Tool</h1>

      <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-6">
        <p className="font-semibold">Current Save Game ID:</p>
        <code className="text-sm">{saveGameId || "Not set"}</code>
      </div>

      {/* Summary Section */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Database Summary</h2>
        <button
          onClick={loadSummary}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? "Loading..." : "Load Stats Summary"}
        </button>

        {summary && (
          <div className="mt-4 space-y-2">
            <div className="bg-gray-50 p-4 rounded">
              <p className="font-semibold">Total Stats in Database:</p>
              <p className="text-2xl font-bold">
                {summary.summary?.total_stats || 0}
              </p>
            </div>
            <div className="bg-green-50 p-4 rounded">
              <p className="font-semibold">
                Stats with Current Save Game ID:
              </p>
              <p className="text-2xl font-bold">
                {summary.summary?.stats_with_save_game_id || 0}
              </p>
            </div>
            <div className="bg-yellow-50 p-4 rounded">
              <p className="font-semibold">Stats with NULL Save Game ID:</p>
              <p className="text-2xl font-bold">
                {summary.summary?.stats_with_null_save_game_id || 0}
              </p>
            </div>

            {summary.recent_stats && summary.recent_stats.length > 0 && (
              <div className="mt-4">
                <h3 className="font-semibold mb-2">Recent Stats Sample:</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-2 py-1 text-left">Player ID</th>
                        <th className="px-2 py-1 text-left">Game ID</th>
                        <th className="px-2 py-1 text-left">Save Game ID</th>
                        <th className="px-2 py-1 text-left">Season</th>
                        <th className="px-2 py-1 text-left">Week</th>
                        <th className="px-2 py-1 text-left">Passing Yds</th>
                        <th className="px-2 py-1 text-left">Rushing Yds</th>
                        <th className="px-2 py-1 text-left">Tackles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.recent_stats.map((stat: any, idx: number) => (
                        <tr key={idx} className="border-t">
                          <td className="px-2 py-1 font-mono text-xs">
                            {stat.player_id.slice(0, 8)}...
                          </td>
                          <td className="px-2 py-1 font-mono text-xs">
                            {stat.game_id.slice(0, 8)}...
                          </td>
                          <td className="px-2 py-1 font-mono text-xs">
                            {stat.save_game_id
                              ? stat.save_game_id.slice(0, 8) + "..."
                              : "NULL"}
                          </td>
                          <td className="px-2 py-1">{stat.season}</td>
                          <td className="px-2 py-1">{stat.week}</td>
                          <td className="px-2 py-1">
                            {stat.passing_yards || 0}
                          </td>
                          <td className="px-2 py-1">
                            {stat.rushing_yards || 0}
                          </td>
                          <td className="px-2 py-1">{stat.tackles || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Game-Specific Diagnostic */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Game-Specific Diagnostic</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Game ID to Diagnose:
          </label>
          <input
            type="text"
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
            placeholder="Enter game UUID"
            className="w-full border rounded px-3 py-2"
          />
          <p className="text-xs text-gray-600 mt-1">
            Tip: Find a game ID by going to a game's page and copying from the URL
          </p>
        </div>

        <button
          onClick={runDiagnostic}
          disabled={loading || !gameId}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400"
        >
          {loading ? "Running..." : "Run Diagnostic"}
        </button>

        {diagnostics && (
          <div className="mt-6">
            {/* Status Badge */}
            <div className="mb-4">
              <span
                className={`px-3 py-1 rounded font-semibold ${
                  diagnostics.status === "healthy"
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {diagnostics.status}
              </span>
            </div>

            {/* Issues */}
            {diagnostics.issues && diagnostics.issues.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-4 mb-4">
                <h3 className="font-bold text-red-800 mb-2">Issues Found:</h3>
                <ul className="list-disc list-inside space-y-1">
                  {diagnostics.issues.map((issue: string, idx: number) => (
                    <li key={idx} className="text-red-700">
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            {diagnostics.recommendations &&
              diagnostics.recommendations.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
                  <h3 className="font-bold text-yellow-800 mb-2">
                    Recommendations:
                  </h3>
                  <ul className="list-disc list-inside space-y-1">
                    {diagnostics.recommendations.map(
                      (rec: string, idx: number) => (
                        <li key={idx} className="text-yellow-700">
                          {rec}
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}

            {/* Detailed Diagnostics */}
            <div className="space-y-4">
              <h3 className="font-bold text-lg">Detailed Results:</h3>

              {/* Game Info */}
              {diagnostics.diagnostics?.game && (
                <div className="bg-gray-50 p-4 rounded">
                  <h4 className="font-semibold mb-2">Game Information:</h4>
                  <pre className="text-xs overflow-auto">
                    {JSON.stringify(diagnostics.diagnostics.game, null, 2)}
                  </pre>
                </div>
              )}

              {/* Stats Count */}
              {diagnostics.diagnostics?.stats_any_save_game && (
                <div className="bg-blue-50 p-4 rounded">
                  <h4 className="font-semibold mb-2">
                    Stats (Any Save Game):
                  </h4>
                  <p className="text-2xl font-bold">
                    {diagnostics.diagnostics.stats_any_save_game.count || 0}{" "}
                    records
                  </p>
                  {diagnostics.diagnostics.stats_any_save_game.sample && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-blue-700">
                        View Sample
                      </summary>
                      <pre className="text-xs mt-2 overflow-auto">
                        {JSON.stringify(
                          diagnostics.diagnostics.stats_any_save_game.sample,
                          null,
                          2
                        )}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Stats with matching save_game_id */}
              {diagnostics.diagnostics?.stats_with_save_game_id && (
                <div className="bg-green-50 p-4 rounded">
                  <h4 className="font-semibold mb-2">
                    Stats (Matching Save Game ID):
                  </h4>
                  <p className="text-2xl font-bold">
                    {diagnostics.diagnostics.stats_with_save_game_id.count || 0}{" "}
                    records
                  </p>
                </div>
              )}

              {/* Rosters */}
              {diagnostics.diagnostics?.rosters && (
                <div className="bg-purple-50 p-4 rounded">
                  <h4 className="font-semibold mb-2">Roster Sizes:</h4>
                  <pre className="text-xs overflow-auto">
                    {JSON.stringify(diagnostics.diagnostics.rosters, null, 2)}
                  </pre>
                </div>
              )}

              {/* Test Insert */}
              {diagnostics.diagnostics?.test_insert && (
                <div
                  className={`p-4 rounded ${
                    diagnostics.diagnostics.test_insert.can_insert
                      ? "bg-green-50"
                      : "bg-red-50"
                  }`}
                >
                  <h4 className="font-semibold mb-2">Database Insert Test:</h4>
                  <p>
                    Can Insert:{" "}
                    {diagnostics.diagnostics.test_insert.can_insert
                      ? "✅ YES"
                      : "❌ NO"}
                  </p>
                  {diagnostics.diagnostics.test_insert.error && (
                    <p className="text-red-700 text-sm mt-2">
                      Error: {diagnostics.diagnostics.test_insert.error}
                    </p>
                  )}
                </div>
              )}

              {/* Full Diagnostics */}
              <details>
                <summary className="cursor-pointer font-semibold text-gray-700">
                  View Full Diagnostic Report (JSON)
                </summary>
                <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto max-h-96">
                  {JSON.stringify(diagnostics, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-8 bg-gray-50 border rounded p-6">
        <h2 className="text-lg font-bold mb-2">How to Use:</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>Click "Load Stats Summary" to see overall database stats</li>
          <li>Simulate a game and note its Game ID from the URL or logs</li>
          <li>Paste the Game ID above and click "Run Diagnostic"</li>
          <li>
            Check the results - it will tell you if stats exist and where
            they're going wrong
          </li>
          <li>Check your browser console for detailed simulation logs</li>
        </ol>
      </div>
    </div>
  );
}

