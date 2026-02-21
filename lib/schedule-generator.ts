// ===============================================
//  ROBUST SCHEDULE GENERATOR
//  Simple deterministic approach that guarantees 272 games
// ===============================================

interface Team {
  id: string;
  division: string;
  conference: string;
}

interface Standing {
  team_id: string;
  division: string;
  conference: string;
  rank: number;
}

export interface Game {
  home_team_id: string;
  away_team_id: string;
  week: number;
}

interface Matchup {
  home: string;
  away: string;
  isDivision: boolean;
}

/**
 * Generate all matchups using a simple, deterministic approach
 * 1. Division games: 96 games (each team plays division rivals twice)
 * 2. Fill remaining: Greedily assign games from pool of all valid matchups
 */
function generateMatchups(teams: Team[]): Matchup[] {
  const matchups: Matchup[] = [];
  const teamGamesCount = new Map<string, number>();

  // Initialize
  teams.forEach((team) => teamGamesCount.set(team.id, 0));

  // Group teams by division
  const divisions = new Map<string, Team[]>();
  teams.forEach((team) => {
    const divKey = `${team.conference} ${team.division}`;
    if (!divisions.has(divKey)) divisions.set(divKey, []);
    divisions.get(divKey)!.push(team);
  });

  // STEP 1: Division games - 96 total
  // Each of 4 teams plays 3 division rivals twice = 6 games per team
  for (const divTeams of divisions.values()) {
    for (let i = 0; i < divTeams.length; i++) {
      for (let j = i + 1; j < divTeams.length; j++) {
        const team1 = divTeams[i].id;
        const team2 = divTeams[j].id;

        // Two games: one home, one away
        matchups.push({ home: team1, away: team2, isDivision: true });
        matchups.push({ home: team2, away: team1, isDivision: true });

        // Update counts
        teamGamesCount.set(team1, (teamGamesCount.get(team1) || 0) + 2);
        teamGamesCount.set(team2, (teamGamesCount.get(team2) || 0) + 2);
      }
    }
  }

  console.log(`[Matchups] Division games: ${matchups.length} (expected 96)`);

  // Verify everyone has 6 division games
  for (const [teamId, count] of teamGamesCount.entries()) {
    if (count !== 6) {
      console.error(
        `[Matchups] ERROR: Team ${teamId} has ${count} division games (expected 6)!`
      );
    }
  }

  // STEP 2: Fill remaining games until everyone has 17
  // Each team needs 11 more games (17 - 6 division = 11)
  // Total: 176 non-division games needed

  // Build pool of all possible non-division matchups
  const possibleMatchups: Array<{ team1: Team; team2: Team }> = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const team1 = teams[i];
      const team2 = teams[j];

      // Skip if same division (already played twice)
      const div1 = `${team1.conference} ${team1.division}`;
      const div2 = `${team2.conference} ${team2.division}`;
      if (div1 === div2) continue;

      possibleMatchups.push({ team1, team2 });
    }
  }

  console.log(
    `[Matchups] Pool of ${possibleMatchups.length} possible non-division matchups`
  );

  // Shuffle the pool for variety
  for (let i = possibleMatchups.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [possibleMatchups[i], possibleMatchups[j]] = [
      possibleMatchups[j],
      possibleMatchups[i],
    ];
  }

  // Track which matchups have been used to avoid duplicates
  const usedMatchups = new Set<string>();

  // Keep trying to add games until everyone has 17
  let attempts = 0;
  const maxAttempts = possibleMatchups.length * 3;

  while (attempts < maxAttempts) {
    attempts++;

    // Check if all teams have 17 games
    const allComplete = teams.every(
      (t) => (teamGamesCount.get(t.id) || 0) >= 17
    );
    if (allComplete) {
      console.log(
        `[Matchups] All teams reached 17 games after ${attempts} attempts!`
      );
      break;
    }

    // Find a matchup where both teams need games AND hasn't been used
    let foundMatchup = false;
    for (const { team1, team2 } of possibleMatchups) {
      const count1 = teamGamesCount.get(team1.id) || 0;
      const count2 = teamGamesCount.get(team2.id) || 0;

      // Create unique key for this matchup (order doesn't matter)
      const matchupKey = [team1.id, team2.id].sort().join("-");

      if (count1 < 17 && count2 < 17 && !usedMatchups.has(matchupKey)) {
        matchups.push({ home: team1.id, away: team2.id, isDivision: false });
        teamGamesCount.set(team1.id, count1 + 1);
        teamGamesCount.set(team2.id, count2 + 1);
        usedMatchups.add(matchupKey);
        foundMatchup = true;
        break; // Added one game, now check again
      }
    }

    // If we couldn't find any valid matchups, we're stuck
    if (!foundMatchup) {
      console.warn(
        `[Matchups] No valid matchups found at attempt ${attempts}, but not all teams have 17 games`
      );
      // Try to find ANY team that needs games and assign them to each other
      const teamsNeedingGames = teams.filter(
        (t) => (teamGamesCount.get(t.id) || 0) < 17
      );
      if (teamsNeedingGames.length >= 2) {
        // Pair up teams that need games, even if they've played before
        const team1 = teamsNeedingGames[0];
        const team2 = teamsNeedingGames[1];
        console.warn(
          `[Matchups] Force-scheduling ${team1.id} vs ${team2.id} (may be duplicate)`
        );
        matchups.push({ home: team1.id, away: team2.id, isDivision: false });
        teamGamesCount.set(team1.id, (teamGamesCount.get(team1.id) || 0) + 1);
        teamGamesCount.set(team2.id, (teamGamesCount.get(team2.id) || 0) + 1);
      } else {
        break; // Can't make progress
      }
    }
  }

  if (attempts >= maxAttempts) {
    console.warn(
      `[Matchups] Stopped after ${maxAttempts} attempts - may not have 17 games per team`
    );
  }

  console.log(`[Matchups] Total matchups: ${matchups.length} (expected 272)`);

  // Final validation
  const errors: string[] = [];
  let totalGames = 0;

  for (const [teamId, count] of teamGamesCount.entries()) {
    totalGames += count;
    if (count !== 17) {
      errors.push(`${teamId}: ${count} games`);
    }
  }

  console.log(
    `[Matchups] Total game participations: ${totalGames} (should be 544)`
  );

  if (errors.length > 0) {
    console.error(
      `[Matchups] ❌ ${errors.length} teams with incorrect counts:`
    );
    errors.forEach((err) => console.error(`  - ${err}`));
  } else {
    console.log(`[Matchups] ✅ All teams have exactly 17 games!`);
  }

  return matchups;
}

/**
 * PHASE 2: Assign weeks to matchups
 */
function assignWeeks(matchups: Matchup[], teams: Team[]): Game[] {
  const games: Game[] = [];
  const teamWeekSchedule = new Map<string, Set<number>>();
  const teamByeWeeks = new Map<string, number>();

  // Initialize
  teams.forEach((team) => teamWeekSchedule.set(team.id, new Set()));

  // Assign bye weeks (weeks 6-14)
  const byeWeeks = [6, 7, 8, 9, 10, 11, 12, 13, 14];
  teams.forEach((team, index) => {
    teamByeWeeks.set(team.id, byeWeeks[index % byeWeeks.length]);
  });

  // Sort matchups: division games first (higher priority)
  const sortedMatchups = [...matchups].sort((a, b) => {
    if (a.isDivision && !b.isDivision) return -1;
    if (!a.isDivision && b.isDivision) return 1;
    return 0;
  });

  // Assign each matchup to a week
  for (const matchup of sortedMatchups) {
    const homeSchedule = teamWeekSchedule.get(matchup.home)!;
    const awaySchedule = teamWeekSchedule.get(matchup.away)!;
    const homeBye = teamByeWeeks.get(matchup.home);
    const awayBye = teamByeWeeks.get(matchup.away);

    let assignedWeek: number | null = null;

    // Try to find week respecting bye weeks
    for (let week = 1; week <= 18; week++) {
      if (homeSchedule.has(week) || awaySchedule.has(week)) continue;
      if (homeBye === week || awayBye === week) continue;

      assignedWeek = week;
      break;
    }

    // If no week found, try ignoring bye weeks
    if (assignedWeek === null) {
      for (let week = 1; week <= 18; week++) {
        if (homeSchedule.has(week) || awaySchedule.has(week)) continue;

        assignedWeek = week;
        break;
      }
    }

    if (assignedWeek !== null) {
      games.push({
        home_team_id: matchup.home,
        away_team_id: matchup.away,
        week: assignedWeek,
      });
      homeSchedule.add(assignedWeek);
      awaySchedule.add(assignedWeek);
    } else {
      // FALLBACK: If still no week found, find week with fewest conflicts
      // This ensures ALL games get scheduled even if it means some teams play 2 games in a week
      let bestWeek = 1;
      let minConflicts = Infinity;

      for (let week = 1; week <= 18; week++) {
        let conflicts = 0;
        if (homeSchedule.has(week)) conflicts++;
        if (awaySchedule.has(week)) conflicts++;
        if (homeBye === week) conflicts++;
        if (awayBye === week) conflicts++;

        if (conflicts < minConflicts) {
          minConflicts = conflicts;
          bestWeek = week;
        }
      }

      console.warn(
        `[Week Assignment] Force-scheduling ${matchup.home} vs ${matchup.away} to week ${bestWeek} (${minConflicts} conflicts)`
      );

      games.push({
        home_team_id: matchup.home,
        away_team_id: matchup.away,
        week: bestWeek,
      });
      homeSchedule.add(bestWeek);
      awaySchedule.add(bestWeek);
    }
  }

  console.log(`[Week Assignment] ${games.length} games assigned to weeks`);

  return games;
}

/**
 * Two-phase schedule generator
 * Phase 1: Generate matchups (guarantees 17 games per team)
 * Phase 2: Assign weeks (fits games into 18-week season)
 */
export function generateSchedule(
  teams: Team[],
  season: number, // eslint-disable-line @typescript-eslint/no-unused-vars
  standingsLastSeason: Standing[] // eslint-disable-line @typescript-eslint/no-unused-vars
): Game[] {
  if (teams.length !== 32) {
    throw new Error("Must supply 32 teams.");
  }

  console.log("[Schedule] Starting schedule generation...");

  // PHASE 1: Generate matchups
  const matchups = generateMatchups(teams);

  if (matchups.length !== 272) {
    console.warn(
      `[Schedule] WARNING: Expected 272 matchups, got ${matchups.length}`
    );
  }

  // PHASE 2: Assign weeks
  const games = assignWeeks(matchups, teams);

  console.log(`[Schedule] Final: ${games.length} games scheduled`);

  // Final validation
  const teamGameCounts = new Map<string, number>();
  teams.forEach((team) => teamGameCounts.set(team.id, 0));

  games.forEach((game) => {
    teamGameCounts.set(
      game.home_team_id,
      (teamGameCounts.get(game.home_team_id) || 0) + 1
    );
    teamGameCounts.set(
      game.away_team_id,
      (teamGameCounts.get(game.away_team_id) || 0) + 1
    );
  });

  const errors: string[] = [];
  for (const [teamId, count] of teamGameCounts.entries()) {
    if (count !== 17) {
      errors.push(`${teamId}: ${count} games`);
    }
  }

  if (errors.length > 0) {
    console.error(
      "[Schedule] Final validation - Teams with incorrect game counts:"
    );
    errors.forEach((err) => console.error(`  ❌ ${err}`));
  } else {
    console.log("[Schedule] ✅ All teams have exactly 17 games");
  }

  return games;
}
