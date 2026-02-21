import { simulatePlayEnhanced } from './enhanced-outcome-generator';
import { TeamWithRoster, Play } from './types';
import { NFL_TARGETS } from './attribute-engine';

/**
 * Calibration test results
 */
interface CalibrationResults {
  totalGames: number;
  totalPlays: number;
  
  // Passing stats
  passAttempts: number;
  completions: number;
  passYards: number;
  passTDs: number;
  interceptions: number;
  sacks: number;
  
  // Rushing stats
  rushAttempts: number;
  rushYards: number;
  rushTDs: number;
  fumbles: number;
  
  // Scoring
  totalPoints: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  
  // Calculated rates
  completionPct: number;
  passYPA: number;
  rushYPC: number;
  avgPPG: number;
  avgTurnovers: number;
  avgSacks: number;
  
  // Variance metrics
  completionPctStdDev: number;
  passYPAStdDev: number;
  ppgStdDev: number;
  
  // Warnings
  warnings: string[];
}

/**
 * Run calibration test suite
 * Simulates multiple games and compares to NFL targets
 */
export async function runCalibrationTest(
  testTeamHome: TeamWithRoster,
  testTeamAway: TeamWithRoster,
  iterations: number = 100
): Promise<CalibrationResults> {
  
  console.log(`🧪 Starting calibration test (${iterations} games)...`);
  
  const gameResults: any[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const gameResult = simulateMockGame(testTeamHome, testTeamAway);
    gameResults.push(gameResult);
    
    if ((i + 1) % 10 === 0) {
      console.log(`  Completed ${i + 1}/${iterations} games...`);
    }
  }
  
  // Aggregate results
  const totals = gameResults.reduce((acc, game) => {
    return {
      passAttempts: acc.passAttempts + game.passAttempts,
      completions: acc.completions + game.completions,
      passYards: acc.passYards + game.passYards,
      passTDs: acc.passTDs + game.passTDs,
      interceptions: acc.interceptions + game.interceptions,
      sacks: acc.sacks + game.sacks,
      rushAttempts: acc.rushAttempts + game.rushAttempts,
      rushYards: acc.rushYards + game.rushYards,
      rushTDs: acc.rushTDs + game.rushTDs,
      fumbles: acc.fumbles + game.fumbles,
      totalPoints: acc.totalPoints + game.totalPoints,
      fieldGoalsMade: acc.fieldGoalsMade + game.fieldGoalsMade,
      fieldGoalsAttempted: acc.fieldGoalsAttempted + game.fieldGoalsAttempted,
    };
  }, {
    passAttempts: 0,
    completions: 0,
    passYards: 0,
    passTDs: 0,
    interceptions: 0,
    sacks: 0,
    rushAttempts: 0,
    rushYards: 0,
    rushTDs: 0,
    fumbles: 0,
    totalPoints: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
  });
  
  // Calculate per-game averages
  const gamesPerTeam = iterations * 2;  // Both teams
  
  const completionPct = totals.completions / totals.passAttempts;
  const passYPA = totals.passYards / totals.passAttempts;
  const rushYPC = totals.rushYards / totals.rushAttempts;
  const avgPPG = totals.totalPoints / gamesPerTeam;
  const avgTurnovers = (totals.interceptions + totals.fumbles) / gamesPerTeam;
  const avgSacks = totals.sacks / gamesPerTeam;
  
  // Calculate standard deviations
  const completionPcts = gameResults.map(g => g.completions / g.passAttempts);
  const passYPAs = gameResults.map(g => g.passYards / g.passAttempts);
  const ppgs = gameResults.map(g => g.totalPoints);
  
  const completionPctStdDev = calculateStdDev(completionPcts);
  const passYPAStdDev = calculateStdDev(passYPAs);
  const ppgStdDev = calculateStdDev(ppgs);
  
  // Generate warnings
  const warnings: string[] = [];
  
  if (Math.abs(completionPct - NFL_TARGETS.rates.completion_pct) > 0.05) {
    warnings.push(
      `⚠️  Completion % out of range: ${(completionPct * 100).toFixed(1)}% ` +
      `(target: ${(NFL_TARGETS.rates.completion_pct * 100).toFixed(1)}%)`
    );
  }
  
  if (Math.abs(passYPA - NFL_TARGETS.rates.pass_ypa) > 1.0) {
    warnings.push(
      `⚠️  Pass YPA out of range: ${passYPA.toFixed(2)} ` +
      `(target: ${NFL_TARGETS.rates.pass_ypa})`
    );
  }
  
  if (Math.abs(rushYPC - NFL_TARGETS.rates.rush_ypc) > 0.8) {
    warnings.push(
      `⚠️  Rush YPC out of range: ${rushYPC.toFixed(2)} ` +
      `(target: ${NFL_TARGETS.rates.rush_ypc})`
    );
  }
  
  if (Math.abs(avgPPG - NFL_TARGETS.per_game.points) > 7) {
    warnings.push(
      `⚠️  PPG out of range: ${avgPPG.toFixed(1)} ` +
      `(target: ${NFL_TARGETS.per_game.points})`
    );
  }
  
  const intRate = totals.interceptions / totals.passAttempts;
  if (Math.abs(intRate - NFL_TARGETS.rates.int_rate) > 0.01) {
    warnings.push(
      `⚠️  INT rate out of range: ${(intRate * 100).toFixed(2)}% ` +
      `(target: ${(NFL_TARGETS.rates.int_rate * 100).toFixed(2)}%)`
    );
  }
  
  const results: CalibrationResults = {
    totalGames: iterations,
    totalPlays: totals.passAttempts + totals.rushAttempts,
    passAttempts: totals.passAttempts,
    completions: totals.completions,
    passYards: totals.passYards,
    passTDs: totals.passTDs,
    interceptions: totals.interceptions,
    sacks: totals.sacks,
    rushAttempts: totals.rushAttempts,
    rushYards: totals.rushYards,
    rushTDs: totals.rushTDs,
    fumbles: totals.fumbles,
    totalPoints: totals.totalPoints,
    fieldGoalsMade: totals.fieldGoalsMade,
    fieldGoalsAttempted: totals.fieldGoalsAttempted,
    completionPct,
    passYPA,
    rushYPC,
    avgPPG,
    avgTurnovers,
    avgSacks,
    completionPctStdDev,
    passYPAStdDev,
    ppgStdDev,
    warnings,
  };
  
  printCalibrationReport(results);
  
  return results;
}

/**
 * Print formatted calibration report
 */
function printCalibrationReport(results: CalibrationResults): void {
  console.log('\n' + '='.repeat(70));
  console.log('📊 CALIBRATION TEST RESULTS');
  console.log('='.repeat(70));
  
  console.log(`\n🎮 Games Simulated: ${results.totalGames}`);
  console.log(`   Total Plays: ${results.totalPlays}`);
  
  console.log(`\n📈 PASSING STATS (per game, per team):`);
  console.log(`   Attempts:     ${(results.passAttempts / (results.totalGames * 2)).toFixed(1)} (target: ${NFL_TARGETS.per_game.pass_attempts})`);
  console.log(`   Completions:  ${(results.completions / (results.totalGames * 2)).toFixed(1)} (target: ${NFL_TARGETS.per_game.completions})`);
  console.log(`   Completion %: ${(results.completionPct * 100).toFixed(1)}% (target: ${(NFL_TARGETS.rates.completion_pct * 100).toFixed(1)}%) ${checkStatus(results.completionPct, NFL_TARGETS.rates.completion_pct, 0.05)}`);
  console.log(`   Pass Yards:   ${(results.passYards / (results.totalGames * 2)).toFixed(1)} (target: ${NFL_TARGETS.per_game.pass_yards})`);
  console.log(`   YPA:          ${results.passYPA.toFixed(2)} (target: ${NFL_TARGETS.rates.pass_ypa}) ${checkStatus(results.passYPA, NFL_TARGETS.rates.pass_ypa, 1.0)}`);
  console.log(`   Pass TDs:     ${(results.passTDs / (results.totalGames * 2)).toFixed(2)}`);
  console.log(`   INTs:         ${(results.interceptions / (results.totalGames * 2)).toFixed(2)}`);
  console.log(`   INT Rate:     ${((results.interceptions / results.passAttempts) * 100).toFixed(2)}% (target: ${(NFL_TARGETS.rates.int_rate * 100).toFixed(2)}%)`);
  console.log(`   Sacks:        ${(results.sacks / (results.totalGames * 2)).toFixed(2)} (target: ${NFL_TARGETS.per_game.sacks})`);
  
  console.log(`\n🏃 RUSHING STATS (per game, per team):`);
  console.log(`   Attempts:     ${(results.rushAttempts / (results.totalGames * 2)).toFixed(1)} (target: ${NFL_TARGETS.per_game.rush_attempts})`);
  console.log(`   Rush Yards:   ${(results.rushYards / (results.totalGames * 2)).toFixed(1)} (target: ${NFL_TARGETS.per_game.rush_yards})`);
  console.log(`   YPC:          ${results.rushYPC.toFixed(2)} (target: ${NFL_TARGETS.rates.rush_ypc}) ${checkStatus(results.rushYPC, NFL_TARGETS.rates.rush_ypc, 0.8)}`);
  console.log(`   Rush TDs:     ${(results.rushTDs / (results.totalGames * 2)).toFixed(2)}`);
  console.log(`   Fumbles:      ${(results.fumbles / (results.totalGames * 2)).toFixed(2)}`);
  console.log(`   Fumble Rate:  ${((results.fumbles / results.rushAttempts) * 100).toFixed(2)}% (target: ${(NFL_TARGETS.rates.fumble_rate * 100).toFixed(2)}%)`);
  
  console.log(`\n🏈 SCORING (per game, per team):`);
  console.log(`   PPG:          ${results.avgPPG.toFixed(1)} (target: ${NFL_TARGETS.per_game.points}) ${checkStatus(results.avgPPG, NFL_TARGETS.per_game.points, 7)}`);
  console.log(`   Total TDs:    ${((results.passTDs + results.rushTDs) / (results.totalGames * 2)).toFixed(2)}`);
  console.log(`   FG Made:      ${(results.fieldGoalsMade / (results.totalGames * 2)).toFixed(2)}`);
  console.log(`   FG %:         ${((results.fieldGoalsMade / Math.max(1, results.fieldGoalsAttempted)) * 100).toFixed(1)}%`);
  
  console.log(`\n📊 VARIANCE (Standard Deviations):`);
  console.log(`   Completion %: ±${(results.completionPctStdDev * 100).toFixed(1)}%`);
  console.log(`   Pass YPA:     ±${results.passYPAStdDev.toFixed(2)}`);
  console.log(`   PPG:          ±${results.ppgStdDev.toFixed(1)}`);
  
  if (results.warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS:`);
    results.warnings.forEach(w => console.log(`   ${w}`));
  } else {
    console.log(`\n✅ All metrics within acceptable range!`);
  }
  
  console.log('\n' + '='.repeat(70) + '\n');
}

/**
 * Check if value is within tolerance
 */
function checkStatus(actual: number, target: number, tolerance: number): string {
  const diff = Math.abs(actual - target);
  if (diff <= tolerance) {
    return '✅';
  } else if (diff <= tolerance * 1.5) {
    return '⚠️';
  } else {
    return '❌';
  }
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  
  return Math.sqrt(avgSquaredDiff);
}

/**
 * Simulate a mock game for calibration
 * Returns aggregated stats
 */
function simulateMockGame(
  homeTeam: TeamWithRoster,
  awayTeam: TeamWithRoster
): any {
  
  const totalPlays = 65;  // ~65 plays per team
  const plays: Play[] = [];
  
  let homeScore = 0;
  let awayScore = 0;
  let homePossession = true;
  let homeYardLine = 25;
  let awayYardLine = 25;
  let homeDown = 1;
  let homeDistance = 10;
  let awayDown = 1;
  let awayDistance = 10;
  
  const stats = {
    home: { passAttempts: 0, completions: 0, passYards: 0, passTDs: 0, ints: 0, sacks: 0, rushAttempts: 0, rushYards: 0, rushTDs: 0, fumbles: 0, fgMade: 0, fgAtt: 0 },
    away: { passAttempts: 0, completions: 0, passYards: 0, passTDs: 0, ints: 0, sacks: 0, rushAttempts: 0, rushYards: 0, rushTDs: 0, fumbles: 0, fgMade: 0, fgAtt: 0 },
  };
  
  for (let playNum = 1; playNum <= totalPlays * 2; playNum++) {
    const isHomeOnOffense = homePossession;
    const currentYardLine = isHomeOnOffense ? homeYardLine : awayYardLine;
    const currentDown = isHomeOnOffense ? homeDown : awayDown;
    const currentDistance = isHomeOnOffense ? homeDistance : awayDistance;
    const teamStats = isHomeOnOffense ? stats.home : stats.away;
    
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
    
    plays.push(play);
    
    // Update stats
    if (play.playType === 'pass') {
      teamStats.passAttempts++;
      if (play.success) {
        teamStats.completions++;
        teamStats.passYards += play.yards;
      }
      if (play.points === 6) teamStats.passTDs++;
      if (play.turnover) teamStats.ints++;
      if (play.yards < 0) teamStats.sacks++;
    } else if (play.playType === 'run') {
      teamStats.rushAttempts++;
      teamStats.rushYards += Math.max(0, play.yards);
      if (play.points === 6) teamStats.rushTDs++;
      if (play.turnover) teamStats.fumbles++;
    } else if (play.playType === 'field_goal') {
      teamStats.fgAtt++;
      if (play.success) teamStats.fgMade++;
    }
    
    // Update score
    if (isHomeOnOffense) {
      homeScore += play.points;
    } else {
      awayScore += play.points;
    }
    
    // Update field position
    if (play.possessionChange) {
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
        }
      } else {
        awayYardLine = play.yardLine;
        awayDistance = Math.max(0, awayDistance - play.yards);
        if (awayDistance <= 0 || play.yards >= 10) {
          awayDown = 1;
          awayDistance = 10;
        } else {
          awayDown++;
        }
      }
    }
  }
  
  // Combine both teams
  return {
    passAttempts: stats.home.passAttempts + stats.away.passAttempts,
    completions: stats.home.completions + stats.away.completions,
    passYards: stats.home.passYards + stats.away.passYards,
    passTDs: stats.home.passTDs + stats.away.passTDs,
    interceptions: stats.home.ints + stats.away.ints,
    sacks: stats.home.sacks + stats.away.sacks,
    rushAttempts: stats.home.rushAttempts + stats.away.rushAttempts,
    rushYards: stats.home.rushYards + stats.away.rushYards,
    rushTDs: stats.home.rushTDs + stats.away.rushTDs,
    fumbles: stats.home.fumbles + stats.away.fumbles,
    totalPoints: homeScore + awayScore,
    fieldGoalsMade: stats.home.fgMade + stats.away.fgMade,
    fieldGoalsAttempted: stats.home.fgAtt + stats.away.fgAtt,
  };
}

/**
 * Create a test team with average ratings
 */
export function createTestTeam(name: string, avgRating: number = 75): TeamWithRoster {
  
  const positions = [
    { pos: 'QB', count: 2 },
    { pos: 'RB', count: 3 },
    { pos: 'WR', count: 5 },
    { pos: 'TE', count: 2 },
    { pos: 'OT', count: 2 },
    { pos: 'OG', count: 2 },
    { pos: 'C', count: 1 },
    { pos: 'DE', count: 2 },
    { pos: 'DT', count: 2 },
    { pos: 'LB', count: 3 },
    { pos: 'CB', count: 3 },
    { pos: 'S', count: 2 },
    { pos: 'K', count: 1 },
    { pos: 'P', count: 1 },
  ];
  
  const players: any[] = [];
  let idCounter = 1;
  
  positions.forEach(({ pos, count }) => {
    for (let i = 0; i < count; i++) {
      const variance = (Math.random() * 2 - 1) * 10;  // ±10 variance
      const overall = Math.round(avgRating + variance);
      
      players.push(createMockPlayer(`Player ${idCounter}`, pos, overall));
      idCounter++;
    }
  });
  
  return {
    id: 'test-team-' + name,
    name: `Test ${name}`,
    abbreviation: name.substring(0, 3).toUpperCase(),
    division: 'Test',
    conference: 'Test',
    players,
  };
}

/**
 * Create a mock player with all attributes
 */
function createMockPlayer(name: string, position: string, overall: number): any {
  
  const base = overall;
  const variance = () => Math.round(base + (Math.random() * 2 - 1) * 8);
  
  return {
    id: `player-${Math.random().toString(36).substr(2, 9)}`,
    full_name: name,
    position,
    age: 25,
    overall,
    potential: overall + 5,
    team_id: null,
    
    // Physical
    spd: variance(),
    acc: variance(),
    agi: variance(),
    str: variance(),
    
    // Passing
    thp: variance(),
    sac: variance(),
    mac: variance(),
    dac: variance(),
    tup: variance(),
    pac: variance(),
    dec: variance(),
    awr: variance(),
    
    // Ball carrier/Blocking
    btk: variance(),
    car: variance(),
    vsn: variance(),
    rtr: variance(),
    pblk: variance(),
    rblk: variance(),
    iblk: variance(),
    agg: variance(),
    
    // Receiving
    rls: variance(),
    rte: variance(),
    cth: variance(),
    cit: variance(),
    yac: variance(),
    
    // Defensive
    pmv: variance(),
    fmv: variance(),
    bsh: variance(),
    pur: variance(),
    tak: variance(),
    cov: variance(),
    mcv: variance(),
    zcv: variance(),
    prs: variance(),
    
    // Kicking
    kpw: variance(),
    kac: variance(),
    
    // Technical
    footwork: variance(),
    hand_placement: variance(),
    release_tech: variance(),
    hand_tech: variance(),
    mechanics: variance(),
    decision_time: variance(),
    leverage: variance(),
    move_set: variance(),
    backpedal: variance(),
    ball_skills: variance(),
    play_recognition: variance(),
    
    // Mental
    football_iq: variance(),
    motor: variance(),
    work_ethic: variance(),
    coachability: variance(),
    leadership: variance(),
    durability: variance(),
    consistency: variance(),
    injury_risk: 50,
  };
}
