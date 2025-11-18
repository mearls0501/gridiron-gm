import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { simulateGame } from "@/lib/simulation/engine";
import { PlayerGameStat } from "@/lib/simulation/types";

export async function POST(req: Request) {
  try {
    const { season, week } = await req.json();

    if (!season || !week) {
      return NextResponse.json(
        { error: "Season and week are required" },
        { status: 400 }
      );
    }

    // Get all unplayed games for this week
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("*")
      .eq("season", season)
      .eq("week", week)
      .eq("played", false);

    if (gamesError) {
      return NextResponse.json(
        { error: "Failed to fetch games" },
        { status: 500 }
      );
    }

    if (!games || games.length === 0) {
      return NextResponse.json(
        { error: "No unplayed games found for this week" },
        { status: 404 }
      );
    }

    // Simulate games sequentially with progress tracking
    // Process in smaller batches for better progress visibility
    const results: Array<{
      gameId: string;
      homeTeam: string;
      awayTeam: string;
      homeScore: number;
      awayScore: number;
    }> = [];
    const errors: Array<{ gameId: string; error: string }> = [];
    const allPlayerStats: PlayerGameStat[] = [];
    const gameUpdates: Array<{
      id: string;
      home_score: number;
      away_score: number;
    }> = [];

    // Process games in batches of 4 for better progress visibility
    const batchSize = 4;
    for (let i = 0; i < games.length; i += batchSize) {
      const batch = games.slice(i, i + batchSize);

      // Simulate batch in parallel
      const batchPromises = batch.map(async (game) => {
        try {
          const result = await simulateGame({
            homeTeamId: game.home_team_id,
            awayTeamId: game.away_team_id,
            gameId: game.id,
            season: game.season,
            week: game.week,
          });

          // Collect stats and updates for batch operations
          if (result.playerStats && result.playerStats.length > 0) {
            allPlayerStats.push(...result.playerStats);
          }

          gameUpdates.push({
            id: game.id,
            home_score: Math.round(result.homeScore),
            away_score: Math.round(result.awayScore),
          });

          return {
            gameId: game.id,
            homeTeam: game.home_team_id,
            awayTeam: game.away_team_id,
            homeScore: result.homeScore,
            awayScore: result.awayScore,
          };
        } catch (error) {
          errors.push({
            gameId: game.id,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          return null;
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter((r) => r !== null));

      // Save progress after each batch
      if (gameUpdates.length > 0) {
        const batchUpdates = gameUpdates.splice(0, batchSize);
        await Promise.all(
          batchUpdates.map((update) =>
            supabase
              .from("games")
              .update({
                home_score: update.home_score,
                away_score: update.away_score,
                played: true,
                updated_at: new Date().toISOString(),
              })
              .eq("id", update.id)
          )
        );
      }
    }

    // Any remaining game updates (should be none after batch processing)
    if (gameUpdates.length > 0) {
      await Promise.all(
        gameUpdates.map((update) =>
          supabase
            .from("games")
            .update({
              home_score: update.home_score,
              away_score: update.away_score,
              played: true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", update.id)
        )
      );
    }

    // Batch insert all player stats
    if (allPlayerStats.length > 0) {
      // Insert in chunks of 1000 to avoid payload size limits
      const chunkSize = 1000;
      for (let i = 0; i < allPlayerStats.length; i += chunkSize) {
        const chunk = allPlayerStats.slice(i, i + chunkSize);
        const { error: statsError } = await supabase
          .from("player_game_stats")
          .insert(chunk);

        if (statsError) {
          console.error(`Error saving stats chunk:`, statsError);
        }
      }
    }

    // Aggregate season stats asynchronously (non-blocking)
    if (results.length > 0) {
      Promise.resolve()
        .then(async () => {
          try {
            const { aggregateSeasonStats } = await import(
              "@/lib/simulation/player-development"
            );
            await aggregateSeasonStats(season);
          } catch (err) {
            console.error("Error aggregating season stats:", err);
          }
        })
        .catch(() => {});
    }

    return NextResponse.json({
      success: true,
      simulated: results.length,
      total: games.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error simulating week:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
