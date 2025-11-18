/**
 * NFL Tiebreaker Rules
 * 
 * For playoff seeding:
 * 1. Win percentage (wins + 0.5 * ties) / games played
 * 2. Head-to-head (if applicable)
 * 3. Division record (for division games)
 * 4. Conference record (for conference games)
 * 5. Common games (minimum 4)
 * 6. Strength of victory
 * 7. Strength of schedule
 * 8. Point differential
 * 9. Points scored
 * 10. Coin flip
 * 
 * For draft order (non-playoff teams):
 * 1. Win percentage (lower = earlier pick)
 * 2. Strength of schedule (weaker = earlier pick)
 * 3. Point differential (worse = earlier pick)
 * 4. Points scored (fewer = earlier pick)
 * 5. Coin flip
 */

import { supabase } from "@/lib/supabase-client";

export interface TeamRecord {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  conference: string;
  division: string;
}

export interface HeadToHeadResult {
  team1Id: string;
  team2Id: string;
  team1Wins: number;
  team2Wins: number;
  ties: number;
}

/**
 * Calculate win percentage
 */
export function calculateWinPercentage(wins: number, losses: number, ties: number): number {
  const games = wins + losses + ties;
  if (games === 0) return 0;
  return (wins + ties * 0.5) / games;
}

/**
 * Get head-to-head record between two teams
 */
export async function getHeadToHead(
  team1Id: string,
  team2Id: string,
  season: number
): Promise<HeadToHeadResult> {
  const { data: games } = await supabase
    .from("games")
    .select("home_team_id, away_team_id, home_score, away_score")
    .eq("season", season)
    .eq("played", true)
    .or(`and(home_team_id.eq.${team1Id},away_team_id.eq.${team2Id}),and(home_team_id.eq.${team2Id},away_team_id.eq.${team1Id})`);

  let team1Wins = 0;
  let team2Wins = 0;
  let ties = 0;

  games?.forEach(game => {
    if (!game.home_score || !game.away_score) return;

    const team1IsHome = game.home_team_id === team1Id;
    const team1Score = team1IsHome ? game.home_score : game.away_score;
    const team2Score = team1IsHome ? game.away_score : game.home_score;

    if (team1Score > team2Score) {
      team1Wins++;
    } else if (team2Score > team1Score) {
      team2Wins++;
    } else {
      ties++;
    }
  });

  return { team1Id, team2Id, team1Wins, team2Wins, ties };
}

/**
 * Get division record for a team
 */
export async function getDivisionRecord(
  teamId: string,
  season: number,
  conference: string,
  division: string
): Promise<{ wins: number; losses: number; ties: number }> {
  // Get all teams in the division
  const { data: divisionTeams } = await supabase
    .from("teams")
    .select("id")
    .eq("conference", conference)
    .eq("division", division);

  const divisionTeamIds = divisionTeams?.map(t => t.id) || [];

  // Get games against division opponents
  const { data: games } = await supabase
    .from("games")
    .select("home_team_id, away_team_id, home_score, away_score")
    .eq("season", season)
    .eq("played", true)
    .or(`and(home_team_id.eq.${teamId},away_team_id.in.(${divisionTeamIds.join(",")})),and(home_team_id.in.(${divisionTeamIds.join(",")}),away_team_id.eq.${teamId})`);

  let wins = 0;
  let losses = 0;
  let ties = 0;

  games?.forEach(game => {
    if (!game.home_score || !game.away_score) return;
    if (game.home_team_id === teamId && !divisionTeamIds.includes(game.away_team_id)) return;
    if (game.away_team_id === teamId && !divisionTeamIds.includes(game.home_team_id)) return;

    const isHome = game.home_team_id === teamId;
    const teamScore = isHome ? game.home_score : game.away_score;
    const opponentScore = isHome ? game.away_score : game.home_score;

    if (teamScore > opponentScore) {
      wins++;
    } else if (opponentScore > teamScore) {
      losses++;
    } else {
      ties++;
    }
  });

  return { wins, losses, ties };
}

/**
 * Get conference record for a team
 */
export async function getConferenceRecord(
  teamId: string,
  season: number,
  conference: string
): Promise<{ wins: number; losses: number; ties: number }> {
  // Get all teams in the conference
  const { data: conferenceTeams } = await supabase
    .from("teams")
    .select("id")
    .eq("conference", conference);

  const conferenceTeamIds = conferenceTeams?.map(t => t.id).filter(id => id !== teamId) || [];

  // Get games against conference opponents
  const { data: games } = await supabase
    .from("games")
    .select("home_team_id, away_team_id, home_score, away_score")
    .eq("season", season)
    .eq("played", true)
    .or(`and(home_team_id.eq.${teamId},away_team_id.in.(${conferenceTeamIds.join(",")})),and(home_team_id.in.(${conferenceTeamIds.join(",")}),away_team_id.eq.${teamId})`);

  let wins = 0;
  let losses = 0;
  let ties = 0;

  games?.forEach(game => {
    if (!game.home_score || !game.away_score) return;

    const isHome = game.home_team_id === teamId;
    const teamScore = isHome ? game.home_score : game.away_score;
    const opponentScore = isHome ? game.away_score : game.home_score;

    if (teamScore > opponentScore) {
      wins++;
    } else if (opponentScore > teamScore) {
      losses++;
    } else {
      ties++;
    }
  });

  return { wins, losses, ties };
}

/**
 * Compare two teams for playoff seeding
 * Returns: -1 if team1 should be seeded higher, 1 if team2 should be seeded higher, 0 if equal
 */
export async function comparePlayoffTeams(
  team1: TeamRecord,
  team2: TeamRecord,
  season: number,
  isDivisionTiebreaker: boolean = false
): Promise<number> {
  // 1. Win percentage
  const team1WP = calculateWinPercentage(team1.wins, team1.losses, team1.ties);
  const team2WP = calculateWinPercentage(team2.wins, team2.losses, team2.ties);
  
  if (Math.abs(team1WP - team2WP) > 0.001) {
    return team2WP > team1WP ? 1 : -1;
  }

  // 2. Head-to-head (if teams played each other)
  const h2h = await getHeadToHead(team1.teamId, team2.teamId, season);
  if (h2h.team1Wins + h2h.team2Wins + h2h.ties > 0) {
    if (h2h.team1Wins > h2h.team2Wins) return -1;
    if (h2h.team2Wins > h2h.team1Wins) return 1;
  }

  // 3. Division record (if both in same division)
  if (isDivisionTiebreaker && team1.division === team2.division) {
    const team1Div = await getDivisionRecord(team1.teamId, season, team1.conference, team1.division);
    const team2Div = await getDivisionRecord(team2.teamId, season, team2.conference, team2.division);
    const team1DivWP = calculateWinPercentage(team1Div.wins, team1Div.losses, team1Div.ties);
    const team2DivWP = calculateWinPercentage(team2Div.wins, team2Div.losses, team2Div.ties);
    
    if (Math.abs(team1DivWP - team2DivWP) > 0.001) {
      return team2DivWP > team1DivWP ? 1 : -1;
    }
  }

  // 4. Conference record
  const team1Conf = await getConferenceRecord(team1.teamId, season, team1.conference);
  const team2Conf = await getConferenceRecord(team2.teamId, season, team2.conference);
  const team1ConfWP = calculateWinPercentage(team1Conf.wins, team1Conf.losses, team1Conf.ties);
  const team2ConfWP = calculateWinPercentage(team2Conf.wins, team2Conf.losses, team2Conf.ties);
  
  if (Math.abs(team1ConfWP - team2ConfWP) > 0.001) {
    return team2ConfWP > team1ConfWP ? 1 : -1;
  }

  // 5. Point differential
  const team1Diff = team1.pointsFor - team1.pointsAgainst;
  const team2Diff = team2.pointsFor - team2.pointsAgainst;
  
  if (team1Diff !== team2Diff) {
    return team2Diff > team1Diff ? 1 : -1;
  }

  // 6. Points scored
  if (team1.pointsFor !== team2.pointsFor) {
    return team2.pointsFor > team1.pointsFor ? 1 : -1;
  }

  // 7. Coin flip (random for now)
  return Math.random() < 0.5 ? -1 : 1;
}

/**
 * Compare two teams for draft order (non-playoff teams)
 * Returns: -1 if team1 should pick earlier, 1 if team2 should pick earlier, 0 if equal
 */
export async function compareDraftOrder(
  team1: TeamRecord,
  team2: TeamRecord,
  season: number
): Promise<number> {
  // 1. Win percentage (lower = earlier pick)
  const team1WP = calculateWinPercentage(team1.wins, team1.losses, team1.ties);
  const team2WP = calculateWinPercentage(team2.wins, team2.losses, team2.ties);
  
  if (Math.abs(team1WP - team2WP) > 0.001) {
    return team1WP < team2WP ? -1 : 1;
  }

  // 2. Strength of schedule (weaker = earlier pick)
  // Simplified: use point differential as proxy (worse differential = weaker schedule)
  const team1Diff = team1.pointsFor - team1.pointsAgainst;
  const team2Diff = team2.pointsFor - team2.pointsAgainst;
  
  if (team1Diff !== team2Diff) {
    return team1Diff < team2Diff ? -1 : 1;
  }

  // 3. Points scored (fewer = earlier pick)
  if (team1.pointsFor !== team2.pointsFor) {
    return team1.pointsFor < team2.pointsFor ? -1 : 1;
  }

  // 4. Coin flip
  return Math.random() < 0.5 ? -1 : 1;
}

