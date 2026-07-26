// @ts-nocheck
import { supabase } from "@/lib/supabase-client";

export interface CareerRecord {
  statName: string;
  value: number;
  playerId: string;
  playerName: string;
}

export interface PlayerRecord {
  statName: string;
  value: number;
  isRecord: boolean;
  recordHolder?: {
    playerId: string;
    playerName: string;
    recordValue: number;
  };
}

/**
 * Get league-wide career records for a specific save game
 * Returns the top record holder for each major stat category
 */
export async function getCareerRecords(
  saveGameId?: string | null
): Promise<Record<string, CareerRecord>> {
  const records: Record<string, CareerRecord> = {};

  // Build query for lifetime stats
  let query = supabase
    .from("player_lifetime_stats")
    .select(
      `
      player_id,
      passing_yards,
      passing_tds,
      rushing_yards,
      rushing_tds,
      receiving_yards,
      receiving_tds,
      tackles,
      sacks,
      defensive_interceptions,
      players!inner (id, full_name)
    `
    );

  if (saveGameId) {
    query = query.eq("save_game_id", saveGameId);
  } else {
    // Handle NULL save_game_id with sentinel UUID
    query = query.eq("save_game_id", "00000000-0000-0000-0000-000000000000");
  }

  const { data: lifetimeStats, error } = await query;

  if (error || !lifetimeStats || lifetimeStats.length === 0) {
    return records;
  }

  // Find record holders for each stat category
  const statCategories = [
    { key: "passing_yards", name: "Career Passing Yards" },
    { key: "passing_tds", name: "Career Passing Touchdowns" },
    { key: "rushing_yards", name: "Career Rushing Yards" },
    { key: "rushing_tds", name: "Career Rushing Touchdowns" },
    { key: "receiving_yards", name: "Career Receiving Yards" },
    { key: "receiving_tds", name: "Career Receiving Touchdowns" },
    { key: "tackles", name: "Career Tackles" },
    { key: "sacks", name: "Career Sacks" },
    { key: "defensive_interceptions", name: "Career Interceptions" },
  ];

  for (const category of statCategories) {
    let maxValue = -1;
    let recordHolder: CareerRecord | null = null;

    for (const stat of lifetimeStats) {
      const value =
        typeof stat[category.key] === "string"
          ? parseFloat(stat[category.key] as string)
          : (stat[category.key] as number) || 0;

      if (value > maxValue) {
        maxValue = value;
        const player = stat.players as { id: string; full_name: string };
        recordHolder = {
          statName: category.name,
          value: maxValue,
          playerId: player.id,
          playerName: player.full_name,
        };
      }
    }

    if (recordHolder && maxValue > 0) {
      records[category.key] = recordHolder;
    }
  }

  return records;
}

/**
 * Check which career records a specific player holds
 * Returns an array of records the player holds or is close to
 */
export async function getPlayerRecords(
  playerId: string,
  saveGameId?: string | null
): Promise<PlayerRecord[]> {
  // Get player's lifetime stats
  let playerQuery = supabase
    .from("player_lifetime_stats")
    .select(
      `
      player_id,
      passing_yards,
      passing_tds,
      rushing_yards,
      rushing_tds,
      receiving_yards,
      receiving_tds,
      tackles,
      sacks,
      defensive_interceptions,
      players!inner (id, full_name)
    `
    )
    .eq("player_id", playerId)
    .single();

  if (saveGameId) {
    playerQuery = playerQuery.eq("save_game_id", saveGameId);
  } else {
    playerQuery = playerQuery.eq(
      "save_game_id",
      "00000000-0000-0000-0000-000000000000"
    );
  }

  const { data: playerStats, error: playerError } = await playerQuery;

  if (playerError || !playerStats) {
    return [];
  }

  // Get all career records
  const allRecords = await getCareerRecords(saveGameId);

  // Compare player stats against records
  const playerRecords: PlayerRecord[] = [];
  const statCategories = [
    { key: "passing_yards", name: "Career Passing Yards" },
    { key: "passing_tds", name: "Career Passing Touchdowns" },
    { key: "rushing_yards", name: "Career Rushing Yards" },
    { key: "rushing_tds", name: "Career Rushing Touchdowns" },
    { key: "receiving_yards", name: "Career Receiving Yards" },
    { key: "receiving_tds", name: "Career Receiving Touchdowns" },
    { key: "tackles", name: "Career Tackles" },
    { key: "sacks", name: "Career Sacks" },
    { key: "defensive_interceptions", name: "Career Interceptions" },
  ];

  for (const category of statCategories) {
    const playerValue =
      typeof playerStats[category.key] === "string"
        ? parseFloat(playerStats[category.key] as string)
        : (playerStats[category.key] as number) || 0;

    const record = allRecords[category.key];

    const playerRecord: PlayerRecord = {
      statName: category.name,
      value: playerValue,
      isRecord: false,
    };

    if (record) {
      if (record.playerId === playerId) {
        playerRecord.isRecord = true;
      } else {
        playerRecord.recordHolder = {
          playerId: record.playerId,
          playerName: record.playerName,
          recordValue: record.value,
        };
      }
    }

    playerRecords.push(playerRecord);
  }

  return playerRecords;
}

/**
 * Get the top N players for a specific stat category
 */
export async function getTopPlayersForStat(
  statKey: string,
  limit: number = 10,
  saveGameId?: string | null
): Promise<Array<{ playerId: string; playerName: string; value: number }>> {
  let query = supabase
    .from("player_lifetime_stats")
    .select(
      `
      player_id,
      ${statKey},
      players!inner (id, full_name)
    `
    )
    .order(statKey, { ascending: false })
    .limit(limit);

  if (saveGameId) {
    query = query.eq("save_game_id", saveGameId);
  } else {
    query = query.eq("save_game_id", "00000000-0000-0000-0000-000000000000");
  }

  const { data: stats, error } = await query;

  if (error || !stats) {
    return [];
  }

  return stats.map((stat) => {
    const value =
      typeof stat[statKey] === "string"
        ? parseFloat(stat[statKey] as string)
        : (stat[statKey] as number) || 0;
    const player = stat.players as { id: string; full_name: string };

    return {
      playerId: player.id,
      playerName: player.full_name,
      value,
    };
  });
}



