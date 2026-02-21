"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/store/game-store";
import { supabase } from "@/lib/supabase-client";

export default function DiagnoseStatsPage() {
  const { saveGameId } = useGameStore();
  const [gameId, setGameId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function diagnose() {
    if (!gameId) return;

    setLoading(true);
    try {
      // Check if stats exist
      const { data: stats, error } = await supabase
        .from("player_game_stats")
        .select("*")
        .eq("game_id", gameId)
        .eq("save_game_id", saveGameId || "");

      // Get game info
      const { data: game } = await supabase
        .from("games")
        .select("*")
        .eq("id", gameId)
        .single();

      setResult({
        gameId,
        saveGameId,
        game,
        statsCount: stats?.length || 0,
        stats: stats?.slice(0, 3), // First 3 for sample
        error: error?.message,
      });
    } catch (err) {
      console.error(err);
      setResult({ error: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-3xl font-bold mb-6">Stats Diagnostic Tool</h1>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Game ID (copy from URL when viewing a game)
            </label>
            <input
              type="text"
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              className="w-full px-4 py-2 border rounded-md"
              placeholder="e.g., 123e4567-e89b-12d3-a456-426614174000"
            />
          </div>

          <button
            onClick={diagnose}
            disabled={loading || !gameId}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? "Checking..." : "Diagnose"}
          </button>

          {result && (
            <div className="mt-6 space-y-4">
              <div className="bg-gray-50 p-4 rounded-md">
                <h2 className="font-bold text-lg mb-2">Results:</h2>
                <div className="space-y-2 text-sm">
                  <p>
                    <strong>Save Game ID:</strong> {result.saveGameId || "none"}
                  </p>
                  <p>
                    <strong>Game Season:</strong> {result.game?.season}
                  </p>
                  <p>
                    <strong>Game Week:</strong> {result.game?.week}
                  </p>
                  <p>
                    <strong>Game Played:</strong>{" "}
                    {result.game?.played ? "Yes" : "No"}
                  </p>
                  <p>
                    <strong>Game save_game_id:</strong>{" "}
                    {result.game?.save_game_id || "null"}
                  </p>
                  <p
                    className={
                      result.statsCount === 0
                        ? "text-red-600 font-bold text-lg"
                        : "text-green-600 font-bold text-lg"
                    }
                  >
                    <strong>Stats Found:</strong> {result.statsCount}
                  </p>
                  {result.error && (
                    <p className="text-red-600">
                      <strong>Error:</strong> {result.error}
                    </p>
                  )}
                </div>
              </div>

              {result.stats && result.stats.length > 0 && (
                <div className="bg-gray-50 p-4 rounded-md">
                  <h3 className="font-bold mb-2">Sample Stats (first 3):</h3>
                  <pre className="text-xs overflow-x-auto">
                    {JSON.stringify(result.stats, null, 2)}
                  </pre>
                </div>
              )}

              {result.statsCount === 0 && result.game?.played && (
                <div className="bg-red-50 border border-red-200 p-4 rounded-md">
                  <h3 className="font-bold text-red-800 mb-2">❌ Problem Found!</h3>
                  <p className="text-red-700">
                    The game was marked as played, but no stats were saved to the
                    database. This means the simulation succeeded but stat saving
                    failed.
                  </p>
                  <p className="text-red-700 mt-2">
                    Check the server console logs when you simulated this game for
                    errors.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



