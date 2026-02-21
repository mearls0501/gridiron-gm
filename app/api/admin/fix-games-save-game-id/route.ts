import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Fix games that have incorrect or missing save_game_id
 * This ensures games are properly associated with the correct save game
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

    // Find games that need fixing (wrong or missing save_game_id)
    let gamesQuery = supabase
      .from("games")
      .select(
        "id, season, week, home_team_id, away_team_id, save_game_id, played"
      )
      .or(`save_game_id.is.null,save_game_id.neq.${saveGameId}`)
      .order("season", { ascending: true })
      .order("week", { ascending: true });

    if (season) {
      gamesQuery = gamesQuery.eq("season", season);
    }

    const { data: gamesToFix, error: gamesError } =
      await gamesQuery.limit(10000);

    if (gamesError) {
      return NextResponse.json(
        { error: `Failed to fetch games: ${gamesError.message}` },
        { status: 500 }
      );
    }

    if (!gamesToFix || gamesToFix.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No games found that need fixing",
        fixed: 0,
        games: 0,
      });
    }

    // Group games by save_game_id to see the distribution
    const gamesBySaveGameId: Record<string, number> = {};
    const gamesBySeason: Record<number, number> = {};
    gamesToFix.forEach((game) => {
      const key = game.save_game_id || "NULL";
      gamesBySaveGameId[key] = (gamesBySaveGameId[key] || 0) + 1;
      gamesBySeason[game.season] = (gamesBySeason[game.season] || 0) + 1;
    });

    console.log("Games distribution by save_game_id:", gamesBySaveGameId);
    console.log("Games distribution by season:", gamesBySeason);

    // Check for duplicates before updating
    // Get all existing games with the correct save_game_id for the same season/week/teams
    const gameKeys = gamesToFix.map((g) => ({
      season: g.season,
      week: g.week,
      home_team_id: g.home_team_id,
      away_team_id: g.away_team_id,
      gameId: g.id,
    }));

    // Query for existing games with correct save_game_id
    const seasons = [...new Set(gamesToFix.map((g) => g.season))];
    const existingGamesQuery = supabase
      .from("games")
      .select("season, week, home_team_id, away_team_id")
      .eq("save_game_id", saveGameId)
      .in("season", seasons);

    const { data: existingGames, error: existingError } =
      await existingGamesQuery;

    if (existingError && existingError.code !== "PGRST116") {
      console.error("Error checking for existing games:", existingError);
    }

    // Create a Set of existing game keys for fast lookup
    const existingGameKeys = new Set(
      (existingGames || []).map(
        (g) => `${g.season}-${g.week}-${g.home_team_id}-${g.away_team_id}`
      )
    );

    // Separate games into duplicates and those to update
    const duplicateGameIds: string[] = [];
    const gamesToUpdate: string[] = [];

    gameKeys.forEach((key) => {
      const keyString = `${key.season}-${key.week}-${key.home_team_id}-${key.away_team_id}`;
      if (existingGameKeys.has(keyString)) {
        duplicateGameIds.push(key.gameId);
      } else {
        gamesToUpdate.push(key.gameId);
      }
    });

    console.log(`Games to fix: ${gamesToFix.length}`);
    console.log(`  - Safe to update: ${gamesToUpdate.length}`);
    console.log(`  - Duplicates (will be deleted): ${duplicateGameIds.length}`);

    // Delete duplicate games (games without/wrong save_game_id that have duplicates with correct save_game_id)
    let deleted = 0;
    if (duplicateGameIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("games")
        .delete()
        .in("id", duplicateGameIds);

      if (deleteError) {
        console.error("Error deleting duplicate games:", deleteError);
        return NextResponse.json(
          { error: `Failed to delete duplicate games: ${deleteError.message}` },
          { status: 500 }
        );
      }
      deleted = duplicateGameIds.length;
    }

    // Update games that don't have duplicates
    let fixed = 0;
    if (gamesToUpdate.length > 0) {
      const { error: updateError } = await supabase
        .from("games")
        .update({ save_game_id: saveGameId })
        .in("id", gamesToUpdate);

      if (updateError) {
        console.error("Error updating games:", updateError);
        return NextResponse.json(
          { error: `Failed to update games: ${updateError.message}` },
          { status: 500 }
        );
      }
      fixed = gamesToUpdate.length;
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixed} games. Deleted ${deleted} duplicate games.`,
      fixed,
      deleted,
      games: gamesToFix.length,
      distribution: {
        bySaveGameId: gamesBySaveGameId,
        bySeason: gamesBySeason,
      },
      details: {
        safeToUpdate: gamesToUpdate.length,
        duplicates: duplicateGameIds.length,
      },
    });
  } catch (error) {
    console.error("Error fixing games:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
