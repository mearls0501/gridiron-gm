"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import { Trophy, Play, ChevronRight } from "lucide-react";
import Link from "next/link";

interface PlayoffGame {
  id: string;
  week: number;
  round: string;
  conference: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_seed: number | null;
  away_team_seed: number | null;
  home_score: number | null;
  away_score: number | null;
  played: boolean;
  winner_id: string | null;
  home_team?: { id: string; name: string; abbreviation: string };
  away_team?: { id: string; name: string; abbreviation: string };
  winner?: { id: string; name: string; abbreviation: string };
}

interface PlayoffSeed {
  team_id: string;
  seed: number;
  conference: string;
  team?: { id: string; name: string; abbreviation: string };
}

export default function PlayoffsPage() {
  const { currentSeason, saveGameId } = useGameStore();
  const [season, setSeason] = useState<number>(currentSeason);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bracket, setBracket] = useState<{
    wildCard: PlayoffGame[];
    divisional: PlayoffGame[];
    conferenceChampionship: PlayoffGame[];
    superBowl: PlayoffGame | null;
  }>({
    wildCard: [],
    divisional: [],
    conferenceChampionship: [],
    superBowl: null,
  });
  const [seeds, setSeeds] = useState<PlayoffSeed[]>([]);
  const [simulating, setSimulating] = useState<string | null>(null);

  useEffect(() => {
    loadPlayoffs();
  }, [season, saveGameId]);

  async function loadPlayoffs() {
    setLoading(true);
    setError(null);
    try {
      const url = saveGameId 
        ? `/api/playoffs/status?season=${season}&saveGameId=${saveGameId}`
        : `/api/playoffs/status?season=${season}`;
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load playoffs");
      }

      // Handle case where API returns error in data but status is 200
      if (data.error) {
        setError(data.error);
        setBracket({
          wildCard: [],
          divisional: [],
          conferenceChampionship: [],
          superBowl: null,
        });
        setSeeds([]);
      } else {
        setBracket(data.bracket || {
          wildCard: [],
          divisional: [],
          conferenceChampionship: [],
          superBowl: null,
        });
        setSeeds(data.seeds || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load playoffs");
      setBracket({
        wildCard: [],
        divisional: [],
        conferenceChampionship: [],
        superBowl: null,
      });
      setSeeds([]);
    } finally {
      setLoading(false);
    }
  }

  async function simulateGame(gameId: string) {
    setSimulating(gameId);
    try {
      const response = await fetch("/api/playoffs/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, season, saveGameId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to simulate game");
      }

      await loadPlayoffs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to simulate game");
    } finally {
      setSimulating(null);
    }
  }

  async function simulateRound(round: string) {
    setSimulating(`round-${round}`);
    try {
      const response = await fetch("/api/playoffs/simulate-round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, round, saveGameId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to simulate round");
      }

      await loadPlayoffs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to simulate round");
    } finally {
      setSimulating(null);
    }
  }

  async function advanceRound(currentRound: string) {
    setSimulating(`advance-${currentRound}`);
    try {
      const response = await fetch("/api/playoffs/advance-round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, currentRound, saveGameId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to advance round");
      }

      await loadPlayoffs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to advance round");
    } finally {
      setSimulating(null);
    }
  }

  async function crownChampion() {
    setSimulating("crown");
    try {
      const response = await fetch("/api/playoffs/crown-champion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, saveGameId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to crown champion");
      }

      alert(`🏆 ${data.champion.teamName} has won Super Bowl ${season}!`);
      await loadPlayoffs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to crown champion");
    } finally {
      setSimulating(null);
    }
  }


  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading playoffs...</div>
      </div>
    );
  }

  // Show error or empty state
  if (error || (!bracket.wildCard.length && !bracket.divisional.length && !bracket.conferenceChampionship.length && !bracket.superBowl)) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">NFL Playoffs {season}</h1>
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
            <p className="text-red-800 font-medium mb-2">Error:</p>
            <p className="text-red-700">{error}</p>
            {error.includes("does not exist") || error.includes("not found") ? (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-yellow-800 text-sm mb-2">
                  The playoff tables may not exist. Please run the database migration:
                </p>
                <code className="text-xs bg-yellow-100 p-2 rounded block">
                  supabase/migrations/create_playoffs_tables.sql
                </code>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <p className="text-blue-800 font-medium mb-2">
            {error ? "Playoffs Not Available" : "Playoffs Not Initialized"}
          </p>
          <p className="text-blue-700 text-sm mb-4">
            {error 
              ? "There was an error loading the playoffs. Please check the error message above."
              : "Week 18 must be complete before playoffs can be initialized. Once week 18 is finished, you can initialize the playoffs from the simulation page."}
          </p>
          {!error && (
            <button
              onClick={async () => {
                try {
                  setLoading(true);
                  const response = await fetch("/api/playoffs/initialize", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ season, saveGameId }),
                  });
                  const data = await response.json();
                  if (response.ok) {
                    await loadPlayoffs();
                  } else {
                    setError(data.error || "Failed to initialize");
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to initialize");
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:text-gray-700 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Initializing..." : "Initialize Playoffs"}
            </button>
          )}
        </div>
      </div>
    );
  }

  const renderGame = (game: PlayoffGame) => (
    <div
      key={game.id}
      className={`border rounded-lg p-4 ${
        game.played ? "bg-gray-50" : "bg-white border-gray-300"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-gray-500">
              {game.home_team_seed && `#${game.home_team_seed}`} {game.home_team?.name || "TBD"}
            </span>
            {game.played && (
              <span className="font-bold text-slate-900">
                {game.home_score}
                {game.winner_id === game.home_team_id && " ✓"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500">
              {game.away_team_seed && `#${game.away_team_seed}`} {game.away_team?.name || "TBD"}
            </span>
            {game.played && (
              <span className="font-bold text-slate-900">
                {game.away_score}
                {game.winner_id === game.away_team_id && " ✓"}
              </span>
            )}
          </div>
        </div>
        {!game.played && game.home_team_id && game.away_team_id && (
          <button
            onClick={() => simulateGame(game.id)}
            disabled={simulating === game.id}
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:bg-gray-400"
          >
            {simulating === game.id ? "Simulating..." : "Simulate"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">NFL Playoffs {season}</h1>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* Playoff Seeds */}
      {seeds.length > 0 && (
        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {["AFC", "NFC"].map((conf) => (
            <div key={conf} className="border rounded-lg p-4">
              <h2 className="text-xl font-bold mb-4">{conf} Playoff Seeds</h2>
              <div className="space-y-2">
                {seeds
                  .filter((s) => s.conference === conf)
                  .sort((a, b) => a.seed - b.seed)
                  .map((seed) => (
                    <div key={seed.team_id} className="flex items-center gap-2 text-sm">
                      <span className="font-bold w-8">#{seed.seed}</span>
                      <span>{seed.team?.name || "Unknown"}</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Wild Card Round */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Wild Card Round (Week 19)</h2>
          <div className="flex items-center gap-2">
            {bracket.wildCard.length > 0 &&
              bracket.wildCard.some((g) => !g.played) && (
                <button
                  onClick={() => simulateRound("wild_card")}
                  disabled={simulating === "round-wild_card"}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {simulating === "round-wild_card" ? "Simulating..." : "Simulate All Games"}
                </button>
              )}
            {bracket.wildCard.length > 0 &&
              bracket.wildCard.every((g) => g.played) &&
              bracket.divisional.length === 0 && (
                <button
                  onClick={() => advanceRound("wild_card")}
                  disabled={simulating === "advance-wild_card"}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400"
                >
                  {simulating === "advance-wild_card" ? "Advancing..." : "Advance to Divisional Round"}
                </button>
              )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {bracket.wildCard.map(renderGame)}
        </div>
      </div>

      {/* Divisional Round */}
      {bracket.divisional.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Divisional Round (Week 20)</h2>
            <div className="flex items-center gap-2">
              {bracket.divisional.some((g) => !g.played) && (
                <button
                  onClick={() => simulateRound("divisional")}
                  disabled={simulating === "round-divisional"}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {simulating === "round-divisional" ? "Simulating..." : "Simulate All Games"}
                </button>
              )}
              {bracket.divisional.every((g) => g.played) &&
                bracket.conferenceChampionship.length === 0 && (
                  <button
                    onClick={() => advanceRound("divisional")}
                    disabled={simulating === "advance-divisional"}
                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400"
                  >
                    {simulating === "advance-divisional" ? "Advancing..." : "Advance to Conference Championship"}
                  </button>
                )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bracket.divisional.map(renderGame)}
          </div>
        </div>
      )}

      {/* Conference Championship */}
      {bracket.conferenceChampionship.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Conference Championship (Week 21)</h2>
            <div className="flex items-center gap-2">
              {bracket.conferenceChampionship.some((g) => !g.played) && (
                <button
                  onClick={() => simulateRound("conference_championship")}
                  disabled={simulating === "round-conference_championship"}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {simulating === "round-conference_championship" ? "Simulating..." : "Simulate All Games"}
                </button>
              )}
              {bracket.conferenceChampionship.every((g) => g.played) &&
                !bracket.superBowl && (
                  <button
                    onClick={() => advanceRound("conference_championship")}
                    disabled={simulating === "advance-conference_championship"}
                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400"
                  >
                    {simulating === "advance-conference_championship" ? "Advancing..." : "Advance to Super Bowl"}
                  </button>
                )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bracket.conferenceChampionship.map(renderGame)}
          </div>
        </div>
      )}

      {/* Super Bowl */}
      {bracket.superBowl && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="w-6 h-6 text-yellow-500" />
              Super Bowl (Week 22)
            </h2>
            {bracket.superBowl.played && !bracket.superBowl.winner_id && (
              <button
                onClick={crownChampion}
                disabled={simulating === "crown"}
                className="bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700 disabled:bg-gray-400"
              >
                {simulating === "crown" ? "Crowning..." : "Crown Champion"}
              </button>
            )}
          </div>
          <div className="max-w-md mx-auto">{renderGame(bracket.superBowl)}</div>
        </div>
      )}
    </div>
  );
}

