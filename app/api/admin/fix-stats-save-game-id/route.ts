import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Fix stats that have incorrect or missing save_game_id
 * This can happen if stats were saved before save_game_id was required,
 * or if stats were saved with the wrong save_game_id
 */
export async function POST(req: Request) {
  try {
    const { saveGameId, season } = await req.json();

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    // First, check what stats exist and their save_game_id values
    let statsQuery = supabase
      .from("player_game_stats")
      .select("id, season, week, save_game_id, game_id")
      .order("season", { ascending: true })
      .order("week", { ascending: true });

    if (season) {
      statsQuery = statsQuery.eq("season", season);
    }

    const { data: allStats, error: statsError } = await statsQuery.limit(10000);

    if (statsError) {
      return NextResponse.json(
        { error: `Failed to fetch stats: ${statsError.message}` },
        { status: 500 }
      );
    }

    if (!allStats || allStats.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No stats found to fix",
        fixed: 0,
        stats: [],
      });
    }

    // Group stats by save_game_id to see the distribution
    const statsBySaveGameId: Record<string, number> = {};
    const statsBySeason: Record<number, number> = {};
    allStats.forEach((stat) => {
      const key = stat.save_game_id || "NULL";
      statsBySaveGameId[key] = (statsBySaveGameId[key] || 0) + 1;
      statsBySeason[stat.season] = (statsBySeason[stat.season] || 0) + 1;
    });

    console.log("Stats distribution by save_game_id:", statsBySaveGameId);
    console.log("Stats distribution by season:", statsBySeason);

    // Find stats that need fixing (wrong or missing save_game_id)
    const statsToFix = allStats.filter(
      (stat) => !stat.save_game_id || stat.save_game_id !== saveGameId
    );

    if (statsToFix.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All stats already have the correct save_game_id",
        fixed: 0,
        stats: allStats.length,
        distribution: {
          bySaveGameId: statsBySaveGameId,
          bySeason: statsBySeason,
        },
      });
    }

    // For each stat that needs fixing, check if the corresponding game has the correct save_game_id
    // If the game has the correct save_game_id, update the stat
    // If the game doesn't exist or has a different save_game_id, we need to check the game
    const gameIds = [...new Set(statsToFix.map((s) => s.game_id))];
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("id, save_game_id, season, week")
      .in("id", gameIds);

    if (gamesError) {
      console.error("Error fetching games:", gamesError);
      // Continue anyway - we'll try to update based on what we know
    }

    const gamesMap = new Map((games || []).map((g) => [g.id, g]));

    // Separate stats into:
    // 1. Stats where the game has the correct save_game_id (safe to update)
    // 2. Stats where the game has a different/wrong save_game_id (need to check)
    // 3. Stats where the game doesn't exist (might be orphaned)
    const safeToUpdate: string[] = [];
    const needGameCheck: Array<{ statId: string; gameId: string }> = [];
    const orphaned: string[] = [];

    statsToFix.forEach((stat) => {
      const game = gamesMap.get(stat.game_id);
      if (!game) {
        orphaned.push(stat.id);
      } else if (game.save_game_id === saveGameId) {
        safeToUpdate.push(stat.id);
      } else {
        needGameCheck.push({ statId: stat.id, gameId: stat.game_id });
      }
    });

    console.log(`Stats to fix: ${statsToFix.length}`);
    console.log(
      `  - Safe to update (game has correct save_game_id): ${safeToUpdate.length}`
    );
    console.log(
      `  - Need game check (game has different save_game_id): ${needGameCheck.length}`
    );
    console.log(`  - Orphaned (game doesn't exist): ${orphaned.length}`);

    // Update stats that are safe to update
    let fixed = 0;
    if (safeToUpdate.length > 0) {
      const { error: updateError } = await supabase
        .from("player_game_stats")
        .update({ save_game_id: saveGameId })
        .in("id", safeToUpdate);

      if (updateError) {
        console.error("Error updating stats:", updateError);
        return NextResponse.json(
          { error: `Failed to update stats: ${updateError.message}` },
          { status: 500 }
        );
      }
      fixed += safeToUpdate.length;
    }

    // For stats where the game has a different save_game_id, we need to be more careful
    // We'll update them if the user explicitly wants to (by passing a flag)
    // For now, we'll just report them
    const needsManualReview = needGameCheck.length + orphaned.length;

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixed} stats. ${needsManualReview} stats need manual review.`,
      fixed,
      needsReview: needsManualReview,
      stats: allStats.length,
      distribution: {
        bySaveGameId: statsBySaveGameId,
        bySeason: statsBySeason,
      },
      details: {
        safeToUpdate: safeToUpdate.length,
        needGameCheck: needGameCheck.length,
        orphaned: orphaned.length,
      },
    });
  } catch (error) {
    console.error("Error fixing stats:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
