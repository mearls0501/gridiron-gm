"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/store/game-store";
import { supabase } from "@/lib/supabase-client";

export default function DiagnoseCoachesPage() {
  const { saveGameId } = useGameStore();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleDiagnose = async () => {
    if (!saveGameId) {
      alert("No save game loaded");
      return;
    }

    setLoading(true);
    try {
      // Count total coaches in seed table
      const { count: totalCoaches } = await supabase
        .from("coaches")
        .select("*", { count: "exact", head: true });

      // Count coaches with team_id (would be assigned on init)
      const { count: coachesWithTeams } = await supabase
        .from("coaches")
        .select("*", { count: "exact", head: true })
        .not("team_id", "is", null);

      // Count coaches without team_id (free agents in seed)
      const { count: freeAgentsInSeed } = await supabase
        .from("coaches")
        .select("*", { count: "exact", head: true })
        .is("team_id", null);

      // Count assignments in this save game
      const { count: assignedInGame } = await supabase
        .from("coach_team_assignments")
        .select("*", { count: "exact", head: true })
        .eq("save_game_id", saveGameId);

      // Get sample coaches to check data structure
      const { data: sampleCoaches } = await supabase
        .from("coaches")
        .select("id, full_name, role, team_id, leadership, football_iq")
        .limit(5);

      setResults({
        totalCoaches,
        coachesWithTeams,
        freeAgentsInSeed,
        assignedInGame,
        sampleCoaches,
      });
    } catch (error) {
      console.error("Error diagnosing coaches:", error);
      alert(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Coach Diagnostics</h1>

      <button
        onClick={handleDiagnose}
        disabled={loading || !saveGameId}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-bold mb-6"
      >
        {loading ? "Checking..." : "Run Diagnostics"}
      </button>

      {results && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Seed Table Status</h2>
            <div className="space-y-2">
              <p>
                <strong>Total Coaches in Seed Table:</strong> {results.totalCoaches || 0}
              </p>
              <p>
                <strong>Coaches with team_id (will assign):</strong> {results.coachesWithTeams || 0}
              </p>
              <p>
                <strong>Coaches without team_id (free agents):</strong> {results.freeAgentsInSeed || 0}
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Save Game Status</h2>
            <p>
              <strong>Coaches Assigned in This Save Game:</strong> {results.assignedInGame || 0}
            </p>
            <p>
              <strong>Expected Free Agents:</strong>{" "}
              {(results.totalCoaches || 0) - (results.assignedInGame || 0)}
            </p>
          </div>

          {results.sampleCoaches && results.sampleCoaches.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4">Sample Coaches</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Name
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Role
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Team ID
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Leadership
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        IQ
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {results.sampleCoaches.map((coach: any) => (
                      <tr key={coach.id}>
                        <td className="px-4 py-2 whitespace-nowrap text-sm">{coach.full_name}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm">{coach.role}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm">
                          {coach.team_id || "NULL"}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm">{coach.leadership}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm">{coach.football_iq}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {results.totalCoaches === 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-900 font-bold">
                ⚠️ No coaches found in seed table! You need to populate the coaches table first.
              </p>
            </div>
          )}

          {results.freeAgentsInSeed === 0 && results.totalCoaches > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-900 font-bold">
                ⚠️ All coaches in seed table have team_id set. When initialized, all coaches will
                be assigned, leaving no free agents!
              </p>
              <p className="text-yellow-900 mt-2">
                <strong>Solution:</strong> The coaches seed table should have some coaches with
                team_id = NULL to create a free agent pool.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}



