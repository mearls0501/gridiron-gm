import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { simulateGame } from "@/lib/simulation/engine";

export async function POST(req: Request) {
  try {
    const { gameId, season, week, saveGameId } = await req.json();

    if (!gameId) {
      return NextResponse.json(
        { error: "Game ID is required" },
        { status: 400 }
      );
    }

    // CRITICAL: Require saveGameId to prevent stats from being saved with wrong/null save_game_id
    if (!saveGameId) {
      return NextResponse.json(
        {
          error: "saveGameId is required",
          hint: "All games and stats must be associated with a save game. Make sure you're using a valid save game.",
        },
        { status: 400 }
      );
    }

    // Quick check if stats tables exist (non-blocking)
    const { error: statsTableError } = await supabase
      .from("player_game_stats")
      .select("id")
      .limit(1);

    if (
      statsTableError &&
      (statsTableError.code === "PGRST116" ||
        statsTableError.message.includes("does not exist"))
    ) {
      return NextResponse.json(
        {
          error:
            "Player stats tables not found. Please run the migration first.",
          instructions:
            "Call POST /api/setup-stats-tables to check status, or run the SQL migration manually.",
          sqlFile: "supabase/migrations/create_player_stats_tables.sql",
        },
        { status: 400 }
      );
    }

    // Load game from database
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (game.played) {
      return NextResponse.json(
        { error: "Game has already been played" },
        { status: 400 }
      );
    }

    // CRITICAL: Ensure game has the correct save_game_id
    // This prevents stats from being saved with wrong/null save_game_id
    // saveGameId is guaranteed to be non-null at this point (validated above)
    if (game.save_game_id !== saveGameId) {
      const { error: updateGameError } = await supabase
        .from("games")
        .update({ save_game_id: saveGameId })
        .eq("id", gameId);

      if (updateGameError) {
        console.error(
          `[SimulateGame] CRITICAL: Failed to update game save_game_id:`,
          updateGameError
        );
        return NextResponse.json(
          {
            error: `Failed to update game with save_game_id. This is required for proper data isolation.`,
            details: updateGameError.message,
          },
          { status: 500 }
        );
      } else {
        console.log(
          `[SimulateGame] Updated game ${gameId} with save_game_id ${saveGameId}`
        );
        // Update local game object so we use the correct save_game_id below
        game.save_game_id = saveGameId;
      }
    }

    // Use provided season/week or fall back to game data
    const gameSeason = season || game.season;
    const gameWeek = week || game.week;

    // CRITICAL: Check roster sizes and auto-replenish if needed
    // This prevents simulation failures due to incomplete rosters
    const { count: homeRosterSize } = await supabase
      .from("player_team_assignments")
      .select("*", { count: "exact", head: true })
      .eq("team_id", game.home_team_id)
      .eq("save_game_id", saveGameId);

    const { count: awayRosterSize } = await supabase
      .from("player_team_assignments")
      .select("*", { count: "exact", head: true })
      .eq("team_id", game.away_team_id)
      .eq("save_game_id", saveGameId);

    if ((homeRosterSize || 0) !== 53 || (awayRosterSize || 0) !== 53) {
      console.log(
        `[SimulateGame] Roster size issue detected. Home: ${homeRosterSize || 0}, Away: ${awayRosterSize || 0}. Auto-replenishing...`
      );

      const { replenishTeamRosterOnly } = await import(
        "@/lib/utils/roster-replenisher"
      );

      if ((homeRosterSize || 0) !== 53) {
        const homeReplenishResult = await replenishTeamRosterOnly(
          game.home_team_id,
          saveGameId,
          gameSeason,
          gameWeek
        );
        console.log(
          `[SimulateGame] Home team replenished: ${homeReplenishResult.beforeSize} → ${homeReplenishResult.afterSize} (added ${homeReplenishResult.playersAdded})`
        );
      }

      if ((awayRosterSize || 0) !== 53) {
        const awayReplenishResult = await replenishTeamRosterOnly(
          game.away_team_id,
          saveGameId,
          gameSeason,
          gameWeek
        );
        console.log(
          `[SimulateGame] Away team replenished: ${awayReplenishResult.beforeSize} → ${awayReplenishResult.afterSize} (added ${awayReplenishResult.playersAdded})`
        );
      }
    }

    // Simulate the game
    let result;
    try {
      result = await simulateGame(
        {
          homeTeamId: game.home_team_id,
          awayTeamId: game.away_team_id,
          gameId: game.id,
          season: gameSeason,
          week: gameWeek,
          useEnhancedAttributes: true, // 🏈 Enable attribute-based simulation
        },
        undefined,
        saveGameId
      );
    } catch (simError) {
      // If it's a roster size error even after replenishment, provide helpful error
      if (
        simError instanceof Error &&
        simError.message.includes("ROSTER_SIZE_ERROR")
      ) {
        console.error(
          `[SimulateGame] Roster size error after replenishment:`,
          simError.message
        );
        return NextResponse.json(
          {
            error: "ROSTER_INVALID",
            message: simError.message.replace("ROSTER_SIZE_ERROR: ", ""),
            hint: "Try using the roster replenishment tool or manually fix the rosters. There may be invalid player assignments.",
          },
          { status: 400 }
        );
      }
      // Re-throw other errors
      throw simError;
    }

    // Update game record with scores (ensure integers)
    const { error: updateError } = await supabase
      .from("games")
      .update({
        home_score: Math.round(result.homeScore),
        away_score: Math.round(result.awayScore),
        played: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", gameId);

    if (updateError) {
      console.error("Error updating game:", updateError);
      return NextResponse.json(
        { error: "Failed to update game record" },
        { status: 500 }
      );
    }

    // Save player stats to database with save_game_id
    if (result.playerStats && result.playerStats.length > 0) {
      // CRITICAL: Always use saveGameId from request (guaranteed to be non-null at this point)
      // Never fall back to game.save_game_id - if game didn't have it, we updated it above
      // This ensures all stats are saved with the correct save_game_id
      const statsWithSaveGameId = result.playerStats.map((stat) => ({
        ...stat,
        save_game_id: saveGameId, // Always use the provided saveGameId
      }));

      const { error: statsError, data: insertedStats } = await supabase
        .from("player_game_stats")
        .insert(statsWithSaveGameId)
        .select(); // Select to verify insertion

      if (statsError) {
        console.error("Error saving player stats:", statsError);
        console.error("Stats error details:", {
          message: statsError.message,
          code: statsError.code,
          details: statsError.details,
          hint: statsError.hint,
        });
        console.error("Attempted to insert stats:", {
          count: statsWithSaveGameId.length,
          sample: statsWithSaveGameId[0],
          save_game_id: saveGameId,
        });
        // Still don't fail the request, but log extensively
      } else {
        console.log(
          `Successfully saved ${insertedStats?.length || 0} player game stats`
        );
        // Update player ratings and aggregate season stats (Phase 4)
        // This is done asynchronously to not block the response
        import("@/lib/simulation/player-development").then(
          ({ updatePlayerRatingsAfterGame, aggregateSeasonStats }) => {
            updatePlayerRatingsAfterGame(gameId).catch((err) => {
              console.error("Error updating player ratings:", err);
            });
            // Aggregate season stats for the season
            aggregateSeasonStats(gameSeason, saveGameId).catch((err) => {
              console.error("Error aggregating season stats:", err);
            });
          }
        );
      }
    } else {
      // Log warning if no stats were generated
      console.warn(
        `[SimulateGame] WARNING: Game ${gameId} simulated but generated 0 player stats. ` +
          `This may indicate incomplete rosters (teams with < 53 players) or simulation issues. ` +
          `Home team: ${game.home_team_id}, Away team: ${game.away_team_id}, saveGameId: ${saveGameId}`
      );
    }

    return NextResponse.json({
      success: true,
      result: {
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        playerStatsCount: result.playerStats.length,
      },
    });
  } catch (error) {
    console.error("Error simulating game:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
