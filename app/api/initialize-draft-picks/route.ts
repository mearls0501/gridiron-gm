import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

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

export async function POST(req: Request) {
  try {
    const { season, futureSeasons = 4, saveGameId } = await req.json();

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

    // Check if draft picks already exist for any of the seasons we're about to create
    // Create picks for current season + futureSeasons (default 4 = 5 total seasons)
    const seasonsToCreate: number[] = [];
    for (let i = 0; i <= futureSeasons; i++) {
      seasonsToCreate.push(season + i);
    }
    const { data: existingPicks, error: checkError } = await supabase
      .from("draft_picks")
      .select("season")
      .eq("save_game_id", saveGameId)
      .in("season", seasonsToCreate)
      .limit(1);

    if (checkError) {
      // If table doesn't exist, that's okay - we'll create the picks
      if (!checkError.message.includes("does not exist") && !checkError.message.includes("relation")) {
        throw checkError;
      }
    }

    if (existingPicks && existingPicks.length > 0) {
      return NextResponse.json(
        { error: `Draft picks already exist for one or more seasons: ${seasonsToCreate.join(", ")}` },
        { status: 400 }
      );
    }

    // Get all teams
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, name, abbreviation");

    if (teamsError || !teams) {
      throw new Error(`Failed to fetch teams: ${teamsError?.message}`);
    }

    // Get season standings (from team_season_stats or calculate from games)
    // Filter by save_game_id to ensure we're using the correct season
    let seasonQuery = supabase
      .from("seasons")
      .select("id")
      .eq("year", season);
    
    if (saveGameId) {
      seasonQuery = seasonQuery.eq("save_game_id", saveGameId);
    } else {
      seasonQuery = seasonQuery.is("save_game_id", null);
    }
    
    const { data: seasonData } = await seasonQuery.single();

    let standings: TeamStanding[] = [];

    if (seasonData) {
      // Try to get from team_season_stats
      const { data: statsData } = await supabase
        .from("team_season_stats")
        .select("team_id, wins, losses, ties, points_for, points_against, playoff_seed")
        .eq("season_id", seasonData.id);

      if (statsData && statsData.length > 0) {
        standings = statsData.map((stat) => {
          const games = stat.wins + stat.losses + stat.ties;
          const winPercentage = games > 0 ? (stat.wins + stat.ties * 0.5) / games : 0;
          return {
            team_id: stat.team_id,
            wins: stat.wins,
            losses: stat.losses,
            ties: stat.ties,
            points_for: stat.points_for || 0,
            points_against: stat.points_against || 0,
            win_percentage: winPercentage,
            point_differential: (stat.points_for || 0) - (stat.points_against || 0),
            is_playoff_team: stat.playoff_seed !== null && stat.playoff_seed !== undefined,
            playoff_seed: stat.playoff_seed,
          };
        });
      }
    }

    // If no standings, calculate from games
    // Filter games by save_game_id through seasons table
    if (standings.length === 0) {
      let gamesQuery = supabase
        .from("games")
        .select("home_team_id, away_team_id, home_score, away_score")
        .eq("season", season)
        .eq("played", true);
      
      // Filter by save_game_id if available (games table should have save_game_id)
      if (saveGameId) {
        gamesQuery = gamesQuery.eq("save_game_id", saveGameId);
      } else {
        gamesQuery = gamesQuery.is("save_game_id", null);
      }
      
      const { data: games } = await gamesQuery;

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
        // Win percentage: (wins + 0.5 * ties) / total games
        // This ensures 3-12-2 (3 + 0.5*2 = 4 wins equivalent) / 17 = 0.235
        // is worse than 3-13-0 (3 + 0 = 3 wins equivalent) / 16 = 0.1875
        // Actually wait - 3-12-2 means 3 wins, 12 losses, 2 ties = 3 + 1 = 4 equivalent wins / 17 = 0.235
        // 3-13-0 means 3 wins, 13 losses, 0 ties = 3 / 16 = 0.1875
        // So 3-12-2 is actually BETTER (higher win %) than 3-13-0
        // For draft order, we want WORSE teams first, so lower win % = earlier pick
        stat.win_percentage = games > 0 ? (stat.wins + stat.ties * 0.5) / games : 0;
        stat.point_differential = stat.points_for - stat.points_against;
      });

      standings = Array.from(teamStatsMap.values());
    }

    // Ensure all teams have standings (even if 0-0-0)
    const standingsMap = new Map<string, TeamStanding>();
    standings.forEach((s) => standingsMap.set(s.team_id, s));

    teams.forEach((team) => {
      if (!standingsMap.has(team.id)) {
        standingsMap.set(team.id, {
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
      }
    });

    standings = Array.from(standingsMap.values());

    // Separate playoff and non-playoff teams
    const playoffTeams = standings.filter((s) => s.is_playoff_team);
    const nonPlayoffTeams = standings.filter((s) => !s.is_playoff_team);

    // Sort non-playoff teams by draft order (worst record first)
    // NFL Draft Order: Worst record gets pick 1
    // Tiebreakers: 1) Win percentage (lower = earlier pick), 2) Strength of schedule, 3) Point differential, 4) Points scored
    nonPlayoffTeams.sort((a, b) => {
      // Primary: Win percentage (lower = worse = earlier pick)
      // DET: 3-12-2 = (3 + 0.5*2) / 17 = 4/17 = 0.235
      // Team with 3-13-0 = 3/16 = 0.1875 (worse, should pick earlier)
      // Team with 4-13-0 = 4/17 = 0.235 (same as DET, need tiebreaker)
      const wpDiff = a.win_percentage - b.win_percentage;
      if (Math.abs(wpDiff) > 0.0001) {
        return wpDiff > 0 ? 1 : -1;
      }
      
      // Secondary: Point differential (worse = earlier pick)
      // Negative differential is worse
      const diffDiff = a.point_differential - b.point_differential;
      if (Math.abs(diffDiff) > 0.0001) {
        return diffDiff > 0 ? 1 : -1; // Worse differential (more negative) = earlier pick
      }
      
      // Tertiary: Points scored (fewer = earlier pick)
      if (a.points_for !== b.points_for) {
        return a.points_for - b.points_for;
      }
      
      // Final: Random (coin flip)
      return Math.random() < 0.5 ? -1 : 1;
    });

    // Sort playoff teams by playoff seed (higher seed = better finish = later pick)
    // In NFL: Super Bowl winner (seed 1) gets pick 32, runner-up gets 31, etc.
    playoffTeams.sort((a, b) => {
      const aSeed = a.playoff_seed || 99;
      const bSeed = b.playoff_seed || 99;
      // Lower seed number = better finish = later pick
      return bSeed - aSeed;
    });

    // Combine: non-playoff teams get picks 1-20 (or however many), playoff teams get picks 21-32
    const draftOrder = [...nonPlayoffTeams, ...playoffTeams];

    // Generate draft picks for current season + 3 future seasons
    const allPicks = [];
    const results: { season: number; picksCreated: number }[] = [];

    for (const targetSeason of seasonsToCreate) {
      // For future seasons, we can't calculate draft order from standings yet
      // So we'll use a default order (alphabetical by team name) or use current season's order
      let seasonDraftOrder = draftOrder;

      // If it's a future season, use team strength projection
      if (targetSeason > season) {
        try {
          const { projectDraftOrderAsStandings } = await import(
            "@/lib/draft/team-strength-projector"
          );
          seasonDraftOrder = await projectDraftOrderAsStandings(
            targetSeason,
            saveGameId
          );
          console.log(
            `[Initialize Draft Picks] Using team strength projection for season ${targetSeason}`
          );
        } catch (projectionError) {
          console.error(
            `[Initialize Draft Picks] Error projecting draft order for season ${targetSeason}:`,
            projectionError
          );
          // Fallback to alphabetical if projection fails
          const { data: allTeams } = await supabase
            .from("teams")
            .select("id, name")
            .order("name", { ascending: true });

          if (allTeams) {
            seasonDraftOrder = allTeams.map((team) => ({
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
            }));
          }
        }
      }

      // Generate draft picks: 7 rounds × 32 teams = 224 picks per season
      const picks = [];
      let overallPick = 1;

      for (let round = 1; round <= 7; round++) {
        for (let i = 0; i < seasonDraftOrder.length; i++) {
          const team = seasonDraftOrder[i];
          if (!team || !team.team_id) {
            console.warn(`Skipping invalid team in draft order for season ${targetSeason}`);
            continue;
          }
          picks.push({
            season: targetSeason,
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

      allPicks.push(...picks);
      results.push({
        season: targetSeason,
        picksCreated: picks.length,
      });
    }

    // Validate we have picks to insert
    if (allPicks.length === 0) {
      throw new Error("No draft picks generated. Check that teams exist and draft order is valid.");
    }

    // Insert all picks in batches (Supabase has a limit on batch size)
    const batchSize = 1000;
    let totalInserted = 0;
    const insertErrors: string[] = [];

    for (let i = 0; i < allPicks.length; i += batchSize) {
      const batch = allPicks.slice(i, i + batchSize);
      const { data: insertedPicks, error: insertError } = await supabase
        .from("draft_picks")
        .insert(batch)
        .select();

      if (insertError) {
        console.error(`Error inserting batch ${i / batchSize + 1}:`, insertError);
        insertErrors.push(`Batch ${i / batchSize + 1}: ${insertError.message}`);
        // Continue with next batch instead of throwing immediately
        continue;
      }

      totalInserted += insertedPicks?.length || 0;
    }

    if (insertErrors.length > 0) {
      throw new Error(`Failed to insert some batches: ${insertErrors.join("; ")}`);
    }

    if (totalInserted === 0) {
      throw new Error("No picks were inserted. Check database connection and table existence.");
    }

    return NextResponse.json({
      success: true,
      picksCreated: totalInserted,
      seasons: results,
      message: `Successfully created ${totalInserted} draft picks for seasons ${seasonsToCreate.join(", ")}`,
    });
  } catch (error) {
    console.error("Error initializing draft picks:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to initialize draft picks";
    
    // Provide more helpful error messages
    if (errorMessage.includes("does not exist") || errorMessage.includes("Could not find the table") || (errorMessage.includes("relation") && errorMessage.includes("does not exist"))) {
      return NextResponse.json(
        {
          error: "Draft picks table does not exist. Please run the migration first.",
          instructions: [
            "1. Go to your Supabase dashboard",
            "2. Navigate to SQL Editor",
            "3. Run the SQL from: supabase/migrations/create_draft_picks_table.sql",
          ],
          sqlFile: "supabase/migrations/create_draft_picks_table.sql",
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

