import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { aggregateSeasonStats } from "@/lib/simulation/player-development";

/**
 * Advance to offseason and store historical season data
 * This should be called after the Super Bowl champion is crowned
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

    // Check if season exists and is active, create if it doesn't exist
    let { data: seasonData, error: seasonError } = await supabase
      .from("seasons")
      .select("*")
      .eq("year", season)
      .eq("is_active", true)
      .maybeSingle();

    if (seasonError && seasonError.code !== "PGRST116") {
      console.error("Error fetching season:", seasonError);
      return NextResponse.json(
        { error: "Failed to fetch season data" },
        { status: 500 }
      );
    }

    // If season doesn't exist, create it
    if (!seasonData) {
      console.log(`[Offseason] Season ${season} not found, creating it...`);
      
      // Check if Super Bowl is complete to determine phase
      const { data: superBowl } = await supabase
        .from("playoff_games")
        .select("winner_id, played")
        .eq("season", season)
        .eq("round", "super_bowl")
        .maybeSingle();

      const { data: newSeason, error: createError } = await supabase
        .from("seasons")
        .insert({
          year: season,
          phase: superBowl?.played && superBowl?.winner_id ? "playoffs" : "regular_season",
          current_week: superBowl?.played && superBowl?.winner_id ? 22 : 18, // Week 22 for playoffs (Super Bowl), 18 for end of regular season
          is_active: true,
          champion_team_id: superBowl?.winner_id || null,
        })
        .select()
        .single();

      if (createError || !newSeason) {
        console.error("Error creating season:", createError);
        return NextResponse.json(
          { error: "Failed to create season record" },
          { status: 500 }
        );
      }

      seasonData = newSeason;
    }

      // Verify Super Bowl is complete and champion is set
      if (!seasonData.champion_team_id) {
        const { data: superBowl, error: sbError } = await supabase
          .from("playoff_games")
          .select("*")
          .eq("season", season)
          .eq("round", "super_bowl")
          .maybeSingle();

        if (sbError && sbError.code !== "PGRST116") {
          console.error("Error checking Super Bowl:", sbError);
        }

        if (!superBowl || !superBowl.played || !superBowl.winner_id) {
          return NextResponse.json(
            { error: "Super Bowl must be completed and champion crowned before advancing to offseason" },
            { status: 400 }
          );
        }

        // If champion not set in season but Super Bowl is complete, set it now
        if (superBowl.winner_id) {
          const { error: updateChampError } = await supabase
            .from("seasons")
            .update({ champion_team_id: superBowl.winner_id })
            .eq("year", season)
            .eq("is_active", true);

          if (updateChampError) {
            console.error("Error setting champion:", updateChampError);
          } else {
            seasonData.champion_team_id = superBowl.winner_id;
          }
        }
      }

    // Step 1: Finalize all season statistics
    console.log(`[Offseason] Aggregating final season stats for ${season}...`);
    try {
      await aggregateSeasonStats(season);
    } catch (err) {
      console.error("Error aggregating season stats:", err);
      // Continue even if stats aggregation fails
    }

    // Step 2: Ensure team_season_stats are finalized
    console.log(`[Offseason] Finalizing team season stats for ${season}...`);
    const { data: games } = await supabase
      .from("games")
      .select("home_team_id, away_team_id, home_score, away_score")
      .eq("season", season)
      .eq("played", true);

    if (games && games.length > 0) {
      const teamStatsMap = new Map<string, {
        wins: number;
        losses: number;
        ties: number;
        points_for: number;
        points_against: number;
      }>();

      // Calculate final standings
      games.forEach((game) => {
        if (game.home_score === null || game.away_score === null) return;

        const homeId = game.home_team_id;
        const awayId = game.away_team_id;

        if (!teamStatsMap.has(homeId)) {
          teamStatsMap.set(homeId, { wins: 0, losses: 0, ties: 0, points_for: 0, points_against: 0 });
        }
        if (!teamStatsMap.has(awayId)) {
          teamStatsMap.set(awayId, { wins: 0, losses: 0, ties: 0, points_for: 0, points_against: 0 });
        }

        const homeStats = teamStatsMap.get(homeId)!;
        const awayStats = teamStatsMap.get(awayId)!;

        homeStats.points_for += game.home_score;
        homeStats.points_against += game.away_score;
        awayStats.points_for += game.away_score;
        awayStats.points_against += game.home_score;

        if (game.home_score > game.away_score) {
          homeStats.wins += 1;
          awayStats.losses += 1;
        } else if (game.away_score > game.home_score) {
          homeStats.losses += 1;
          awayStats.wins += 1;
        } else {
          homeStats.ties += 1;
          awayStats.ties += 1;
        }
      });

      // Update team_season_stats for all teams
      const { data: seasonRecord } = await supabase
        .from("seasons")
        .select("id")
        .eq("year", season)
        .maybeSingle();

      if (seasonRecord) {
        const updatePromises = Array.from(teamStatsMap.entries()).map(async ([teamId, stats]) => {
          const games = stats.wins + stats.losses + stats.ties;
          const winPercentage = games > 0 ? (stats.wins + stats.ties * 0.5) / games : 0;

          // Get playoff seed if applicable
          const { data: playoffSeed } = await supabase
            .from("playoff_seeds")
            .select("seed")
            .eq("season", season)
            .eq("team_id", teamId)
            .maybeSingle();

          const { error } = await supabase
            .from("team_season_stats")
            .upsert({
              season_id: seasonRecord.id,
              team_id: teamId,
              wins: stats.wins,
              losses: stats.losses,
              ties: stats.ties,
              points_for: stats.points_for,
              points_against: stats.points_against,
              playoff_seed: playoffSeed?.seed || null,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "season_id,team_id",
            });

          if (error) {
            console.error(`Error updating team stats for team ${teamId}:`, error);
          }
        });

        await Promise.all(updatePromises);
      }
    }

    // Step 3: Store playoff results in historical format
    console.log(`[Offseason] Storing playoff results for ${season}...`);
    const { data: playoffGames } = await supabase
      .from("playoff_games")
      .select("*")
      .eq("season", season)
      .eq("played", true)
      .order("week", { ascending: true })
      .order("round", { ascending: true });

    // Step 3.5: Process expiring contracts and move players to free agency
    console.log(`[Offseason] Processing expiring contracts for ${season}...`);
    try {
      const { processExpiringContracts } = await import('@/lib/offseason/contract-processor');
      const contractResult = await processExpiringContracts(season);
      
      if (!contractResult.success) {
        console.error("Error processing contracts:", contractResult.error);
        // Continue even if contract processing fails - can be done manually
      } else {
        console.log(`[Offseason] Contract processing: ${contractResult.playersMovedToFA} players moved to FA, ${contractResult.contractsShifted} contracts shifted`);
      }
    } catch (err) {
      console.error("Error processing contracts:", err);
      // Continue even if contract processing fails
    }

    // Step 4: Update season to offseason phase
    console.log(`[Offseason] Transitioning season ${season} to offseason...`);
    const { error: updateError } = await supabase
      .from("seasons")
      .update({
        phase: "offseason",
        current_week: 23,
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("year", season)
      .eq("is_active", true);

    if (updateError) {
      console.error("Error updating season to offseason:", updateError);
      return NextResponse.json(
        { error: "Failed to update season to offseason" },
        { status: 500 }
      );
    }

    // Step 5: Get champion info
    const { data: championTeam } = await supabase
      .from("teams")
      .select("id, name, abbreviation")
      .eq("id", seasonData.champion_team_id)
      .maybeSingle();

    // Step 6: Get final standings summary
    const { data: finalStandings } = await supabase
      .from("team_season_stats")
      .select(`
        *,
        teams!inner (id, name, abbreviation, conference, division)
      `)
      .eq("season_id", seasonData.id)
      .order("wins", { ascending: false })
      .order("points_for", { ascending: false });

    return NextResponse.json({
      success: true,
      message: `Season ${season} has been finalized and advanced to offseason`,
      season: {
        year: season,
        phase: "offseason",
        currentWeek: 23,
        champion: championTeam ? {
          id: championTeam.id,
          name: championTeam.name,
          abbreviation: championTeam.abbreviation,
        } : null,
      },
      summary: {
        totalGames: games?.length || 0,
        playoffGames: playoffGames?.length || 0,
        teamsWithStats: finalStandings?.length || 0,
      },
    });
  } catch (error) {
    console.error("Error advancing to offseason:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

