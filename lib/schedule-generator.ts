// NFL-style schedule with 32 teams, 8 divisions, 17 games per team, 1 bye week
// Total: 32 teams * 17 games / 2 = 272 games

interface Team {
  id: string;
  division: string;
  conference: string;
}

interface Game {
  week: number;
  home_team_id: string;
  away_team_id: string;
}

// Seeded random number generator for deterministic schedules
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

function shuffleArray<T>(array: T[], seed?: number): T[] {
  const arr = [...array];
  const rng = seed !== undefined ? new SeededRandom(seed) : null;
  
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng 
      ? Math.floor(rng.next() * (i + 1))
      : Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateSchedule(teams: Team[], season: number = 2025): Game[] {
  if (teams.length !== 32) {
    throw new Error("Schedule generation requires exactly 32 teams");
  }

  // Create a deterministic seed from season and team IDs
  // This ensures the same season always generates the same schedule
  const teamIdsHash = teams
    .map(t => t.id)
    .sort()
    .join('')
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const seed = season * 1000 + (teamIdsHash % 1000);

  const games: Game[] = [];
  const teamGamesCount = new Map<string, number>();
  const teamWeekSchedule = new Map<string, Set<number>>();
  const teamByeWeeks = new Map<string, number>();

  // Initialize tracking
  teams.forEach(team => {
    teamGamesCount.set(team.id, 0);
    teamWeekSchedule.set(team.id, new Set());
  });

  // Organize teams by division
  const divisions = new Map<string, Team[]>();
  teams.forEach(team => {
    const divisionKey = `${team.conference}-${team.division}`;
    if (!divisions.has(divisionKey)) {
      divisions.set(divisionKey, []);
    }
    divisions.get(divisionKey)!.push(team);
  });

  // Validate division structure
  divisions.forEach((divTeams, key) => {
    if (divTeams.length !== 4) {
      console.warn(`Division ${key} has ${divTeams.length} teams (expected 4)`);
    }
  });

  // Assign bye weeks (weeks 6-14 are typical bye weeks)
  // CRITICAL: Each week must have an EVEN number of teams on bye
  // so the remaining teams can be paired for games
  // Use 8 bye weeks with 4 teams each = 32 teams total
  const byeWeekOptions = [6, 7, 8, 9, 10, 11, 12, 13]; // 8 weeks, 4 teams each
  const shuffledTeams = shuffleArray([...teams], seed);
  const teamsPerByeWeek = 4; // Even number ensures remaining teams can pair up
  
  shuffledTeams.forEach((team, index) => {
    const byeWeekIndex = Math.floor(index / teamsPerByeWeek);
    // Ensure we don't go beyond available bye weeks
    const byeWeek = byeWeekOptions[Math.min(byeWeekIndex, byeWeekOptions.length - 1)];
    teamByeWeeks.set(team.id, byeWeek);
  });
  
  // Verify bye week distribution (each week should have exactly 4 teams)
  const byeWeekCounts = new Map<number, number>();
  teamByeWeeks.forEach((byeWeek) => {
    byeWeekCounts.set(byeWeek, (byeWeekCounts.get(byeWeek) || 0) + 1);
  });
  
  // Ensure all bye weeks have even numbers of teams
  byeWeekCounts.forEach((count, week) => {
    if (count % 2 !== 0) {
      console.warn(`Bye week ${week} has odd number of teams (${count}), this may cause scheduling issues`);
    }
  });

  // Step 1: Schedule ALL division games (6 games per team)
  // Each team plays their 3 division opponents twice (home and away)
  divisions.forEach((divisionTeams) => {
    for (let i = 0; i < divisionTeams.length; i++) {
      for (let j = i + 1; j < divisionTeams.length; j++) {
        const team1 = divisionTeams[i];
        const team2 = divisionTeams[j];

        // Schedule both home and away games
        scheduleMatchup(team1, team2, games, teamGamesCount, teamWeekSchedule, teamByeWeeks, false);
        scheduleMatchup(team2, team1, games, teamGamesCount, teamWeekSchedule, teamByeWeeks, false);
      }
    }
  });

  console.log(`After division games: ${games.length} games scheduled`);
  
  // Verify bye week distribution
  const byeWeekDistribution = new Map<number, number>();
  teamByeWeeks.forEach((week) => {
    byeWeekDistribution.set(week, (byeWeekDistribution.get(week) || 0) + 1);
  });
  console.log('Bye week distribution:', Array.from(byeWeekDistribution.entries()).map(([week, count]) => 
    `Week ${week}: ${count} teams`
  ).join(', '));

  // Step 2: Generate all possible non-division matchups
  const allMatchups: Array<[Team, Team]> = [];
  
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const team1 = teams[i];
      const team2 = teams[j];

      // Skip if same division (already scheduled)
      if (team1.division === team2.division && team1.conference === team2.conference) {
        continue;
      }

      allMatchups.push([team1, team2]);
    }
  }

  // Shuffle for variety (deterministic based on seed)
  let shuffledMatchups = shuffleArray(allMatchups, seed + 1000);

  // Step 3: Schedule remaining games until all teams have exactly 17 games
  // Try multiple passes to ensure we get as many games as possible
  for (let pass = 0; pass < 3; pass++) {
    for (const [team1, team2] of shuffledMatchups) {
      const team1Games = teamGamesCount.get(team1.id)!;
      const team2Games = teamGamesCount.get(team2.id)!;

      // Only schedule if both teams need more games
      if (team1Games < 17 && team2Games < 17) {
        // Check if they've already played (avoid duplicates in later passes)
        const alreadyPlayed = games.some(g => 
          (g.home_team_id === team1.id && g.away_team_id === team2.id) ||
          (g.home_team_id === team2.id && g.away_team_id === team1.id)
        );
        
        if (!alreadyPlayed || pass === 0) {
          // Deterministically decide home/away based on team IDs
          const homeAwaySeed = (team1.id.charCodeAt(0) + team2.id.charCodeAt(0) + pass) % 2;
          const [home, away] = homeAwaySeed === 0 ? [team1, team2] : [team2, team1];
          scheduleMatchup(home, away, games, teamGamesCount, teamWeekSchedule, teamByeWeeks, pass > 1);
        }
      }

      // Check if all teams have exactly 17 games
      const allComplete = Array.from(teamGamesCount.values()).every(count => count === 17);
      if (allComplete) {
        break;
      }
    }
    
    // Check if we're done
    const allComplete = Array.from(teamGamesCount.values()).every(count => count === 17);
    if (allComplete) {
      break;
    }
    
    // Reshuffle for next pass (deterministic)
    if (pass < 2) {
      const remainingMatchups = allMatchups.filter(([t1, t2]) => {
        const t1Games = teamGamesCount.get(t1.id)!;
        const t2Games = teamGamesCount.get(t2.id)!;
        return t1Games < 17 && t2Games < 17;
      });
      shuffledMatchups = shuffleArray(remainingMatchups, seed + 2000 + pass);
    }
  }

  // Final verification and filling
  const incompleteTeams = Array.from(teamGamesCount.entries())
    .filter(([, count]) => count !== 17);
  
  if (incompleteTeams.length > 0) {
    console.warn('Incomplete teams:', incompleteTeams.map(([id, count]) => ({
      teamId: id,
      games: count
    })));
    
    // Fill remaining games by pairing incomplete teams
    fillRemainingGames(teams, games, teamGamesCount, teamWeekSchedule, teamByeWeeks, seed);
  }

  console.log(`Final schedule: ${games.length} games (expected 272)`);
  
  // Verify each team has 17 games
  const finalCounts = Array.from(teamGamesCount.entries()).map(([id, count]) => ({
    id,
    count
  }));
  
  const incorrectCounts = finalCounts.filter(t => t.count !== 17);
  if (incorrectCounts.length > 0) {
    console.error('Teams with incorrect game counts:', incorrectCounts);
    console.error(`Total incomplete teams: ${incorrectCounts.length}`);
    const missingGames = incorrectCounts.reduce((sum, t) => sum + (17 - t.count), 0);
    console.error(`Missing games: ${missingGames}`);
    
    // If we're missing exactly 3 games (269 total), it's likely a pairing issue
    if (missingGames === 3) {
      console.error('Likely issue: Odd number of teams available in some weeks due to bye week distribution');
    }
  } else {
    console.log('✅ All teams have exactly 17 games!');
  }

  return games;
}

function scheduleMatchup(
  homeTeam: Team,
  awayTeam: Team,
  games: Game[],
  teamGamesCount: Map<string, number>,
  teamWeekSchedule: Map<string, Set<number>>,
  teamByeWeeks: Map<string, number>,
  allowByeWeek: boolean = false
): boolean {
  const week = findAvailableWeek(
    [homeTeam.id, awayTeam.id],
    teamWeekSchedule,
    teamByeWeeks,
    1,
    allowByeWeek
  );

  if (week === -1) {
    return false; // No available week found
  }

  games.push({
    week,
    home_team_id: homeTeam.id,
    away_team_id: awayTeam.id,
  });

  teamGamesCount.set(homeTeam.id, teamGamesCount.get(homeTeam.id)! + 1);
  teamGamesCount.set(awayTeam.id, teamGamesCount.get(awayTeam.id)! + 1);
  teamWeekSchedule.get(homeTeam.id)!.add(week);
  teamWeekSchedule.get(awayTeam.id)!.add(week);

  return true;
}

function findAvailableWeek(
  teamIds: string[],
  teamWeekSchedule: Map<string, Set<number>>,
  teamByeWeeks: Map<string, number>,
  minWeek: number = 1,
  allowByeWeek: boolean = false
): number {
  const maxWeek = 18;
  
  // First pass: find a week where neither team has a bye and both are available
  if (!allowByeWeek) {
    for (let week = minWeek; week <= maxWeek; week++) {
      // Check if any team has a bye this week
      const hasBye = teamIds.some(id => teamByeWeeks.get(id) === week);
      if (hasBye) {
        continue;
      }

      // Check if all teams are available this week
      const allAvailable = teamIds.every(id => {
        const schedule = teamWeekSchedule.get(id);
        return schedule && !schedule.has(week);
      });

      if (allAvailable) {
        return week;
      }
    }
  }

  // Second pass: ignore bye weeks if needed to complete schedule
  for (let week = minWeek; week <= maxWeek; week++) {
    const allAvailable = teamIds.every(id => {
      const schedule = teamWeekSchedule.get(id);
      return schedule && !schedule.has(week);
    });

    if (allAvailable) {
      return week;
    }
  }

  // No available week found
  return -1;
}

function fillRemainingGames(
  teams: Team[],
  games: Game[],
  teamGamesCount: Map<string, number>,
  teamWeekSchedule: Map<string, Set<number>>,
  teamByeWeeks: Map<string, number>,
  seed: number
): void {
  console.log('Filling remaining games...');
  
  // Get teams that need more games, sorted by how many they need (most first)
  let incompleteTeams = teams
    .filter(team => (teamGamesCount.get(team.id) || 0) < 17)
    .sort((a, b) => {
      const aGames = teamGamesCount.get(a.id) || 0;
      const bGames = teamGamesCount.get(b.id) || 0;
      return (17 - aGames) - (17 - bGames); // Most needed first
    });

  let attempts = 0;
  const maxAttempts = 20000; // Increased for more thorough attempts
  let lastProgress = incompleteTeams.length;
  let stuckCount = 0;
  let lastGameCount = games.length;

  while (incompleteTeams.length > 0 && attempts < maxAttempts) {
    attempts++;
    
    // Update incomplete teams list every iteration to catch completed teams
    incompleteTeams = teams
      .filter(team => (teamGamesCount.get(team.id) || 0) < 17)
      .sort((a, b) => {
        const aGames = teamGamesCount.get(a.id) || 0;
        const bGames = teamGamesCount.get(b.id) || 0;
        return (17 - aGames) - (17 - bGames); // Most needed first
      });
    
    if (incompleteTeams.length === 0) break;
    
    // Check progress every 100 attempts
    if (attempts % 100 === 0) {
      const currentIncomplete = incompleteTeams.length;
      const currentGameCount = games.length;
      
      if (currentIncomplete === lastProgress && currentGameCount === lastGameCount) {
        stuckCount++;
        // If stuck for too long, skip to aggressive mode
        if (stuckCount > 20) {
          console.warn(`Stuck for ${stuckCount * 100} attempts, switching to aggressive mode`);
          // Force games more aggressively
        }
      } else {
        stuckCount = 0;
      }
      lastProgress = currentIncomplete;
      lastGameCount = currentGameCount;
    }

    const team1 = incompleteTeams[0];
    const team1Games = teamGamesCount.get(team1.id) || 0;
    const needed = 17 - team1Games;
    
    if (needed <= 0) {
      continue; // Will be filtered out in next iteration
    }
    
    // Try to find a match - prioritize other incomplete teams
    let matched = false;
    
    // First try: match with other incomplete teams
    for (const team2 of incompleteTeams.slice(1)) {
      const team2Games = teamGamesCount.get(team2.id) || 0;
      if (team2Games >= 17) continue;
      
      // Check if they've already played (avoid duplicates)
      const alreadyPlayed = games.some(g => 
        (g.home_team_id === team1.id && g.away_team_id === team2.id) ||
        (g.home_team_id === team2.id && g.away_team_id === team1.id)
      );
      
        if (!alreadyPlayed) {
          const homeAwaySeed = (team1.id.charCodeAt(0) + team2.id.charCodeAt(0) + attempts) % 2;
          const [home, away] = homeAwaySeed === 0 ? [team1, team2] : [team2, team1];
          const scheduled = scheduleMatchup(home, away, games, teamGamesCount, teamWeekSchedule, teamByeWeeks, false);
        
        if (scheduled) {
          matched = true;
          break;
        }
      }
    }
    
    // Second try: match with any team that has space and hasn't played this team
    if (!matched) {
      const shuffledAllTeams = shuffleArray([...teams], seed + attempts);
      for (const team2 of shuffledAllTeams) {
        if (team2.id === team1.id) continue;
        
        const team2Games = teamGamesCount.get(team2.id) || 0;
        if (team2Games >= 17) continue;
        
        // Check if they've already played
        const alreadyPlayed = games.some(g => 
          (g.home_team_id === team1.id && g.away_team_id === team2.id) ||
          (g.home_team_id === team2.id && g.away_team_id === team1.id)
        );
        
        if (!alreadyPlayed) {
          const homeAwaySeed = (team1.id.charCodeAt(0) + team2.id.charCodeAt(0)) % 2;
          const [home, away] = homeAwaySeed === 0 ? [team1, team2] : [team2, team1];
          const scheduled = scheduleMatchup(home, away, games, teamGamesCount, teamWeekSchedule, teamByeWeeks, false);
          
          if (scheduled) {
            matched = true;
            break;
          }
        }
      }
    }
    
    // Third try: allow bye weeks if needed
    if (!matched) {
      const shuffledAllTeams = shuffleArray([...teams], seed + attempts + 10000);
      for (const team2 of shuffledAllTeams) {
        if (team2.id === team1.id) continue;
        
        const team2Games = teamGamesCount.get(team2.id) || 0;
        if (team2Games >= 17) continue;
        
        const alreadyPlayed = games.some(g => 
          (g.home_team_id === team1.id && g.away_team_id === team2.id) ||
          (g.home_team_id === team2.id && g.away_team_id === team1.id)
        );
        
        if (!alreadyPlayed) {
          const homeAwaySeed = (team1.id.charCodeAt(0) + team2.id.charCodeAt(0) + attempts) % 2;
          const [home, away] = homeAwaySeed === 0 ? [team1, team2] : [team2, team1];
          const scheduled = scheduleMatchup(home, away, games, teamGamesCount, teamWeekSchedule, teamByeWeeks, true);
          
          if (scheduled) {
            matched = true;
            break;
          }
        }
      }
    }
    
    // Fourth try: force schedule even if they've played (only if desperate)
    if (!matched && needed > 1) {
      const shuffledAllTeams = shuffleArray([...teams], seed + attempts + 20000);
      for (const team2 of shuffledAllTeams) {
        if (team2.id === team1.id) continue;
        
        const team2Games = teamGamesCount.get(team2.id) || 0;
        if (team2Games >= 17) continue;
        
        const homeAwaySeed = (team1.id.charCodeAt(0) + team2.id.charCodeAt(0) + attempts) % 2;
        const [home, away] = homeAwaySeed === 0 ? [team1, team2] : [team2, team1];
        const scheduled = scheduleMatchup(home, away, games, teamGamesCount, teamWeekSchedule, teamByeWeeks, true);
        
        if (scheduled) {
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      // Last resort: force schedule by finding ANY available week
      // Be very aggressive - find any team that can play
      const team1Schedule = teamWeekSchedule.get(team1.id)!;
      
      // Try all weeks and all teams
      for (let week = 1; week <= 18; week++) {
        if (team1Schedule.has(week)) continue;
        
        // Try all teams, prioritizing incomplete ones
        const teamsToTry = [
          ...incompleteTeams.slice(1), // Other incomplete teams first
          ...teams.filter(t => t.id !== team1.id && (teamGamesCount.get(t.id) || 0) < 17) // Any incomplete team
        ];
        
        for (const team2 of teamsToTry) {
          if (team2.id === team1.id) continue;
          const team2Games = teamGamesCount.get(team2.id) || 0;
          if (team2Games >= 17) continue;
          
          const team2Schedule = teamWeekSchedule.get(team2.id)!;
          if (!team2Schedule.has(week)) {
            // Force the game - don't check if they've played
            games.push({
              week,
              home_team_id: team1.id,
              away_team_id: team2.id,
            });
            
            teamGamesCount.set(team1.id, team1Games + 1);
            teamGamesCount.set(team2.id, team2Games + 1);
            team1Schedule.add(week);
            team2Schedule.add(week);
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
      
      // If STILL no match, force a game even if both teams are already scheduled that week
      // This should rarely happen, but if it does, we need to complete the schedule
      if (!matched && needed > 0 && stuckCount > 15) {
        for (let week = 1; week <= 18; week++) {
          for (const team2 of incompleteTeams.slice(1)) {
            if (team2.id === team1.id) continue;
            const team2Games = teamGamesCount.get(team2.id) || 0;
            if (team2Games >= 17) continue;
            
            // Force the game even if there's a conflict - we'll handle it
            const team1Schedule = teamWeekSchedule.get(team1.id)!;
            const team2Schedule = teamWeekSchedule.get(team2.id)!;
            
            // Only force if at least one team is free this week
            if (!team1Schedule.has(week) || !team2Schedule.has(week)) {
              games.push({
                week,
                home_team_id: team1.id,
                away_team_id: team2.id,
              });
              
              teamGamesCount.set(team1.id, team1Games + 1);
              teamGamesCount.set(team2.id, team2Games + 1);
              team1Schedule.add(week);
              team2Schedule.add(week);
              matched = true;
              break;
            }
          }
          if (matched) break;
        }
      }
    }
  }

  // Final check - force complete any remaining teams
  const finalIncomplete = teams.filter(team => (teamGamesCount.get(team.id) || 0) < 17);
  if (finalIncomplete.length > 0) {
    console.warn(`Force completing ${finalIncomplete.length} remaining teams...`);
    
    // Pair up remaining incomplete teams and force games
    for (let i = 0; i < finalIncomplete.length; i += 2) {
      if (i + 1 >= finalIncomplete.length) {
        // Odd number - pair with any team that has space
        const team1 = finalIncomplete[i];
        const team1Games = teamGamesCount.get(team1.id) || 0;
        const needed = 17 - team1Games;
        
        if (needed > 0) {
          // Find any team with space
          for (const team2 of teams) {
            if (team2.id === team1.id) continue;
            const team2Games = teamGamesCount.get(team2.id) || 0;
            if (team2Games >= 17) continue;
            
            // Find any available week
            for (let week = 1; week <= 18; week++) {
              const team1Schedule = teamWeekSchedule.get(team1.id)!;
              const team2Schedule = teamWeekSchedule.get(team2.id)!;
              
              if (!team1Schedule.has(week) && !team2Schedule.has(week)) {
                games.push({
                  week,
                  home_team_id: team1.id,
                  away_team_id: team2.id,
                });
                
                teamGamesCount.set(team1.id, team1Games + 1);
                teamGamesCount.set(team2.id, team2Games + 1);
                team1Schedule.add(week);
                team2Schedule.add(week);
                break;
              }
            }
          }
        }
      } else {
        const team1 = finalIncomplete[i];
        const team2 = finalIncomplete[i + 1];
        const team1Games = teamGamesCount.get(team1.id) || 0;
        const team2Games = teamGamesCount.get(team2.id) || 0;
        
        if (team1Games < 17 && team2Games < 17) {
          // Find any available week for both
          for (let week = 1; week <= 18; week++) {
            const team1Schedule = teamWeekSchedule.get(team1.id)!;
            const team2Schedule = teamWeekSchedule.get(team2.id)!;
            
            if (!team1Schedule.has(week) && !team2Schedule.has(week)) {
              games.push({
                week,
                home_team_id: team1.id,
                away_team_id: team2.id,
              });
              
              teamGamesCount.set(team1.id, team1Games + 1);
              teamGamesCount.set(team2.id, team2Games + 1);
              team1Schedule.add(week);
              team2Schedule.add(week);
              break;
            }
          }
        }
      }
    }
  }
  
  if (attempts >= maxAttempts) {
    const stillIncomplete = teams.filter(team => (teamGamesCount.get(team.id) || 0) < 17);
    if (stillIncomplete.length > 0) {
      console.error('Max attempts reached while filling remaining games');
      console.error('Remaining incomplete teams:', stillIncomplete.map(t => ({
        id: t.id,
        games: teamGamesCount.get(t.id) || 0
      })));
    }
  }
}

