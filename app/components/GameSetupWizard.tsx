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

      // Step 2: Create a save game FIRST (needed for player and schedule isolation)
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

      if (!saveGameResponse.ok) {
        const saveGameError = await saveGameResponse.json();
        throw new Error(
          `Failed to create save game: ${saveGameError.error || "Unknown error"}. Cannot proceed without a save game.`
        );
      }

      const saveGameData = await saveGameResponse.json();
      if (!saveGameData.success || !saveGameData.saveGame?.id) {
        throw new Error(
          `Save game creation failed: ${saveGameData.error || "Save game ID not returned"}. Cannot proceed without a save game.`
        );
      }

      // IMPORTANT: At this point, we MUST have a saveGameId
      currentSaveGameId = saveGameData.saveGame.id;

      // Store all game state immediately to prevent reading old localStorage values
      const { useGameStore: getGameStore } = await import(
        "@/lib/store/game-store"
      );
      const gameStoreInstance = getGameStore.getState();
      gameStoreInstance.setSaveGameId(currentSaveGameId);
      gameStoreInstance.setCurrentWeek(0); // Preseason starts at week 0
      gameStoreInstance.setCurrentSeason(2025);
      gameStoreInstance.setSeasonPhase("preseason");

      // Verify saveGameId is now in store (defensive check)
      // Get fresh state after setting to check the update
      const updatedState = getGameStore.getState();
      if (!updatedState.saveGameId) {
        throw new Error(
          "Failed to store saveGameId in game store. Cannot proceed."
        );
      }

      // Step 3: Check if players exist in seed data (base players table)
      // We always check the base players table because that's where seed data lives
      // player_team_assignments will be empty for a new save game - that's expected
      setProgress("Checking players...");
      let playerCount = 0;
      try {
        // Always check the base players table for seed data
        // This is the source of truth for whether players have been seeded
        const { count, error } = await supabase
          .from("players")
          .select("*", { count: "exact", head: true });

        if (error) {
          console.warn("Error checking base players:", error.message);
          playerCount = 0;
        } else {
          playerCount = count || 0;
        }
      } catch (checkError) {
        // If checking fails, assume no players exist
        console.warn("Error checking player count:", checkError);
        playerCount = 0;
      }

      if (playerCount === 0) {
        // Players must be manually seeded - the game does not create players
        // Only draft prospects are created by the game
        throw new Error(
          "No players found in database. Please seed players first before creating a new save game. " +
            "Players must be manually imported/uploaded - the game only creates draft prospects."
        );
      }

      // Initialize player assignments and contracts for this save game
      if (!currentSaveGameId) {
        throw new Error("Save game ID is required but was not found");
      }

      setProgress("Initializing player assignments and contracts...");
      try {
        await initializePlayersForSaveGame(currentSaveGameId);
      } catch (initError) {
        console.error("Error initializing players for save game:", initError);
        throw new Error(
          `Failed to initialize players: ${initError instanceof Error ? initError.message : String(initError)}`
        );
      }

      // Initialize coaches for this save game
      setProgress("Initializing coaching staffs...");
      try {
        const coachResponse = await fetch("/api/coaches/initialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            saveGameId: currentSaveGameId,
            season: 2025,
          }),
        });

        if (!coachResponse.ok) {
          const coachError = await coachResponse.json();
          console.warn("Warning initializing coaches:", coachError.error);
          // Don't fail the whole setup if coaches fail - user can add them later
        } else {
          const coachData = await coachResponse.json();
          console.log(`Initialized ${coachData.assignmentsCreated} coach assignments`);
        }
      } catch (coachError) {
        console.warn("Error initializing coaches:", coachError);
        // Don't fail the whole setup - coaches can be added later
      }

      // Step 4: Check if free agents exist (seed data - should be seeded once for all games)
      // Free agents are now in players table with is_free_agent = TRUE
      setProgress("Checking free agents...");
      const { count: freeAgentCount, error: freeAgentCountError } =
        await supabase
          .from("players")
          .select("*", { count: "exact", head: true })
          .eq("is_free_agent", true);

      if (freeAgentCountError) {
        console.error("Error checking free agents:", freeAgentCountError);
        // Don't fail - free agents may not be seeded yet, but game can still be created
        // They will be available once seeded
      }

      if ((freeAgentCount || 0) === 0) {
        // Free agents don't exist - generate them using service role API
        setProgress("Generating free agents...");
        try {
          const seedResponse = await fetch("/api/free-agents/seed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ count: 200 }),
          });

          if (!seedResponse.ok) {
            const seedError = await seedResponse.json();
            console.warn(
              "Failed to seed free agents:",
              seedError.error || "Unknown error"
            );
            // Don't fail the whole setup - free agents can be added later
          } else {
            const seedData = await seedResponse.json();
            console.log(
              `[Game Setup] Seeded ${seedData.count} free agents successfully`
            );
          }
        } catch (seedErr) {
          console.warn("Error seeding free agents:", seedErr);
          // Don't fail the whole setup - free agents can be added later
        }
      }

      // Create availability records for this save game from seed free agents
      if (currentSaveGameId) {
        setProgress("Initializing free agent availability...");
        try {
          // Get all free agents from players table (seed data)
          const { data: seedFreeAgents, error: seedError } = await supabase
            .from("players")
            .select("id")
            .eq("is_free_agent", true);

          if (!seedError && seedFreeAgents && seedFreeAgents.length > 0) {
            // Create availability records for this save game
            const availabilityRecords = seedFreeAgents.map((fa) => ({
              player_id: fa.id,
              save_game_id: currentSaveGameId,
              entered_free_agency_season: 2025, // Initial season
              reason: "initial",
              archived: false,
            }));

            const { error: availabilityError } = await supabase
              .from("free_agent_availability")
              .upsert(availabilityRecords, {
                onConflict: "save_game_id,player_id",
              });

            if (availabilityError) {
              console.warn(
                "Failed to create initial free agent availability:",
                availabilityError
              );
              // Don't fail - this is not critical
            } else {
              console.log(
                `[Game Setup] Created ${availabilityRecords.length} free agent availability records`
              );
            }
          } else {
            console.log(
              `[Game Setup] No free agents found to create availability records`
            );
          }
        } catch (availabilityErr) {
          console.warn(
            "Error initializing free agent availability:",
            availabilityErr
          );
          // Don't fail - this is not critical for game creation
        }
      }

      // Step 4: Create season record FIRST (preseason, week 0)
      // CRITICAL: Season record must exist before schedule generation
      // This ensures schedule can link to season_id UUID
      setProgress("Creating season record...");
      try {
        const { getOrCreateSeason } = await import(
          "@/lib/seasons/season-manager"
        );
        const seasonResult = await getOrCreateSeason(
          2025,
          currentSaveGameId || null,
          {
            phase: "preseason",
            currentWeek: 0,
            isActive: true,
          }
        );

        if (seasonResult.error) {
          console.error(
            "[GameSetupWizard] Failed to create season record:",
            seasonResult.error
          );
          throw new Error(
            `Failed to create season record: ${seasonResult.error}`
          );
        } else {
          console.log(
            `[GameSetupWizard] ${seasonResult.created ? "Created" : "Retrieved"} season record with phase: ${seasonResult.season.phase}`
          );
        }
      } catch (seasonErr) {
        console.error(
          "[GameSetupWizard] Exception creating season record:",
          seasonErr
        );
        if (seasonErr instanceof Error) {
          throw seasonErr;
        }
        throw new Error(
          `Failed to create season record: ${String(seasonErr)}`
        );
      }

      // Step 5: Generate and save schedule to database (REQUIRED for simulation)
      // Schedule will now link to the season_id UUID created in Step 4
      setProgress("Generating schedule...");
      try {
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
          const errorDetails = scheduleError.details
            ? `\n\nDetails: ${scheduleError.details}`
            : "";
          const errorHint = scheduleError.hint
            ? `\n\nHint: ${scheduleError.hint}`
            : "";
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
      } catch (scheduleError) {
        console.error("Error in schedule generation:", scheduleError);
        if (scheduleError instanceof Error) {
          throw scheduleError;
        }
        throw new Error(
          `Failed to generate schedule: ${String(scheduleError)}`
        );
      }

      // Step 6: Initialize draft picks for current season + 4 future seasons (5 total)
      if (currentSaveGameId) {
        setProgress("Initializing draft picks...");
        try {
          const draftPicksResponse = await fetch(
            "/api/initialize-draft-picks",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                season: 2025,
                saveGameId: currentSaveGameId,
                futureSeasons: 4, // Creates picks for 2025-2029
              }),
            }
          );

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

      // Step 7: Initialize depth charts for all teams
      if (currentSaveGameId) {
        try {
          setProgress("Generating depth charts for all teams...");
          const depthChartResponse = await fetch("/api/depth-chart/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              season: 2025,
              saveGameId: currentSaveGameId,
            }),
          });

          if (depthChartResponse.ok) {
            const depthChartData = await depthChartResponse.json();
            console.log(
              `[Game Setup] Depth charts initialized: ${depthChartData.teamsUpdated} teams, ${depthChartData.totalSlots} total slots`
            );
          } else {
            // Don't fail league creation if depth charts fail
            const depthChartError = await depthChartResponse.json();
            console.warn(
              "Could not initialize depth charts:",
              depthChartError.error || "Unknown error"
            );
          }
        } catch (depthChartErr) {
          // Don't fail league creation if depth charts fail
          console.warn("Error initializing depth charts:", depthChartErr);
        }
      }

      // Step 8: Update save game to mark as initialized (if it was created)
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

      // Step 9: Store selected team
      setProgress("Saving your team selection...");
      if (typeof window !== "undefined") {
        localStorage.setItem("selectedTeamId", selectedTeamId);
      }

      // Update game store - reset to week 0, season 2025 (preseason)
      const { useGameStore: getGameStoreForComplete } = await import(
        "@/lib/store/game-store"
      );
      const gameStoreForComplete = getGameStoreForComplete.getState();
      gameStoreForComplete.setSelectedTeam(selectedTeamId);
      gameStoreForComplete.setCurrentWeek(0); // Preseason starts at week 0
      gameStoreForComplete.setCurrentSeason(2025);
      gameStoreForComplete.setSeasonPhase("preseason");
      if (currentSaveGameId) {
        gameStoreForComplete.setSaveGameId(currentSaveGameId);
      }

      setProgress("League created successfully!");
      setTimeout(() => {
        onComplete(selectedTeamId);
      }, 500);
    } catch (err) {
      // Log detailed error information
      console.error("Error creating league - Full error object:", err);
      if (err instanceof Error) {
        console.error("Error name:", err.name);
        console.error("Error message:", err.message);
        console.error("Error stack:", err.stack);
      }

      // Try to extract meaningful error message
      let errorMessage = "Failed to create league. Please try again.";

      if (err instanceof Error) {
        errorMessage = err.message || errorMessage;
      } else if (err && typeof err === "object") {
        // Try to extract message from various possible error formats
        const errObj = err as Record<string, unknown>;
        if (errObj.message) {
          errorMessage = String(errObj.message);
        } else if (errObj.error) {
          errorMessage = String(errObj.error);
        } else if (errObj.toString && errObj.toString() !== "[object Object]") {
          errorMessage = errObj.toString();
        } else {
          // Last resort: try JSON stringify with error handling
          try {
            errorMessage = JSON.stringify(err, Object.getOwnPropertyNames(err));
          } catch {
            errorMessage = "Unknown error occurred. Check console for details.";
          }
        }
      } else if (err) {
        errorMessage = String(err);
      }

      setError(errorMessage);
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

  /**
   * Initialize players for a new save game
   * Creates player_team_assignments and copies contracts from seed data to player_contracts_per_save_game
   * Players must already exist in the players table (manually seeded)
   */
  async function initializePlayersForSaveGame(saveGameId: string) {
    if (!saveGameId) {
      throw new Error("saveGameId is required to initialize players");
    }

    // Verify players exist in seed data
    const { count: playerCount, error: countError } = await supabase
      .from("players")
      .select("*", { count: "exact", head: true });

    if (countError) {
      throw new Error(`Failed to check players: ${countError.message}`);
    }

    if ((playerCount || 0) === 0) {
      throw new Error(
        "No players found in database. Please seed players first before creating a save game."
      );
    }

    // Get all teams to create assignments
    const { data: allTeams, error: teamsError } = await supabase
      .from("teams")
      .select("id");

    if (teamsError) {
      throw new Error(
        `Failed to fetch teams for assignments: ${teamsError.message}`
      );
    }

    if (!allTeams || allTeams.length === 0) {
      throw new Error("No teams found in database");
    }

    // Create player_team_assignments for all players based on their seed team_id
    const assignments = [];
    const playersPerTeam = 53; // NFL roster size

    for (const team of allTeams) {
      const { data: teamPlayers, error: playersError } = await supabase
        .from("players")
        .select("id, team_id")
        .eq("team_id", team.id)
        .limit(playersPerTeam);

      if (playersError) {
        throw new Error(
          `Failed to fetch players for team ${team.id}: ${playersError.message}`
        );
      }

      if (teamPlayers && teamPlayers.length > 0) {
        // Create assignments for this team's players (up to 53)
        const teamAssignments = teamPlayers
          .slice(0, playersPerTeam)
          .map((player) => ({
            player_id: player.id,
            team_id: team.id,
            save_game_id: saveGameId,
            assigned_reason: "initial",
            season: 2025,
            week: 0,
          }));

        assignments.push(...teamAssignments);
      }
    }

    // Insert assignments in batches
    // Note: We can't use ON CONFLICT with partial unique indexes, so we check existence first
    if (assignments.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < assignments.length; i += batchSize) {
        const batch = assignments.slice(i, i + batchSize);

        // Check which assignments already exist
        const playerIds = batch
          .filter((a) => a.player_id)
          .map((a) => a.player_id);
        const existingAssignments: Set<string> = new Set();

        if (playerIds.length > 0) {
          const { data: existing } = await supabase
            .from("player_team_assignments")
            .select("player_id")
            .in("player_id", playerIds)
            .eq("save_game_id", saveGameId);

          if (existing) {
            existing.forEach((a: { player_id: string | null }) => {
              if (a.player_id) existingAssignments.add(a.player_id);
            });
          }
        }

        // Filter out existing assignments and insert only new ones
        const newAssignments = batch.filter(
          (a) => !a.player_id || !existingAssignments.has(a.player_id)
        );

        if (newAssignments.length > 0) {
          const { error } = await supabase
            .from("player_team_assignments")
            .insert(newAssignments);

          if (error) {
            // If table doesn't exist yet, that's okay - migration might not have run
            if (
              error.message?.includes("does not exist") ||
              error.code === "42P01"
            ) {
              console.warn(
                "player_team_assignments table doesn't exist yet - skipping assignments"
              );
              break;
            }
            throw new Error(
              `Failed to create player assignments: ${error.message || error.code || "Unknown error"}`
            );
          }
        }
      }
    }

    // Copy contracts from players table to player_contracts_per_save_game
    const { initializeContractsForSaveGame } = await import(
      "@/lib/utils/player-contracts"
    );
    const contractResult = await initializeContractsForSaveGame(saveGameId);

    if (!contractResult.success) {
      throw new Error(
        `Failed to initialize contracts: ${contractResult.error || "Unknown error"}`
      );
    }

    console.log(
      `[GameSetupWizard] Initialized ${assignments.length} player assignments and ${contractResult.contractsCreated} contracts for save game ${saveGameId}`
    );
  }

  async function createFreeAgents(saveGameId?: string) {
    const { generatePlayer } = await import("@/lib/player-generator");

    if (!generatePlayer || typeof generatePlayer !== "function") {
      throw new Error("Failed to import generatePlayer function");
    }

    // Generate ~200 free agents (base seed data)
    // Free agents are now created in players table with is_free_agent = TRUE
    const freeAgents = [];
    for (let i = 0; i < 200; i++) {
      const player = generatePlayer({ isProspect: false });
      if (!player) {
        throw new Error(`Failed to generate free agent at index ${i}`);
      }
      // Create player record with is_free_agent = TRUE
      // Note: Contract fields are tracked in player_contracts_per_save_game, not in players table
      freeAgents.push({
        id: crypto.randomUUID(),
        full_name: player.full_name,
        position: player.position,
        age: player.age,
        college: player.college || null,
        archetype: player.archetype || null,
        overall: player.overall,
        potential: player.potential,
        is_free_agent: true, // Mark as free agent
        team_id: null, // Free agents have no team
      });
    }

    if (!freeAgents || freeAgents.length === 0) {
      throw new Error("No free agents were generated");
    }

    // Insert into players table (seed data, shared across all games)
    // Note: RLS must be temporarily disabled or we need to use a service role key
    const { error } = await supabase
      .from("players")
      .upsert(freeAgents, { onConflict: "id" });
    if (error) {
      throw new Error(
        `Failed to insert free agents: ${error.message || error.code || JSON.stringify(error)}`
      );
    }

    // If saveGameId is provided, create initial availability records for this save game
    if (saveGameId) {
      const availabilityRecords = freeAgents.map((fa) => ({
        player_id: fa.id,
        save_game_id: saveGameId,
        entered_free_agency_season: 2025,
        reason: "initial",
        archived: false,
      }));

      const { error: availabilityError } = await supabase
        .from("free_agent_availability")
        .upsert(availabilityRecords, {
          onConflict: "save_game_id,player_id",
        });

      if (availabilityError) {
        console.warn(
          "Failed to create free agent availability:",
          availabilityError.message
        );
      } else {
        console.log(
          `[Game Setup] Created ${availabilityRecords.length} free agent availability records`
        );
      }
    }
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
                  <span>1,696 Players across all teams (53 per team)</span>
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
