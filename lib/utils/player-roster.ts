/**
 * Utility functions for querying player rosters with save game isolation
 * Uses player_team_assignments table to track team assignments per save game
 */

import { supabase } from "@/lib/supabase-client";

/**
 * Get players for a team, respecting save game isolation
 * Returns players and prospects with their current team assignment for the save game
 */
export async function getTeamRoster(
  teamId: string,
  saveGameId?: string | null
) {
  if (saveGameId) {
    // Get assignments for both players and prospects
    const { data: assignments, error } = await supabase
      .from("player_team_assignments")
      .select(`
        player_id,
        prospect_id,
        team_id,
        players (*),
        draft_prospects (*)
      `)
      .eq("team_id", teamId)
      .eq("save_game_id", saveGameId);

    if (!error && assignments && assignments.length > 0) {
      // Map assignments to player/prospect data
      return assignments.map((assignment: any) => {
        // If it's a player (seed player), use players data
        if (assignment.player_id && assignment.players) {
          return {
            ...assignment.players,
            team_id: assignment.team_id,
            is_prospect: false,
          };
        }
        // If it's a prospect (drafted), use draft_prospects data
        if (assignment.prospect_id && assignment.draft_prospects) {
          return {
            ...assignment.draft_prospects,
            team_id: assignment.team_id,
            is_prospect: true,
            is_rookie: true, // All drafted prospects are rookies
          };
        }
        return null;
      }).filter(Boolean);
    }

    // If no assignments found, fall back to base players table
    // (for backward compatibility or if assignments table doesn't exist)
  }

  // Fallback: query base players table
  // Limit to 53 players (NFL roster size) to prevent loading too many players
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("team_id", teamId)
    .limit(53);

  if (error) {
    throw error;
  }

  return (data || []).map((p: any) => ({ ...p, is_prospect: false }));
}

/**
 * Get a player's or prospect's current team for a save game
 * Returns assignment team_id if exists, otherwise base team_id from players table
 */
export async function getPlayerTeam(
  playerId: string,
  saveGameId?: string | null
): Promise<string | null> {
  if (saveGameId) {
    // Check for assignment (could be player_id or prospect_id)
    const { data: assignment } = await supabase
      .from("player_team_assignments")
      .select("team_id")
      .or(`player_id.eq.${playerId},prospect_id.eq.${playerId}`)
      .eq("save_game_id", saveGameId)
      .maybeSingle();

    if (assignment) {
      return assignment.team_id;
    }
  }

  // Fallback to base team_id from players table
  const { data: player } = await supabase
    .from("players")
    .select("team_id")
    .eq("id", playerId)
    .maybeSingle();

  return player?.team_id || null;
}

