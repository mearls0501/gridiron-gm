import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Diagnostic endpoint to check game counts per team
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const season = parseInt(searchParams.get("season") || "2025");

    // Get all teams
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, name, abbreviation, conference, division")
      .order("conference")
      .order("division")
      .order("name");

    if (teamsError || !teams) {
      return NextResponse.json(
        { error: "Failed to fetch teams" },
        { status: 500 }
      );
    }

    // Get all games for this season
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("id, home_team_id, away_team_id, week, played")
      .eq("season", season);

    if (gamesError) {
      return NextResponse.json(
        { error: "Failed to fetch games" },
        { status: 500 }
      );
    }

    // Count games per team
    const teamGameCounts = new Map<string, {
      team: { id: string; name: string; abbreviation: string; conference: string; division: string };
      totalGames: number;
      playedGames: number;
      unplayedGames: number;
      homeGames: number;
      awayGames: number;
      gamesByWeek: Record<number, number>;
    }>();

    teams.forEach(team => {
      teamGameCounts.set(team.id, {
        team,
        totalGames: 0,
        playedGames: 0,
        unplayedGames: 0,
        homeGames: 0,
        awayGames: 0,
        gamesByWeek: {},
      });
    });

    games?.forEach(game => {
      const homeCount = teamGameCounts.get(game.home_team_id);
      const awayCount = teamGameCounts.get(game.away_team_id);

      if (homeCount) {
        homeCount.totalGames++;
        homeCount.homeGames++;
        homeCount.gamesByWeek[game.week] = (homeCount.gamesByWeek[game.week] || 0) + 1;
        if (game.played) {
          homeCount.playedGames++;
        } else {
          homeCount.unplayedGames++;
        }
      }

      if (awayCount) {
        awayCount.totalGames++;
        awayCount.awayGames++;
        awayCount.gamesByWeek[game.week] = (awayCount.gamesByWeek[game.week] || 0) + 1;
        if (game.played) {
          awayCount.playedGames++;
        } else {
          awayCount.unplayedGames++;
        }
      }
    });

    const results = Array.from(teamGameCounts.values()).map(count => ({
      team: count.team.name,
      abbreviation: count.team.abbreviation,
      conference: count.team.conference,
      division: count.team.division,
      totalGames: count.totalGames,
      playedGames: count.playedGames,
      unplayedGames: count.unplayedGames,
      homeGames: count.homeGames,
      awayGames: count.awayGames,
      expectedGames: 17,
      missingGames: Math.max(0, 17 - count.totalGames),
      extraGames: Math.max(0, count.totalGames - 17),
    }));

    const teamsWithIssues = results.filter(r => r.totalGames !== 17);
    const totalGames = games?.length || 0;
    const expectedTotalGames = 32 * 17 / 2; // 272 games

    return NextResponse.json({
      season,
      summary: {
        totalGames,
        expectedTotalGames,
        missingGames: expectedTotalGames - totalGames,
        teamsWithIssues: teamsWithIssues.length,
        teamsWithCorrectGames: results.length - teamsWithIssues.length,
      },
      teamsWithIssues,
      allTeams: results.sort((a, b) => {
        if (a.totalGames !== b.totalGames) {
          return a.totalGames - b.totalGames; // Sort by game count
        }
        return a.team.localeCompare(b.team);
      }),
    });
  } catch (error) {
    console.error("Error diagnosing games:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}


