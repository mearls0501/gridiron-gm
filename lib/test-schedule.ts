// @ts-nocheck
// Test script for schedule generation
// Run with: npx tsx lib/test-schedule.ts

import { generateSchedule } from './schedule-generator';

// Create mock NFL teams
function createMockTeams() {
  const conferences = ['AFC', 'NFC'];
  const divisions = ['East', 'North', 'South', 'West'];
  const teamNames: Record<string, Record<string, string[]>> = {
    AFC: {
      East: ['Patriots', 'Bills', 'Dolphins', 'Jets'],
      North: ['Ravens', 'Steelers', 'Browns', 'Bengals'],
      South: ['Titans', 'Colts', 'Texans', 'Jaguars'],
      West: ['Chiefs', 'Raiders', 'Chargers', 'Broncos'],
    },
    NFC: {
      East: ['Cowboys', 'Eagles', 'Giants', 'Commanders'],
      North: ['Packers', 'Vikings', 'Bears', 'Lions'],
      South: ['Saints', 'Buccaneers', 'Falcons', 'Panthers'],
      West: ['49ers', 'Seahawks', 'Rams', 'Cardinals'],
    },
  };

  interface TestTeam {
    id: string;
    name: string;
    abbreviation: string;
    conference: string;
    division: string;
  }
  const teams: TestTeam[] = [];
  let id = 1;

  for (const conference of conferences) {
    for (const division of divisions) {
      for (const name of teamNames[conference][division]) {
        teams.push({
          id: id.toString(),
          name,
          abbreviation: name.substring(0, 3).toUpperCase(),
          conference,
          division,
        });
        id++;
      }
    }
  }

  return teams;
}

function testSchedule() {
  console.log('🏈 Testing NFL Schedule Generator\n');
  console.log('=' .repeat(60));

  const teams = createMockTeams();
  console.log(`✓ Created ${teams.length} teams\n`);

  const games = generateSchedule(teams, 2025);
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Schedule Statistics:\n');
  console.log(`Total Games: ${games.length}`);
  console.log(`Expected Games: 272`);
  console.log(`Match: ${games.length === 272 ? '✅' : '❌'}\n`);

  // Verify each team has exactly 17 games
  const teamGameCounts = new Map<string, number>();
  teams.forEach(team => teamGameCounts.set(team.id, 0));

  games.forEach(game => {
    teamGameCounts.set(game.home_team_id, (teamGameCounts.get(game.home_team_id) || 0) + 1);
    teamGameCounts.set(game.away_team_id, (teamGameCounts.get(game.away_team_id) || 0) + 1);
  });

  console.log('Games per team:');
  const incorrectTeams: string[] = [];
  teamGameCounts.forEach((count, teamId) => {
    const team = teams.find(t => t.id === teamId);
    if (count !== 17) {
      incorrectTeams.push(`${team?.name || teamId}: ${count} games`);
    }
  });

  if (incorrectTeams.length === 0) {
    console.log('✅ All teams have exactly 17 games\n');
  } else {
    console.log('❌ Teams with incorrect game counts:');
    incorrectTeams.forEach(msg => console.log(`   ${msg}`));
    console.log();
  }

  // Check games per week
  const gamesPerWeek = new Map<number, number>();
  games.forEach(game => {
    gamesPerWeek.set(game.week, (gamesPerWeek.get(game.week) || 0) + 1);
  });

  console.log('Games per week:');
  for (let week = 1; week <= 18; week++) {
    const count = gamesPerWeek.get(week) || 0;
    console.log(`  Week ${week.toString().padStart(2, ' ')}: ${count.toString().padStart(2, ' ')} games`);
  }

  // Verify division matchups
  console.log('\n🏆 Division Matchup Verification:\n');
  const divisionMatchups = new Map<string, Set<string>>();
  
  games.forEach(game => {
    const homeTeam = teams.find(t => t.id === game.home_team_id);
    const awayTeam = teams.find(t => t.id === game.away_team_id);
    
    if (homeTeam && awayTeam && 
        homeTeam.division === awayTeam.division && 
        homeTeam.conference === awayTeam.conference) {
      const key = `${homeTeam.id}-${awayTeam.id}`;
      if (!divisionMatchups.has(key)) {
        divisionMatchups.set(key, new Set());
      }
      divisionMatchups.get(key)!.add(`${homeTeam.name} vs ${awayTeam.name}`);
    }
  });

  console.log(`Division games scheduled: ${divisionMatchups.size} unique matchups`);
  console.log(`Expected: 96 (32 teams * 3 division opponents = 96 matchups)`);
  console.log(`Match: ${divisionMatchups.size === 96 ? '✅' : '❌'}\n`);

  // Final summary
  console.log('='.repeat(60));
  console.log('\n🎯 Final Result:\n');
  
  const allTestsPassed = 
    games.length === 272 && 
    incorrectTeams.length === 0 &&
    divisionMatchups.size === 96;

  if (allTestsPassed) {
    console.log('✅ ALL TESTS PASSED! Schedule is valid.');
    console.log('   • 272 total games');
    console.log('   • 17 games per team');
    console.log('   • Division matchups correct');
  } else {
    console.log('❌ SOME TESTS FAILED. Please review the output above.');
  }
  
  console.log('\n' + '='.repeat(60));
}

// Run the test
testSchedule();

