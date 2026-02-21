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

    // Use provided season/week or fall back to game data
    const gameSeason = season || game.season;
    const gameWeek = week || game.week;

    // Simulate the game
    const result = await simulateGame({
      homeTeamId: game.home_team_id,
      awayTeamId: game.away_team_id,
      gameId: game.id,
      season: gameSeason,
      week: gameWeek,
    });

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
      // Ensure we have a save_game_id - prioritize in this order:
      // 1. Provided saveGameId
      // 2. Game's save_game_id
      // 3. null (for legacy compatibility)
      const effectiveSaveGameId = saveGameId || game.save_game_id || null;

      const statsWithSaveGameId = result.playerStats.map((stat) => ({
        ...stat,
        save_game_id: effectiveSaveGameId,
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
          save_game_id: effectiveSaveGameId,
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
            aggregateSeasonStats(gameSeason, effectiveSaveGameId).catch(
              (err) => {
                console.error("Error aggregating season stats:", err);
              }
            );
          }
        );
      }
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
