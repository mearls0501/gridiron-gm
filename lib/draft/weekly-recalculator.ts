import { supabase } from "@/lib/supabase-client";

interface TeamStanding {
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
}

/**
 * Recalculate draft pick positions for a season based on current standings
 * This is called weekly to update draft order as teams' records change
 * Only updates pick_overall and pick_in_round, preserves trades
 */
export async function recalculateDraftPicksForSeason(
  season: number,
  saveGameId: string
): Promise<void> {
  // Get all teams
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, name, abbreviation, conference, division")
    .order("conference")
    .order("division")
    .order("name");

  if (teamsError || !teams) {
    throw new Error(`Failed to fetch teams: ${teamsError?.message}`);
  }

  // Calculate current standings from games
  let gamesQuery = supabase
    .from("games")
    .select("home_team_id, away_team_id, home_score, away_score")
    .eq("season", season)
    .eq("played", true);

  if (saveGameId) {
    gamesQuery = gamesQuery.eq("save_game_id", saveGameId);
  } else {
    gamesQuery = gamesQuery.is("save_game_id", null);
  }

  const { data: games, error: gamesError } = await gamesQuery;

  if (gamesError) {
    throw new Error(`Failed to fetch games: ${gamesError.message}`);
  }

  const teamStatsMap = new Map<string, TeamStanding>();

  teams.forEach((team) => {
    teamStatsMap.set(team.id, {
      team_id: team.id,
      wins: 0,
      losses: 0,
      ties: 0,
      points_for: 0,
      points_against: 0,
      win_percentage: 0,
      point_differential: 0,
      is_playoff_team: false,
      playoff_seed: null,
    });
  });

  games?.forEach((game) => {
    if (game.home_score === null || game.away_score === null) return;

    const homeStat = teamStatsMap.get(game.home_team_id)!;
    const awayStat = teamStatsMap.get(game.away_team_id)!;

    homeStat.points_for += game.home_score;
    homeStat.points_against += game.away_score;
    awayStat.points_for += game.away_score;
    awayStat.points_against += game.home_score;

    if (game.home_score > game.away_score) {
      homeStat.wins += 1;
      awayStat.losses += 1;
    } else if (game.away_score > game.home_score) {
      homeStat.losses += 1;
      awayStat.wins += 1;
    } else {
      homeStat.ties += 1;
      awayStat.ties += 1;
    }
  });

  teamStatsMap.forEach((stat) => {
    const games = stat.wins + stat.losses + stat.ties;
    stat.win_percentage = games > 0 ? (stat.wins + stat.ties * 0.5) / games : 0;
    stat.point_differential = stat.points_for - stat.points_against;
  });

  const standings = Array.from(teamStatsMap.values());

  // Check if playoffs exist to determine playoff teams
  let playoffSeedsQuery = supabase
    .from("playoff_seeds")
    .select("team_id, seed")
    .eq("season", season);

  if (saveGameId) {
    playoffSeedsQuery = playoffSeedsQuery.eq("save_game_id", saveGameId);
  } else {
    playoffSeedsQuery = playoffSeedsQuery.is("save_game_id", null);
  }

  const { data: playoffSeeds } = await playoffSeedsQuery;

  const playoffTeamIds = new Set(playoffSeeds?.map((p) => p.team_id) || []);
  const playoffSeedMap = new Map(
    playoffSeeds?.map((p) => [p.team_id, p.seed]) || []
  );

  standings.forEach((stat) => {
    stat.is_playoff_team = playoffTeamIds.has(stat.team_id);
    stat.playoff_seed = playoffSeedMap.get(stat.team_id) || null;
  });

  // Separate playoff and non-playoff teams
  const playoffTeams = standings.filter((s) => s.is_playoff_team);
  const nonPlayoffTeams = standings.filter((s) => !s.is_playoff_team);

  // Sort non-playoff teams by draft order (worst record first)
  nonPlayoffTeams.sort((a, b) => {
    const wpDiff = a.win_percentage - b.win_percentage;
    if (Math.abs(wpDiff) > 0.0001) {
      return wpDiff > 0 ? 1 : -1;
    }

    const diffDiff = a.point_differential - b.point_differential;
    if (Math.abs(diffDiff) > 0.0001) {
      return diffDiff > 0 ? 1 : -1;
    }

    if (a.points_for !== b.points_for) {
      return a.points_for - b.points_for;
    }

    return Math.random() < 0.5 ? -1 : 1;
  });

  // Sort playoff teams by playoff seed
  playoffTeams.sort((a, b) => {
    const aSeed = a.playoff_seed || 99;
    const bSeed = b.playoff_seed || 99;
    return bSeed - aSeed;
  });

  // Combine: non-playoff teams get picks 1-N, playoff teams get picks N+1-32
  const draftOrder = [...nonPlayoffTeams, ...playoffTeams];

  // Get existing draft picks for this season (to preserve trades)
  let existingPicksQuery = supabase
    .from("draft_picks")
    .select("*")
    .eq("season", season)
    .eq("save_game_id", saveGameId);

  const { data: existingPicks, error: picksError } = await existingPicksQuery;

  if (picksError) {
    throw new Error(`Failed to fetch existing picks: ${picksError.message}`);
  }

  if (!existingPicks || existingPicks.length === 0) {
    // No picks to update
    return;
  }

  // Create a map of team_id -> draft position (0-indexed)
  const teamPositionMap = new Map<string, number>();
  draftOrder.forEach((team, index) => {
    teamPositionMap.set(team.team_id, index);
  });

  // Update each pick's position based on current draft order
  // Preserve owning_team_id (trades) and original_team_id
  const updates: Array<{
    id: string;
    pick_overall: number;
    pick_in_round: number;
  }> = [];

  for (let round = 1; round <= 7; round++) {
    for (let i = 0; i < draftOrder.length; i++) {
      const team = draftOrder[i];
      const overallPick = (round - 1) * 32 + i + 1;

      // Find the pick for this team in this round
      // Use original_team_id to find the pick (before trades)
      const pick = existingPicks.find(
        (p) =>
          p.round === round &&
          p.original_team_id === team.team_id &&
          p.season === season
      );

      if (pick) {
        updates.push({
          id: pick.id,
          pick_overall: overallPick,
          pick_in_round: i + 1,
        });
      }
    }
  }

  // Batch update picks
  if (updates.length > 0) {
    // Update in batches to avoid payload size limits
    const batchSize = 100;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      const updatePromises = batch.map((update) =>
        supabase
          .from("draft_picks")
          .update({
            pick_overall: update.pick_overall,
            pick_in_round: update.pick_in_round,
            updated_at: new Date().toISOString(),
          })
          .eq("id", update.id)
      );

      await Promise.all(updatePromises);
    }
  }
}


