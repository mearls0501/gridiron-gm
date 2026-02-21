import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import {
  aggregateSeasonStats,
  aggregateLifetimeStats,
  archiveGameStats,
} from "@/lib/simulation/player-development";
import {
  getOrCreateSeason,
  updateSeasonPhase,
} from "@/lib/seasons/season-manager";

/**
 * Advance to offseason and store historical season data
 * This should be called after the Super Bowl champion is crowned
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

    // Check if Super Bowl is complete to determine phase and champion
    let superBowlQuery = supabase
      .from("playoff_games")
      .select("winner_id, played")
      .eq("season", season)
      .eq("round", "super_bowl");

    if (saveGameId) {
      superBowlQuery = superBowlQuery.eq("save_game_id", saveGameId);
    } else {
      superBowlQuery = superBowlQuery.is("save_game_id", null);
    }

    const { data: superBowl } = await superBowlQuery.maybeSingle();

    // Get or create season using season manager
    const seasonResult = await getOrCreateSeason(season, saveGameId || null, {
      phase:
        superBowl?.played && superBowl?.winner_id
          ? "playoffs"
          : "regular_season",
      currentWeek: superBowl?.played && superBowl?.winner_id ? 22 : 18,
      isActive: true,
      championTeamId: superBowl?.winner_id || null,
    });

    if (seasonResult.error || !seasonResult.season) {
      console.error("Error getting/creating season:", seasonResult.error);
      return NextResponse.json(
        {
          error: seasonResult.error || "Failed to get or create season record",
        },
        { status: 500 }
      );
    }

    const seasonData = seasonResult.season;

    // Verify Super Bowl is complete and champion is set
    if (!seasonData.champion_team_id) {
      if (!superBowl || !superBowl.played || !superBowl.winner_id) {
        return NextResponse.json(
          {
            error:
              "Super Bowl must be completed and champion crowned before advancing to offseason",
          },
          { status: 400 }
        );
      }

      // If champion not set in season but Super Bowl is complete, set it now
      if (superBowl.winner_id) {
        let updateChampQuery = supabase
          .from("seasons")
          .update({ champion_team_id: superBowl.winner_id })
          .eq("year", season)
          .eq("is_active", true);

        if (saveGameId) {
          updateChampQuery = updateChampQuery.eq("save_game_id", saveGameId);
        } else {
          updateChampQuery = updateChampQuery.is("save_game_id", null);
        }

        const { error: updateChampError } = await updateChampQuery;

        if (updateChampError) {
          console.error("Error setting champion:", updateChampError);
        } else {
          seasonData.champion_team_id = superBowl.winner_id;
        }
      }
    }

    // Step 1: Finalize all season statistics
    console.log(`[Offseason] Aggregating final season stats for ${season}...`);
    let seasonStatsResult = { aggregated: 0, errors: [] as string[] };
    try {
      seasonStatsResult = await aggregateSeasonStats(season, saveGameId);
    } catch (err) {
      console.error("Error aggregating season stats:", err);
      // Continue even if stats aggregation fails
    }

    // Step 1.5: Aggregate season stats into lifetime stats
    console.log(`[Offseason] Aggregating lifetime stats for ${season}...`);
    let lifetimeStatsResult = { updated: 0, created: 0, errors: [] as string[] };
    try {
      lifetimeStatsResult = await aggregateLifetimeStats(season, saveGameId);
      console.log(
        `[Offseason] Lifetime stats: ${lifetimeStatsResult.created} created, ${lifetimeStatsResult.updated} updated`
      );
    } catch (err) {
      console.error("Error aggregating lifetime stats:", err);
      // Continue even if lifetime stats aggregation fails
    }

    // Step 1.6: Archive old game stats (delete after season stats are aggregated)
    console.log(`[Offseason] Archiving game stats for ${season}...`);
    let archiveResult = { deleted: 0, errors: [] as string[] };
    try {
      archiveResult = await archiveGameStats(season, saveGameId);
      console.log(
        `[Offseason] Archived ${archiveResult.deleted} game stats for season ${season}`
      );
    } catch (err) {
      console.error("Error archiving game stats:", err);
      // Continue even if archival fails - game stats will remain but can be cleaned up later
    }

    // Step 2: Ensure team_season_stats are finalized
    console.log(`[Offseason] Finalizing team season stats for ${season}...`);
    let gamesQuery = supabase
      .from("games")
      .select("home_team_id, away_team_id, home_score, away_score")
      .eq("season", season)
      .eq("played", true);

    // Filter by save_game_id if available
    if (saveGameId) {
      gamesQuery = gamesQuery.eq("save_game_id", saveGameId);
    } else {
      gamesQuery = gamesQuery.is("save_game_id", null);
    }

    const { data: games } = await gamesQuery;

    if (games && games.length > 0) {
      const teamStatsMap = new Map<
        string,
        {
          wins: number;
          losses: number;
          ties: number;
          points_for: number;
          points_against: number;
        }
      >();

      // Calculate final standings
      games.forEach((game) => {
        if (game.home_score === null || game.away_score === null) return;

        const homeId = game.home_team_id;
        const awayId = game.away_team_id;

        if (!teamStatsMap.has(homeId)) {
          teamStatsMap.set(homeId, {
            wins: 0,
            losses: 0,
            ties: 0,
            points_for: 0,
            points_against: 0,
          });
        }
        if (!teamStatsMap.has(awayId)) {
          teamStatsMap.set(awayId, {
            wins: 0,
            losses: 0,
            ties: 0,
            points_for: 0,
            points_against: 0,
          });
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
      let seasonRecordQuery = supabase
        .from("seasons")
        .select("id")
        .eq("year", season);

      if (saveGameId) {
        seasonRecordQuery = seasonRecordQuery.eq("save_game_id", saveGameId);
      } else {
        seasonRecordQuery = seasonRecordQuery.is("save_game_id", null);
      }

      const { data: seasonRecord } = await seasonRecordQuery.maybeSingle();

      if (seasonRecord) {
        const updatePromises = Array.from(teamStatsMap.entries()).map(
          async ([teamId, stats]) => {
            // Get playoff seed if applicable
            let playoffSeedQuery = supabase
              .from("playoff_seeds")
              .select("seed")
              .eq("season", season)
              .eq("team_id", teamId);

            if (saveGameId) {
              playoffSeedQuery = playoffSeedQuery.eq(
                "save_game_id",
                saveGameId
              );
            } else {
              playoffSeedQuery = playoffSeedQuery.is("save_game_id", null);
            }

            const { data: playoffSeed } = await playoffSeedQuery.maybeSingle();

            const { error } = await supabase.from("team_season_stats").upsert(
              {
                season_id: seasonRecord.id,
                team_id: teamId,
                wins: stats.wins,
                losses: stats.losses,
                ties: stats.ties,
                points_for: stats.points_for,
                points_against: stats.points_against,
                playoff_seed: playoffSeed?.seed || null,
                save_game_id: saveGameId || null,
                updated_at: new Date().toISOString(),
              },
              {
                onConflict: "season_id,team_id",
              }
            );

            if (error) {
              console.error(
                `Error updating team stats for team ${teamId}:`,
                error
              );
            }
          }
        );

        await Promise.all(updatePromises);
      }
    }

    // Step 3: Store playoff results in historical format
    console.log(`[Offseason] Storing playoff results for ${season}...`);
    let playoffGamesQuery = supabase
      .from("playoff_games")
      .select("*")
      .eq("season", season)
      .eq("played", true)
      .order("week", { ascending: true })
      .order("round", { ascending: true });

    if (saveGameId) {
      playoffGamesQuery = playoffGamesQuery.eq("save_game_id", saveGameId);
    } else {
      playoffGamesQuery = playoffGamesQuery.is("save_game_id", null);
    }

    const { data: playoffGames } = await playoffGamesQuery;

    // NOTE: We do NOT process expiring contracts here anymore!
    // Contracts should be processed when LEAVING week 23 (resign phase), not when ENTERING it
    // This gives CPU teams a chance to resign their players during week 23
    // Contract processing now happens in simulate-advance when transitioning from week 23 -> 24

    // Step 4: Update season to offseason phase using season manager
    console.log(`[Offseason] Transitioning season ${season} to offseason...`);
    const phaseUpdateResult = await updateSeasonPhase(
      season,
      saveGameId || null,
      "offseason",
      23
    );

    if (!phaseUpdateResult.success) {
      console.error(
        "Error updating season to offseason:",
        phaseUpdateResult.error
      );
      return NextResponse.json(
        {
          error:
            phaseUpdateResult.error || "Failed to update season to offseason",
        },
        { status: 500 }
      );
    }

    // Also update ended_at timestamp
    let updateEndedQuery = supabase
      .from("seasons")
      .update({ ended_at: new Date().toISOString() })
      .eq("year", season)
      .eq("is_active", true);

    if (saveGameId) {
      updateEndedQuery = updateEndedQuery.eq("save_game_id", saveGameId);
    } else {
      updateEndedQuery = updateEndedQuery.is("save_game_id", null);
    }

    await updateEndedQuery; // Don't fail if this update fails

    // Step 5: Get champion info
    const { data: championTeam } = await supabase
      .from("teams")
      .select("id, name, abbreviation")
      .eq("id", seasonData.champion_team_id)
      .maybeSingle();

    // Step 6: Get final standings summary
    const { data: finalStandings } = await supabase
      .from("team_season_stats")
      .select(
        `
        *,
        teams!inner (id, name, abbreviation, conference, division)
      `
      )
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
        champion: championTeam
          ? {
              id: championTeam.id,
              name: championTeam.name,
              abbreviation: championTeam.abbreviation,
            }
          : null,
      },
      summary: {
        totalGames: games?.length || 0,
        playoffGames: playoffGames?.length || 0,
        teamsWithStats: finalStandings?.length || 0,
        seasonStatsAggregated: seasonStatsResult.aggregated,
        lifetimeStatsCreated: lifetimeStatsResult.created,
        lifetimeStatsUpdated: lifetimeStatsResult.updated,
        gameStatsArchived: archiveResult.deleted,
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
