"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/store/game-store";

export default function FixCoachesPage() {
  const { saveGameId, currentSeason } = useGameStore();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    assignmentsCreated?: number;
    message?: string;
    error?: string;
  } | null>(null);

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
      const response = await fetch("/api/coaches/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          saveGameId,
          season: currentSeason || 2025,
        }),
      });

      const data = await response.json();
      setResult(data);
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
      <h1 className="text-3xl font-bold mb-6">Fix Missing Coaches</h1>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-bold text-yellow-900 mb-2">⚠️ Problem</h2>
        <p className="text-yellow-900">
          If your save game was created before coaches were added to the GameSetupWizard,
          you may have no coaches assigned to teams. This will cause simulation errors.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-bold text-blue-900 mb-2">🔧 Solution</h2>
        <p className="text-blue-900 mb-3">
          This tool will:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-blue-900 ml-4">
          <li>Load all coaches from the coaches seed table</li>
          <li>Create coach_team_assignments for your save game</li>
          <li>Assign each coach to their seed team</li>
        </ol>
      </div>

      {saveGameId && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-600">
            <strong>Current Save Game:</strong> {saveGameId}
          </p>
          <p className="text-sm text-gray-600">
            <strong>Season:</strong> {currentSeason || 2025}
          </p>
        </div>
      )}

      <button
        onClick={handleFix}
        disabled={loading || !saveGameId}
        className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-bold"
      >
        {loading ? "Initializing Coaches..." : "Initialize Missing Coaches"}
      </button>

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
            <div className="text-green-900">
              <p>{result.message}</p>
              {result.assignmentsCreated !== undefined && (
                <p className="mt-2 text-lg">
                  ✅ Created {result.assignmentsCreated} coach assignments
                </p>
              )}
              <p className="mt-4 font-bold">
                Coaches are now assigned! You can view them on each team's Staff page.
              </p>
            </div>
          ) : (
            <p className="text-red-900">
              {result.error || "An unknown error occurred"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}



