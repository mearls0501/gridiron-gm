import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import {
  calculatePlayoffSeeds,
  createPlayoffBracket,
} from "@/lib/playoffs/calculator";

/**
 * Initialize playoffs for a season
 * Calculates seeds and creates the playoff bracket
 */
export async function POST(req: Request) {
  try {
    const { season, saveGameId } = await req.json();

    if (!season) {
      return NextResponse.json(
        { error: "Season is required" },
        { status: 400 }
      );
    }

    // Check if week 18 is complete
    let gamesQuery = supabase
      .from("games")
      .select("id, played")
      .eq("season", season)
      .eq("week", 18);

    if (saveGameId) {
      gamesQuery = gamesQuery.eq("save_game_id", saveGameId);
    } else {
      gamesQuery = gamesQuery.is("save_game_id", null);
    }

    const { data: games, error: gamesError } = await gamesQuery;

    if (gamesError) {
      return NextResponse.json(
        { error: "Failed to check week 18 status" },
        { status: 500 }
      );
    }

    const unplayedGames = games?.filter((g) => !g.played) || [];
    if (unplayedGames.length > 0) {
      return NextResponse.json(
        {
          error: `Week 18 is not complete. ${unplayedGames.length} games remaining.`,
          unplayedGames: unplayedGames.length,
        },
        { status: 400 }
      );
    }

    // Check if playoffs already exist
    let existingPlayoffsQuery = supabase
      .from("playoff_games")
      .select("id")
      .eq("season", season);

    if (saveGameId) {
      existingPlayoffsQuery = existingPlayoffsQuery.eq(
        "save_game_id",
        saveGameId
      );
    } else {
      existingPlayoffsQuery = existingPlayoffsQuery.is("save_game_id", null);
    }

    const { data: existingPlayoffs } = await existingPlayoffsQuery.limit(1);

    if (existingPlayoffs && existingPlayoffs.length > 0) {
      return NextResponse.json(
        {
          error: "Playoffs already initialized for this season",
          message: "Use /api/playoffs/status to view current bracket",
        },
        { status: 400 }
      );
    }

    // Calculate playoff seeds (with save_game_id filtering)
    let afc: any[], nfc: any[];
    try {
      const seedsResult = await calculatePlayoffSeeds(season, saveGameId);
      afc = seedsResult.afc;
      nfc = seedsResult.nfc;
    } catch (calcError) {
      console.error("Error calculating playoff seeds:", calcError);
      return NextResponse.json(
        {
          error: "Failed to calculate playoff seeds",
          details:
            calcError instanceof Error ? calcError.message : "Unknown error",
        },
        { status: 500 }
      );
    }

    if (!afc || !nfc || afc.length < 7 || nfc.length < 7) {
      return NextResponse.json(
        {
          error: `Insufficient playoff teams. AFC: ${afc?.length || 0}, NFC: ${nfc?.length || 0}. Need 7 per conference.`,
          afc: afc?.length || 0,
          nfc: nfc?.length || 0,
        },
        { status: 400 }
      );
    }

    // Delete any existing playoff seeds for this season and save_game_id first
    // This prevents conflicts with the unique constraint
    let deleteSeedsQuery = supabase
      .from("playoff_seeds")
      .delete()
      .eq("season", season);

    if (saveGameId) {
      deleteSeedsQuery = deleteSeedsQuery.eq("save_game_id", saveGameId);
    } else {
      deleteSeedsQuery = deleteSeedsQuery.is("save_game_id", null);
    }

    const { error: deleteError } = await deleteSeedsQuery;

    if (deleteError) {
      console.warn(
        "Warning deleting existing playoff seeds (may not exist):",
        deleteError.message
      );
      // Continue anyway - the insert might still work
    } else {
      console.log(
        "Deleted existing playoff seeds for this season/save_game_id"
      );
    }

    // Save playoff seeds with save_game_id
    const seedsToInsert = [...afc, ...nfc].map((team) => {
      // Validate required fields
      if (!team.teamId) {
        throw new Error(`Team missing teamId: ${JSON.stringify(team)}`);
      }
      if (!team.conference || !["AFC", "NFC"].includes(team.conference)) {
        throw new Error(
          `Invalid conference for team ${team.teamId}: ${team.conference}`
        );
      }
      if (!team.seed || team.seed < 1 || team.seed > 7) {
        throw new Error(`Invalid seed for team ${team.teamId}: ${team.seed}`);
      }

      return {
        season,
        team_id: team.teamId,
        conference: team.conference,
        seed: team.seed,
        division: team.division || "Unknown",
        wins: team.wins || 0,
        losses: team.losses || 0,
        ties: team.ties || 0,
        win_percentage: team.winPercentage || 0,
        points_for: team.pointsFor || 0,
        points_against: team.pointsAgainst || 0,
        save_game_id: saveGameId || null,
      };
    });

    console.log(
      `[Playoffs Initialize] Prepared ${seedsToInsert.length} seeds to insert`
    );
    console.log(`[Playoffs Initialize] Sample seed:`, seedsToInsert[0]);

    const { error: seedsError, data: insertedSeeds } = await supabase
      .from("playoff_seeds")
      .insert(seedsToInsert)
      .select();

    if (seedsError) {
      console.error("Error saving playoff seeds:", seedsError);
      console.error("Seeds error details:", {
        message: seedsError.message,
        code: seedsError.code,
        details: seedsError.details,
        hint: seedsError.hint,
      });
      console.error("Attempted to insert seeds:", {
        count: seedsToInsert.length,
        sample: seedsToInsert[0],
        save_game_id: saveGameId || null,
      });
      return NextResponse.json(
        {
          error: "Failed to save playoff seeds",
          details: seedsError.message,
          hint: seedsError.hint,
          code: seedsError.code,
          attemptedCount: seedsToInsert.length,
          sampleSeed: seedsToInsert[0],
        },
        { status: 500 }
      );
    } else {
      console.log(
        `Successfully saved ${insertedSeeds?.length || 0} playoff seeds`
      );
    }

    // Create playoff bracket
    const bracket = await createPlayoffBracket(season, afc, nfc);

    // Save wild card games with save_game_id
    const wildCardGames = bracket.wildCard.map((game) => ({
      season,
      week: game.week,
      round: game.round,
      conference: game.conference,
      home_team_id: game.homeTeamId,
      away_team_id: game.awayTeamId,
      home_team_seed: game.homeTeamSeed,
      away_team_seed: game.awayTeamSeed,
      home_score: game.homeScore,
      away_score: game.awayScore,
      played: game.played,
      winner_id: game.winnerId,
      save_game_id: saveGameId || null,
    }));

    // Delete any existing playoff games for this season and save_game_id first
    let deleteGamesQuery = supabase
      .from("playoff_games")
      .delete()
      .eq("season", season);

    if (saveGameId) {
      deleteGamesQuery = deleteGamesQuery.eq("save_game_id", saveGameId);
    } else {
      deleteGamesQuery = deleteGamesQuery.is("save_game_id", null);
    }

    const { error: deleteGamesError } = await deleteGamesQuery;

    if (deleteGamesError) {
      console.warn(
        "Warning deleting existing playoff games (may not exist):",
        deleteGamesError.message
      );
    } else {
      console.log(
        "Deleted existing playoff games for this season/save_game_id"
      );
    }

    console.log(
      `[Playoffs Initialize] Prepared ${wildCardGames.length} wild card games to insert`
    );
    console.log(`[Playoffs Initialize] Sample game:`, wildCardGames[0]);

    const { error: gamesError2, data: insertedGames } = await supabase
      .from("playoff_games")
      .insert(wildCardGames)
      .select();

    if (gamesError2) {
      console.error("Error saving playoff games:", gamesError2);
      console.error("Games error details:", {
        message: gamesError2.message,
        code: gamesError2.code,
        details: gamesError2.details,
        hint: gamesError2.hint,
      });
      console.error("Attempted to insert games:", {
        count: wildCardGames.length,
        sample: wildCardGames[0],
        save_game_id: saveGameId || null,
      });
      return NextResponse.json(
        {
          error: "Failed to save playoff games",
          details: gamesError2.message,
          hint: gamesError2.hint,
          code: gamesError2.code,
        },
        { status: 500 }
      );
    } else {
      console.log(
        `Successfully saved ${insertedGames?.length || 0} playoff games`
      );
    }

    // Update season phase to "playoffs" and set week to 19 using season manager
    const { updateSeasonPhase } = await import("@/lib/seasons/season-manager");
    const phaseUpdateResult = await updateSeasonPhase(
      season,
      saveGameId || null,
      "playoffs",
      19
    );

    if (!phaseUpdateResult.success) {
      console.error(
        "Error updating season phase to playoffs:",
        phaseUpdateResult.error
      );
      // Don't fail - playoffs are initialized, just log the warning
      console.warn(
        "Warning: Playoffs initialized but season phase not updated"
      );
    } else {
      console.log(
        `[Playoffs Initialize] Updated season ${season} phase to playoffs (week 19)`
      );
    }

    return NextResponse.json({
      success: true,
      message: "Playoffs initialized successfully",
      seeds: {
        afc: afc.map((t) => ({ team: t.teamName, seed: t.seed })),
        nfc: nfc.map((t) => ({ team: t.teamName, seed: t.seed })),
      },
      wildCardGames: bracket.wildCard.length,
    });
  } catch (error) {
    console.error("Error initializing playoffs:", error);
    console.error("Full error:", JSON.stringify(error, null, 2));
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        fullError: String(error),
      },
      { status: 500 }
    );
  }
}
