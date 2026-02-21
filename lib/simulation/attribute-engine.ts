import { Player } from './types';
import { CoachingStaff } from './coaching-influence';

/**
 * ============================================================================
 * CALIBRATION TARGETS - Non-negotiable NFL averages
 * ============================================================================
 */
export const NFL_TARGETS = {
  per_game: {
    points: 21.5,
    total_yards: 320,
    pass_yards: 230,
    rush_yards: 90,
    pass_attempts: 35,
    completions: 22,
    rush_attempts: 24,
    turnovers: 1.5,
    sacks: 2.5,
  },
  
  rates: {
    completion_pct: 0.63,
    pass_ypa: 6.5,
    rush_ypc: 4.3,
    td_rate: 0.038,
    int_rate: 0.022,
    fumble_rate: 0.015,
    sack_rate: 0.065,
  },
};

/**
 * ============================================================================
 * ATTRIBUTE WEIGHTS - Normalized to sum to 1.0
 * ============================================================================
 */
export const ATTRIBUTE_WEIGHTS = {
  separation_man: {
    rte: 0.35,
    rls: 0.25,
    spd: 0.25,
    agi: 0.15,
  },
  separation_zone: {
    rte: 0.40,
    awr: 0.35,
    spd: 0.15,
    release_tech: 0.10,
  },
  
  accuracy_short: {
    sac: 0.50,
    mechanics: 0.30,
    decision_time: 0.20,
  },
  accuracy_medium: {
    mac: 0.50,
    mechanics: 0.25,
    awr: 0.25,
  },
  accuracy_deep: {
    dac: 0.50,
    thp: 0.30,
    mechanics: 0.20,
  },
  accuracy_pressure: {
    tup: 0.60,
    awr: 0.25,
    decision_time: 0.15,
  },
  
  catch_clean: {
    cth: 0.60,
    ball_skills: 0.25,
    hand_tech: 0.15,
  },
  catch_contested: {
    cit: 0.45,
    cth: 0.30,
    str: 0.15,
    ball_skills: 0.10,
  },
  
  yac_calculation: {
    yac: 0.35,
    spd: 0.25,
    agi: 0.20,
    btk: 0.15,
    str: 0.05,
  },
  
  pass_blocking: {
    pblk: 0.50,
    footwork: 0.25,
    str: 0.15,
    awr: 0.10,
  },
  run_blocking: {
    rblk: 0.45,
    str: 0.25,
    hand_placement: 0.15,
    leverage: 0.15,
  },
  
  rush_vision: {
    vsn: 0.45,
    awr: 0.30,
    play_recognition: 0.25,
  },
  break_tackle: {
    btk: 0.40,
    str: 0.30,
    agi: 0.20,
    car: 0.10,
  },
  ball_security: {
    car: 0.60,
    str: 0.25,
    awr: 0.15,
  },
  
  pass_rush_power: {
    pmv: 0.45,
    str: 0.30,
    bsh: 0.15,
    motor: 0.10,
  },
  pass_rush_speed: {
    fmv: 0.40,
    spd: 0.30,
    acc: 0.20,
    move_set: 0.10,
  },
  
  coverage_man: {
    mcv: 0.40,
    spd: 0.25,
    prs: 0.20,
    backpedal: 0.15,
  },
  coverage_zone: {
    zcv: 0.45,
    play_recognition: 0.30,
    awr: 0.25,
  },
  
  tackling: {
    tak: 0.50,
    str: 0.20,
    pur: 0.20,
    awr: 0.10,
  },
  pursuit: {
    pur: 0.40,
    spd: 0.35,
    motor: 0.15,
    play_recognition: 0.10,
  },
  
  run_defense: {
    bsh: 0.35,
    str: 0.30,
    tak: 0.20,
    play_recognition: 0.15,
  },
  
  field_goal: {
    kac: 0.60,
    kpw: 0.25,
    consistency: 0.15,
  },
};

/**
 * ============================================================================
 * VARIANCE CONFIG - "Any Given Sunday"
 * ============================================================================
 */
export const VARIANCE_CONFIG = {
  rating_variance: 0.05,
  outcome_variance: 0.05,
  yards_variance: 0.10,
  big_play_variance: 0.15,
  upset_magic_chance: 0.05,
  trap_game_chance: 0.05,
};

/**
 * ============================================================================
 * VARIANCE HELPERS
 * ============================================================================
 */
export function applyRatingVariance(rating: number, variancePct: number = 0.05): number {
  const variance = rating * variancePct;
  const randomVariance = (Math.random() * 2 - 1) * variance;
  return Math.max(0, Math.min(99, rating + randomVariance));
}

export function applyProbabilityVariance(probability: number, variancePct: number = 0.05): number {
  const variance = variancePct;
  const randomVariance = (Math.random() * 2 - 1) * variance;
  return Math.max(0, Math.min(1, probability + randomVariance));
}

export function applyYardsVariance(yards: number, variancePct: number = 0.10): number {
  const variance = Math.abs(yards) * variancePct;
  const randomVariance = (Math.random() * 2 - 1) * variance;
  return yards + randomVariance;
}

export function applyUpsetFactor(probability: number, differential: number): number {
  if (differential < -15 && Math.random() < VARIANCE_CONFIG.upset_magic_chance) {
    return Math.min(1, probability + 0.10);
  }
  if (differential > 15 && Math.random() < VARIANCE_CONFIG.trap_game_chance) {
    return Math.max(0, probability - 0.10);
  }
  return probability;
}

function avg(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

/**
 * ============================================================================
 * WEIGHTED RATING CALCULATION
 * ============================================================================
 */
export function calculateWeightedRating(
  player: any,
  weights: Record<string, number>,
  applyVariance: boolean = true
): number {
  let total = 0;
  let weightSum = 0;
  
  for (const [attr, weight] of Object.entries(weights)) {
    let value = player[attr] || 70;
    
    if (applyVariance) {
      value = applyRatingVariance(value, VARIANCE_CONFIG.rating_variance);
    }
    
    total += value * weight;
    weightSum += weight;
  }
  
  const rating = weightSum > 0 ? total / weightSum : 70;
  
  // Consistency-based variance
  if (applyVariance && player.consistency) {
    const consistencyFactor = player.consistency / 100;
    const extraVariance = (1 - consistencyFactor) * 0.10;
    return applyRatingVariance(rating, VARIANCE_CONFIG.rating_variance + extraVariance);
  }
  
  return rating;
}

/**
 * ============================================================================
 * SITUATIONAL CONTEXT
 * ============================================================================
 */
export interface SituationalContext {
  down: number;
  distance: number;
  yardLine: number;
  quarter: number;
  timeRemaining: number;
  scoreDifferential: number;
  isRedZone: boolean;
  isThirdAndLong: boolean;
  isThirdAndShort: boolean;
  isTwoMinuteDrill: boolean;
  isGoalLine: boolean;
}

export function createSituationalContext(
  down: number,
  distance: number,
  yardLine: number,
  quarter: number = 2,
  timeRemaining: number = 900,
  scoreDiff: number = 0
): SituationalContext {
  return {
    down,
    distance,
    yardLine,
    quarter,
    timeRemaining,
    scoreDifferential: scoreDiff,
    isRedZone: yardLine >= 80,
    isThirdAndLong: down === 3 && distance >= 7,
    isThirdAndShort: down === 3 && distance <= 3,
    isTwoMinuteDrill: timeRemaining < 120 && quarter >= 2,
    isGoalLine: yardLine >= 97,
  };
}

/**
 * ============================================================================
 * PRESSURE CALCULATION - NORMALIZED
 * ============================================================================
 */
export function calculatePressureChance(
  dlinePlayers: any[],
  olinePlayers: any[],
  coaches?: CoachingStaff
): { pressureChance: number; timeToPress: number; sackChance: number } {
  
  const powerRushRating = avg(dlinePlayers.map(p => 
    calculateWeightedRating(p, ATTRIBUTE_WEIGHTS.pass_rush_power, true)
  ));
  
  const speedRushRating = avg(dlinePlayers.map(p => 
    calculateWeightedRating(p, ATTRIBUTE_WEIGHTS.pass_rush_speed, true)
  ));
  
  const dlineWinRate = Math.max(powerRushRating, speedRushRating);
  const passBlockRating = avg(olinePlayers.map(p => 
    calculateWeightedRating(p, ATTRIBUTE_WEIGHTS.pass_blocking, true)
  ));
  
  const differential = dlineWinRate - passBlockRating;
  
  // NORMALIZED: Target 35% pressure rate
  let pressureChance = 0.35 + (differential / 250);
  pressureChance = applyProbabilityVariance(pressureChance, VARIANCE_CONFIG.outcome_variance);
  pressureChance = applyUpsetFactor(pressureChance, differential);
  
  // Apply defensive coordinator's blitz rate
  if (coaches?.defensiveCoordinator?.blitz_rate) {
    const blitzBonus = (coaches.defensiveCoordinator.blitz_rate / 100) * 0.15;
    pressureChance += blitzBonus; // +0 to +15% pressure
  }
  
  pressureChance = Math.max(0.15, Math.min(0.60, pressureChance));
  
  // NORMALIZED: Target 6.5% sack rate
  let sackChance = pressureChance * 0.20;
  sackChance = Math.max(0.03, Math.min(0.12, sackChance));
  
  // Time to pressure
  let timeToPress = 2.5;
  if (passBlockRating > dlineWinRate + 10) {
    timeToPress = 2.9 + Math.random() * 0.3;
  } else if (dlineWinRate > passBlockRating + 10) {
    timeToPress = 2.0 + Math.random() * 0.3;
  } else {
    timeToPress = 2.4 + Math.random() * 0.4;
  }
  
  timeToPress += (Math.random() * 2 - 1) * 0.15;
  timeToPress = Math.max(1.8, Math.min(3.5, timeToPress));
  
  return { pressureChance, timeToPress, sackChance };
}

/**
 * ============================================================================
 * ROUTE SELECTION - NORMALIZED to hit 6.5 YPA
 * ============================================================================
 */
export function selectRouteDistance(situational: SituationalContext): number {
  
  if (situational.isThirdAndLong) {
    const yardsNeeded = situational.distance;
    const roll = Math.random();
    
    if (roll < 0.55) {
      return Math.max(7, Math.min(20, yardsNeeded + (Math.random() * 4 - 2)));
    } else if (roll < 0.80) {
      return 12 + Math.random() * 8;
    } else {
      return 22 + Math.random() * 18;
    }
  }
  
  if (situational.isRedZone) {
    return 2 + Math.random() * 10;
  }
  
  if (situational.isGoalLine) {
    return 1 + Math.random() * 4;
  }
  
  if (situational.isTwoMinuteDrill) {
    const roll = Math.random();
    if (roll < 0.50) return 4 + Math.random() * 6;
    if (roll < 0.80) return 10 + Math.random() * 10;
    return 20 + Math.random() * 20;
  }
  
  // NORMALIZED: Average route = 3.8 yards (final tuning for 230 pass yards)
  const roll = Math.random();
  
  if (roll < 0.75) {
    return 1 + Math.random() * 4;  // 1-5 yards (75% - ultra short heavy)
  } else if (roll < 0.92) {
    return 5 + Math.random() * 5;  // 5-10 yards (17%)
  } else if (roll < 0.98) {
    return 10 + Math.random() * 7;  // 10-17 yards (6%)
  } else {
    return 17 + Math.random() * 10;  // 17-27 yards (2%)
  }
}

/**
 * ============================================================================
 * SEPARATION CALCULATION - Man vs Zone differentiated
 * ============================================================================
 */
export function calculateSeparation(
  receiver: any,
  defender: any,
  coverageType: 'man' | 'zone',
  situational: SituationalContext
): { separation: number; coverage: number } {
  
  let receiverRating: number;
  let defenderRating: number;
  
  if (coverageType === 'man') {
    receiverRating = calculateWeightedRating(receiver, ATTRIBUTE_WEIGHTS.separation_man, true);
    defenderRating = calculateWeightedRating(defender, ATTRIBUTE_WEIGHTS.coverage_man, true);
  } else {
    receiverRating = calculateWeightedRating(receiver, ATTRIBUTE_WEIGHTS.separation_zone, true);
    defenderRating = calculateWeightedRating(defender, ATTRIBUTE_WEIGHTS.coverage_zone, true);
  }
  
  if (situational.isRedZone) {
    receiverRating *= 0.80;
    defenderRating *= 1.15;
  }
  
  if (situational.isThirdAndLong) {
    defenderRating *= 1.10;
  }
  
  const differential = receiverRating - defenderRating;
  const adjustedDiff = differential + (applyUpsetFactor(0.5, differential) - 0.5) * 15;
  
  // NORMALIZED: Average separation = 2.2 yards (increased to boost completions)
  let separation = 2.2 + (adjustedDiff / 20);  // Reduced divisor for more separation
  separation = applyYardsVariance(separation, VARIANCE_CONFIG.yards_variance);
  separation = Math.max(0.5, Math.min(5.0, separation));
  
  return { separation, coverage: defenderRating };
}

/**
 * ============================================================================
 * THROW ACCURACY
 * ============================================================================
 */
export function calculateThrowAccuracy(
  qb: any,
  routeDistance: number,
  underPressure: boolean,
  situational: SituationalContext
): number {
  
  let accuracyRating: number;
  
  if (underPressure) {
    accuracyRating = calculateWeightedRating(qb, ATTRIBUTE_WEIGHTS.accuracy_pressure, true);
  } else if (routeDistance <= 12) {
    accuracyRating = calculateWeightedRating(qb, ATTRIBUTE_WEIGHTS.accuracy_short, true);
  } else if (routeDistance <= 25) {
    accuracyRating = calculateWeightedRating(qb, ATTRIBUTE_WEIGHTS.accuracy_medium, true);
  } else {
    accuracyRating = calculateWeightedRating(qb, ATTRIBUTE_WEIGHTS.accuracy_deep, true);
    
    const powerCheck = applyRatingVariance(qb.thp || 70, 0.05);
    if (powerCheck < 65) {
      accuracyRating *= 0.75;
    } else if (powerCheck < 75) {
      accuracyRating *= 0.90;
    }
  }
  
  if (situational.isRedZone && routeDistance > 18) {
    accuracyRating *= 0.70;
  }
  
  // NORMALIZED: Balanced accuracy for ~60-65% completion
  let probability = (accuracyRating / 100) * 1.05;  // Slight boost
  probability = applyProbabilityVariance(probability, VARIANCE_CONFIG.outcome_variance);
  
  return Math.max(0.58, Math.min(0.98, probability));
}

/**
 * ============================================================================
 * INCOMPLETION FACTORS
 * ============================================================================
 */
export function checkIncompletionFactors(): { incomplete: boolean; reason: string } {
  
  if (Math.random() < 0.02) {  // Reduced from 5% to 2%
    return { incomplete: true, reason: 'Throwaway' };
  }
  
  if (Math.random() < 0.01) {  // Reduced from 3% to 1%
    return { incomplete: true, reason: 'Batted at line' };
  }
  
  if (Math.random() < 0.005) {  // Reduced from 1% to 0.5%
    return { incomplete: true, reason: 'Receiver fell' };
  }
  
  return { incomplete: false, reason: '' };
}

/**
 * ============================================================================
 * CATCH PROBABILITY
 * ============================================================================
 */
export function calculateCatchProbability(
  receiver: any,
  defender: any,
  separation: number,
  accuracySuccess: boolean
): number {
  
  if (!accuracySuccess) return 0;
  
  const isContested = separation < 1.5;
  
  let catchRating: number;
  
  if (isContested) {
    catchRating = calculateWeightedRating(receiver, ATTRIBUTE_WEIGHTS.catch_contested, true);
    
    const defenderBallSkills = defender.ball_skills || 70;
    const defenderCov = defender.cov || 70;
    const passDefenseRating = (defenderBallSkills * 0.6 + defenderCov * 0.4);
    
    catchRating -= (passDefenseRating - 70) * 0.4;
  } else {
    catchRating = calculateWeightedRating(receiver, ATTRIBUTE_WEIGHTS.catch_clean, true);
  }
  
  // NORMALIZED: 95% catch rate on accurate throws
  let probability = (catchRating / 100) * 1.05;  // Slight boost
  
  if (isContested) {
    probability *= 0.85;  // Less penalty
  }
  
  probability = applyProbabilityVariance(probability, VARIANCE_CONFIG.outcome_variance);
  
  return Math.max(0.55, Math.min(0.99, probability));
}

/**
 * ============================================================================
 * YAC WITH PURSUIT ANGLES - NORMALIZED
 * ============================================================================
 */
export function calculateYardsAfterCatch(
  receiver: any,
  defenders: any[],
  separation: number,
  routeDistance: number,
  situational: SituationalContext
): number {
  
  const receiverYAC = calculateWeightedRating(receiver, ATTRIBUTE_WEIGHTS.yac_calculation, true);
  
  const pursuitRatings = defenders.map(d => {
    const pursuitRating = calculateWeightedRating(d, ATTRIBUTE_WEIGHTS.pursuit, true);
    const tackleRating = calculateWeightedRating(d, ATTRIBUTE_WEIGHTS.tackling, true);
    
    const speed = applyRatingVariance(d.spd || 70, 0.05);
    const pursuit = applyRatingVariance(d.pur || 70, 0.05);
    const angleQuality = (speed * pursuit) / 10000;
    
    const angleVariance = (Math.random() * 2 - 1) * 0.15;
    const finalAngleQuality = Math.max(0.1, Math.min(1, angleQuality + angleVariance));
    
    return {
      pursuit: pursuitRating * finalAngleQuality,
      tackle: tackleRating,
      missedAngle: finalAngleQuality < 0.35,
    };
  });
  
  const avgPursuit = avg(pursuitRatings.map(p => p.pursuit));
  const avgTackle = avg(pursuitRatings.map(p => p.tackle));
  const missedAngles = pursuitRatings.filter(p => p.missedAngle).length;
  
  // NORMALIZED: Base YAC = 2.8 yards (balanced)
  const differential = receiverYAC - avgPursuit;
  let expectedYAC = 2.8 + (differential / 30);
  
  expectedYAC += separation * 0.3;  // Moderate separation bonus
  
  // Route distance penalty
  if (routeDistance > 20) {
    expectedYAC *= 0.50;
  } else if (routeDistance > 12) {
    expectedYAC *= 0.75;
  }
  
  if (situational.isRedZone) {
    expectedYAC *= 0.60;
  }
  
  if (missedAngles > 0) {
    expectedYAC += missedAngles * 3;
  }
  
  expectedYAC = applyYardsVariance(expectedYAC, VARIANCE_CONFIG.yards_variance);
  
  const tackleChance = applyProbabilityVariance(avgTackle / 100, VARIANCE_CONFIG.outcome_variance);
  
  let finalYAC = expectedYAC;
  
  if (Math.random() > tackleChance) {
    const breakTackleBonus = (receiver.btk || 70) / 15;
    const bonusWithVariance = applyYardsVariance(breakTackleBonus, 0.20);
    finalYAC += bonusWithVariance;
  }
  
  // HARD CAP (reduced to lower YPA)
  const maxYAC = routeDistance <= 10 ? 8 : routeDistance <= 20 ? 5 : 3;
  
  if (Math.random() < 0.015 && missedAngles >= 2) {  // Reduced from 2% to 1.5%
    return Math.min(20, Math.round(finalYAC));  // Reduced from 30 to 20
  }
  
  return Math.max(0, Math.min(maxYAC, Math.round(finalYAC)));
}

/**
 * ============================================================================
 * RUSH OUTCOME - NORMALIZED
 * ============================================================================
 */
export function calculateRushOutcome(
  rb: any,
  olinePlayers: any[],
  defenders: any[],
  situational: SituationalContext
): { yards: number; fumble: boolean; touchdown: boolean } {
  
  const holeQuality = calculateWeightedRating({
    rblk: avg(olinePlayers.map(p => applyRatingVariance(p.rblk || 70, 0.05))),
    str: avg(olinePlayers.map(p => applyRatingVariance(p.str || 70, 0.05))),
    hand_placement: avg(olinePlayers.map(p => applyRatingVariance(p.hand_placement || 70, 0.05))),
    leverage: avg(olinePlayers.map(p => applyRatingVariance(p.leverage || 70, 0.05))),
  }, ATTRIBUTE_WEIGHTS.run_blocking, false);
  
  const runDefense = calculateWeightedRating({
    bsh: avg(defenders.map(p => applyRatingVariance(p.bsh || 70, 0.05))),
    str: avg(defenders.map(p => applyRatingVariance(p.str || 70, 0.05))),
    tak: avg(defenders.map(p => applyRatingVariance(p.tak || 70, 0.05))),
    play_recognition: avg(defenders.map(p => applyRatingVariance(p.play_recognition || 70, 0.05))),
  }, ATTRIBUTE_WEIGHTS.run_defense, false);
  
  const visionRating = calculateWeightedRating(rb, ATTRIBUTE_WEIGHTS.rush_vision, true);
  
  const offenseAdvantage = (holeQuality + visionRating) / 2;
  const differential = offenseAdvantage - runDefense;
  const adjustedDiff = differential + (applyUpsetFactor(0.5, differential) - 0.5) * 15;
  
  // NORMALIZED: Base 3.3 YPC (balanced for 90-95 ypg)
  let baseYards = 3.3 + (adjustedDiff / 35);
  
  if (situational.isThirdAndShort) {
    baseYards *= 0.85;
  }
  
  if (situational.isGoalLine) {
    baseYards *= 0.70;
  }
  
  baseYards = applyYardsVariance(baseYards, VARIANCE_CONFIG.yards_variance);
  
  // Broken tackle - NORMALIZED to 15% rate
  const breakTackleRating = calculateWeightedRating(rb, ATTRIBUTE_WEIGHTS.break_tackle, true);
  const tackleQuality = avg(defenders.map(d => calculateWeightedRating(d, ATTRIBUTE_WEIGHTS.tackling, true)));
  
  const breakChance = applyProbabilityVariance(
    0.15 + (breakTackleRating - tackleQuality) / 300,
    VARIANCE_CONFIG.outcome_variance
  );
  
  if (Math.random() < breakChance) {
    const extraYards = 1.0 + Math.random() * 2.0;  // Reduced to 1-3 yards
    baseYards += applyYardsVariance(extraYards, 0.20);
  }
  
  // Big run - NORMALIZED to 2% rate (reduced from 3%)
  const rbSpeed = applyRatingVariance(rb.spd || 70, 0.05);
  const pursuitRating = avg(defenders.map(d => calculateWeightedRating(d, ATTRIBUTE_WEIGHTS.pursuit, true)));
  
  const bigRunChance = 0.02 + (rbSpeed - pursuitRating) / 600;  // Reduced from 0.03 and /500
  
  if (Math.random() < bigRunChance && baseYards > 5) {
    const bigRunYards = 12 + Math.random() * 15;  // Reduced from 15-35 to 12-27
    baseYards = applyYardsVariance(bigRunYards, VARIANCE_CONFIG.big_play_variance);
  }
  
  // FUMBLE - NORMALIZED to 1.5% rate
  const ballSecurityRating = calculateWeightedRating(rb, ATTRIBUTE_WEIGHTS.ball_security, true);
  const defenderAgg = avg(defenders.map(d => applyRatingVariance(d.agg || 70, 0.05)));
  
  let fumbleChance = 0.015 + (70 - ballSecurityRating) / 5000 + (defenderAgg - 70) / 5000;
  fumbleChance = applyProbabilityVariance(fumbleChance, VARIANCE_CONFIG.outcome_variance);
  fumbleChance = Math.max(0.005, Math.min(0.035, fumbleChance));
  
  const fumble = Math.random() < fumbleChance;
  const touchdown = (situational.yardLine + baseYards) >= 100;
  
  // HARD CAP
  if (baseYards > 50) {
    baseYards = 50;
  }
  
  return {
    yards: Math.max(-5, Math.round(baseYards)),
    fumble,
    touchdown,
  };
}

/**
 * ============================================================================
 * INTERCEPTION CHANCE - NORMALIZED
 * ============================================================================
 */
export function calculateInterceptionChance(
  qb: any,
  defender: any,
  separation: number,
  underPressure: boolean,
  coaches?: CoachingStaff
): number {
  
  // NORMALIZED: Target 2.2% INT rate
  let baseIntRate = 0.022;
  
  if (underPressure) {
    baseIntRate *= 1.8;
  }
  
  if (separation < 1.0) {
    baseIntRate *= 1.5;
  }
  
  const qbDecision = qb.dec || 70;
  const decisionPenalty = (70 - qbDecision) / 2000;
  baseIntRate += decisionPenalty;
  
  const defBallSkills = defender.ball_skills || 70;
  const defBonus = (defBallSkills - 70) / 2000;
  baseIntRate += defBonus;
  
  baseIntRate = applyProbabilityVariance(baseIntRate, VARIANCE_CONFIG.outcome_variance);
  
  // Apply defensive coordinator's turnover focus
  if (coaches?.defensiveCoordinator?.turnover_focus) {
    const turnoverBonus = (coaches.defensiveCoordinator.turnover_focus / 100) * 0.015;
    baseIntRate += turnoverBonus; // +0 to +1.5%
  }
  
  return Math.max(0.005, Math.min(0.08, baseIntRate));
}

/**
 * ============================================================================
 * FIELD GOAL - NORMALIZED
 * ============================================================================
 */
export function calculateFieldGoalSuccess(
  kicker: any,
  distance: number,
  situational: SituationalContext
): boolean {
  
  // Simplified FG formula - more generous
  let baseSuccess = 98;
  if (distance >= 55) baseSuccess = 60;
  else if (distance >= 50) baseSuccess = 75;
  else if (distance >= 45) baseSuccess = 82;
  else if (distance >= 40) baseSuccess = 88;
  else if (distance >= 35) baseSuccess = 93;
  
  // Kicker skill modifier (minimal impact)
  const kickAccuracy = kicker.kac || 70;
  const skillBonus = (kickAccuracy - 70) / 5;  // ±4% range
  
  let finalSuccess = baseSuccess + skillBonus;
  
  // Small variance for clutch/choke
  finalSuccess += (Math.random() * 2 - 1) * 3;  // ±3% random
  
  finalSuccess = Math.max(50, Math.min(99, finalSuccess));
  
  return Math.random() * 100 < finalSuccess;
}

/**
 * ============================================================================
 * COVERAGE TYPE DETERMINATION
 * ============================================================================
 */
export function determineCoverageType(
  situational: SituationalContext,
  coaches?: CoachingStaff
): 'man' | 'zone' {
  
  // If coaches present, use their man/zone bias
  if (coaches?.defensiveCoordinator?.man_bias && coaches?.defensiveCoordinator?.zone_bias) {
    const dc = coaches.defensiveCoordinator;
    const totalCov = dc.man_bias + dc.zone_bias;
    const manThreshold = dc.man_bias / totalCov;
    return Math.random() < manThreshold ? 'man' : 'zone';
  }
  
  // Otherwise use situational defaults
  if (situational.isThirdAndLong) {
    return Math.random() < 0.55 ? 'man' : 'zone';
  }
  
  if (situational.isRedZone) {
    return Math.random() < 0.60 ? 'man' : 'zone';
  }
  
  if (situational.isTwoMinuteDrill) {
    return Math.random() < 0.50 ? 'man' : 'zone';
  }
  
  return Math.random() < 0.48 ? 'man' : 'zone';
}

/**
 * ============================================================================
 * TOUCHDOWN PROBABILITY - NORMALIZED
 * ============================================================================
 */
export function calculateTouchdownProbability(
  yards: number,
  yardLine: number,
  playType: 'pass' | 'run'
): boolean {
  
  const yardsToGoal = 100 - yardLine;
  
  if (yards < yardsToGoal) return false;
  
  // Goal line defense - almost no resistance to hit 3.0 TD/game target
  if (yardsToGoal <= 2) {
    const goalLineDefense = 0.05;  // 95% success rate from 1-2 yards
    return Math.random() > goalLineDefense;
  }
  
  if (yardsToGoal <= 10) {
    return true;  // Auto-TD from 3-10 yards
  }
  
  return true;  // Auto-TD if yards gained reach goal line
}

/**
 * ============================================================================
 * PLAY TYPE DETERMINATION - NORMALIZED
 * ============================================================================
 */
export function determinePlayType(
  situational: SituationalContext,
  coaches?: CoachingStaff
): 'pass' | 'run' | 'field_goal' | 'punt' {
  
  // Check 4th down decisions with coaching aggressiveness
  if (situational.down === 4) {
    // Check if aggressive coach wants to go for it
    if (coaches) {
      const { shouldGoForItOnFourth } = require('./coaching-influence');
      if (shouldGoForItOnFourth(situational, coaches)) {
        // Continue to play selection (don't punt/FG)
      } else {
        // Use standard 4th down logic
        if (situational.yardLine >= 65 && situational.yardLine <= 95) {
          return 'field_goal';
        }
        return 'punt';
      }
    } else {
      // No coaches, use standard logic
      if (situational.yardLine >= 65 && situational.yardLine <= 95) {
        return 'field_goal';
      }
      if (situational.yardLine < 65) {
        return 'punt';
      }
    }
  }
  
  // NORMALIZED: 58% pass, 42% run (NFL average)
  let passPercentage = 0.58;
  
  if (situational.isThirdAndLong) {
    passPercentage = 0.90;
  } else if (situational.isThirdAndShort) {
    passPercentage = 0.40;
  } else if (situational.isTwoMinuteDrill) {
    passPercentage = 0.85;
  } else if (situational.scoreDifferential < -14) {
    passPercentage = 0.75;
  } else if (situational.scoreDifferential > 14) {
    passPercentage = 0.30;
  } else if (situational.down === 1) {
    passPercentage = 0.45;  // 1st down: run more
  } else if (situational.down === 2) {
    passPercentage = situational.distance > 7 ? 0.65 : 0.50;
  }
  
  let basePlayType: 'pass' | 'run' = Math.random() < passPercentage ? 'pass' : 'run';
  
  // Apply coaching modifiers to play selection
  if (coaches) {
    const { applyCoachingModifiers } = require('./coaching-influence');
    const modifiers = applyCoachingModifiers(basePlayType, situational, coaches);
    return modifiers.playType;
  }
  
  return basePlayType;
}

