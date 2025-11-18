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

  // Update each player
  for (const [playerId, ratings] of playerStatsMap.entries()) {
    try {
      // Get current player data
      const { data: player, error: playerError } = await supabase
        .from('players')
        .select('*')
        .eq('id', playerId)
        .single();

      if (playerError || !player) {
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
        const { error: updateError } = await supabase
          .from('players')
          .update({ overall: Math.round(newOverall) })
          .eq('id', playerId);

        if (updateError) {
          errors.push(`Failed to update player ${playerId}: ${updateError.message}`);
        } else {
          updated++;
        }
      }
    } catch (error) {
      errors.push(`Error processing player ${playerId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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

  // For each player, get their season average so far
  for (const stat of gameStats || []) {
    if (!stat.performance_rating) continue;

    try {
      // Get player
      const { data: player, error: playerError } = await supabase
        .from('players')
        .select('*')
        .eq('id', stat.player_id)
        .single();

      if (playerError || !player) {
        errors.push(`Player ${stat.player_id} not found`);
        continue;
      }

      // Get all game stats for this player this season
      const { data: seasonStats, error: seasonError } = await supabase
        .from('player_game_stats')
        .select('performance_rating')
        .eq('player_id', stat.player_id)
        .eq('season', season)
        .not('performance_rating', 'is', null);

      if (seasonError) {
        errors.push(`Failed to fetch season stats for ${stat.player_id}`);
        continue;
      }

      const ratings = (seasonStats || []).map(s => s.performance_rating as number);
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

        const { error: updateError } = await supabase
          .from('players')
          .update({ overall: Math.round(newOverall) })
          .eq('id', stat.player_id);

        if (updateError) {
          errors.push(`Failed to update player ${stat.player_id}`);
        } else {
          updated++;
        }
      }
    } catch (error) {
      errors.push(`Error processing player ${stat.player_id}: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  return { updated, errors };
}

/**
 * Aggregate season stats from game stats
 * This should be called periodically to keep season stats up to date
 */
export async function aggregateSeasonStats(
  season: number
): Promise<{ aggregated: number; errors: string[] }> {
  const errors: string[] = [];
  let aggregated = 0;

  // Get all unique players who played this season
  const { data: players, error: playersError } = await supabase
    .from('player_game_stats')
    .select('player_id, team_id')
    .eq('season', season);

  if (playersError) {
    throw new Error(`Failed to fetch players: ${playersError.message}`);
  }

  // Group by player
  const playerMap = new Map<string, { teamId: string; stats: any[] }>();
  
  players?.forEach(p => {
    if (!playerMap.has(p.player_id)) {
      playerMap.set(p.player_id, { teamId: p.team_id, stats: [] });
    }
  });

  // Fetch all game stats for this season
  const { data: allStats, error: statsError } = await supabase
    .from('player_game_stats')
    .select('*')
    .eq('season', season);

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

  // Aggregate for each player
  for (const [playerId, { teamId, stats }] of playerMap.entries()) {
    if (stats.length === 0) continue;

    try {
      // Sum all stat fields
      const seasonStat: any = {
        player_id: playerId,
        team_id: teamId,
        season: season,
        games_played: stats.length,
        games_started: stats.filter(s => (s.snaps_played || 0) > 40).length, // Started if > 40 snaps
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

      // Upsert season stats
      const { error: upsertError } = await supabase
        .from('player_season_stats')
        .upsert(seasonStat, { onConflict: 'player_id,season' });

      if (upsertError) {
        errors.push(`Failed to aggregate stats for ${playerId}: ${upsertError.message}`);
      } else {
        aggregated++;
        
        // Check for season record-breaking performances
        try {
          // Fetch player info for logging
          const { data: player } = await supabase
            .from('players')
            .select('full_name, position')
            .eq('id', playerId)
            .single();
          
          if (player) {
            // Check season passing records
            if (seasonStat.passing_yards && seasonStat.passing_yards > 0) {
              checkRecordBreak(
                'passing_yards',
                seasonStat.passing_yards,
                NFL_RECORDS.season.passing.yards,
                player.full_name,
                'season'
              );
            }

            if (seasonStat.passing_tds && seasonStat.passing_tds > NFL_RECORDS.season.passing.touchdowns) {
              checkRecordBreak(
                'passing_touchdowns',
                seasonStat.passing_tds,
                NFL_RECORDS.season.passing.touchdowns,
                player.full_name,
                'season'
              );
            }

            // Check season rushing records
            if (seasonStat.rushing_yards && seasonStat.rushing_yards > 0) {
              checkRecordBreak(
                'rushing_yards',
                seasonStat.rushing_yards,
                NFL_RECORDS.season.rushing.yards,
                player.full_name,
                'season'
              );
            }

            if (seasonStat.rushing_tds && seasonStat.rushing_tds > NFL_RECORDS.season.rushing.touchdowns) {
              checkRecordBreak(
                'rushing_touchdowns',
                seasonStat.rushing_tds,
                NFL_RECORDS.season.rushing.touchdowns,
                player.full_name,
                'season'
              );
            }

            // Check season receiving records
            if (seasonStat.receiving_yards && seasonStat.receiving_yards > 0) {
              checkRecordBreak(
                'receiving_yards',
                seasonStat.receiving_yards,
                NFL_RECORDS.season.receiving.yards,
                player.full_name,
                'season'
              );
            }

            if (seasonStat.receptions && seasonStat.receptions > NFL_RECORDS.season.receiving.receptions) {
              checkRecordBreak(
                'receptions',
                seasonStat.receptions,
                NFL_RECORDS.season.receiving.receptions,
                player.full_name,
                'season'
              );
            }

            // Check season defensive records
            const sacksValue = typeof seasonStat.sacks === 'string' 
              ? parseFloat(seasonStat.sacks) 
              : (seasonStat.sacks || 0);
            if (sacksValue > NFL_RECORDS.season.defense.sacks) {
              checkRecordBreak(
                'sacks',
                sacksValue,
                NFL_RECORDS.season.defense.sacks,
                player.full_name,
                'season'
              );
            }

            if (seasonStat.defensive_interceptions && seasonStat.defensive_interceptions > NFL_RECORDS.season.defense.interceptions) {
              checkRecordBreak(
                'defensive_interceptions',
                seasonStat.defensive_interceptions,
                NFL_RECORDS.season.defense.interceptions,
                player.full_name,
                'season'
              );
            }
          }
        } catch (recordError) {
          // Don't fail aggregation if record checking fails
          console.warn(`Failed to check records for player ${playerId}:`, recordError);
        }
      }
    } catch (error) {
      errors.push(`Error aggregating stats for ${playerId}: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  return { aggregated, errors };
}

