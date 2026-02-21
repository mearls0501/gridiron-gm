import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Diagnose why stats work in one season but not another
 * Checks games, rosters, and stats across multiple seasons
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const saveGameId = url.searchParams.get('saveGameId');

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    // Check stats by season
    const { data: statsBySeason } = await supabase
      .from("player_game_stats")
      .select("season")
      .eq("save_game_id", saveGameId);

    const seasonStatsCount = new Map<number, number>();
    (statsBySeason || []).forEach(stat => {
      const count = seasonStatsCount.get(stat.season) || 0;
      seasonStatsCount.set(stat.season, count + 1);
    });

    // Check games by season
    const { data: gamesBySeason } = await supabase
      .from("games")
      .select("season, played")
      .eq("save_game_id", saveGameId);

    const seasonGamesCount = new Map<number, { total: number; played: number }>();
    (gamesBySeason || []).forEach(game => {
      const stats = seasonGamesCount.get(game.season) || { total: 0, played: 0 };
      stats.total++;
      if (game.played) stats.played++;
      seasonGamesCount.set(game.season, stats);
    });

    // Check rosters by checking player_team_assignments count
    // Note: Rosters don't have a "season" field, they're just current state
    const { count: totalRosterAssignments } = await supabase
      .from("player_team_assignments")
      .select("*", { count: "exact", head: true })
      .eq("save_game_id", saveGameId);

    // Get all teams to check roster completeness
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name");

    let rosterDetails = [];
    if (teams) {
      for (const team of teams.slice(0, 5)) { // Sample 5 teams
        const { count: teamRosterSize } = await supabase
          .from("player_team_assignments")
          .select("*", { count: "exact", head: true })
          .eq("team_id", team.id)
          .eq("save_game_id", saveGameId);

        rosterDetails.push({
          team_name: team.name,
          roster_size: teamRosterSize || 0,
        });
      }
    }

    // Build summary by season
    const seasons = new Set([
      ...Array.from(seasonStatsCount.keys()),
      ...Array.from(seasonGamesCount.keys()),
    ]);

    const seasonSummary = Array.from(seasons).sort().map(season => {
      const games = seasonGamesCount.get(season) || { total: 0, played: 0 };
      const stats = seasonStatsCount.get(season) || 0;
      
      return {
        season,
        games_total: games.total,
        games_played: games.played,
        stats_count: stats,
        stats_per_game: games.played > 0 ? Math.round(stats / games.played) : 0,
        issue: stats === 0 && games.played > 0 ? 
          "STATS NOT SAVING - Games played but no stats" :
          stats < games.played * 20 && games.played > 0 ?
          "LOW STATS - Fewer stats than expected" :
          "OK",
      };
    });

    // Identify problematic seasons
    const problemSeasons = seasonSummary.filter(s => s.issue !== "OK");

    // If we have problem seasons, dig deeper
    let deepDiveResults = null;
    if (problemSeasons.length > 0 && problemSeasons[0]) {
      const problemSeason = problemSeasons[0].season;
      
      // Get a sample game from the problem season
      const { data: sampleGames } = await supabase
        .from("games")
        .select("id, home_team_id, away_team_id, played, home_score, away_score")
        .eq("season", problemSeason)
        .eq("save_game_id", saveGameId)
        .eq("played", true)
        .limit(3);

      if (sampleGames && sampleGames.length > 0) {
        const sampleGame = sampleGames[0];

        // Check if stats exist for this game
        const { data: gameStats } = await supabase
          .from("player_game_stats")
          .select("player_id")
          .eq("game_id", sampleGame.id)
          .eq("save_game_id", saveGameId);

        // Check rosters for this game's teams
        const { count: homeRosterSize } = await supabase
          .from("player_team_assignments")
          .select("*", { count: "exact", head: true })
          .eq("team_id", sampleGame.home_team_id)
          .eq("save_game_id", saveGameId);

        const { count: awayRosterSize } = await supabase
          .from("player_team_assignments")
          .select("*", { count: "exact", head: true })
          .eq("team_id", sampleGame.away_team_id)
          .eq("save_game_id", saveGameId);

        deepDiveResults = {
          problem_season: problemSeason,
          sample_game: {
            id: sampleGame.id,
            played: sampleGame.played,
            has_scores: sampleGame.home_score !== null && sampleGame.away_score !== null,
            home_score: sampleGame.home_score,
            away_score: sampleGame.away_score,
          },
          stats_for_sample_game: gameStats?.length || 0,
          rosters: {
            home_team_size: homeRosterSize || 0,
            away_team_size: awayRosterSize || 0,
            both_full: (homeRosterSize || 0) === 53 && (awayRosterSize || 0) === 53,
          },
          diagnosis: (homeRosterSize || 0) !== 53 || (awayRosterSize || 0) !== 53 ?
            "ROSTER ISSUE - Teams don't have 53 players, simulation likely failing" :
            gameStats && gameStats.length === 0 ?
            "STATS NOT SAVING - Rosters OK but stats aren't being inserted" :
            "UNKNOWN - Further investigation needed",
        };
      }
    }

    return NextResponse.json({
      summary: {
        total_roster_assignments: totalRosterAssignments || 0,
        seasons_with_data: seasons.size,
        seasons_with_issues: problemSeasons.length,
      },
      roster_sample: rosterDetails,
      by_season: seasonSummary,
      problem_seasons: problemSeasons,
      deep_dive: deepDiveResults,
      recommendation: problemSeasons.length === 0 ?
        "All seasons look healthy!" :
        deepDiveResults?.diagnosis || "Check deep_dive for details",
    });

  } catch (error) {
    console.error('Error diagnosing season stats:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}



