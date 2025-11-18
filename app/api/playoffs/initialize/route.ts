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
    const { season } = await req.json();

    if (!season) {
      return NextResponse.json(
        { error: "Season is required" },
        { status: 400 }
      );
    }

    // Check if week 18 is complete
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("id, played")
      .eq("season", season)
      .eq("week", 18);

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
    const { data: existingPlayoffs } = await supabase
      .from("playoff_games")
      .select("id")
      .eq("season", season)
      .limit(1);

    if (existingPlayoffs && existingPlayoffs.length > 0) {
      return NextResponse.json(
        {
          error: "Playoffs already initialized for this season",
          message: "Use /api/playoffs/status to view current bracket",
        },
        { status: 400 }
      );
    }

    // Calculate playoff seeds
    const { afc, nfc } = await calculatePlayoffSeeds(season);

    if (afc.length < 7 || nfc.length < 7) {
      return NextResponse.json(
        {
          error: `Insufficient playoff teams. AFC: ${afc.length}, NFC: ${nfc.length}. Need 7 per conference.`,
          afc: afc.length,
          nfc: nfc.length,
        },
        { status: 400 }
      );
    }

    // Save playoff seeds
    const seedsToInsert = [...afc, ...nfc].map((team) => ({
      season,
      team_id: team.teamId,
      conference: team.conference,
      seed: team.seed,
      division: team.division,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      win_percentage: team.winPercentage,
      points_for: team.pointsFor,
      points_against: team.pointsAgainst,
    }));

    const { error: seedsError } = await supabase
      .from("playoff_seeds")
      .insert(seedsToInsert);

    if (seedsError) {
      console.error("Error saving playoff seeds:", seedsError);
      return NextResponse.json(
        { error: "Failed to save playoff seeds" },
        { status: 500 }
      );
    }

    // Create playoff bracket
    const bracket = await createPlayoffBracket(season, afc, nfc);

    // Save wild card games
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
    }));

    const { error: gamesError2 } = await supabase
      .from("playoff_games")
      .insert(wildCardGames);

    if (gamesError2) {
      console.error("Error saving playoff games:", gamesError2);
      return NextResponse.json(
        { error: "Failed to save playoff games" },
        { status: 500 }
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
