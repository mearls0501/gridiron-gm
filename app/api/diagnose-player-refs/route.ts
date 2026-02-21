import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Check if player_game_stats references players that don't exist
 * This causes stats to not appear due to INNER JOIN failures
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const saveGameId = url.searchParams.get('saveGameId');
    const gameId = url.searchParams.get('gameId');

    // Get a sample of stats
    let statsQuery = supabase
      .from("player_game_stats")
      .select("player_id, game_id, team_id, season, week, save_game_id");

    if (gameId) {
      statsQuery = statsQuery.eq("game_id", gameId);
    } else if (saveGameId) {
      statsQuery = statsQuery.eq("save_game_id", saveGameId);
    }

    const { data: stats } = await statsQuery.limit(100);

    if (!stats || stats.length === 0) {
      return NextResponse.json({
        message: "No stats found",
        stats_count: 0,
      });
    }

    // Get unique player IDs from stats
    const playerIds = [...new Set(stats.map(s => s.player_id))];

    // Check how many exist in players table
    const { data: playersInTable } = await supabase
      .from("players")
      .select("id")
      .in("id", playerIds);

    const playersInTableIds = new Set(playersInTable?.map(p => p.id) || []);

    // Check draft_prospects table
    const { data: prospectsInTable } = await supabase
      .from("draft_prospects")
      .select("id")
      .in("id", playerIds);

    const prospectsInTableIds = new Set(prospectsInTable?.map(p => p.id) || []);

    // Find missing players
    const missingPlayers = playerIds.filter(
      id => !playersInTableIds.has(id) && !prospectsInTableIds.has(id)
    );

    // Sample stats with missing players
    const statsWithMissingPlayers = stats.filter(
      s => missingPlayers.includes(s.player_id)
    ).slice(0, 10);

    // Sample stats with players in players table
    const statsWithPlayersInTable = stats.filter(
      s => playersInTableIds.has(s.player_id)
    ).slice(0, 10);

    // Sample stats with players in prospects table
    const statsWithProspectsInTable = stats.filter(
      s => prospectsInTableIds.has(s.player_id)
    ).slice(0, 10);

    return NextResponse.json({
      summary: {
        total_stats_checked: stats.length,
        unique_player_ids: playerIds.length,
        players_in_players_table: playersInTableIds.size,
        players_in_prospects_table: prospectsInTableIds.size,
        players_not_found: missingPlayers.length,
      },
      breakdown: {
        percentage_in_players_table: Math.round((playersInTableIds.size / playerIds.length) * 100),
        percentage_in_prospects_table: Math.round((prospectsInTableIds.size / playerIds.length) * 100),
        percentage_missing: Math.round((missingPlayers.length / playerIds.length) * 100),
      },
      samples: {
        stats_with_missing_players: statsWithMissingPlayers,
        stats_with_players_in_table: statsWithPlayersInTable,
        stats_with_prospects_in_table: statsWithProspectsInTable,
      },
      issue: prospectsInTableIds.size > 0 ? 
        "FOUND ISSUE: Stats reference draft_prospects but JOIN uses players table" :
        missingPlayers.length > 0 ?
        "FOUND ISSUE: Stats reference player IDs that don't exist in any table" :
        "No issue found - all player IDs exist in players table",
      recommendation: prospectsInTableIds.size > 0 ?
        "Change INNER JOIN to LEFT JOIN or use a UNION to include both players and draft_prospects" :
        missingPlayers.length > 0 ?
        "Clean up orphaned stats or investigate why player IDs are invalid" :
        "Stats should display correctly",
    });

  } catch (error) {
    console.error('Error diagnosing player refs:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}



