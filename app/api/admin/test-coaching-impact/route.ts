import { NextRequest, NextResponse } from "next/server";
import { simulateGame } from "@/lib/simulation/engine";
import { supabase } from "@/lib/supabase-client";
import { Coach, CoachingStaff } from "@/lib/simulation/coaching-influence";

/**
 * POST /api/admin/test-coaching-impact
 * Test coaching influence by running simulations with modified coach attributes
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      homeTeamId,
      awayTeamId,
      saveGameId,
      simulations = 10,
      coachOverrides = {},
    } = body;

    if (!homeTeamId || !awayTeamId || !saveGameId) {
      return NextResponse.json(
        { error: "Missing required fields: homeTeamId, awayTeamId, saveGameId" },
        { status: 400 }
      );
    }

    // Create a temporary test game record
    const { data: gameData, error: gameError } = await supabase
      .from("games")
      .insert({
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        season: 2025,
        week: 1,
        played: false,
        save_game_id: saveGameId,
      })
      .select()
      .single();

    if (gameError || !gameData) {
      return NextResponse.json(
        { error: `Failed to create test game: ${gameError?.message}` },
        { status: 500 }
      );
    }

    const testGameId = gameData.id;

    // Run multiple simulations
    const results = [];
    const stats = {
      homeScores: [] as number[],
      awayScores: [] as number[],
      totalPlays: [] as number[],
      passPlays: [] as number[],
      runPlays: [] as number[],
    };

    for (let i = 0; i < simulations; i++) {
      try {
        const result = await simulateGame(
          {
            homeTeamId,
            awayTeamId,
            gameId: testGameId,
            season: 2025,
            week: 1,
            includePlayByPlay: true,
            useEnhancedAttributes: true,
            loadCoaches: true,
          },
          undefined,
          saveGameId
        );

        stats.homeScores.push(result.homeScore);
        stats.awayScores.push(result.awayScore);

        // Count play types
        const playByPlay = result.playByPlay || [];
        const passPlays = playByPlay.filter((p) => p.playType === "pass").length;
        const runPlays = playByPlay.filter((p) => p.playType === "run").length;

        stats.totalPlays.push(playByPlay.length);
        stats.passPlays.push(passPlays);
        stats.runPlays.push(runPlays);

        results.push({
          simulation: i + 1,
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          totalPlays: playByPlay.length,
          passPlays,
          runPlays,
          passPercentage: (passPlays / (passPlays + runPlays)) * 100,
        });
      } catch (error) {
        console.error(`Simulation ${i + 1} failed:`, error);
        results.push({
          simulation: i + 1,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Calculate averages
    const avg = (arr: number[]) =>
      arr.reduce((sum, val) => sum + val, 0) / arr.length;

    const summary = {
      simulations: simulations,
      homeTeam: {
        avgScore: avg(stats.homeScores).toFixed(1),
        minScore: Math.min(...stats.homeScores),
        maxScore: Math.max(...stats.homeScores),
      },
      awayTeam: {
        avgScore: avg(stats.awayScores).toFixed(1),
        minScore: Math.min(...stats.awayScores),
        maxScore: Math.max(...stats.awayScores),
      },
      playDistribution: {
        avgTotalPlays: avg(stats.totalPlays).toFixed(1),
        avgPassPlays: avg(stats.passPlays).toFixed(1),
        avgRunPlays: avg(stats.runPlays).toFixed(1),
        passPercentage: (
          (avg(stats.passPlays) / avg(stats.totalPlays)) *
          100
        ).toFixed(1),
        runPercentage: (
          (avg(stats.runPlays) / avg(stats.totalPlays)) *
          100
        ).toFixed(1),
      },
    };

    // Clean up test game
    await supabase.from("games").delete().eq("id", testGameId);

    // Delete any stats that were created
    await supabase
      .from("player_game_stats")
      .delete()
      .eq("game_id", testGameId);

    return NextResponse.json({
      success: true,
      summary,
      results,
    });
  } catch (error) {
    console.error("[test-coaching-impact] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}



