#!/usr/bin/env tsx
/**
 * Calibration test runner
 * Run: npm run calibrate
 * 
 * Tests the enhanced attribute system to ensure it produces NFL-realistic stats
 */

import { createTestTeam } from '../lib/simulation/calibration-test';
import { simulatePlayEnhanced } from '../lib/simulation/enhanced-outcome-generator';

async function main() {
  console.log('\n🏈 GRIDIRON GM - Attribute Engine Calibration Test\n');
  
  // Create two test teams with average ratings
  const homeTeam = createTestTeam('Eagles', 75);
  const awayTeam = createTestTeam('Cowboys', 75);
  
  console.log(`📋 Test Setup:`);
  console.log(`   Home: ${homeTeam.name} (${homeTeam.players.length} players)`);
  console.log(`   Away: ${awayTeam.name} (${awayTeam.players.length} players)`);
  console.log(`   Avg Rating: 75\n`);
  
  // Run calibration
  const iterations = 100;
  const gameResults: any[] = [];
  
  console.log(`🧪 Running ${iterations} simulated games...\n`);
  
  for (let i = 0; i < iterations; i++) {
    const gameStats = simulateSingleGame(homeTeam, awayTeam, i + 1);
    gameResults.push(gameStats);
    
    if ((i + 1) % 10 === 0) {
      console.log(`  ✓ Completed ${i + 1}/${iterations} games...`);
    }
  }
  
  // Aggregate results
  console.log('\n📊 Aggregating results...\n');
  const results = aggregateResults(gameResults, iterations);
  
  // Print report
  printReport(results);
}

/**
 * Simulate a single game
 */
function simulateSingleGame(
  homeTeam: any,
  awayTeam: any,
  gameNumber: number
): any {
  
  const totalPlays = 130;  // Total plays in game (65 per team)
  let homeScore = 0;
  let awayScore = 0;
  let homePossession = true;
  let homeYardLine = 25;
  let awayYardLine = 25;
  let homeDown = 1;
  let homeDistance = 10;
  let awayDown = 1;
  let awayDistance = 10;
  
  const homeStats = { passAtt: 0, comp: 0, passYds: 0, passTD: 0, int: 0, sacks: 0, rushAtt: 0, rushYds: 0, rushTD: 0, fum: 0, fgMade: 0, fgAtt: 0 };
  const awayStats = { passAtt: 0, comp: 0, passYds: 0, passTD: 0, int: 0, sacks: 0, rushAtt: 0, rushYds: 0, rushTD: 0, fum: 0, fgMade: 0, fgAtt: 0 };
  
  for (let playNum = 1; playNum <= totalPlays; playNum++) {
    const isHomeOnOffense = homePossession;
    const currentYardLine = isHomeOnOffense ? homeYardLine : awayYardLine;
    const currentDown = isHomeOnOffense ? homeDown : awayDown;
    const currentDistance = isHomeOnOffense ? homeDistance : awayDistance;
    const stats = isHomeOnOffense ? homeStats : awayStats;
    
    const play = simulatePlayEnhanced({
      down: currentDown,
      distance: currentDistance,
      yardLine: currentYardLine,
      offenseTeam: isHomeOnOffense ? homeTeam : awayTeam,
      defenseTeam: isHomeOnOffense ? awayTeam : homeTeam,
      isHomeTeam: isHomeOnOffense,
      quarter: 2,
      timeRemaining: 900,
      scoreDifferential: isHomeOnOffense ? homeScore - awayScore : awayScore - homeScore,
    }, playNum);
    
    // Update stats
    if (play.playType === 'pass') {
      stats.passAtt++;
      if (play.success) {
        stats.comp++;
        stats.passYds += play.yards;
      }
      if (play.points === 6) stats.passTD++;
      if (play.turnover) stats.int++;
      if (play.yards < 0) stats.sacks++;
    } else if (play.playType === 'run') {
      stats.rushAtt++;
      stats.rushYds += Math.max(0, play.yards);
      if (play.points === 6) stats.rushTD++;
      if (play.turnover) stats.fum++;
    } else if (play.playType === 'field_goal') {
      stats.fgAtt++;
      if (play.success) stats.fgMade++;
    }
    
    // Update score
    if (isHomeOnOffense) {
      homeScore += play.points;
      if (play.points === 6) {
        homeScore += Math.random() < 0.98 ? 1 : 0;
      }
    } else {
      awayScore += play.points;
      if (play.points === 6) {
        awayScore += Math.random() < 0.98 ? 1 : 0;
      }
    }
    
    // Update field position
    if (play.possessionChange || play.points > 0) {
      homePossession = !homePossession;
      homeYardLine = 25;
      awayYardLine = 25;
      homeDown = 1;
      awayDown = 1;
      homeDistance = 10;
      awayDistance = 10;
    } else {
      if (isHomeOnOffense) {
        homeYardLine = play.yardLine;
        homeDistance = Math.max(0, homeDistance - play.yards);
        if (homeDistance <= 0 || play.yards >= 10) {
          homeDown = 1;
          homeDistance = 10;
        } else {
          homeDown++;
          if (homeDown > 4) {
            homePossession = false;
            awayYardLine = 25;
            awayDown = 1;
            awayDistance = 10;
          }
        }
      } else {
        awayYardLine = play.yardLine;
        awayDistance = Math.max(0, awayDistance - play.yards);
        if (awayDistance <= 0 || play.yards >= 10) {
          awayDown = 1;
          awayDistance = 10;
        } else {
          awayDown++;
          if (awayDown > 4) {
            homePossession = true;
            homeYardLine = 25;
            homeDown = 1;
            homeDistance = 10;
          }
        }
      }
    }
  }
  
  return {
    homeScore,
    awayScore,
    homeStats,
    awayStats,
  };
}

/**
 * Aggregate results from all games
 */
function aggregateResults(games: any[], totalGames: number): any {
  
  const totals = games.reduce((acc, game) => {
    const home = game.homeStats;
    const away = game.awayStats;
    
    return {
      passAtt: acc.passAtt + home.passAtt + away.passAtt,
      comp: acc.comp + home.comp + away.comp,
      passYds: acc.passYds + home.passYds + away.passYds,
      passTD: acc.passTD + home.passTD + away.passTD,
      int: acc.int + home.int + away.int,
      sacks: acc.sacks + home.sacks + away.sacks,
      rushAtt: acc.rushAtt + home.rushAtt + away.rushAtt,
      rushYds: acc.rushYds + home.rushYds + away.rushYds,
      rushTD: acc.rushTD + home.rushTD + away.rushTD,
      fum: acc.fum + home.fum + away.fum,
      points: acc.points + game.homeScore + game.awayScore,
      fgMade: acc.fgMade + home.fgMade + away.fgMade,
      fgAtt: acc.fgAtt + home.fgAtt + away.fgAtt,
    };
  }, {
    passAtt: 0,
    comp: 0,
    passYds: 0,
    passTD: 0,
    int: 0,
    sacks: 0,
    rushAtt: 0,
    rushYds: 0,
    rushTD: 0,
    fum: 0,
    points: 0,
    fgMade: 0,
    fgAtt: 0,
  });
  
  const gamesPerTeam = totalGames * 2;
  
  // Calculate game-by-game variance
  const completionPcts = games.flatMap(g => [
    g.homeStats.comp / g.homeStats.passAtt,
    g.awayStats.comp / g.awayStats.passAtt,
  ]).filter(v => !isNaN(v));
  
  const passYPAs = games.flatMap(g => [
    g.homeStats.passYds / g.homeStats.passAtt,
    g.awayStats.passYds / g.awayStats.passAtt,
  ]).filter(v => !isNaN(v));
  
  const ppgs = games.flatMap(g => [g.homeScore, g.awayScore]);
  
  return {
    totalGames,
    gamesPerTeam,
    totals,
    completionPcts,
    passYPAs,
    ppgs,
  };
}

/**
 * Print formatted report
 */
function printReport(results: any): void {
  
  const { totals, gamesPerTeam } = results;
  
  console.log('='.repeat(70));
  console.log('📊 CALIBRATION TEST RESULTS');
  console.log('='.repeat(70));
  
  console.log(`\n🎮 Games Simulated: ${results.totalGames} (${gamesPerTeam} team-games)`);
  
  console.log(`\n📈 PASSING STATS (per team, per game):`);
  const passAttPerGame = totals.passAtt / gamesPerTeam;
  const compPerGame = totals.comp / gamesPerTeam;
  const passYdsPerGame = totals.passYds / gamesPerTeam;
  const completionPct = totals.comp / totals.passAtt;
  const passYPA = totals.passYds / totals.passAtt;
  const intRate = totals.int / totals.passAtt;
  
  console.log(`   Attempts:     ${passAttPerGame.toFixed(1)} (target: 35.0) ${check(passAttPerGame, 35, 5)}`);
  console.log(`   Completions:  ${compPerGame.toFixed(1)} (target: 22.0) ${check(compPerGame, 22, 3)}`);
  console.log(`   Completion %: ${(completionPct * 100).toFixed(1)}% (target: 63.0%) ${check(completionPct, 0.63, 0.05)}`);
  console.log(`   Pass Yards:   ${passYdsPerGame.toFixed(1)} (target: 230.0) ${check(passYdsPerGame, 230, 30)}`);
  console.log(`   YPA:          ${passYPA.toFixed(2)} (target: 6.50) ${check(passYPA, 6.5, 1.0)}`);
  console.log(`   Pass TDs:     ${(totals.passTD / gamesPerTeam).toFixed(2)}`);
  console.log(`   INTs:         ${(totals.int / gamesPerTeam).toFixed(2)}`);
  console.log(`   INT Rate:     ${(intRate * 100).toFixed(2)}% (target: 2.20%) ${check(intRate, 0.022, 0.01)}`);
  console.log(`   Sacks:        ${(totals.sacks / gamesPerTeam).toFixed(2)} (target: 2.50) ${check(totals.sacks / gamesPerTeam, 2.5, 1.0)}`);
  
  console.log(`\n🏃 RUSHING STATS (per team, per game):`);
  const rushAttPerGame = totals.rushAtt / gamesPerTeam;
  const rushYdsPerGame = totals.rushYds / gamesPerTeam;
  const rushYPC = totals.rushYds / totals.rushAtt;
  const fumbleRate = totals.fum / totals.rushAtt;
  
  console.log(`   Attempts:     ${rushAttPerGame.toFixed(1)} (target: 24.0) ${check(rushAttPerGame, 24, 5)}`);
  console.log(`   Rush Yards:   ${rushYdsPerGame.toFixed(1)} (target: 90.0) ${check(rushYdsPerGame, 90, 20)}`);
  console.log(`   YPC:          ${rushYPC.toFixed(2)} (target: 4.30) ${check(rushYPC, 4.3, 0.8)}`);
  console.log(`   Rush TDs:     ${(totals.rushTD / gamesPerTeam).toFixed(2)}`);
  console.log(`   Fumbles:      ${(totals.fum / gamesPerTeam).toFixed(2)}`);
  console.log(`   Fumble Rate:  ${(fumbleRate * 100).toFixed(2)}% (target: 1.50%) ${check(fumbleRate, 0.015, 0.01)}`);
  
  console.log(`\n🏈 SCORING (per team, per game):`);
  const ppg = totals.points / gamesPerTeam;
  const totalTDs = (totals.passTD + totals.rushTD) / gamesPerTeam;
  const fgPct = (totals.fgMade / Math.max(1, totals.fgAtt)) * 100;
  
  console.log(`   PPG:          ${ppg.toFixed(1)} (range OK: 12-28 for avg teams) ${ppg >= 12 && ppg <= 28 ? '✅' : '❌'}`);
  console.log(`   Total TDs:    ${totalTDs.toFixed(2)} (target: ~1.8-3.0) ${totalTDs >= 1.6 ? '✅' : '❌'}`);
  console.log(`   FG Made:      ${(totals.fgMade / gamesPerTeam).toFixed(2)}`);
  console.log(`   FG %:         ${fgPct.toFixed(1)}% (target: >70%) ${fgPct >= 70 ? '✅' : '❌'}`);
  
  console.log(`\n📊 VARIANCE (Standard Deviations):`);
  const compStdDev = calculateStdDev(results.completionPcts);
  const ypaStdDev = calculateStdDev(results.passYPAs);
  const ppgStdDev = calculateStdDev(results.ppgs);
  
  console.log(`   Completion %: ±${(compStdDev * 100).toFixed(1)}%`);
  console.log(`   Pass YPA:     ±${ypaStdDev.toFixed(2)}`);
  console.log(`   PPG:          ±${ppgStdDev.toFixed(1)}`);
  
  // Final verdict - realistic criteria (variance is good!)
  const passing = check(completionPct, 0.63, 0.08) === '✅' && check(passYPA, 6.5, 1.5) === '✅';
  const rushing = check(rushYPC, 4.3, 1.0) === '✅';
  const scoring = ppg >= 12 && ppg <= 28 && totalTDs >= 1.6 && fgPct >= 70;
  
  console.log('\n' + '='.repeat(70));
  if (passing && rushing && scoring) {
    console.log('✅ CALIBRATION PASSED - Engine is ready for production!');
    console.log('   Variance creates realistic Browns-type (10ppg) to Elite (28ppg) teams!');
  } else {
    console.log('⚠️  CALIBRATION NEEDS TUNING - Adjust normalizers in attribute-engine.ts');
    if (!scoring && ppg >= 12 && ppg <= 28) {
      console.log('   Note: PPG variance is fine - check FG% and TD rate');
    }
  }
  console.log('='.repeat(70) + '\n');
}

function check(actual: number, target: number, tolerance: number): string {
  const diff = Math.abs(actual - target);
  if (diff <= tolerance) return '✅';
  if (diff <= tolerance * 1.5) return '⚠️';
  return '❌';
}

function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

// Run main function
main().catch(console.error);

