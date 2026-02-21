"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";

interface Team {
  id: string;
  name: string;
  abbreviation: string;
}

interface TestResults {
  summary: {
    simulations: number;
    homeTeam: {
      avgScore: string;
      minScore: number;
      maxScore: number;
    };
    awayTeam: {
      avgScore: string;
      minScore: number;
      maxScore: number;
    };
    playDistribution: {
      avgTotalPlays: string;
      avgPassPlays: string;
      avgRunPlays: string;
      passPercentage: string;
      runPercentage: string;
    };
  };
  results: Array<{
    simulation: number;
    homeScore: number;
    awayScore: number;
    totalPlays: number;
    passPlays: number;
    runPlays: number;
    passPercentage: number;
  }>;
}

export default function TestCoachingPage() {
  const { saveGameId } = useGameStore();
  const [teams, setTeams] = useState<Team[]>([]);
  const [homeTeamId, setHomeTeamId] = useState<string>("");
  const [awayTeamId, setAwayTeamId] = useState<string>("");
  const [simulations, setSimulations] = useState<number>(10);
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<TestResults | null>(null);

  // Load teams
  useEffect(() => {
    async function loadTeams() {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, abbreviation")
        .order("name");

      if (!error && data) {
        setTeams(data);
        if (data.length >= 2) {
          setHomeTeamId(data[0].id);
          setAwayTeamId(data[1].id);
        }
      }
    }
    loadTeams();
  }, []);

  const runTest = async () => {
    if (!homeTeamId || !awayTeamId || !saveGameId) {
      alert("Please select both teams and ensure you have an active save game");
      return;
    }

    setTesting(true);
    setResults(null);

    try {
      const response = await fetch("/api/admin/test-coaching-impact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeTeamId,
          awayTeamId,
          saveGameId,
          simulations,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResults(data);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Test failed:", error);
      alert(`Test failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="container mx-auto p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Test Coaching Impact</h1>

        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Simulation Settings</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Home Team
              </label>
              <select
                className="w-full border rounded p-2"
                value={homeTeamId}
                onChange={(e) => setHomeTeamId(e.target.value)}
              >
                <option value="">Select Team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Away Team
              </label>
              <select
                className="w-full border rounded p-2"
                value={awayTeamId}
                onChange={(e) => setAwayTeamId(e.target.value)}
              >
                <option value="">Select Team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Number of Simulations: {simulations}
            </label>
            <input
              type="range"
              min="1"
              max="50"
              value={simulations}
              onChange={(e) => setSimulations(parseInt(e.target.value))}
              className="w-full"
            />
          </div>

          <button
            onClick={runTest}
            disabled={testing || !homeTeamId || !awayTeamId || !saveGameId}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {testing ? "Running Simulations..." : "Run Test"}
          </button>

          {!saveGameId && (
            <p className="text-red-600 mt-2">
              No active save game. Please start a game first.
            </p>
          )}
        </div>

        {results && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Test Results</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="border rounded p-4">
                <h3 className="font-semibold mb-2">
                  {teams.find((t) => t.id === homeTeamId)?.name || "Home Team"}
                </h3>
                <div className="space-y-1">
                  <p>
                    Average Score:{" "}
                    <span className="font-bold">
                      {results.summary.homeTeam.avgScore}
                    </span>
                  </p>
                  <p>
                    Range: {results.summary.homeTeam.minScore} -{" "}
                    {results.summary.homeTeam.maxScore}
                  </p>
                </div>
              </div>

              <div className="border rounded p-4">
                <h3 className="font-semibold mb-2">
                  {teams.find((t) => t.id === awayTeamId)?.name || "Away Team"}
                </h3>
                <div className="space-y-1">
                  <p>
                    Average Score:{" "}
                    <span className="font-bold">
                      {results.summary.awayTeam.avgScore}
                    </span>
                  </p>
                  <p>
                    Range: {results.summary.awayTeam.minScore} -{" "}
                    {results.summary.awayTeam.maxScore}
                  </p>
                </div>
              </div>
            </div>

            <div className="border rounded p-4 mb-6">
              <h3 className="font-semibold mb-2">Play Distribution</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Avg Total Plays</p>
                  <p className="text-xl font-bold">
                    {results.summary.playDistribution.avgTotalPlays}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Avg Pass Plays</p>
                  <p className="text-xl font-bold">
                    {results.summary.playDistribution.avgPassPlays}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Avg Run Plays</p>
                  <p className="text-xl font-bold">
                    {results.summary.playDistribution.avgRunPlays}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Pass %</p>
                  <p className="text-xl font-bold">
                    {results.summary.playDistribution.passPercentage}%
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Individual Simulations</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 text-left">#</th>
                      <th className="p-2 text-right">Home</th>
                      <th className="p-2 text-right">Away</th>
                      <th className="p-2 text-right">Plays</th>
                      <th className="p-2 text-right">Pass</th>
                      <th className="p-2 text-right">Run</th>
                      <th className="p-2 text-right">Pass %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.results.map((r) => (
                      <tr key={r.simulation} className="border-b">
                        <td className="p-2">{r.simulation}</td>
                        <td className="p-2 text-right font-semibold">
                          {r.homeScore}
                        </td>
                        <td className="p-2 text-right font-semibold">
                          {r.awayScore}
                        </td>
                        <td className="p-2 text-right">{r.totalPlays}</td>
                        <td className="p-2 text-right">{r.passPlays}</td>
                        <td className="p-2 text-right">{r.runPlays}</td>
                        <td className="p-2 text-right">
                          {r.passPercentage?.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



