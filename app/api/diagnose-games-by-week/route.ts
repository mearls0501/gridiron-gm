import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Diagnostic endpoint to check games per week
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const season = parseInt(searchParams.get("season") || "2025");

    // Get games grouped by week
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("id, week, played, home_team_id, away_team_id")
      .eq("season", season)
      .order("week", { ascending: true });

    if (gamesError) {
      return NextResponse.json(
        { error: "Failed to fetch games" },
        { status: 500 }
      );
    }

    // Group by week
    const gamesByWeek = new Map<number, {
      total: number;
      played: number;
      unplayed: number;
      games: any[];
    }>();

    games?.forEach(game => {
      if (!gamesByWeek.has(game.week)) {
        gamesByWeek.set(game.week, {
          total: 0,
          played: 0,
          unplayed: 0,
          games: [],
        });
      }

      const weekData = gamesByWeek.get(game.week)!;
      weekData.total++;
      weekData.games.push(game);
      if (game.played) {
        weekData.played++;
      } else {
        weekData.unplayed++;
      }
    });

    // Convert to array
    const weekSummary = Array.from(gamesByWeek.entries())
      .map(([week, data]) => ({
        week,
        totalGames: data.total,
        playedGames: data.played,
        unplayedGames: data.unplayed,
        expectedGames: week >= 6 && week <= 13 ? 14 : 16, // Bye weeks have 14 games, others have 16
        missingGames: Math.max(0, (week >= 6 && week <= 13 ? 14 : 16) - data.total),
        extraGames: Math.max(0, data.total - (week >= 6 && week <= 13 ? 14 : 16)),
      }))
      .sort((a, b) => a.week - b.week);

    const totalGames = games?.length || 0;
    const expectedTotal = 272;
    const weeksWithIssues = weekSummary.filter(w => w.missingGames > 0 || w.extraGames > 0);

    return NextResponse.json({
      season,
      summary: {
        totalGames,
        expectedTotal,
        missingGames: expectedTotal - totalGames,
        weeksWithIssues: weeksWithIssues.length,
      },
      weeksWithIssues,
      allWeeks: weekSummary,
    });
  } catch (error) {
    console.error("Error diagnosing games by week:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}


