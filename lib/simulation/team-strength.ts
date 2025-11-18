import { TeamWithRoster, TeamStrength, Player } from './types';

/**
 * Calculate team strength based on player ratings and depth
 */
export function calculateTeamStrength(team: TeamWithRoster): TeamStrength {
  const players = team.players || [];
  
  // Get starters by position (best overall rating)
  const getStarter = (position: string): Player | null => {
    const positionPlayers = players
      .filter(p => p.position === position)
      .sort((a, b) => b.overall - a.overall);
    return positionPlayers[0] || null;
  };

  const getAverageRating = (positions: string[]): number => {
    const positionPlayers = players.filter(p => positions.includes(p.position));
    if (positionPlayers.length === 0) return 50; // Default if no players
    const total = positionPlayers.reduce((sum, p) => sum + p.overall, 0);
    return total / positionPlayers.length;
  };

  // QB is critical (25% weight)
  const qb = getStarter('QB');
  const qbRating = qb ? qb.overall : 50;

  // Offensive line (15% weight) - average of OT, OG, C
  const olineRating = getAverageRating(['OT', 'OG', 'C']);

  // Skill positions (20% weight) - RB, WR, TE
  const skillRating = getAverageRating(['RB', 'WR', 'TE']);

  // Defensive line (15% weight) - DE, DT
  const dlineRating = getAverageRating(['DE', 'DT']);

  // Linebackers (10% weight)
  const lbRating = getAverageRating(['LB']);

  // Secondary (15% weight) - CB, S
  const secondaryRating = getAverageRating(['CB', 'S']);

  // Special teams (5% weight) - K, P
  const specialTeamsRating = getAverageRating(['K', 'P']);

  // Calculate weighted overall ratings
  const offense = (qbRating * 0.25) + (olineRating * 0.15) + (skillRating * 0.20) + (olineRating * 0.10);
  const defense = (dlineRating * 0.20) + (lbRating * 0.15) + (secondaryRating * 0.15);
  const specialTeams = specialTeamsRating;

  // Overall team strength
  const overall = (offense * 0.50) + (defense * 0.45) + (specialTeams * 0.05);

  return {
    overall,
    offense,
    defense,
    specialTeams,
    qbRating,
    olineRating,
    skillRating,
    dlineRating,
    secondaryRating,
  };
}

/**
 * Get the best player at a position for a team
 */
export function getBestPlayerAtPosition(team: TeamWithRoster, position: string): Player | null {
  const positionPlayers = team.players
    .filter(p => p.position === position)
    .sort((a, b) => b.overall - a.overall);
  return positionPlayers[0] || null;
}

/**
 * Get average rating for a position group
 */
export function getPositionGroupRating(team: TeamWithRoster, positions: string[]): number {
  const players = team.players.filter(p => positions.includes(p.position));
  if (players.length === 0) return 50;
  const total = players.reduce((sum, p) => sum + p.overall, 0);
  return total / players.length;
}

