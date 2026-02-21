import { supabase } from "@/lib/supabase-client";

interface Prospect {
  id: string;
  full_name: string;
  position: string;
  overall: number;
  potential: number;
  traits?: any;
}

/**
 * Analyze team needs based on roster composition
 */
async function analyzeTeamNeeds(
  teamId: string,
  saveGameId: string
): Promise<string[]> {
  try {
    // Get current roster using player_team_assignments for save game isolation
    let players: Array<{ position: string }> = [];

    if (saveGameId) {
      // Use player_team_assignments to get roster for this save game
      const { data: assignments, error: assignmentsError } = await supabase
        .from("player_team_assignments")
        .select(
          `
          players:player_id (
            position
          )
        `
        )
        .eq("team_id", teamId)
        .eq("save_game_id", saveGameId);

      if (!assignmentsError && assignments && assignments.length > 0) {
        // Extract position from nested players object
        players = assignments
          .map((a: any) => a.players)
          .filter(Boolean)
          .map((p: any) => ({ position: p.position }));
      }
    }

    // Fallback to base players table if no assignments found
    if (players.length === 0) {
      const { data: basePlayers, error: baseError } = await supabase
        .from("players")
        .select("position")
        .eq("team_id", teamId);

      if (!baseError && basePlayers) {
        players = basePlayers;
      }
    }

    if (!players || players.length === 0) {
      // No players, need everything
      console.log(
        `[analyzeTeamNeeds] Team ${teamId} has no players, returning all positions as needs`
      );
      return ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K", "P"];
    }

    // Count players by position
    const positionCounts = new Map<string, number>();
    players.forEach((player) => {
      const pos = player.position;
      positionCounts.set(pos, (positionCounts.get(pos) || 0) + 1);
    });

    // Determine needs (positions with fewer players)
    const needs: string[] = [];
    const positionThresholds: Record<string, number> = {
      QB: 2,
      RB: 3,
      WR: 5,
      TE: 3,
      OL: 8,
      DL: 7,
      LB: 6,
      DB: 8,
      K: 1,
      P: 1,
    };

    for (const [position, threshold] of Object.entries(positionThresholds)) {
      const count = positionCounts.get(position) || 0;
      if (count < threshold) {
        needs.push(position);
      }
    }

    // Log team needs for debugging
    if (needs.length > 0) {
      console.log(
        `[analyzeTeamNeeds] Team ${teamId} needs: ${needs.join(", ")}`
      );
    } else {
      console.log(
        `[analyzeTeamNeeds] Team ${teamId} has no specific needs, will use best available`
      );
    }

    // If no specific needs, return empty array (will use best available)
    return needs;
  } catch (error) {
    console.error("Error analyzing team needs:", error);
    return []; // Fallback to best available
  }
}

/**
 * Select best available prospect for CPU team
 */
export async function selectCPUProspect(
  teamId: string,
  availableProspects: Prospect[],
  saveGameId: string
): Promise<Prospect | null> {
  if (availableProspects.length === 0) {
    console.log(
      `[selectCPUProspect] No available prospects for team ${teamId}`
    );
    return null;
  }

  // Analyze team needs
  const needs = await analyzeTeamNeeds(teamId, saveGameId);

  // Filter prospects by needs if we have specific needs
  let candidates = availableProspects;
  if (needs.length > 0) {
    // Prioritize prospects that fill needs
    const needProspects = availableProspects.filter((p) =>
      needs.includes(p.position)
    );
    if (needProspects.length > 0) {
      console.log(
        `[selectCPUProspect] Team ${teamId} filtering ${needProspects.length} prospects that match needs from ${availableProspects.length} total`
      );
      candidates = needProspects;
    } else {
      console.log(
        `[selectCPUProspect] Team ${teamId} has needs but no prospects match, using best available`
      );
    }
  }

  // Sort by overall rating (best available)
  candidates.sort((a, b) => {
    // Primary: Overall rating
    if (b.overall !== a.overall) {
      return b.overall - a.overall;
    }
    // Secondary: Potential
    if (b.potential !== a.potential) {
      return b.potential - a.potential;
    }
    // Tertiary: Alphabetical
    return a.full_name.localeCompare(b.full_name);
  });

  const selected = candidates[0] || null;
  if (selected) {
    console.log(
      `[selectCPUProspect] Team ${teamId} selected ${selected.full_name} (${selected.position}, OVR: ${selected.overall}, POT: ${selected.potential})`
    );
  } else {
    console.warn(
      `[selectCPUProspect] Team ${teamId} could not select a prospect from ${availableProspects.length} available`
    );
  }

  return selected;
}

/**
 * Get the next available pick for a team
 * currentPickOverall represents the NEXT pick to be made (not the last made pick)
 * So we query for picks >= currentPickOverall to include the current pick
 */
export async function getNextPick(
  season: number,
  saveGameId: string,
  currentPickOverall: number
): Promise<{
  pickId: string;
  teamId: string;
  pickOverall: number;
  round: number;
} | null> {
  const { data: nextPick } = await supabase
    .from("draft_picks")
    .select("id, owning_team_id, pick_overall, round")
    .eq("season", season)
    .eq("save_game_id", saveGameId)
    .gte("pick_overall", currentPickOverall) // Use >= to include current pick
    .is("selected_player_id", null)
    .order("pick_overall", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextPick) {
    return null;
  }

  return {
    pickId: nextPick.id,
    teamId: nextPick.owning_team_id,
    pickOverall: nextPick.pick_overall,
    round: nextPick.round,
  };
}

/**
 * Check if a team is a CPU team (not user-controlled)
 * For now, we'll assume all teams except the selectedTeamId are CPU
 * This can be enhanced later with a user_team_id field in teams table
 */
export function isCPUTeam(teamId: string, userTeamId: string | null): boolean {
  return userTeamId !== null && teamId !== userTeamId;
}
