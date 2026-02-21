import { supabase } from "@/lib/supabase-client";
import { Player } from "./types";
import { Coach, getTalentDevelopmentMultiplier } from "./coaching-influence";

/**
 * Update player ratings based on season performance
 * This should be called at the end of a season or periodically
 */
export async function updatePlayerRatingsForSeason(
  season: number,
  saveGameId?: string | null
): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  // Get all players who played in this season
  const { data: gameStats, error: statsError } = await supabase
    .from("player_game_stats")
    .select("player_id, performance_rating, team_id")
    .eq("season", season);

  if (statsError) {
    throw new Error(`Failed to fetch player stats: ${statsError.message}`);
  }

  // Group stats by player
  const playerStatsMap = new Map<string, number[]>();
  const playerTeamMap = new Map<string, string>();

  gameStats?.forEach((stat) => {
    if (!playerStatsMap.has(stat.player_id)) {
      playerStatsMap.set(stat.player_id, []);
      playerTeamMap.set(stat.player_id, stat.team_id);
    }
    if (stat.performance_rating) {
      playerStatsMap.get(stat.player_id)!.push(stat.performance_rating);
    }
  });

  // Batch fetch all players at once
  const playerIds = Array.from(playerStatsMap.keys());
  if (playerIds.length === 0) {
    return { updated: 0, errors: [] };
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("*")
    .in("id", playerIds);

  if (playersError) {
    throw new Error(`Failed to fetch players: ${playersError.message}`);
  }

  // Create player map for O(1) lookup
  const playerMap = new Map<string, Player>();
  players?.forEach((player) => {
    playerMap.set(player.id, player as Player);
  });

  // Collect all updates to execute in parallel
  const updates: Array<{ playerId: string; newOverall: number }> = [];

  for (const [playerId, ratings] of playerStatsMap.entries()) {
    try {
      const player = playerMap.get(playerId);
      if (!player) {
        errors.push(`Player ${playerId} not found`);
        continue;
      }

      // Calculate average performance rating
      const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
      const gamesPlayed = ratings.length;

      // Calculate rating change
      let ratingChange = calculateRatingChange(
        avgRating,
        player.overall,
        player.potential,
        gamesPlayed
      );
      
      // Apply talent development modifier from head coach
      if (saveGameId) {
        const teamId = playerTeamMap.get(playerId);
        if (teamId) {
          try {
            const headCoach = await getPlayerTeamHeadCoach(teamId, saveGameId);
            if (headCoach) {
              const talentDevMod = getTalentDevelopmentMultiplier(headCoach);
              ratingChange *= talentDevMod;
              console.log(
                `[updatePlayerRatings] Applied talent_dev modifier ${talentDevMod.toFixed(2)}x for player ${player.full_name} (coach: ${headCoach.full_name})`
              );
            }
          } catch (error) {
            // Coach not found, continue without modifier
            console.warn(`[updatePlayerRatings] Could not load coach for team ${teamId}`);
          }
        }
      }

      // Update player rating
      const newOverall = Math.max(
        0,
        Math.min(
          player.potential, // Can't exceed potential
          player.overall + ratingChange
        )
      );

      // Only update if there's a meaningful change (>= 1 point)
      if (Math.abs(ratingChange) >= 1) {
        updates.push({ playerId, newOverall: Math.round(newOverall) });
      }
    } catch (error) {
      errors.push(
        `Error processing player ${playerId}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  // Execute all updates in parallel
  if (updates.length > 0) {
    const updatePromises = updates.map(async ({ playerId, newOverall }) => {
      try {
        const { error: updateError } = await supabase
          .from("players")
          .update({ overall: newOverall })
          .eq("id", playerId);

        if (updateError) {
          errors.push(
            `Failed to update player ${playerId}: ${updateError.message}`
          );
          return false;
        }
        return true;
      } catch (error) {
        errors.push(
          `Error updating player ${playerId}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        return false;
      }
    });

    const results = await Promise.all(updatePromises);
    updated = results.filter((r) => r === true).length;
  }

  return { updated, errors };
}

/**
 * Calculate how much a player's rating should change based on performance
 */
function calculateRatingChange(
  avgPerformanceRating: number,
  currentOverall: number,
  potential: number,
  gamesPlayed: number
): number {
  // Need at least 8 games to have meaningful progression
  if (gamesPlayed < 8) {
    return 0;
  }

  // Calculate performance vs expected
  // Expected performance = current overall rating (roughly)
  const performanceDelta = avgPerformanceRating - currentOverall;

  // Rating change formula:
  // - Strong performance (10+ points above current): +1 to +3
  // - Good performance (5-10 points above): +0.5 to +1.5
  // - Average performance (-5 to +5): -0.5 to +0.5
  // - Poor performance (-10 to -5): -1 to -1.5
  // - Very poor performance (< -10): -1.5 to -3

  let ratingChange = 0;

  if (performanceDelta >= 10) {
    // Excellent performance
    ratingChange = 1.5 + (performanceDelta - 10) * 0.1; // 1.5 to 3.0
    ratingChange = Math.min(3, ratingChange);
  } else if (performanceDelta >= 5) {
    // Good performance
    ratingChange = 0.5 + (performanceDelta - 5) * 0.2; // 0.5 to 1.5
  } else if (performanceDelta >= -5) {
    // Average performance
    ratingChange = performanceDelta * 0.1; // -0.5 to 0.5
  } else if (performanceDelta >= -10) {
    // Poor performance
    ratingChange = -1 + (performanceDelta + 10) * 0.1; // -1 to -1.5
  } else {
    // Very poor performance
    ratingChange = -1.5 + (performanceDelta + 10) * 0.15; // -1.5 to -3
    ratingChange = Math.max(-3, ratingChange);
  }

  // Scale by games played (more games = more reliable)
  const gamesFactor = Math.min(1, gamesPlayed / 16); // Full season = 1.0
  ratingChange *= gamesFactor;

  // Young players (age < 26) can improve faster
  // Older players (age > 30) decline faster
  // This would require age data, but for now we'll use a flat modifier

  return Math.round(ratingChange * 10) / 10; // Round to 1 decimal
}

/**
 * Update player ratings after a single game
 * This is a lighter version for mid-season updates
 */
export async function updatePlayerRatingsAfterGame(
  gameId: string
): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  // Get game stats
  const { data: gameStats, error: statsError } = await supabase
    .from("player_game_stats")
    .select("player_id, performance_rating, season")
    .eq("game_id", gameId);

  if (statsError) {
    throw new Error(`Failed to fetch game stats: ${statsError.message}`);
  }

  // Get season stats for context
  const season = gameStats?.[0]?.season;
  if (!season) {
    return { updated: 0, errors: ["No season found"] };
  }

  // Get unique player IDs from game stats
  const playerIds = [
    ...new Set(
      (gameStats || [])
        .filter((stat) => stat.performance_rating)
        .map((stat) => stat.player_id)
    ),
  ];

  if (playerIds.length === 0) {
    return { updated: 0, errors: [] };
  }

  // Batch fetch all players at once
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("*")
    .in("id", playerIds);

  if (playersError) {
    throw new Error(`Failed to fetch players: ${playersError.message}`);
  }

  // Create player map for O(1) lookup
  const playerMap = new Map<string, Player>();
  players?.forEach((player) => {
    playerMap.set(player.id, player as Player);
  });

  // Batch fetch all season stats for these players
  const { data: allSeasonStats, error: seasonStatsError } = await supabase
    .from("player_game_stats")
    .select("player_id, performance_rating")
    .in("player_id", playerIds)
    .eq("season", season)
    .not("performance_rating", "is", null);

  if (seasonStatsError) {
    throw new Error(
      `Failed to fetch season stats: ${seasonStatsError.message}`
    );
  }

  // Group season stats by player
  const playerSeasonStatsMap = new Map<string, number[]>();
  allSeasonStats?.forEach((stat) => {
    if (!playerSeasonStatsMap.has(stat.player_id)) {
      playerSeasonStatsMap.set(stat.player_id, []);
    }
    playerSeasonStatsMap
      .get(stat.player_id)!
      .push(stat.performance_rating as number);
  });

  // Collect all updates to execute in parallel
  const updates: Array<{ playerId: string; newOverall: number }> = [];

  for (const stat of gameStats || []) {
    if (!stat.performance_rating) continue;

    try {
      const player = playerMap.get(stat.player_id);
      if (!player) {
        errors.push(`Player ${stat.player_id} not found`);
        continue;
      }

      // Get all game stats for this player this season
      const ratings = playerSeasonStatsMap.get(stat.player_id) || [];
      if (ratings.length === 0) {
        continue;
      }

      const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
      const gamesPlayed = ratings.length;

      // Calculate rating change (smaller increments for single game)
      const ratingChange =
        calculateRatingChange(
          avgRating,
          player.overall,
          player.potential,
          gamesPlayed
        ) * 0.1; // Scale down for single game updates

      // Only update if meaningful change
      if (Math.abs(ratingChange) >= 0.1) {
        const newOverall = Math.max(
          0,
          Math.min(player.potential, player.overall + ratingChange)
        );

        updates.push({
          playerId: stat.player_id,
          newOverall: Math.round(newOverall),
        });
      }
    } catch (error) {
      errors.push(
        `Error processing player ${stat.player_id}: ${error instanceof Error ? error.message : "Unknown"}`
      );
    }
  }

  // Execute all updates in parallel
  if (updates.length > 0) {
    const updatePromises = updates.map(async ({ playerId, newOverall }) => {
      try {
        const { error: updateError } = await supabase
          .from("players")
          .update({ overall: newOverall })
          .eq("id", playerId);

        if (updateError) {
          errors.push(
            `Failed to update player ${playerId}: ${updateError.message}`
          );
          return false;
        }
        return true;
      } catch (error) {
        errors.push(
          `Error updating player ${playerId}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        return false;
      }
    });

    const results = await Promise.all(updatePromises);
    updated = results.filter((r) => r === true).length;
  }

  return { updated, errors };
}

/**
 * Aggregate season stats from game stats
 * This should be called periodically to keep season stats up to date
 */
export async function aggregateSeasonStats(
  season: number,
  saveGameId?: string | null
): Promise<{ aggregated: number; errors: string[] }> {
  console.log(
    `[AggregateStats] Starting aggregation for season ${season}, saveGameId: ${saveGameId || "null"}`
  );
  const errors: string[] = [];
  let aggregated = 0;
  const seasonStatsToUpsert: Array<Record<string, unknown>> = [];

  // Fetch all game stats for this season (we'll group by player after fetching)
  // Include game_id and week for debugging
  // CRITICAL: Supabase has a default limit of 1000 rows. We need to fetch all rows.
  let statsQuery = supabase
    .from("player_game_stats")
    .select(
      "player_id, team_id, save_game_id, game_id, week, passing_yards, passing_tds, interceptions, defensive_interceptions, completions, attempts, rushing_yards, rushing_tds, rushing_attempts, receiving_yards, receiving_tds, receptions, targets, fumbles, tackles, solo_tackles, sacks, forced_fumbles, fumble_recoveries, passes_defended, tfl, field_goals_made, field_goals_attempted, extra_points_made, punts, punt_yards, performance_rating, snaps_played"
    )
    .eq("season", season);

  // Filter by save_game_id if provided
  if (saveGameId) {
    statsQuery = statsQuery.eq("save_game_id", saveGameId);
    console.log(
      `[AggregateStats] Filtering stats by save_game_id: ${saveGameId}`
    );
  } else {
    statsQuery = statsQuery.is("save_game_id", null);
    console.log(`[AggregateStats] Filtering stats by save_game_id IS NULL`);
  }

  // CRITICAL: Supabase has a default limit of 1000 rows
  // We need to paginate to fetch ALL stats
  // First, get the count to see how many total stats exist (using same filters)
  let countQuery = supabase
    .from("player_game_stats")
    .select("*", { count: "exact", head: true })
    .eq("season", season);

  if (saveGameId) {
    countQuery = countQuery.eq("save_game_id", saveGameId);
  } else {
    countQuery = countQuery.is("save_game_id", null);
  }

  const { count } = await countQuery;

  // Fetch all stats using pagination (Supabase max is 1000 per request)
  // Type will be inferred from the query result later
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allStats: any[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  let hasMore = true;

  console.log(
    `[AggregateStats] Fetching ${count || "unknown"} total stats in pages of ${PAGE_SIZE}...`
  );

  while (hasMore) {
    const paginatedQuery = statsQuery.range(from, from + PAGE_SIZE - 1);
    const { data: pageStats, error: pageError } = await paginatedQuery;

    if (pageError) {
      throw new Error(
        `Failed to fetch stats page (${from}-${from + PAGE_SIZE - 1}): ${pageError.message}`
      );
    }

    if (pageStats && pageStats.length > 0) {
      allStats.push(...pageStats);
      from += PAGE_SIZE;
      hasMore = pageStats.length === PAGE_SIZE; // If we got a full page, there might be more

      console.log(
        `[AggregateStats] Fetched page: ${allStats.length}/${count || "unknown"} stats loaded...`
      );
    } else {
      hasMore = false;
    }

    // Safety check: if we've fetched more than the count, something's wrong
    if (count && allStats.length >= count) {
      hasMore = false;
    }
  }

  if (!allStats || allStats.length === 0) {
    console.log(
      `[AggregateStats] No game stats found for season ${season}${saveGameId ? ` with save_game_id ${saveGameId}` : " with NULL save_game_id"}`
    );
    return { aggregated: 0, errors: [] };
  }

  console.log(
    `[AggregateStats] Found ${allStats.length} game stats (count: ${count || "unknown"}) for season ${season}${saveGameId ? ` with save_game_id ${saveGameId}` : " with NULL save_game_id"}`
  );

  // WARNING: If count is higher than allStats.length, we're missing data due to limit
  if (count && count > allStats.length) {
    console.error(
      `[AggregateStats] CRITICAL: Query returned ${allStats.length} stats but count shows ${count} total. Data is being truncated!`
    );
    errors.push(
      `Query limit reached: Found ${count} total stats but only retrieved ${allStats.length}. Aggregation may be incomplete.`
    );
  }

  // Debug: Check unique weeks and game_ids
  const uniqueWeeks = new Set(
    allStats.map((s) => s.week).filter((w) => w != null)
  );
  const uniqueGameIds = new Set(allStats.map((s) => s.game_id).filter(Boolean));
  const weekCounts = new Map<number, number>();
  allStats.forEach((s) => {
    if (s.week != null) {
      weekCounts.set(s.week, (weekCounts.get(s.week) || 0) + 1);
    }
  });

  console.log(`[AggregateStats] Unique game_ids found: ${uniqueGameIds.size}`);
  console.log(
    `[AggregateStats] Unique weeks found: ${Array.from(uniqueWeeks)
      .sort((a, b) => a - b)
      .join(", ")}`
  );
  console.log(
    `[AggregateStats] Week distribution:`,
    Object.fromEntries(weekCounts)
  );
  console.log(
    `[AggregateStats] Sample game_ids:`,
    Array.from(uniqueGameIds).slice(0, 5)
  );

  // Check save_game_id distribution - this is critical for debugging
  const saveGameIdCounts = new Map<string | null, number>();
  allStats.forEach((s) => {
    const sgid = s.save_game_id || null;
    saveGameIdCounts.set(sgid, (saveGameIdCounts.get(sgid) || 0) + 1);
  });
  console.log(
    `[AggregateStats] save_game_id distribution:`,
    Object.fromEntries(saveGameIdCounts)
  );

  // WARNING: If we filtered by saveGameId but found stats with different save_game_id values, that's a problem
  if (saveGameId && saveGameIdCounts.size > 1) {
    console.error(
      `[AggregateStats] ERROR: Filtered by saveGameId ${saveGameId} but found stats with different save_game_id values:`,
      Object.fromEntries(saveGameIdCounts)
    );
    errors.push(
      `Found stats with multiple save_game_id values when filtering by ${saveGameId}. This indicates data inconsistency.`
    );
  }

  // WARNING: If we filtered by saveGameId but found stats with NULL, that's also a problem
  if (saveGameId && saveGameIdCounts.has(null)) {
    console.error(
      `[AggregateStats] ERROR: Filtered by saveGameId ${saveGameId} but found ${saveGameIdCounts.get(null)} stats with NULL save_game_id`
    );
    errors.push(
      `Found ${saveGameIdCounts.get(null)} stats with NULL save_game_id when filtering by ${saveGameId}. These stats will be excluded from aggregation.`
    );
  }

  // CRITICAL: Verify we have stats for all expected weeks
  // If we're in week 6, we should have stats for weeks 1-6
  // This helps catch cases where stats weren't saved or have wrong save_game_id
  const maxWeek = Math.max(...Array.from(uniqueWeeks));
  const minWeek = Math.min(...Array.from(uniqueWeeks));
  const expectedWeeks = maxWeek - minWeek + 1;
  const actualUniqueWeeks = uniqueWeeks.size;

  if (actualUniqueWeeks < expectedWeeks) {
    console.warn(
      `[AggregateStats] WARNING: Found stats for ${actualUniqueWeeks} unique weeks (${Array.from(
        uniqueWeeks
      )
        .sort((a, b) => a - b)
        .join(
          ", "
        )}) but expected ${expectedWeeks} weeks (${minWeek}-${maxWeek}). Some weeks may be missing.`
    );
  }

  // Also check if we have game_id in the stats
  if (allStats.length > 0 && !allStats[0].game_id) {
    console.warn(
      `[AggregateStats] WARNING: Game stats don't have game_id field! This might be why we can't verify weeks.`
    );
  }

  // Check for a specific player to debug (Blake Walker or any player with rushing yards)
  const playersWithRushing = allStats.filter((s) => (s.rushing_yards || 0) > 0);
  if (playersWithRushing.length > 0) {
    const samplePlayer = playersWithRushing[0];
    const playerStats = allStats.filter(
      (s) => s.player_id === samplePlayer.player_id
    );
    const playerRushingTotal = playerStats.reduce(
      (sum, s) => sum + (s.rushing_yards || 0),
      0
    );
    const playerWeeks = playerStats
      .map((s) => s.week)
      .filter((w) => w != null)
      .sort((a, b) => a! - b!);
    console.log(
      `[AggregateStats] Sample player ${samplePlayer.player_id}: ${playerStats.length} games, weeks: ${playerWeeks.join(", ")}, total rushing yards: ${playerRushingTotal}`
    );
  }

  // Group by player (use the most recent team_id for each player)
  // Type for stats from database query (includes save_game_id)
  type GameStatRow = typeof allStats extends (infer T)[] ? T : never;
  const playerMap = new Map<
    string,
    { teamId: string; stats: GameStatRow[]; saveGameId: string | null }
  >();

  allStats?.forEach((stat) => {
    if (!playerMap.has(stat.player_id)) {
      playerMap.set(stat.player_id, {
        teamId: stat.team_id, // Use team_id from the stat
        stats: [],
        saveGameId: stat.save_game_id || null,
      });
    }
    // Add this stat to the player's stats array
    const playerData = playerMap.get(stat.player_id);
    if (playerData) {
      playerData.stats.push(stat);
      // Update team_id to the most recent one (in case player was traded)
      playerData.teamId = stat.team_id;
    }
  });

  // Aggregate for each player (collect for batch upsert)
  for (const [
    playerId,
    { teamId, stats, saveGameId: playerSaveGameId },
  ] of playerMap.entries()) {
    if (stats.length === 0) continue;

    try {
      // Sum all stat fields
      // Use sentinel UUID for NULL save_game_id to work with COALESCE-based unique index
      const SENTINEL_UUID = "00000000-0000-0000-0000-000000000000";
      // Prioritize saveGameId parameter to ensure consistency with delete logic
      // When saveGameId is provided (even if null), use it exclusively
      // When it's undefined, use the stat's save_game_id (which should all be NULL if filtered correctly)
      const effectiveSaveGameId =
        saveGameId !== undefined && saveGameId !== null
          ? saveGameId
          : playerSaveGameId || SENTINEL_UUID;

      // Debug: Log players with stats to verify we're getting all weeks
      // Only log a sample to avoid console spam (log first 5 players and any with > 10 games)
      const shouldLog =
        playerMap.size <= 5 || // Log all if <= 5 players
        stats.length > 10 || // Log players with many games
        playerId === playerMap.keys().next().value; // Always log first player

      if (shouldLog && stats.length > 0) {
        const totalRushingYards = stats.reduce(
          (sum, s) => sum + (s.rushing_yards || 0),
          0
        );
        const weeks = stats
          .map((s) => s.week)
          .filter((w) => w != null)
          .sort((a, b) => a! - b!);
        const uniqueWeeks = new Set(weeks);
        console.log(
          `[AggregateStats] Player ${playerId}: ${stats.length} games, ${uniqueWeeks.size} unique weeks [${weeks.join(", ")}], ${totalRushingYards} total rushing yards`
        );
      }

      const seasonStat: Record<string, unknown> = {
        player_id: playerId,
        team_id: teamId,
        season: season,
        games_played: stats.length,
        games_started: stats.filter((s) => (s.snaps_played || 0) > 40).length, // Started if > 40 snaps
        save_game_id: effectiveSaveGameId, // Use sentinel for NULL to match unique index
      };

      // Sum all numeric fields
      const numericFields = [
        "passing_yards",
        "passing_tds",
        "interceptions",
        "defensive_interceptions",
        "completions",
        "attempts",
        "rushing_yards",
        "rushing_tds",
        "rushing_attempts",
        "receiving_yards",
        "receiving_tds",
        "receptions",
        "targets",
        "fumbles",
        "tackles",
        "solo_tackles",
        "sacks",
        "forced_fumbles",
        "fumble_recoveries",
        "passes_defended",
        "tfl",
        "field_goals_made",
        "field_goals_attempted",
        "extra_points_made",
        "punts",
        "punt_yards",
      ];

      numericFields.forEach((field) => {
        // Handle DECIMAL fields (sacks) differently
        if (field === "sacks") {
          seasonStat[field] = stats.reduce((sum, s) => {
            const value = (s as Record<string, unknown>)[field];
            // Handle both number and string (from database DECIMAL)
            const numValue =
              typeof value === "string"
                ? parseFloat(value)
                : (value as number) || 0;
            return sum + numValue;
          }, 0);
        } else {
          seasonStat[field] = stats.reduce(
            (sum, s) =>
              sum + (((s as Record<string, unknown>)[field] as number) || 0),
            0
          );
        }
      });

      // Calculate average performance rating
      const ratings = stats
        .map((s) => s.performance_rating)
        .filter((r) => r !== null && r !== undefined) as number[];

      if (ratings.length > 0) {
        seasonStat.avg_performance_rating =
          ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
      }

      // Collect stats for batch upsert (skip record checking for performance)
      seasonStatsToUpsert.push(seasonStat);
    } catch (error) {
      errors.push(
        `Error aggregating stats for ${playerId}: ${error instanceof Error ? error.message : "Unknown"}`
      );
    }
  }

  // Batch upsert all season stats at once for better performance
  if (seasonStatsToUpsert.length > 0) {
    console.log(
      `[AggregateStats] Upserting ${seasonStatsToUpsert.length} season stats for season ${season}, saveGameId: ${saveGameId || "null"}`
    );
    console.log(
      `[AggregateStats] Sample stat:`,
      JSON.stringify(seasonStatsToUpsert[0], null, 2)
    );

    try {
      // Since the unique index uses COALESCE and Supabase's onConflict doesn't support expressions,
      // we'll use a delete-then-insert approach for the affected players
      // This ensures we don't have conflicts with the COALESCE-based unique index

      // Use upsert with conflict resolution instead of delete-then-insert for better performance
      // Batch in chunks to avoid hitting database limits
      const BATCH_SIZE = 500;
      const SENTINEL_UUID = "00000000-0000-0000-0000-000000000000";

      // Process in batches for better performance
      for (let i = 0; i < seasonStatsToUpsert.length; i += BATCH_SIZE) {
        const batch = seasonStatsToUpsert.slice(i, i + BATCH_SIZE);

        // For each batch, delete existing records first, then insert
        const playerIds = batch.map((s) => s.player_id);

        // Delete existing records - need to handle save_game_id properly
        // Delete records matching the save_game_id (or sentinel/null for legacy)
        if (saveGameId) {
          // Delete records with matching save_game_id
          const { error: deleteError1 } = await supabase
            .from("player_season_stats")
            .delete()
            .eq("season", season)
            .eq("save_game_id", saveGameId)
            .in("player_id", playerIds);

          if (deleteError1) {
            console.warn(
              `[AggregateStats] Warning deleting batch ${i / BATCH_SIZE + 1} (saveGameId):`,
              deleteError1.message
            );
          }
        } else {
          // Delete records with NULL or sentinel UUID
          // First delete NULL
          const { error: deleteError1 } = await supabase
            .from("player_season_stats")
            .delete()
            .eq("season", season)
            .is("save_game_id", null)
            .in("player_id", playerIds);

          if (deleteError1) {
            console.warn(
              `[AggregateStats] Warning deleting batch ${i / BATCH_SIZE + 1} (null):`,
              deleteError1.message
            );
          }

          // Then delete sentinel UUID
          const { error: deleteError2 } = await supabase
            .from("player_season_stats")
            .delete()
            .eq("season", season)
            .eq("save_game_id", SENTINEL_UUID)
            .in("player_id", playerIds);

          if (deleteError2) {
            console.warn(
              `[AggregateStats] Warning deleting batch ${i / BATCH_SIZE + 1} (sentinel):`,
              deleteError2.message
            );
          }
        }

        // Insert the batch
        const insertResult = await supabase
          .from("player_season_stats")
          .insert(batch)
          .select();

        if (insertResult.error) {
          console.error(
            `[AggregateStats] Batch ${i / BATCH_SIZE + 1} insert error:`,
            insertResult.error
          );
          console.error(
            `[AggregateStats] Error details:`,
            JSON.stringify(insertResult.error, null, 2)
          );
          console.error(
            `[AggregateStats] Sample stat from failed batch:`,
            JSON.stringify(batch[0], null, 2)
          );
          errors.push(
            `Batch ${i / BATCH_SIZE + 1} failed: ${insertResult.error.message}`
          );

          // Try individual inserts for this batch as fallback
          console.log(
            `[AggregateStats] Attempting individual inserts for batch ${i / BATCH_SIZE + 1}...`
          );
          let batchSuccessCount = 0;
          for (const stat of batch) {
            try {
              // Delete existing first - handle both sentinel and actual save_game_id
              const effectiveSaveGameId =
                stat.save_game_id === SENTINEL_UUID ? null : stat.save_game_id;

              if (effectiveSaveGameId) {
                const { error: delError } = await supabase
                  .from("player_season_stats")
                  .delete()
                  .eq("player_id", stat.player_id)
                  .eq("season", stat.season)
                  .eq("save_game_id", effectiveSaveGameId);

                if (delError) {
                  console.error(
                    `[AggregateStats] Failed to delete stat for player ${stat.player_id}:`,
                    delError
                  );
                }
              } else {
                // Delete both NULL and sentinel
                const { error: delError1 } = await supabase
                  .from("player_season_stats")
                  .delete()
                  .eq("player_id", stat.player_id)
                  .eq("season", stat.season)
                  .is("save_game_id", null);

                const { error: delError2 } = await supabase
                  .from("player_season_stats")
                  .delete()
                  .eq("player_id", stat.player_id)
                  .eq("season", stat.season)
                  .eq("save_game_id", SENTINEL_UUID);

                if (delError1 || delError2) {
                  console.error(
                    `[AggregateStats] Failed to delete stat for player ${stat.player_id}:`,
                    delError1 || delError2
                  );
                }
              }

              // Insert
              const { error: singleError } = await supabase
                .from("player_season_stats")
                .insert(stat)
                .select();

              if (!singleError) {
                batchSuccessCount++;
              } else {
                console.error(
                  `[AggregateStats] Failed to insert stat for player ${stat.player_id}:`,
                  singleError
                );
              }
            } catch (err) {
              console.error(
                `[AggregateStats] Exception inserting stat for player ${stat.player_id}:`,
                err
              );
            }
          }
          aggregated += batchSuccessCount;
          console.log(
            `[AggregateStats] Batch ${i / BATCH_SIZE + 1} fallback: ${batchSuccessCount}/${batch.length} inserted individually`
          );
        } else {
          aggregated += insertResult.data?.length || batch.length;
          console.log(
            `[AggregateStats] Batch ${i / BATCH_SIZE + 1} succeeded: ${insertResult.data?.length || batch.length} stats inserted`
          );
        }
      }

      console.log(
        `[AggregateStats] Successfully processed ${aggregated} player season stats in ${Math.ceil(seasonStatsToUpsert.length / BATCH_SIZE)} batches`
      );
    } catch (batchError) {
      console.error(`[AggregateStats] Batch insert exception:`, batchError);
      errors.push(
        `Error during batch insert: ${batchError instanceof Error ? batchError.message : "Unknown error"}`
      );
    }
  } else {
    console.log(
      `[AggregateStats] No stats to upsert (seasonStatsToUpsert.length = 0)`
    );
    console.log(
      `[AggregateStats] This might mean no game stats were found. Check if player_game_stats has data for season ${season}${saveGameId ? ` with save_game_id ${saveGameId}` : " with NULL save_game_id"}`
    );
  }

  return { aggregated, errors };
}

/**
 * Aggregate season stats into lifetime stats
 * This should be called after a season ends to update career totals
 */
export async function aggregateLifetimeStats(
  season: number,
  saveGameId?: string | null
): Promise<{ updated: number; created: number; errors: string[] }> {
  console.log(
    `[AggregateLifetimeStats] Starting lifetime aggregation for season ${season}, saveGameId: ${saveGameId || "null"}`
  );
  const errors: string[] = [];
  let updated = 0;
  let created = 0;

  // Fetch all season stats for this season
  let seasonStatsQuery = supabase
    .from("player_season_stats")
    .select("*")
    .eq("season", season);

  // Filter by save_game_id if provided
  if (saveGameId) {
    seasonStatsQuery = seasonStatsQuery.eq("save_game_id", saveGameId);
  } else {
    // For NULL save_game_id, we need to handle the sentinel UUID case
    // Check for both NULL and sentinel UUID
    seasonStatsQuery = seasonStatsQuery.or(
      "save_game_id.is.null,save_game_id.eq.00000000-0000-0000-0000-000000000000"
    );
  }

  const { data: seasonStats, error: fetchError } = await seasonStatsQuery;

  if (fetchError) {
    console.error(
      `[AggregateLifetimeStats] Error fetching season stats:`,
      fetchError
    );
    return {
      updated: 0,
      created: 0,
      errors: [`Failed to fetch season stats: ${fetchError.message}`],
    };
  }

  if (!seasonStats || seasonStats.length === 0) {
    console.log(
      `[AggregateLifetimeStats] No season stats found for season ${season}${saveGameId ? ` with save_game_id ${saveGameId}` : " with NULL save_game_id"}`
    );
    return { updated: 0, created: 0, errors: [] };
  }

  console.log(
    `[AggregateLifetimeStats] Found ${seasonStats.length} season stats to aggregate`
  );

  // Process each player's season stats
  const SENTINEL_UUID = "00000000-0000-0000-0000-000000000000";
  const effectiveSaveGameId =
    saveGameId !== undefined && saveGameId !== null
      ? saveGameId
      : SENTINEL_UUID;

  // Fetch existing lifetime stats for these players
  const playerIds = seasonStats.map((s) => s.player_id);
  let lifetimeStatsQuery = supabase
    .from("player_lifetime_stats")
    .select("*")
    .in("player_id", playerIds);

  if (saveGameId) {
    lifetimeStatsQuery = lifetimeStatsQuery.eq("save_game_id", saveGameId);
  } else {
    lifetimeStatsQuery = lifetimeStatsQuery.eq("save_game_id", SENTINEL_UUID);
  }

  const { data: existingLifetimeStats, error: lifetimeFetchError } =
    await lifetimeStatsQuery;

  if (lifetimeFetchError) {
    console.error(
      `[AggregateLifetimeStats] Error fetching existing lifetime stats:`,
      lifetimeFetchError
    );
    return {
      updated: 0,
      created: 0,
      errors: [
        `Failed to fetch existing lifetime stats: ${lifetimeFetchError.message}`,
      ],
    };
  }

  // Create a map of existing lifetime stats by player_id
  const lifetimeStatsMap = new Map<string, typeof existingLifetimeStats[0]>();
  if (existingLifetimeStats) {
    existingLifetimeStats.forEach((stat) => {
      lifetimeStatsMap.set(stat.player_id, stat);
    });
  }

  // Prepare lifetime stats updates/inserts
  const lifetimeStatsToUpsert: Array<Record<string, unknown>> = [];

  for (const seasonStat of seasonStats) {
    try {
      const existingLifetime = lifetimeStatsMap.get(seasonStat.player_id);
      const isNew = !existingLifetime;

      // Start with existing lifetime stats or initialize new record
      const lifetimeStat: Record<string, unknown> = existingLifetime
        ? { ...existingLifetime }
        : {
            player_id: seasonStat.player_id,
            save_game_id: effectiveSaveGameId === SENTINEL_UUID ? null : effectiveSaveGameId,
            passing_yards: 0,
            passing_tds: 0,
            interceptions: 0,
            completions: 0,
            attempts: 0,
            rushing_yards: 0,
            rushing_tds: 0,
            rushing_attempts: 0,
            receiving_yards: 0,
            receiving_tds: 0,
            receptions: 0,
            targets: 0,
            fumbles: 0,
            tackles: 0,
            solo_tackles: 0,
            sacks: 0,
            defensive_interceptions: 0,
            forced_fumbles: 0,
            fumble_recoveries: 0,
            passes_defended: 0,
            tfl: 0,
            field_goals_made: 0,
            field_goals_attempted: 0,
            extra_points_made: 0,
            punts: 0,
            punt_yards: 0,
            seasons_played: 0,
            first_season: null,
            last_season: null,
            total_games_played: 0,
            total_games_started: 0,
            avg_performance_rating: null,
          };

      // Add season stats to lifetime totals
      const numericFields = [
        "passing_yards",
        "passing_tds",
        "interceptions",
        "completions",
        "attempts",
        "rushing_yards",
        "rushing_tds",
        "rushing_attempts",
        "receiving_yards",
        "receiving_tds",
        "receptions",
        "targets",
        "fumbles",
        "tackles",
        "solo_tackles",
        "forced_fumbles",
        "fumble_recoveries",
        "passes_defended",
        "tfl",
        "field_goals_made",
        "field_goals_attempted",
        "extra_points_made",
        "punts",
        "punt_yards",
      ];

      numericFields.forEach((field) => {
        const existingValue = (lifetimeStat[field] as number) || 0;
        const seasonValue = (seasonStat[field] as number) || 0;
        lifetimeStat[field] = existingValue + seasonValue;
      });

      // Handle DECIMAL fields (sacks)
      const existingSacks =
        typeof lifetimeStat.sacks === "string"
          ? parseFloat(lifetimeStat.sacks as string)
          : (lifetimeStat.sacks as number) || 0;
      const seasonSacks =
        typeof seasonStat.sacks === "string"
          ? parseFloat(seasonStat.sacks as string)
          : (seasonStat.sacks as number) || 0;
      lifetimeStat.sacks = existingSacks + seasonSacks;

      // Handle defensive_interceptions (might be in season stat)
      const existingDefInt = (lifetimeStat.defensive_interceptions as number) || 0;
      const seasonDefInt = (seasonStat.defensive_interceptions as number) || 0;
      lifetimeStat.defensive_interceptions = existingDefInt + seasonDefInt;

      // Update games played/started
      lifetimeStat.total_games_played =
        ((lifetimeStat.total_games_played as number) || 0) +
        (seasonStat.games_played || 0);
      lifetimeStat.total_games_started =
        ((lifetimeStat.total_games_started as number) || 0) +
        (seasonStat.games_started || 0);

      // Update season tracking
      if (!lifetimeStat.first_season || season < (lifetimeStat.first_season as number)) {
        lifetimeStat.first_season = season;
      }
      if (!lifetimeStat.last_season || season > (lifetimeStat.last_season as number)) {
        lifetimeStat.last_season = season;
      }
      lifetimeStat.seasons_played = ((lifetimeStat.seasons_played as number) || 0) + 1;

      // Recalculate average performance rating (weighted by games)
      // For simplicity, we'll recalculate based on total games
      // This is an approximation - ideally we'd track total rating points
      if (seasonStat.avg_performance_rating && seasonStat.games_played) {
        const existingRating = (lifetimeStat.avg_performance_rating as number) || 0;
        const existingGames = (lifetimeStat.total_games_played as number) || 0;
        const seasonRating = seasonStat.avg_performance_rating as number;
        const seasonGames = seasonStat.games_played as number;

        if (existingGames + seasonGames > 0) {
          lifetimeStat.avg_performance_rating =
            (existingRating * existingGames + seasonRating * seasonGames) /
            (existingGames + seasonGames);
        }
      }

      // Remove id and timestamps for upsert (they'll be auto-generated/updated)
      delete lifetimeStat.id;
      delete lifetimeStat.created_at;
      lifetimeStat.updated_at = new Date().toISOString();

      lifetimeStatsToUpsert.push(lifetimeStat);

      if (isNew) {
        created++;
      } else {
        updated++;
      }
    } catch (error) {
      errors.push(
        `Error processing lifetime stats for player ${seasonStat.player_id}: ${error instanceof Error ? error.message : "Unknown"}`
      );
    }
  }

  // Batch upsert lifetime stats
  if (lifetimeStatsToUpsert.length > 0) {
    console.log(
      `[AggregateLifetimeStats] Upserting ${lifetimeStatsToUpsert.length} lifetime stats (${created} new, ${updated} updated)`
    );

    const BATCH_SIZE = 500;
    for (let i = 0; i < lifetimeStatsToUpsert.length; i += BATCH_SIZE) {
      const batch = lifetimeStatsToUpsert.slice(i, i + BATCH_SIZE);

      // Delete existing records first (for the players in this batch)
      const batchPlayerIds = batch.map((s) => s.player_id as string);
      
      if (saveGameId) {
        const { error: deleteError } = await supabase
          .from("player_lifetime_stats")
          .delete()
          .eq("save_game_id", saveGameId)
          .in("player_id", batchPlayerIds);

        if (deleteError) {
          console.warn(
            `[AggregateLifetimeStats] Warning deleting batch ${i / BATCH_SIZE + 1}:`,
            deleteError.message
          );
        }
      } else {
        const { error: deleteError } = await supabase
          .from("player_lifetime_stats")
          .delete()
          .eq("save_game_id", SENTINEL_UUID)
          .in("player_id", batchPlayerIds);

        if (deleteError) {
          console.warn(
            `[AggregateLifetimeStats] Warning deleting batch ${i / BATCH_SIZE + 1}:`,
            deleteError.message
          );
        }
      }

      // Insert the batch
      const { error: insertError } = await supabase
        .from("player_lifetime_stats")
        .insert(batch);

      if (insertError) {
        console.error(
          `[AggregateLifetimeStats] Batch ${i / BATCH_SIZE + 1} insert error:`,
          insertError
        );
        errors.push(
          `Batch ${i / BATCH_SIZE + 1} failed: ${insertError.message}`
        );
      } else {
        console.log(
          `[AggregateLifetimeStats] Batch ${i / BATCH_SIZE + 1} succeeded: ${batch.length} stats upserted`
        );
      }
    }
  }

  console.log(
    `[AggregateLifetimeStats] Completed: ${created} created, ${updated} updated, ${errors.length} errors`
  );

  return { updated, created, errors };
}

/**
 * Archive game stats by deleting them after season completion
 * Only deletes if season stats exist (safety check)
 */
export async function archiveGameStats(
  season: number,
  saveGameId?: string | null
): Promise<{ deleted: number; errors: string[] }> {
  console.log(
    `[ArchiveGameStats] Starting archival for season ${season}, saveGameId: ${saveGameId || "null"}`
  );
  const errors: string[] = [];

  // Safety check: Verify season stats exist before deleting game stats
  let seasonStatsCheck = supabase
    .from("player_season_stats")
    .select("id", { count: "exact", head: true })
    .eq("season", season);

  if (saveGameId) {
    seasonStatsCheck = seasonStatsCheck.eq("save_game_id", saveGameId);
  } else {
    seasonStatsCheck = seasonStatsCheck.or(
      "save_game_id.is.null,save_game_id.eq.00000000-0000-0000-0000-000000000000"
    );
  }

  const { count: seasonStatsCount, error: checkError } = await seasonStatsCheck;

  if (checkError) {
    const errorMsg = `Failed to verify season stats exist: ${checkError.message}`;
    console.error(`[ArchiveGameStats] ${errorMsg}`);
    return { deleted: 0, errors: [errorMsg] };
  }

  if (!seasonStatsCount || seasonStatsCount === 0) {
    const errorMsg = `No season stats found for season ${season}. Cannot safely delete game stats without season stats backup.`;
    console.error(`[ArchiveGameStats] ${errorMsg}`);
    return { deleted: 0, errors: [errorMsg] };
  }

  console.log(
    `[ArchiveGameStats] Verified ${seasonStatsCount} season stats exist. Proceeding with game stats deletion...`
  );

  // Get count of game stats to be deleted
  let gameStatsCountQuery = supabase
    .from("player_game_stats")
    .select("id", { count: "exact", head: true })
    .eq("season", season);

  if (saveGameId) {
    gameStatsCountQuery = gameStatsCountQuery.eq("save_game_id", saveGameId);
  } else {
    gameStatsCountQuery = gameStatsCountQuery.is("save_game_id", null);
  }

  const { count: gameStatsCount } = await gameStatsCountQuery;

  console.log(
    `[ArchiveGameStats] Found ${gameStatsCount || 0} game stats to delete for season ${season}`
  );

  // Delete game stats in batches to avoid timeout on large datasets
  const BATCH_SIZE = 1000;
  let totalDeleted = 0;
  let hasMore = true;
  let offset = 0;

  while (hasMore) {
    // Fetch a batch of IDs to delete
    let batchQuery = supabase
      .from("player_game_stats")
      .select("id")
      .eq("season", season)
      .range(offset, offset + BATCH_SIZE - 1);

    if (saveGameId) {
      batchQuery = batchQuery.eq("save_game_id", saveGameId);
    } else {
      batchQuery = batchQuery.is("save_game_id", null);
    }

    const { data: batchIds, error: fetchError } = await batchQuery;

    if (fetchError) {
      const errorMsg = `Failed to fetch batch for deletion: ${fetchError.message}`;
      console.error(`[ArchiveGameStats] ${errorMsg}`);
      errors.push(errorMsg);
      break;
    }

    if (!batchIds || batchIds.length === 0) {
      hasMore = false;
      break;
    }

    // Delete this batch
    const idsToDelete = batchIds.map((row) => row.id);
    const { error: deleteError } = await supabase
      .from("player_game_stats")
      .delete()
      .in("id", idsToDelete);

    if (deleteError) {
      const errorMsg = `Failed to delete batch: ${deleteError.message}`;
      console.error(`[ArchiveGameStats] ${errorMsg}`);
      errors.push(errorMsg);
      break;
    }

    totalDeleted += idsToDelete.length;
    offset += BATCH_SIZE;

    console.log(
      `[ArchiveGameStats] Deleted batch: ${idsToDelete.length} records (${totalDeleted}/${gameStatsCount || "unknown"} total)`
    );

    // Check if we've deleted all records
    if (batchIds.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  console.log(
    `[ArchiveGameStats] Completed: ${totalDeleted} game stats deleted for season ${season}`
  );

  return { deleted: totalDeleted, errors };
}

/**
 * Get the head coach for a player's team
 * Used to apply talent development modifiers
 */
async function getPlayerTeamHeadCoach(
  teamId: string,
  saveGameId: string
): Promise<Coach | null> {
  // Query coach_team_assignments joined with coaches
  const { data: assignments, error } = await supabase
    .from("coach_team_assignments")
    .select(`
      coach_id,
      coaches (*)
    `)
    .eq("team_id", teamId)
    .eq("save_game_id", saveGameId);

  if (error || !assignments || assignments.length === 0) {
    return null;
  }

  // Find the head coach
  const coachesData = assignments
    .map((assignment: any) => assignment.coaches)
    .filter(Boolean) as Coach[];

  const headCoach = coachesData.find((c) => 
    c.role === 'head_coach' || c.role === 'HC'
  );

  return headCoach || null;
}
