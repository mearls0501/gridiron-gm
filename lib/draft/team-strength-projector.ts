import { supabase } from "@/lib/supabase-client";

interface TeamStrengthScore {
  team_id: string;
  strength_score: number; // 0-100 scale, lower = weaker = earlier draft pick
  average_overall: number;
  average_potential: number;
  depth_score: number;
}

/**
 * Calculate team strength based on player overall and potential ratings
 * Similar to Madden's team strength calculation
 */
export async function calculateTeamStrength(
  teamId: string,
  saveGameId?: string | null
): Promise<TeamStrengthScore> {
  // Get all players on the team
  let playersQuery = supabase
    .from("players")
    .select("id, overall, potential, position")
    .eq("team_id", teamId);

  // Filter by save_game_id if players table has it (for future multi-league support)
  // Note: players table may not have save_game_id yet, so this is optional for now
  if (saveGameId) {
    // If players table gets save_game_id in the future, uncomment:
    // playersQuery = playersQuery.eq("save_game_id", saveGameId);
  }

  const { data: players, error } = await playersQuery;

  if (error || !players || players.length === 0) {
    // Return default strength if no players (weakest team = earliest pick)
    return {
      team_id: teamId,
      strength_score: 0,
      average_overall: 50,
      average_potential: 50,
      depth_score: 0,
    };
  }

  // Calculate average overall and potential
  const totalOverall = players.reduce((sum, p) => sum + (p.overall || 50), 0);
  const totalPotential = players.reduce((sum, p) => sum + (p.potential || 50), 0);
  const averageOverall = totalOverall / players.length;
  const averagePotential = totalPotential / players.length;

  // Calculate depth score (how good are backups vs starters)
  // Group by position and calculate starter vs backup quality
  const positionGroups: Record<string, number[]> = {};
  players.forEach((player) => {
    if (!positionGroups[player.position]) {
      positionGroups[player.position] = [];
    }
    positionGroups[player.position].push(player.overall || 50);
  });

  let depthScore = 0;
  let depthCount = 0;
  Object.values(positionGroups).forEach((ratings) => {
    if (ratings.length > 1) {
      // Sort descending to get starter and backups
      const sorted = [...ratings].sort((a, b) => b - a);
      const starter = sorted[0];
      const backup = sorted[1] || starter;
      // Depth score: how close backup is to starter (higher = better depth)
      const depth = Math.min(backup / starter, 1.0) * 100;
      depthScore += depth;
      depthCount++;
    }
  });
  const averageDepth = depthCount > 0 ? depthScore / depthCount : 50;

  // Calculate strength score
  // Weight: 40% current overall, 30% potential, 20% depth, 10% roster size
  const rosterSizeFactor = Math.min(players.length / 53, 1.0) * 10; // 53 is full NFL roster
  const strengthScore =
    averageOverall * 0.4 +
    averagePotential * 0.3 +
    averageDepth * 0.2 +
    rosterSizeFactor;

  return {
    team_id: teamId,
    strength_score: Math.max(0, Math.min(100, strengthScore)), // Clamp to 0-100
    average_overall: averageOverall,
    average_potential: averagePotential,
    depth_score: averageDepth,
  };
}

/**
 * Project draft order for a future season based on team strength
 * Returns teams ordered from weakest (earliest pick) to strongest (latest pick)
 */
export async function projectDraftOrder(
  season: number,
  saveGameId: string
): Promise<Array<{ team_id: string; strength_score: number }>> {
  // Get all teams
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id");

  if (teamsError || !teams) {
    throw new Error(`Failed to fetch teams: ${teamsError?.message}`);
  }

  // Calculate strength for each team
  const teamStrengths = await Promise.all(
    teams.map(async (team) => {
      const strength = await calculateTeamStrength(team.id, saveGameId);
      return {
        team_id: team.id,
        strength_score: strength.strength_score,
      };
    })
  );

  // Sort by strength (weaker teams = earlier picks)
  // Lower strength_score = weaker team = earlier draft pick
  teamStrengths.sort((a, b) => a.strength_score - b.strength_score);

  return teamStrengths;
}

/**
 * Convert team strength scores to draft order format
 * Compatible with the TeamStanding interface used in initialize-draft-picks
 */
export async function projectDraftOrderAsStandings(
  season: number,
  saveGameId: string
): Promise<
  Array<{
    team_id: string;
    wins: number;
    losses: number;
    ties: number;
    points_for: number;
    points_against: number;
    win_percentage: number;
    point_differential: number;
    is_playoff_team: boolean;
    playoff_seed: number | null;
  }>
> {
  const draftOrder = await projectDraftOrder(season, saveGameId);

  // Convert to standings format (all zeros since it's a projection)
  return draftOrder.map((team) => ({
    team_id: team.team_id,
    wins: 0,
    losses: 0,
    ties: 0,
    points_for: 0,
    points_against: 0,
    win_percentage: 0,
    point_differential: 0,
    is_playoff_team: false,
    playoff_seed: null,
  }));
}


