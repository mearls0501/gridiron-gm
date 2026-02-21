import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Recalculate draft picks for a season based on current standings
 * This fixes issues where draft picks were calculated before all games were played
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

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

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

    // Calculate current standings from games
    // Filter by save_game_id
    let gamesQuery = supabase
      .from("games")
      .select("home_team_id, away_team_id, home_score, away_score")
      .eq("season", season)
      .eq("played", true);

    if (saveGameId) {
      gamesQuery = gamesQuery.eq("save_game_id", saveGameId);
    } else {
      gamesQuery = gamesQuery.is("save_game_id", null);
    }

    const { data: games, error: gamesError } = await gamesQuery;

    if (gamesError) {
      return NextResponse.json(
        { error: "Failed to fetch games" },
        { status: 500 }
      );
    }

    interface TeamStanding {
      team_id: string;
      wins: number;
      losses: number;
      ties: number;
      points_for: number;
      points_against: number;
      win_percentage: number;
      point_differential: number;
      is_playoff_team: boolean;
      playoff_seed: number | null;
    }

    const teamStatsMap = new Map<string, TeamStanding>();

    teams.forEach((team) => {
      teamStatsMap.set(team.id, {
        team_id: team.id,
        wins: 0,
        losses: 0,
        ties: 0,
        points_for: 0,
        points_against: 0,
        win_percentage: 0,
        point_differential: 0,
        is_playoff_team: false,
        playoff_seed: null,
      });
    });

    games?.forEach((game) => {
      if (game.home_score === null || game.away_score === null) return;

      const homeStat = teamStatsMap.get(game.home_team_id)!;
      const awayStat = teamStatsMap.get(game.away_team_id)!;

      homeStat.points_for += game.home_score;
      homeStat.points_against += game.away_score;
      awayStat.points_for += game.away_score;
      awayStat.points_against += game.home_score;

      if (game.home_score > game.away_score) {
        homeStat.wins += 1;
        awayStat.losses += 1;
      } else if (game.away_score > game.home_score) {
        homeStat.losses += 1;
        awayStat.wins += 1;
      } else {
        homeStat.ties += 1;
        awayStat.ties += 1;
      }
    });

    teamStatsMap.forEach((stat) => {
      const games = stat.wins + stat.losses + stat.ties;
      stat.win_percentage =
        games > 0 ? (stat.wins + stat.ties * 0.5) / games : 0;
      stat.point_differential = stat.points_for - stat.points_against;
    });

    const standings = Array.from(teamStatsMap.values());

    // Check if playoffs exist to determine playoff teams
    // Filter by save_game_id
    let playoffSeedsQuery = supabase
      .from("playoff_seeds")
      .select("team_id, seed")
      .eq("season", season);

    if (saveGameId) {
      playoffSeedsQuery = playoffSeedsQuery.eq("save_game_id", saveGameId);
    } else {
      playoffSeedsQuery = playoffSeedsQuery.is("save_game_id", null);
    }

    const { data: playoffSeeds } = await playoffSeedsQuery;

    const playoffTeamIds = new Set(playoffSeeds?.map((p) => p.team_id) || []);
    const playoffSeedMap = new Map(
      playoffSeeds?.map((p) => [p.team_id, p.seed]) || []
    );

    standings.forEach((stat) => {
      stat.is_playoff_team = playoffTeamIds.has(stat.team_id);
      stat.playoff_seed = playoffSeedMap.get(stat.team_id) || null;
    });

    // Separate playoff and non-playoff teams
    const playoffTeams = standings.filter((s) => s.is_playoff_team);
    const nonPlayoffTeams = standings.filter((s) => !s.is_playoff_team);

    // Sort non-playoff teams by draft order (worst record first)
    nonPlayoffTeams.sort((a, b) => {
      // Primary: Win percentage (lower = worse = earlier pick)
      const wpDiff = a.win_percentage - b.win_percentage;
      if (Math.abs(wpDiff) > 0.0001) {
        return wpDiff > 0 ? 1 : -1;
      }

      // Secondary: Point differential (worse = earlier pick)
      const diffDiff = a.point_differential - b.point_differential;
      if (Math.abs(diffDiff) > 0.0001) {
        return diffDiff > 0 ? 1 : -1;
      }

      // Tertiary: Points scored (fewer = earlier pick)
      if (a.points_for !== b.points_for) {
        return a.points_for - b.points_for;
      }

      // Final: Random (coin flip)
      return Math.random() < 0.5 ? -1 : 1;
    });

    // Sort playoff teams by playoff seed
    playoffTeams.sort((a, b) => {
      const aSeed = a.playoff_seed || 99;
      const bSeed = b.playoff_seed || 99;
      return bSeed - aSeed;
    });

    // Combine: non-playoff teams get picks 1-N, playoff teams get picks N+1-32
    const draftOrder = [...nonPlayoffTeams, ...playoffTeams];

    // Delete existing picks for this season and save game
    const { error: deleteError } = await supabase
      .from("draft_picks")
      .delete()
      .eq("season", season)
      .eq("save_game_id", saveGameId);

    if (deleteError) {
      console.error("Error deleting existing picks:", deleteError);
    }

    // Generate new draft picks
    const picks = [];
    let overallPick = 1;

    for (let round = 1; round <= 7; round++) {
      for (let i = 0; i < draftOrder.length; i++) {
        const team = draftOrder[i];
        if (!team || !team.team_id) {
          continue;
        }
        picks.push({
          season,
          save_game_id: saveGameId,
          round,
          pick_overall: overallPick,
          pick_in_round: i + 1,
          owning_team_id: team.team_id,
          original_team_id: team.team_id,
          status: "owned",
        });
        overallPick++;
      }
    }

    if (picks.length === 0) {
      return NextResponse.json(
        { error: "No draft picks generated" },
        { status: 400 }
      );
    }

    // Insert new picks
    const { error: insertError } = await supabase
      .from("draft_picks")
      .insert(picks);

    if (insertError) {
      console.error("Error inserting picks:", insertError);
      return NextResponse.json(
        { error: "Failed to insert draft picks" },
        { status: 500 }
      );
    }

    // Return diagnostic info
    const top5Worst = nonPlayoffTeams.slice(0, 5).map((t, idx) => {
      const team = teams.find((team) => team.id === t.team_id);
      return {
        rank: idx + 1,
        team: team?.name || "Unknown",
        record: `${t.wins}-${t.losses}-${t.ties}`,
        winPercentage: t.win_percentage.toFixed(3),
        pointDifferential: t.point_differential,
        pick: idx + 1,
      };
    });

    return NextResponse.json({
      success: true,
      message: `Recalculated ${picks.length} draft picks for season ${season}`,
      picksCreated: picks.length,
      draftOrder: {
        nonPlayoffTeams: nonPlayoffTeams.length,
        playoffTeams: playoffTeams.length,
        top5Worst,
      },
    });
  } catch (error) {
    console.error("Error recalculating draft picks:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
