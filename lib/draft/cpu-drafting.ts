import { supabase } from "@/lib/supabase-client";

interface Prospect {
  id: string;
  full_name: string;
  position: string;
  overall: number;
  potential: number;
  traits?: any;
}

interface TeamRoster {
  position: string;
  count: number;
}

/**
 * Analyze team needs based on roster composition
 */
async function analyzeTeamNeeds(teamId: string, saveGameId: string): Promise<string[]> {
  try {
    // Get current roster
    const { data: players } = await supabase
      .from("players")
      .select("position")
      .eq("team_id", teamId);

    if (!players || players.length === 0) {
      // No players, need everything
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
    return null;
  }

  // Analyze team needs
  const needs = await analyzeTeamNeeds(teamId, saveGameId);

  // Filter prospects by needs if we have specific needs
  let candidates = availableProspects;
  if (needs.length > 0) {
    // Prioritize prospects that fill needs
    const needProspects = availableProspects.filter((p) => needs.includes(p.position));
    if (needProspects.length > 0) {
      candidates = needProspects;
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

  return candidates[0] || null;
}

/**
 * Get the next available pick for a team
 */
export async function getNextPick(
  season: number,
  saveGameId: string,
  currentPickOverall: number
): Promise<{ pickId: string; teamId: string; pickOverall: number; round: number } | null> {
  const { data: nextPick } = await supabase
    .from("draft_picks")
    .select("id, owning_team_id, pick_overall, round")
    .eq("season", season)
    .eq("save_game_id", saveGameId)
    .gt("pick_overall", currentPickOverall)
    .is("selected_player_id", null)
    .order("pick_overall", { ascending: true })
    .limit(1)
    .single();

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

