import { supabase } from '@/lib/supabase-client';
import { Player } from './types';
import { checkRecordBreak, NFL_RECORDS } from './nfl-records';

/**
 * Update player ratings based on season performance
 * This should be called at the end of a season or periodically
 */
export async function updatePlayerRatingsForSeason(
  season: number
): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  // Get all players who played in this season
  const { data: gameStats, error: statsError } = await supabase
    .from('player_game_stats')
    .select('player_id, performance_rating, team_id')
    .eq('season', season);

  if (statsError) {
    throw new Error(`Failed to fetch player stats: ${statsError.message}`);
  }

  // Group stats by player
  const playerStatsMap = new Map<string, number[]>();
  const playerTeamMap = new Map<string, string>();

  gameStats?.forEach(stat => {
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
    .from('players')
    .select('*')
    .in('id', playerIds);

  if (playersError) {
    throw new Error(`Failed to fetch players: ${playersError.message}`);
  }

  // Create player map for O(1) lookup
  const playerMap = new Map<string, Player>();
  players?.forEach(player => {
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
      const ratingChange = calculateRatingChange(
        avgRating,
        player.overall,
        player.potential,
        gamesPlayed
      );

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
      errors.push(`Error processing player ${playerId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Execute all updates in parallel
  if (updates.length > 0) {
    const updatePromises = updates.map(async ({ playerId, newOverall }) => {
      try {
        const { error: updateError } = await supabase
          .from('players')
          .update({ overall: newOverall })
          .eq('id', playerId);

        if (updateError) {
          errors.push(`Failed to update player ${playerId}: ${updateError.message}`);
          return false;
        }
        return true;
      } catch (error) {
        errors.push(`Error updating player ${playerId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return false;
      }
    });

    const results = await Promise.all(updatePromises);
    updated = results.filter(r => r === true).length;
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
    .from('player_game_stats')
    .select('player_id, performance_rating, season')
    .eq('game_id', gameId);

  if (statsError) {
    throw new Error(`Failed to fetch game stats: ${statsError.message}`);
  }

  // Get season stats for context
  const season = gameStats?.[0]?.season;
  if (!season) {
    return { updated: 0, errors: ['No season found'] };
  }

  // Get unique player IDs from game stats
  const playerIds = [...new Set((gameStats || [])
    .filter(stat => stat.performance_rating)
    .map(stat => stat.player_id))];

  if (playerIds.length === 0) {
    return { updated: 0, errors: [] };
  }

  // Batch fetch all players at once
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('*')
    .in('id', playerIds);

  if (playersError) {
    throw new Error(`Failed to fetch players: ${playersError.message}`);
  }

  // Create player map for O(1) lookup
  const playerMap = new Map<string, Player>();
  players?.forEach(player => {
    playerMap.set(player.id, player as Player);
  });

  // Batch fetch all season stats for these players
  const { data: allSeasonStats, error: seasonStatsError } = await supabase
    .from('player_game_stats')
    .select('player_id, performance_rating')
    .in('player_id', playerIds)
    .eq('season', season)
    .not('performance_rating', 'is', null);

  if (seasonStatsError) {
    throw new Error(`Failed to fetch season stats: ${seasonStatsError.message}`);
  }

  // Group season stats by player
  const playerSeasonStatsMap = new Map<string, number[]>();
  allSeasonStats?.forEach(stat => {
    if (!playerSeasonStatsMap.has(stat.player_id)) {
      playerSeasonStatsMap.set(stat.player_id, []);
    }
    playerSeasonStatsMap.get(stat.player_id)!.push(stat.performance_rating as number);
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
      const ratingChange = calculateRatingChange(
        avgRating,
        player.overall,
        player.potential,
        gamesPlayed
      ) * 0.1; // Scale down for single game updates

      // Only update if meaningful change
      if (Math.abs(ratingChange) >= 0.1) {
        const newOverall = Math.max(
          0,
          Math.min(
            player.potential,
            player.overall + ratingChange
          )
        );

        updates.push({ playerId: stat.player_id, newOverall: Math.round(newOverall) });
      }
    } catch (error) {
      errors.push(`Error processing player ${stat.player_id}: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  // Execute all updates in parallel
  if (updates.length > 0) {
    const updatePromises = updates.map(async ({ playerId, newOverall }) => {
      try {
        const { error: updateError } = await supabase
          .from('players')
          .update({ overall: newOverall })
          .eq('id', playerId);

        if (updateError) {
          errors.push(`Failed to update player ${playerId}: ${updateError.message}`);
          return false;
        }
        return true;
      } catch (error) {
        errors.push(`Error updating player ${playerId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return false;
      }
    });

    const results = await Promise.all(updatePromises);
    updated = results.filter(r => r === true).length;
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
  console.log(`[AggregateStats] Starting aggregation for season ${season}, saveGameId: ${saveGameId || 'null'}`);
  const errors: string[] = [];
  let aggregated = 0;
  const seasonStatsToUpsert: any[] = [];

  // Get all unique players who played this season
  let playersQuery = supabase
    .from('player_game_stats')
    .select('player_id, team_id, save_game_id')
    .eq('season', season);
  
  // Filter by save_game_id if provided
  if (saveGameId) {
    playersQuery = playersQuery.eq('save_game_id', saveGameId);
  } else {
    playersQuery = playersQuery.is('save_game_id', null);
  }
  
  const { data: players, error: playersError } = await playersQuery;

  if (playersError) {
    throw new Error(`Failed to fetch players: ${playersError.message}`);
  }

  // Group by player
  const playerMap = new Map<string, { teamId: string; stats: any[]; saveGameId: string | null }>();
  
  players?.forEach(p => {
    if (!playerMap.has(p.player_id)) {
      playerMap.set(p.player_id, { 
        teamId: p.team_id, 
        stats: [],
        saveGameId: p.save_game_id || null
      });
    }
  });

  // Fetch all game stats for this season
  let statsQuery = supabase
    .from('player_game_stats')
    .select('*')
    .eq('season', season);
  
  // Filter by save_game_id if provided
  if (saveGameId) {
    statsQuery = statsQuery.eq('save_game_id', saveGameId);
  } else {
    statsQuery = statsQuery.is('save_game_id', null);
  }
  
  const { data: allStats, error: statsError } = await statsQuery;

  if (statsError) {
    throw new Error(`Failed to fetch stats: ${statsError.message}`);
  }

  // Group stats by player
  allStats?.forEach(stat => {
    const playerData = playerMap.get(stat.player_id);
    if (playerData) {
      playerData.stats.push(stat);
    }
  });

  // Determine conflict columns once
  // Note: The order matters - it should match the unique index order
  const conflictColumns = saveGameId
    ? 'save_game_id,player_id,season'
    : 'player_id,season';

  // Aggregate for each player (collect for batch upsert)
  for (const [playerId, { teamId, stats, saveGameId: playerSaveGameId }] of playerMap.entries()) {
    if (stats.length === 0) continue;

    try {
      // Sum all stat fields
      // Use sentinel UUID for NULL save_game_id to work with COALESCE-based unique index
      const SENTINEL_UUID = '00000000-0000-0000-0000-000000000000';
      const effectiveSaveGameId = playerSaveGameId || saveGameId || SENTINEL_UUID;
      
      const seasonStat: any = {
        player_id: playerId,
        team_id: teamId,
        season: season,
        games_played: stats.length,
        games_started: stats.filter(s => (s.snaps_played || 0) > 40).length, // Started if > 40 snaps
        save_game_id: effectiveSaveGameId, // Use sentinel for NULL to match unique index
      };

      // Sum all numeric fields
      const numericFields = [
        'passing_yards', 'passing_tds', 'interceptions', 'defensive_interceptions', 'completions', 'attempts',
        'rushing_yards', 'rushing_tds', 'rushing_attempts',
        'receiving_yards', 'receiving_tds', 'receptions', 'targets', 'fumbles',
        'tackles', 'solo_tackles', 'sacks', 'forced_fumbles', 'fumble_recoveries',
        'passes_defended', 'tfl',
        'field_goals_made', 'field_goals_attempted', 'extra_points_made',
        'punts', 'punt_yards',
      ];

      numericFields.forEach(field => {
        // Handle DECIMAL fields (sacks) differently
        if (field === 'sacks') {
          seasonStat[field] = stats.reduce((sum, s) => {
            const value = s[field];
            // Handle both number and string (from database DECIMAL)
            const numValue = typeof value === 'string' ? parseFloat(value) : (value || 0);
            return sum + numValue;
          }, 0);
        } else {
          seasonStat[field] = stats.reduce((sum, s) => sum + (s[field] || 0), 0);
        }
      });

      // Calculate average performance rating
      const ratings = stats
        .map(s => s.performance_rating)
        .filter(r => r !== null && r !== undefined) as number[];
      
      if (ratings.length > 0) {
        seasonStat.avg_performance_rating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
      }

      // Collect stats for batch upsert (skip record checking for performance)
      seasonStatsToUpsert.push(seasonStat);
    } catch (error) {
      errors.push(`Error aggregating stats for ${playerId}: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  // Batch upsert all season stats at once for better performance
  if (seasonStatsToUpsert.length > 0) {
    console.log(`[AggregateStats] Upserting ${seasonStatsToUpsert.length} season stats for season ${season}, saveGameId: ${saveGameId || 'null'}`);
    console.log(`[AggregateStats] Sample stat:`, JSON.stringify(seasonStatsToUpsert[0], null, 2));
    
    try {
      // Since the unique index uses COALESCE and Supabase's onConflict doesn't support expressions,
      // we'll use a delete-then-insert approach for the affected players
      // This ensures we don't have conflicts with the COALESCE-based unique index
      
      // First, delete existing season stats for these players (if any)
      const playerIds = seasonStatsToUpsert.map(s => s.player_id);
      const deleteQuery = supabase
        .from('player_season_stats')
        .delete()
        .eq('season', season)
        .in('player_id', playerIds);
      
      // If we have a saveGameId, also filter by it
      if (saveGameId) {
        deleteQuery.eq('save_game_id', saveGameId);
      } else {
        // For NULL save_game_id, delete both NULL and sentinel UUID
        const SENTINEL_UUID = '00000000-0000-0000-0000-000000000000';
        deleteQuery.or(`save_game_id.is.null,save_game_id.eq.${SENTINEL_UUID}`);
      }
      
      const { error: deleteError } = await deleteQuery;
      
      if (deleteError) {
        console.warn(`[AggregateStats] Warning deleting old stats (may not exist):`, deleteError.message);
        // Continue anyway - the insert might still work
      } else {
        console.log(`[AggregateStats] Deleted existing season stats for ${playerIds.length} players`);
      }
      
      // Now insert the new stats
      const insertResult = await supabase
        .from('player_season_stats')
        .insert(seasonStatsToUpsert)
        .select();

      if (insertResult.error) {
        console.error(`[AggregateStats] Insert error:`, insertResult.error);
        console.error(`[AggregateStats] Error details:`, JSON.stringify(insertResult.error, null, 2));
        console.error(`[AggregateStats] Error code:`, insertResult.error.code);
        console.error(`[AggregateStats] Error message:`, insertResult.error.message);
        console.error(`[AggregateStats] Error hint:`, insertResult.error.hint);
        console.error(`[AggregateStats] Sample stat being inserted:`, JSON.stringify(seasonStatsToUpsert[0], null, 2));
        
        // Try individual inserts as fallback
        console.log(`[AggregateStats] Attempting individual inserts as fallback...`);
        let successCount = 0;
        for (const stat of seasonStatsToUpsert) {
          try {
            // Delete existing for this player first
            const { error: delError } = await supabase
              .from('player_season_stats')
              .delete()
              .eq('player_id', stat.player_id)
              .eq('season', stat.season)
              .eq('save_game_id', stat.save_game_id);
            
            if (delError) {
              console.warn(`[AggregateStats] Warning deleting for player ${stat.player_id}:`, delError.message);
            }
            
            // Then insert
            const { error: singleError } = await supabase
              .from('player_season_stats')
              .insert(stat)
              .select();
            
            if (!singleError) {
              successCount++;
            } else {
              console.error(`[AggregateStats] Failed to insert stat for player ${stat.player_id}:`, singleError);
            }
          } catch (err) {
            console.error(`[AggregateStats] Exception inserting stat for player ${stat.player_id}:`, err);
          }
        }
        aggregated = successCount;
        console.log(`[AggregateStats] Fallback: Successfully inserted ${successCount}/${seasonStatsToUpsert.length} stats individually`);
        if (successCount < seasonStatsToUpsert.length) {
          errors.push(`Failed to insert ${seasonStatsToUpsert.length - successCount} stats. Batch error: ${insertResult.error.message}`);
        }
      } else {
        aggregated = insertResult.data?.length || seasonStatsToUpsert.length;
        console.log(`[AggregateStats] Successfully inserted ${aggregated} player season stats`);
      }
    } catch (batchError) {
      console.error(`[AggregateStats] Batch insert exception:`, batchError);
      errors.push(`Error during batch insert: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`);
    }
  } else {
    console.log(`[AggregateStats] No stats to upsert (seasonStatsToUpsert.length = 0)`);
    console.log(`[AggregateStats] This might mean no game stats were found. Check if player_game_stats has data for season ${season}${saveGameId ? ` with save_game_id ${saveGameId}` : ' with NULL save_game_id'}`);
  }

  return { aggregated, errors };
}

