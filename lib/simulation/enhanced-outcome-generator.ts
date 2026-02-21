import { Player, TeamWithRoster, Play } from './types';
import {
  calculatePressureChance,
  calculateSeparation,
  calculateThrowAccuracy,
  calculateCatchProbability,
  calculateYardsAfterCatch,
  calculateRushOutcome,
  calculateFieldGoalSuccess,
  calculateInterceptionChance,
  calculateTouchdownProbability,
  determinePlayType,
  determineCoverageType,
  selectRouteDistance,
  createSituationalContext,
  checkIncompletionFactors,
  SituationalContext,
} from './attribute-engine';
import {
  CoachingStaff,
  applyCoachingModifiers,
  calculateCoachingBonus,
} from './coaching-influence';

interface EnhancedPlayConfig {
  down: number;
  distance: number;
  yardLine: number;
  offenseTeam: TeamWithRoster;
  defenseTeam: TeamWithRoster;
  isHomeTeam: boolean;
  quarter?: number;
  timeRemaining?: number;
  scoreDifferential?: number;
}

/**
 * Simulate a single play using detailed attribute system
 */
export function simulatePlayEnhanced(
  config: EnhancedPlayConfig,
  playNumber: number
): Play {
  
  const situational = createSituationalContext(
    config.down,
    config.distance,
    config.yardLine,
    config.quarter || 2,
    config.timeRemaining || 900,
    config.scoreDifferential || 0
  );
  
  // Get coaching staff from offense team
  const offenseCoaches = config.offenseTeam.coaches;
  
  const playType = determinePlayType(situational, offenseCoaches);
  
  if (playType === 'pass') {
    return simulatePassPlay(config, situational, playNumber);
  } else if (playType === 'run') {
    return simulateRunPlay(config, situational, playNumber);
  } else if (playType === 'field_goal') {
    return simulateFieldGoal(config, situational, playNumber);
  } else {
    return simulatePunt(config, situational, playNumber);
  }
}

/**
 * Simulate passing play with full attribute system
 */
function simulatePassPlay(
  config: EnhancedPlayConfig,
  situational: SituationalContext,
  playNumber: number
): Play {
  
  const { offenseTeam, defenseTeam } = config;
  
  // Get players
  const qb = getBestPlayerAtPosition(offenseTeam, 'QB');
  const receivers = getPlayersByPosition(offenseTeam, ['WR', 'TE']).slice(0, 3);
  const olinePlayers = getPlayersByPosition(offenseTeam, ['OT', 'OG', 'C']);
  const dlinePlayers = getPlayersByPosition(defenseTeam, ['DE', 'DT']);
  const dbs = getPlayersByPosition(defenseTeam, ['CB', 'S']);
  
  if (!qb || receivers.length === 0 || dbs.length === 0) {
    return createSimplePlay('pass', 0, false, playNumber, config);
  }
  
  // Check incompletion factors first
  const incompletionCheck = checkIncompletionFactors();
  if (incompletionCheck.incomplete) {
    return {
      playNumber,
      down: config.down,
      distance: config.distance,
      yardLine: config.yardLine,
      playType: 'pass',
      yards: 0,
      success: false,
      turnover: false,
      points: 0,
      possessionChange: false,
      description: incompletionCheck.reason,
    };
  }
  
  // STEP 1: Pass rush pressure
  const defenseCoaches = defenseTeam.coaches;
  const { pressureChance, timeToPress, sackChance } = calculatePressureChance(dlinePlayers, olinePlayers, defenseCoaches);
  const underPressure = Math.random() < pressureChance;
  
  // Check for sack
  if (underPressure && Math.random() < sackChance / pressureChance) {
    const sackYards = -(3 + Math.random() * 5);
    
    // Fumble on sack check (rare)
    if (Math.random() < 0.03) {
      return {
        playNumber,
        down: config.down,
        distance: config.distance,
        yardLine: Math.max(0, config.yardLine + sackYards),
        playType: 'pass',
        yards: sackYards,
        success: false,
        turnover: true,
        points: 0,
        possessionChange: true,
        description: `Sacked and FUMBLED! ${Math.abs(sackYards)} yard loss`,
      };
    }
    
    return {
      playNumber,
      down: config.down,
      distance: config.distance,
      yardLine: Math.max(0, config.yardLine + sackYards),
      playType: 'pass',
      yards: sackYards,
      success: false,
      turnover: false,
      points: 0,
      possessionChange: false,
      description: `Sacked for ${Math.abs(sackYards)} yard loss`,
    };
  }
  
  // STEP 2: Route selection
  const routeDistance = selectRouteDistance(situational);
  
  // STEP 3: Coverage type
  const coverageType = determineCoverageType(situational, defenseCoaches);
  
  // STEP 4: Find best matchup
  let bestMatchup = { 
    receiver: receivers[0], 
    defender: dbs[0], 
    separation: 0,
    receiverIndex: 0,
  };
  let bestSeparation = -1;
  
  for (let i = 0; i < Math.min(3, receivers.length); i++) {
    const receiver = receivers[i];
    const defender = dbs[Math.floor(Math.random() * dbs.length)];
    const { separation } = calculateSeparation(receiver, defender, coverageType, situational);
    
    if (separation > bestSeparation) {
      bestSeparation = separation;
      bestMatchup = { receiver, defender, separation, receiverIndex: i };
    }
  }
  
  // STEP 5: Throw accuracy
  const accuracyProb = calculateThrowAccuracy(
    qb,
    routeDistance,
    underPressure,
    situational
  );
  
  const accurateThrow = Math.random() < accuracyProb;
  
  // Check for interception on inaccurate throws
  if (!accurateThrow) {
    const intChance = calculateInterceptionChance(
      qb,
      bestMatchup.defender,
      bestMatchup.separation,
      underPressure,
      defenseCoaches
    );
    
    if (Math.random() < intChance) {
      const intReturn = Math.round(Math.random() * 15);
      return {
        playNumber,
        down: config.down,
        distance: config.distance,
        yardLine: config.yardLine,
        playType: 'pass',
        yards: -intReturn,
        success: false,
        turnover: true,
        points: 0,
        possessionChange: true,
        description: `INTERCEPTION! Returned ${intReturn} yards`,
      };
    }
    
    return {
      playNumber,
      down: config.down,
      distance: config.distance,
      yardLine: config.yardLine,
      playType: 'pass',
      yards: 0,
      success: false,
      turnover: false,
      points: 0,
      possessionChange: false,
      description: 'Pass incomplete - inaccurate throw',
    };
  }
  
  // STEP 6: Catch probability
  let catchProb = calculateCatchProbability(
    bestMatchup.receiver,
    bestMatchup.defender,
    bestMatchup.separation,
    accurateThrow
  );
  
  // Apply offensive coaching bonuses
  const offenseCoaches = offenseTeam.coaches;
  if (offenseCoaches) {
    const modifiers = applyCoachingModifiers(
      'pass',
      situational,
      offenseCoaches
    );
    catchProb = calculateCoachingBonus(catchProb, situational, offenseCoaches, modifiers);
  }
  
  const catchSuccess = Math.random() < catchProb;
  
  if (!catchSuccess) {
    const defended = bestMatchup.separation < 1.0;
    return {
      playNumber,
      down: config.down,
      distance: config.distance,
      yardLine: config.yardLine,
      playType: 'pass',
      yards: 0,
      success: false,
      turnover: false,
      points: 0,
      possessionChange: false,
      description: defended ? 'Pass defended' : 'Pass dropped',
    };
  }
  
  // STEP 7: YAC calculation
  const yac = calculateYardsAfterCatch(
    bestMatchup.receiver,
    dbs,
    bestMatchup.separation,
    routeDistance,
    situational
  );
  
  const totalYards = Math.round(routeDistance + yac);
  
  // STEP 8: Touchdown check (with goal line defense)
  const touchdown = calculateTouchdownProbability(totalYards, config.yardLine, 'pass');
  
  return {
    playNumber,
    down: config.down,
    distance: config.distance,
    yardLine: Math.min(100, config.yardLine + totalYards),
    playType: 'pass',
    yards: totalYards,
    success: true,
    turnover: false,
    points: touchdown ? 6 : 0,
    possessionChange: touchdown,
    description: touchdown 
      ? `TOUCHDOWN! ${totalYards} yard pass`
      : `Pass complete for ${totalYards} yards`,
  };
}

/**
 * Simulate running play with full attribute system
 */
function simulateRunPlay(
  config: EnhancedPlayConfig,
  situational: SituationalContext,
  playNumber: number
): Play {
  
  const rb = getBestPlayerAtPosition(config.offenseTeam, 'RB');
  const olinePlayers = getPlayersByPosition(config.offenseTeam, ['OT', 'OG', 'C']);
  const defenders = getPlayersByPosition(config.defenseTeam, ['DE', 'DT', 'LB']);
  
  if (!rb || olinePlayers.length === 0 || defenders.length === 0) {
    return createSimplePlay('run', 4, true, playNumber, config);
  }
  
  const outcome = calculateRushOutcome(rb, olinePlayers, defenders, situational);
  
  if (outcome.fumble) {
    const fumbleReturn = Math.round(outcome.yards / 2);
    return {
      playNumber,
      down: config.down,
      distance: config.distance,
      yardLine: Math.max(0, config.yardLine + fumbleReturn),
      playType: 'run',
      yards: fumbleReturn,
      success: false,
      turnover: true,
      points: 0,
      possessionChange: true,
      description: `FUMBLE! Lost ${Math.abs(fumbleReturn)} yards`,
    };
  }
  
  return {
    playNumber,
    down: config.down,
    distance: config.distance,
    yardLine: Math.min(100, config.yardLine + outcome.yards),
    playType: 'run',
    yards: outcome.yards,
    success: outcome.yards > 0,
    turnover: false,
    points: outcome.touchdown ? 6 : 0,
    possessionChange: outcome.touchdown,
    description: outcome.touchdown
      ? `TOUCHDOWN! ${outcome.yards} yard run`
      : `Run for ${outcome.yards} yards`,
  };
}

/**
 * Simulate field goal
 */
function simulateFieldGoal(
  config: EnhancedPlayConfig,
  situational: SituationalContext,
  playNumber: number
): Play {
  
  const kicker = getBestPlayerAtPosition(config.offenseTeam, 'K');
  const distance = 100 - config.yardLine + 17;
  
  const success = kicker 
    ? calculateFieldGoalSuccess(kicker, distance, situational)
    : Math.random() < 0.75;
  
  return {
    playNumber,
    down: config.down,
    distance: config.distance,
    yardLine: config.yardLine,
    playType: 'field_goal',
    yards: 0,
    success,
    turnover: false,
    points: success ? 3 : 0,
    possessionChange: true,
    description: success 
      ? `Field goal GOOD from ${distance} yards!` 
      : `Field goal MISSED from ${distance} yards`,
  };
}

/**
 * Simulate punt
 */
function simulatePunt(
  config: EnhancedPlayConfig,
  situational: SituationalContext,
  playNumber: number
): Play {
  
  const punter = getBestPlayerAtPosition(config.offenseTeam, 'P');
  
  // Simple punt for now (can enhance later with punter attributes)
  const puntDistance = 40 + Math.random() * 15;
  
  return {
    playNumber,
    down: config.down,
    distance: config.distance,
    yardLine: config.yardLine,
    playType: 'punt',
    yards: 0,
    success: true,
    turnover: false,
    points: 0,
    possessionChange: true,
    description: `Punt ${Math.round(puntDistance)} yards`,
  };
}

/**
 * Helper: Get best player at position
 */
function getBestPlayerAtPosition(team: TeamWithRoster, position: string): any {
  return team.players
    .filter(p => p.position === position)
    .sort((a, b) => b.overall - a.overall)[0] || null;
}

/**
 * Helper: Get players by positions
 */
function getPlayersByPosition(team: TeamWithRoster, positions: string[]): any[] {
  return team.players
    .filter(p => positions.includes(p.position))
    .sort((a, b) => b.overall - a.overall);
}

/**
 * Helper: Create simple play (fallback)
 */
function createSimplePlay(
  playType: 'pass' | 'run',
  yards: number,
  success: boolean,
  playNumber: number,
  config: EnhancedPlayConfig
): Play {
  return {
    playNumber,
    down: config.down,
    distance: config.distance,
    yardLine: config.yardLine,
    playType,
    yards,
    success,
    turnover: false,
    points: 0,
    possessionChange: false,
    description: `${playType} for ${yards} yards`,
  };
}

