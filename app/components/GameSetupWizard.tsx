"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase-client";
import { Loader2, Check, ArrowRight, ArrowLeft, X } from "lucide-react";

interface Team {
  id: string;
  name: string;
  abbreviation: string;
  conference: string;
  division: string;
}

interface GameSetupWizardProps {
  onComplete: (teamId: string) => void;
  onCancel: () => void;
}

export default function GameSetupWizard({
  onComplete,
  onCancel,
}: GameSetupWizardProps) {
  const [step, setStep] = useState(1);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");

  useEffect(() => {
    loadTeams();
  }, []);

  async function loadTeams() {
    try {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, abbreviation, conference, division")
        .order("conference")
        .order("division")
        .order("name");

      if (error) {
        // If teams table doesn't exist or is empty, that's okay - we'll create them
        if (
          error.code === "PGRST116" ||
          error.message.includes("does not exist")
        ) {
          setTeams([]);
          return;
        }
        throw error;
      }
      setTeams(data || []);
    } catch (err) {
      console.error("Error loading teams:", err);
      // Don't set error here - teams might not exist yet, which is fine
      setTeams([]);
    }
  }

  async function handleCreateLeague() {
    if (!selectedTeamId) {
      setError("Please select a team first");
      return;
    }

    setLoading(true);
    setError(null);
    setProgress("Initializing league...");

    try {
      // Step 1: Ensure teams exist (should already exist from step 1, but double-check)
      setProgress("Checking teams...");
      const { count: teamCount } = await supabase
        .from("teams")
        .select("*", { count: "exact", head: true });

      if ((teamCount || 0) === 0) {
        setProgress("Creating teams...");
        await createTeams();
      }

      // Step 2: Check if players exist, if not create them
      setProgress("Checking players...");
      const { count: playerCount } = await supabase
        .from("players")
        .select("*", { count: "exact", head: true });

      if ((playerCount || 0) === 0) {
        setProgress("Generating players...");
        await createPlayers();
      }

      // Step 3: Check if free agents exist, if not create them
      setProgress("Checking free agents...");
      const { count: freeAgentCount } = await supabase
        .from("free_agents")
        .select("*", { count: "exact", head: true });

      if ((freeAgentCount || 0) === 0) {
        setProgress("Generating free agents...");
        await createFreeAgents();
      }

      // Step 4: Create a save game FIRST (needed for schedule isolation)
      setProgress("Creating save game...");
      let currentSaveGameId: string | null = null;
      // Generate unique save name with timestamp to prevent reusing existing saves
      const uniqueSaveName = `New Game - ${new Date().toISOString()}`;
      const saveGameResponse = await fetch("/api/save-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saveName: uniqueSaveName,
          description: "Newly created league",
          currentSeason: 2025,
          currentWeek: 0, // Preseason starts at week 0
          selectedTeamId: selectedTeamId,
          gameState: {
            timestamp: new Date().toISOString(),
            initialized: false, // Will be set to true after schedule is created
          },
        }),
      });

      if (saveGameResponse.ok) {
        const saveGameData = await saveGameResponse.json();
        if (saveGameData.success && saveGameData.saveGame?.id) {
          currentSaveGameId = saveGameData.saveGame.id;
          // Store all game state immediately to prevent reading old localStorage values
          const { useGameStore } = await import("@/lib/store/game-store");
          const gameStore = useGameStore.getState();
          gameStore.setSaveGameId(currentSaveGameId);
          gameStore.setCurrentWeek(0); // Preseason starts at week 0
          gameStore.setCurrentSeason(2025);
          gameStore.setSeasonPhase("preseason");
        }
      } else {
        // If save games table doesn't exist, that's okay - we'll continue without it
        const saveGameError = await saveGameResponse.json();
        console.warn("Could not create save game:", saveGameError.error || "Unknown error");
      }

      // Step 5: Generate and save schedule to database (REQUIRED for simulation)
      setProgress("Generating schedule...");
      const scheduleResponse = await fetch("/api/generate-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          season: 2025,
          saveGameId: currentSaveGameId, // Pass save_game_id to schedule generation
        }),
      });

      if (!scheduleResponse.ok) {
        const scheduleError = await scheduleResponse.json();
        const errorMessage = scheduleError.error || "Unknown error";
        const errorDetails = scheduleError.details ? `\n\nDetails: ${scheduleError.details}` : "";
        const errorHint = scheduleError.hint ? `\n\nHint: ${scheduleError.hint}` : "";
        throw new Error(
          `Failed to generate schedule: ${errorMessage}${errorDetails}${errorHint}`
        );
      }

      const scheduleData = await scheduleResponse.json();
      if (!scheduleData.success) {
        throw new Error(
          `Schedule generation failed: ${scheduleData.message || "Unknown error"}`
        );
      }

      setProgress("Schedule generated successfully!");

      // Step 6: Initialize draft picks for current season + 4 future seasons (5 total)
      if (currentSaveGameId) {
        setProgress("Initializing draft picks...");
        try {
          const draftPicksResponse = await fetch("/api/initialize-draft-picks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              season: 2025,
              saveGameId: currentSaveGameId,
              futureSeasons: 4, // Creates picks for 2025-2029
            }),
          });

          if (draftPicksResponse.ok) {
            const draftPicksData = await draftPicksResponse.json();
            console.log(
              `[Game Setup] Draft picks initialized: ${draftPicksData.picksCreated} picks created`
            );
          } else {
            // Don't fail league creation if draft picks fail - can be done manually
            const draftPicksError = await draftPicksResponse.json();
            console.warn(
              "Could not initialize draft picks:",
              draftPicksError.error || "Unknown error"
            );
          }
        } catch (draftPicksErr) {
          // Don't fail league creation if draft picks fail
          console.warn("Error initializing draft picks:", draftPicksErr);
        }
      }

      // Step 7: Update save game to mark as initialized (if it was created)
      if (currentSaveGameId) {
        await fetch("/api/save-game", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            saveName: `New Game - ${new Date().toLocaleDateString()}`,
            description: "Newly created league",
            currentSeason: 2025,
            currentWeek: 0, // Preseason starts at week 0
            selectedTeamId: selectedTeamId,
            gameState: {
              timestamp: new Date().toISOString(),
              initialized: true,
            },
          }),
        });
      }

      // Step 7: Store selected team
      setProgress("Saving your team selection...");
      if (typeof window !== "undefined") {
        localStorage.setItem("selectedTeamId", selectedTeamId);
      }

      // Update game store - reset to week 1, season 2025
      const { useGameStore } = await import("@/lib/store/game-store");
      const gameStore = useGameStore.getState();
      gameStore.setSelectedTeam(selectedTeamId);
      gameStore.setCurrentWeek(0); // Preseason starts at week 0
      gameStore.setCurrentSeason(2025);
      gameStore.setSeasonPhase("preseason");
      if (currentSaveGameId) {
        gameStore.setSaveGameId(currentSaveGameId);
      }

      setProgress("League created successfully!");
      setTimeout(() => {
        onComplete(selectedTeamId);
      }, 500);
    } catch (err) {
      console.error("Error creating league:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create league. Please try again."
      );
      setLoading(false);
    }
  }

  async function createTeams() {
    const nflTeams = [
      // AFC East
      {
        id: "BUF",
        name: "Buffalo Bills",
        abbreviation: "BUF",
        conference: "AFC",
        division: "East",
        salary_cap_total: 255000000,
        owner_goal: "Win Super Bowl",
        owner_expected_wins: 12,
      },
      {
        id: "MIA",
        name: "Miami Dolphins",
        abbreviation: "MIA",
        conference: "AFC",
        division: "East",
        salary_cap_total: 255000000,
        owner_goal: "Make Playoffs",
        owner_expected_wins: 10,
      },
      {
        id: "NE",
        name: "New England Patriots",
        abbreviation: "NE",
        conference: "AFC",
        division: "East",
        salary_cap_total: 255000000,
        owner_goal: "Rebuild",
        owner_expected_wins: 6,
      },
      {
        id: "NYJ",
        name: "New York Jets",
        abbreviation: "NYJ",
        conference: "AFC",
        division: "East",
        salary_cap_total: 255000000,
        owner_goal: "Make Playoffs",
        owner_expected_wins: 9,
      },

      // AFC North
      {
        id: "BAL",
        name: "Baltimore Ravens",
        abbreviation: "BAL",
        conference: "AFC",
        division: "North",
        salary_cap_total: 255000000,
        owner_goal: "Win Super Bowl",
        owner_expected_wins: 13,
      },
      {
        id: "CIN",
        name: "Cincinnati Bengals",
        abbreviation: "CIN",
        conference: "AFC",
        division: "North",
        salary_cap_total: 255000000,
        owner_goal: "Win Super Bowl",
        owner_expected_wins: 11,
      },
      {
        id: "CLE",
        name: "Cleveland Browns",
        abbreviation: "CLE",
        conference: "AFC",
        division: "North",
        salary_cap_total: 255000000,
        owner_goal: "Make Playoffs",
        owner_expected_wins: 10,
      },
      {
        id: "PIT",
        name: "Pittsburgh Steelers",
        abbreviation: "PIT",
        conference: "AFC",
        division: "North",
        salary_cap_total: 255000000,
        owner_goal: "Make Playoffs",
        owner_expected_wins: 9,
      },

      // AFC South
      {
        id: "HOU",
        name: "Houston Texans",
        abbreviation: "HOU",
        conference: "AFC",
        division: "South",
        salary_cap_total: 255000000,
        owner_goal: "Make Playoffs",
        owner_expected_wins: 10,
      },
      {
        id: "IND",
        name: "Indianapolis Colts",
        abbreviation: "IND",
        conference: "AFC",
        division: "South",
        salary_cap_total: 255000000,
        owner_goal: "Make Playoffs",
        owner_expected_wins: 9,
      },
      {
        id: "JAX",
        name: "Jacksonville Jaguars",
        abbreviation: "JAX",
        conference: "AFC",
        division: "South",
        salary_cap_total: 255000000,
        owner_goal: "Win Division",
        owner_expected_wins: 11,
      },
      {
        id: "TEN",
        name: "Tennessee Titans",
        abbreviation: "TEN",
        conference: "AFC",
        division: "South",
        salary_cap_total: 255000000,
        owner_goal: "Rebuild",
        owner_expected_wins: 7,
      },

      // AFC West
      {
        id: "DEN",
        name: "Denver Broncos",
        abbreviation: "DEN",
        conference: "AFC",
        division: "West",
        salary_cap_total: 255000000,
        owner_goal: "Make Playoffs",
        owner_expected_wins: 9,
      },
      {
        id: "KC",
        name: "Kansas City Chiefs",
        abbreviation: "KC",
        conference: "AFC",
        division: "West",
        salary_cap_total: 255000000,
        owner_goal: "Win Super Bowl",
        owner_expected_wins: 13,
      },
      {
        id: "LV",
        name: "Las Vegas Raiders",
        abbreviation: "LV",
        conference: "AFC",
        division: "West",
        salary_cap_total: 255000000,
        owner_goal: "Make Playoffs",
        owner_expected_wins: 8,
      },
      {
        id: "LAC",
        name: "Los Angeles Chargers",
        abbreviation: "LAC",
        conference: "AFC",
        division: "West",
        salary_cap_total: 255000000,
        owner_goal: "Make Playoffs",
        owner_expected_wins: 10,
      },

      // NFC East
      {
        id: "DAL",
        name: "Dallas Cowboys",
        abbreviation: "DAL",
        conference: "NFC",
        division: "East",
        salary_cap_total: 255000000,
        owner_goal: "Win Super Bowl",
        owner_expected_wins: 12,
      },
      {
        id: "NYG",
        name: "New York Giants",
        abbreviation: "NYG",
        conference: "NFC",
        division: "East",
        salary_cap_total: 255000000,
        owner_goal: "Make Playoffs",
        owner_expected_wins: 9,
      },
      {
        id: "PHI",
        name: "Philadelphia Eagles",
        abbreviation: "PHI",
        conference: "NFC",
        division: "East",
        salary_cap_total: 255000000,
        owner_goal: "Win Super Bowl",
        owner_expected_wins: 11,
      },
      {
        id: "WAS",
        name: "Washington Commanders",
        abbreviation: "WAS",
        conference: "NFC",
        division: "East",
        salary_cap_total: 255000000,
        owner_goal: "Rebuild",
        owner_expected_wins: 6,
      },

      // NFC North
      {
        id: "CHI",
        name: "Chicago Bears",
        abbreviation: "CHI",
        conference: "NFC",
        division: "North",
        salary_cap_total: 255000000,
        owner_goal: "Make Playoffs",
        owner_expected_wins: 9,
      },
      {
        id: "DET",
        name: "Detroit Lions",
        abbreviation: "DET",
        conference: "NFC",
        division: "North",
        salary_cap_total: 255000000,
        owner_goal: "Win Division",
        owner_expected_wins: 11,
      },
      {
        id: "GB",
        name: "Green Bay Packers",
        abbreviation: "GB",
        conference: "NFC",
        division: "North",
        salary_cap_total: 255000000,
        owner_goal: "Make Playoffs",
        owner_expected_wins: 10,
      },
      {
        id: "MIN",
        name: "Minnesota Vikings",
        abbreviation: "MIN",
        conference: "NFC",
        division: "North",
        salary_cap_total: 255000000,
        owner_goal: "Make Playoffs",
        owner_expected_wins: 9,
      },

      // NFC South
      {
        id: "ATL",
        name: "Atlanta Falcons",
        abbreviation: "ATL",
        conference: "NFC",
        division: "South",
        salary_cap_total: 255000000,
        owner_goal: "Make Playoffs",
        owner_expected_wins: 9,
      },
      {
        id: "CAR",
        name: "Carolina Panthers",
        abbreviation: "CAR",
        conference: "NFC",
        division: "South",
        salary_cap_total: 255000000,
        owner_goal: "Rebuild",
        owner_expected_wins: 6,
      },
      {
        id: "NO",
        name: "New Orleans Saints",
        abbreviation: "NO",
        conference: "NFC",
        division: "South",
        salary_cap_total: 255000000,
        owner_goal: "Make Playoffs",
        owner_expected_wins: 9,
      },
      {
        id: "TB",
        name: "Tampa Bay Buccaneers",
        abbreviation: "TB",
        conference: "NFC",
        division: "South",
        salary_cap_total: 255000000,
        owner_goal: "Win Division",
        owner_expected_wins: 10,
      },

      // NFC West
      {
        id: "ARI",
        name: "Arizona Cardinals",
        abbreviation: "ARI",
        conference: "NFC",
        division: "West",
        salary_cap_total: 255000000,
        owner_goal: "Rebuild",
        owner_expected_wins: 7,
      },
      {
        id: "LAR",
        name: "Los Angeles Rams",
        abbreviation: "LAR",
        conference: "NFC",
        division: "West",
        salary_cap_total: 255000000,
        owner_goal: "Make Playoffs",
        owner_expected_wins: 10,
      },
      {
        id: "SF",
        name: "San Francisco 49ers",
        abbreviation: "SF",
        conference: "NFC",
        division: "West",
        salary_cap_total: 255000000,
        owner_goal: "Win Super Bowl",
        owner_expected_wins: 12,
      },
      {
        id: "SEA",
        name: "Seattle Seahawks",
        abbreviation: "SEA",
        conference: "NFC",
        division: "West",
        salary_cap_total: 255000000,
        owner_goal: "Make Playoffs",
        owner_expected_wins: 9,
      },
    ];

    const { error } = await supabase
      .from("teams")
      .upsert(nflTeams, { onConflict: "id" });
    if (error) throw error;

    // Reload teams after creation
    await loadTeams();
  }

  async function createPlayers() {
    const { generatePlayer } = await import("@/lib/player-generator");

    if (!generatePlayer || typeof generatePlayer !== "function") {
      throw new Error("Failed to import generatePlayer function");
    }

    // Generate ~50 players per team (32 teams * 50 = 1600 players)
    const players = [];
    const teamIds = [
      "BUF",
      "MIA",
      "NE",
      "NYJ",
      "BAL",
      "CIN",
      "CLE",
      "PIT",
      "HOU",
      "IND",
      "JAX",
      "TEN",
      "DEN",
      "KC",
      "LV",
      "LAC",
      "DAL",
      "NYG",
      "PHI",
      "WAS",
      "CHI",
      "DET",
      "GB",
      "MIN",
      "ATL",
      "CAR",
      "NO",
      "TB",
      "ARI",
      "LAR",
      "SF",
      "SEA",
    ];

    for (let i = 0; i < 1600; i++) {
      const player = generatePlayer({ isProspect: false });
      if (!player) {
        throw new Error(`Failed to generate player at index ${i}`);
      }
      // Assign to random team
      const teamIndex = Math.floor(Math.random() * 32);
      players.push({
        ...player,
        id: `player_${i + 1}`,
        team_id: teamIds[teamIndex],
      });
    }

    if (!players || players.length === 0) {
      throw new Error("No players were generated");
    }

    // Insert in batches
    const batchSize = 100;
    for (let i = 0; i < players.length; i += batchSize) {
      const batch = players.slice(i, i + batchSize);
      const { error } = await supabase
        .from("players")
        .upsert(batch, { onConflict: "id" });
      if (error) throw error;
    }
  }

  async function createFreeAgents() {
    const { generatePlayer } = await import("@/lib/player-generator");

    if (!generatePlayer || typeof generatePlayer !== "function") {
      throw new Error("Failed to import generatePlayer function");
    }

    // Generate ~200 free agents
    const freeAgents = [];
    for (let i = 0; i < 200; i++) {
      const player = generatePlayer({ isProspect: false });
      if (!player) {
        throw new Error(`Failed to generate free agent at index ${i}`);
      }
      freeAgents.push({
        ...player,
        id: `fa_${i + 1}`,
      });
    }

    if (!freeAgents || freeAgents.length === 0) {
      throw new Error("No free agents were generated");
    }

    const { error } = await supabase
      .from("free_agents")
      .upsert(freeAgents, { onConflict: "id" });
    if (error) throw error;
  }

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white rounded-lg shadow-xl p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Game Setup Wizard
            </h1>
            <p className="text-gray-600">
              Step {step} of 2:{" "}
              {step === 1 ? "Pick Your Team" : "Create League"}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Cancel"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div
              className={`flex-1 h-2 rounded-full ${step >= 1 ? "bg-blue-600" : "bg-gray-200"}`}
            />
            <div
              className={`flex-1 h-2 rounded-full ${step >= 2 ? "bg-blue-600" : "bg-gray-200"}`}
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Step 1: Team Selection */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Select Your Team
            </h2>
            {teams.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-96 overflow-y-auto">
                {teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => setSelectedTeamId(team.id)}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      selectedTeamId === team.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div className="font-semibold text-gray-900">
                      {team.abbreviation}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {team.name}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {team.conference} {team.division}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p className="mb-4">
                  Teams will be created when you proceed to the next step.
                </p>
                <p className="text-sm">
                  Click &quot;Next&quot; to continue with league creation.
                </p>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              {teams.length === 0 ? (
                <button
                  onClick={async () => {
                    setLoading(true);
                    setError(null);
                    setProgress("Creating teams...");
                    try {
                      await createTeams();
                      await loadTeams(); // Reload teams after creation
                      setLoading(false);
                      setProgress("");
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Failed to create teams"
                      );
                      setLoading(false);
                      setProgress("");
                    }
                  }}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating Teams...
                    </>
                  ) : (
                    <>
                      Create Teams & Continue
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => setStep(2)}
                  disabled={!selectedTeamId}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Create League */}
        {step === 2 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Create League
            </h2>

            {selectedTeam && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Selected Team:</p>
                <p className="font-semibold text-gray-900">
                  {selectedTeam.name} ({selectedTeam.abbreviation})
                </p>
              </div>
            )}

            <div className="mb-6">
              <p className="text-gray-700 mb-4">
                This will set up your league with:
              </p>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>32 NFL Teams</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>~1,600 Players across all teams</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>~200 Free Agents</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>272 Game Schedule (saved to database)</span>
                </li>
              </ul>
            </div>

            {progress && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  <p className="text-sm text-gray-700">{progress}</p>
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <button
                onClick={() => setStep(1)}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={handleCreateLeague}
                disabled={loading || !selectedTeamId}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Create League
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
