import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { replenishAllRosters } from "@/lib/utils/roster-replenisher";

/**
 * Admin endpoint to:
 * 1. Replenish all rosters to 53 players
 * 2. Optionally resimulate games that have no stats
 */
export async function POST(req: Request) {
  try {
    const { saveGameId, season, resimulateGames = false } = await req.json();

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    // Get current season/week if not provided
    let currentSeason = season;
    let currentWeek = 0;

    if (!currentSeason) {
      const { data: activeSeason } = await supabase
        .from("seasons")
        .select("year, current_week")
        .eq("save_game_id", saveGameId)
        .eq("is_active", true)
        .maybeSingle();

      if (activeSeason) {
        currentSeason = activeSeason.year;
        currentWeek = activeSeason.current_week || 0;
      } else {
        currentSeason = 2025;
      }
    }

    const results: {
      replenishment: any;
      resimulation?: {
        gamesFound: number;
        gamesResimulated: number;
        errors: string[];
      };
    } = {
      replenishment: null,
    };

    // Step 1: Replenish rosters
    console.log(
      `[ReplenishRostersAndResimulate] Starting roster replenishment for saveGameId: ${saveGameId}, season: ${currentSeason}`
    );
    const replenishResult = await replenishAllRosters(
      saveGameId,
      currentSeason,
      currentWeek
    );

    results.replenishment = {
      success: replenishResult.success,
      teamsProcessed: replenishResult.teamsProcessed,
      playersAdded: replenishResult.playersAdded,
      errors: replenishResult.errors,
    };

    // Step 2: Optionally resimulate games with no stats
    if (resimulateGames) {
      console.log(
        `[ReplenishRostersAndResimulate] Finding games with no stats for resimulation...`
      );

      // Find games that are marked as played but have no player stats
      const { data: gamesWithoutStats, error: gamesError } = await supabase
        .from("games")
        .select("id, season, week, home_team_id, away_team_id")
        .eq("save_game_id", saveGameId)
        .eq("played", true)
        .eq("season", currentSeason);

      if (gamesError) {
        return NextResponse.json(
          {
            error: `Failed to find games: ${gamesError.message}`,
            replenishment: results.replenishment,
          },
          { status: 500 }
        );
      }

      if (!gamesWithoutStats || gamesWithoutStats.length === 0) {
        results.resimulation = {
          gamesFound: 0,
          gamesResimulated: 0,
          errors: [],
        };
      } else {
        // Check which games actually have no stats
        const gamesToResimulate: string[] = [];
        const errors: string[] = [];

        for (const game of gamesWithoutStats) {
          const { count: statsCount } = await supabase
            .from("player_game_stats")
            .select("*", { count: "exact", head: true })
            .eq("game_id", game.id)
            .eq("save_game_id", saveGameId);

          if (!statsCount || statsCount === 0) {
            gamesToResimulate.push(game.id);
          }
        }

        console.log(
          `[ReplenishRostersAndResimulate] Found ${gamesToResimulate.length} games to resimulate`
        );

        // Resimulate games
        let resimulated = 0;
        for (const gameId of gamesToResimulate) {
          try {
            const { simulateGame } = await import("@/lib/simulation/engine");
            const game = gamesWithoutStats.find((g) => g.id === gameId);
            if (!game) continue;

            // Load game details
            const { data: gameDetails } = await supabase
              .from("games")
              .select("*")
              .eq("id", gameId)
              .single();

            if (!gameDetails) {
              errors.push(`Game ${gameId} not found`);
              continue;
            }

            // Simulate game
            const result = await simulateGame(
              {
                gameId: gameDetails.id,
                homeTeamId: gameDetails.home_team_id,
                awayTeamId: gameDetails.away_team_id,
                season: gameDetails.season,
                week: gameDetails.week,
                includePlayByPlay: false,
                useEnhancedAttributes: true,  // 🏈 Enable attribute-based simulation
              },
              undefined,
              saveGameId
            );

            // Save stats
            if (result.playerStats && result.playerStats.length > 0) {
              const statsWithSaveGameId = result.playerStats.map((stat) => ({
                ...stat,
                save_game_id: saveGameId,
              }));

              const { error: statsError } = await supabase
                .from("player_game_stats")
                .insert(statsWithSaveGameId);

              if (statsError) {
                errors.push(
                  `Failed to save stats for game ${gameId}: ${statsError.message}`
                );
              } else {
                resimulated++;
                console.log(
                  `[ReplenishRostersAndResimulate] Resimulated game ${gameId}, saved ${result.playerStats.length} stats`
                );
              }
            } else {
              errors.push(
                `Game ${gameId} resimulated but generated 0 stats (roster issue?)`
              );
            }
          } catch (error) {
            errors.push(
              `Failed to resimulate game ${gameId}: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
          }
        }

        results.resimulation = {
          gamesFound: gamesWithoutStats.length,
          gamesResimulated: resimulated,
          errors,
        };
      }
    }

    return NextResponse.json({
      success: true,
      message: `Roster replenishment completed. ${
        resimulateGames
          ? `${results.resimulation?.gamesResimulated || 0} games resimulated.`
          : "Set resimulateGames=true to resimulate games with no stats."
      }`,
      ...results,
    });
  } catch (error) {
    console.error("Error in replenish-rosters-and-resimulate:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

