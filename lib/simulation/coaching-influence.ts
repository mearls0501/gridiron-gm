// Coaching influence system for game simulation
// Coaches affect play calling, strategy, player development, and in-game performance

import { SituationalContext } from './attribute-engine';

/**
 * Coach interface matching database schema
 */
export interface Coach {
  id: string;
  full_name: string;
  role: string;
  team_id?: string | null;
  archetype?: string | null;
  
  // Core coaching attributes (0-100)
  leadership: number;
  football_iq: number;
  motivation: number;
  adaptability: number;
  aggressiveness: number;
  talent_dev: number;
  scheme_fit: number;

  // Offensive coordinator attributes
  run_bias?: number | null;
  pass_bias?: number | null;
  tempo?: number | null;
  creativity?: number | null;
  red_zone_iq?: number | null;

  // Defensive coordinator attributes
  man_bias?: number | null;
  zone_bias?: number | null;
  blitz_rate?: number | null;
  turnover_focus?: number | null;
  bend_break?: number | null;
}

/**
 * Team's full coaching staff
 */
export interface CoachingStaff {
  headCoach: Coach;
  offensiveCoordinator: Coach;
  defensiveCoordinator: Coach;
}

/**
 * Structured coaching play modifiers
 */
export interface CoachingPlayModifiers {
  playType: 'pass' | 'run';
  isTrickPlay: boolean;
  isHighEfficiency: boolean;
  coverageType: 'man' | 'zone';
  isBlitz: boolean;
  tempoMultiplier: number;
}

// ---------------------------
// PLAY CALL MODIFICATION
// ---------------------------

/**
 * Apply coaching staff tendencies to modify play calling
 * @param basePlayType - The base play type from situational logic
 * @param situational - Current game situation context
 * @param coaches - Team's coaching staff
 * @returns Modified play call with coaching influence
 */
export function applyCoachingModifiers(
  basePlayType: 'pass' | 'run',
  situational: SituationalContext,
  coaches: CoachingStaff
): CoachingPlayModifiers {
  const oc = coaches.offensiveCoordinator;
  const dc = coaches.defensiveCoordinator;

  let playType = basePlayType;
  let isTrickPlay = false;
  let isHighEfficiency = false;
  let coverageType: 'man' | 'zone' = 'zone';
  let isBlitz = false;
  let tempoMultiplier = 1.0;

  // ---------- OFFENSIVE COORDINATOR ----------
  
  // Run/Pass bias (normalized properly)
  if (oc.run_bias && oc.pass_bias) {
    const totalBias = oc.run_bias + oc.pass_bias;
    const runThreshold = oc.run_bias / totalBias;
    
    // Apply bias adjustment to base play call (15% chance to override)
    const biasRoll = Math.random();
    if (biasRoll < runThreshold && playType === 'pass') {
      // OC wants to run more, shift some passes to runs
      if (Math.random() < 0.15) playType = 'run';
    } else if (biasRoll >= runThreshold && playType === 'run') {
      // OC wants to pass more, shift some runs to passes
      if (Math.random() < 0.15) playType = 'pass';
    }
  }

  // Tempo influence (affects plays per game and hurry-up usage)
  if (oc.tempo) {
    tempoMultiplier = 0.85 + (oc.tempo / 100) * 0.30; // Range: 0.85 to 1.15
    
    // High tempo = more passes in two-minute drill
    if (oc.tempo > 70 && situational.isTwoMinuteDrill) {
      if (Math.random() < (oc.tempo - 70) / 150) {
        playType = 'pass';
      }
    }
  }

  // Creativity = occasional trick plays
  if (oc.creativity && oc.creativity > 80) {
    // Rare but possible on 1st-3rd down
    if (situational.down <= 3 && Math.random() < (oc.creativity - 75) / 400) {
      isTrickPlay = true;
    }
  }

  // Red zone efficiency
  if (oc.red_zone_iq && situational.isRedZone) {
    if (Math.random() < oc.red_zone_iq / 150) {
      isHighEfficiency = true;
    }
  }

  // ---------- DEFENSIVE COORDINATOR ----------
  
  // Coverage scheme (man vs zone)
  if (dc.man_bias && dc.zone_bias) {
    const totalCov = dc.man_bias + dc.zone_bias;
    const manThreshold = dc.man_bias / totalCov;
    coverageType = Math.random() < manThreshold ? 'man' : 'zone';
  } else {
    // Default 50/50 if attributes missing
    coverageType = Math.random() < 0.5 ? 'man' : 'zone';
  }

  // Blitz tendency
  if (dc.blitz_rate) {
    isBlitz = Math.random() < (dc.blitz_rate / 100);
  }

  return {
    playType,
    isTrickPlay,
    isHighEfficiency,
    coverageType,
    isBlitz,
    tempoMultiplier,
  };
}

// ---------------------------
// SUCCESS RATE MODIFIERS
// ---------------------------

/**
 * Calculate offensive coaching bonuses to success rate
 * @param baseSuccess - Base success probability (0-1)
 * @param situational - Current game situation
 * @param coaches - Team's coaching staff
 * @param modifiers - Applied coaching modifiers
 * @returns Adjusted success probability
 */
export function calculateCoachingBonus(
  baseSuccess: number,
  situational: SituationalContext,
  coaches: CoachingStaff,
  modifiers: CoachingPlayModifiers
): number {
  let success = baseSuccess;

  const hc = coaches.headCoach;
  const oc = coaches.offensiveCoordinator;

  // Red zone bonus
  if (situational.isRedZone && oc.red_zone_iq) {
    success += (oc.red_zone_iq / 100) * 0.15; // 0-15% bonus
  }

  // High efficiency bonus
  if (modifiers.isHighEfficiency) {
    success += 0.08; // 8% bonus for smart play calling
  }

  // Trick play bonus/risk (high variance)
  if (modifiers.isTrickPlay) {
    if (Math.random() < 0.6) {
      success += 0.20; // 20% boost if defense doesn't read it
    } else {
      success -= 0.30; // -30% if defense reads it
    }
  }

  // 4th down aggressiveness bonus
  if (situational.down === 4 && hc.aggressiveness) {
    // Aggressive coaches get slight boost on 4th down
    success += ((hc.aggressiveness - 50) / 100) * 0.05; // -2.5% to +2.5%
  }

  // Leadership in close games
  const isCloseGame = Math.abs(situational.scoreDifferential) <= 7;
  if (isCloseGame && hc.leadership) {
    success += (hc.leadership / 100) * 0.05; // 0-5% bonus
  }

  // Football IQ reduces mental mistakes
  if (hc.football_iq) {
    success += (hc.football_iq / 100) * 0.03; // 0-3% bonus
  }

  // Scheme fit multiplier
  if (hc.scheme_fit) {
    success *= (1 + (hc.scheme_fit - 50) / 600); // ±8.3% max
  }

  // Ensure success stays in valid range [0, 1]
  return Math.max(0, Math.min(1, success));
}

/**
 * Calculate defensive coaching bonuses
 */
export function calculateDefensiveCoachingBonus(
  basePressure: number,
  baseIntChance: number,
  coaches: CoachingStaff,
  modifiers: CoachingPlayModifiers
): { pressure: number; intChance: number } {
  const dc = coaches.defensiveCoordinator;
  
  let pressure = basePressure;
  let intChance = baseIntChance;

  // Blitz increases pressure
  if (modifiers.isBlitz && dc.blitz_rate) {
    pressure += (dc.blitz_rate / 100) * 0.15; // +0 to +15% pressure
  }

  // Turnover focus increases interceptions
  if (dc.turnover_focus) {
    intChance += (dc.turnover_focus / 100) * 0.015; // +0 to +1.5%
  }

  // Bend-but-don't-break philosophy
  // High values mean willing to give up yards to prevent TDs
  if (dc.bend_break) {
    // This will be applied to touchdown prevention logic
    // Not implemented here, but should reduce TD chance in red zone
  }

  return { pressure, intChance };
}

// ---------------------------
// 4TH DOWN DECISION MAKING
// ---------------------------

/**
 * Determine if team should go for it on 4th down based on coaching aggressiveness
 */
export function shouldGoForItOnFourth(
  situational: SituationalContext,
  coaches: CoachingStaff
): boolean {
  const hc = coaches.headCoach;
  
  // Base 4th down thresholds (probability of going for it)
  let goForItThreshold = 0.0;
  
  if (situational.distance === 1) goForItThreshold = 0.70;
  else if (situational.distance <= 3) goForItThreshold = 0.50;
  else if (situational.distance <= 5) goForItThreshold = 0.20;
  else goForItThreshold = 0.05;
  
  // Aggressiveness modifier
  if (hc.aggressiveness) {
    const aggMod = (hc.aggressiveness - 50) / 100; // -0.5 to +0.5
    goForItThreshold += aggMod * 0.30; // Adjust threshold by up to ±30%
  }
  
  // Score differential consideration (more aggressive when losing)
  if (situational.scoreDifferential < -14) {
    goForItThreshold += 0.20;
  } else if (situational.scoreDifferential < -7) {
    goForItThreshold += 0.10;
  }
  
  // Field position consideration (more aggressive in opponent territory)
  if (situational.yardLine > 50) {
    goForItThreshold += 0.15;
  }
  
  return Math.random() < goForItThreshold;
}

// ---------------------------
// PLAYER DEVELOPMENT
// ---------------------------

/**
 * Get talent development multiplier from head coach
 * Applied to player rating progression
 */
export function getTalentDevelopmentMultiplier(coach: Coach): number {
  if (!coach.talent_dev) return 1.0;
  
  // Range: 0.75x to 1.25x development speed
  // 0 talent_dev = 0.75x, 50 = 1.0x, 100 = 1.25x
  return 0.75 + (coach.talent_dev / 100) * 0.50;
}

/**
 * Get motivation impact on player performance
 * Applied as a small performance boost
 */
export function getMotivationBonus(coach: Coach): number {
  if (!coach.motivation) return 0;
  
  // Range: 0 to +3% performance boost
  return (coach.motivation / 100) * 0.03;
}

// ---------------------------
// GAME PACE MODIFIERS
// ---------------------------

/**
 * Get tempo modifier for total plays per game
 * Low tempo coaches = fewer plays, high tempo = more plays
 */
export function getTempoPlayCountModifier(oc: Coach): number {
  if (!oc.tempo) return 1.0;
  
  // Range: 0.85x to 1.15x plays per game
  // 0 tempo = 0.85x (slow, methodical), 50 = 1.0x, 100 = 1.15x (hurry-up)
  return 0.85 + (oc.tempo / 100) * 0.30;
}

// ---------------------------
// SCHEME & STRATEGY
// ---------------------------

/**
 * Calculate scheme fit modifier for team performance
 * Applied to overall team strength calculation
 */
export function getSchemeFitModifier(hc: Coach): number {
  if (!hc.scheme_fit) return 1.0;
  
  // Range: 0.917x to 1.083x (±8.3% max)
  // 0 scheme_fit = 0.917x, 50 = 1.0x, 100 = 1.083x
  return 1 + (hc.scheme_fit - 50) / 600;
}

/**
 * Get adaptability bonus for second half adjustments
 * Applied at halftime to improve performance based on first half
 */
export function getAdaptabilityBonus(coach: Coach, halfNumber: 1 | 2): number {
  if (halfNumber === 1 || !coach.adaptability) return 0;
  
  // Second half only: 0 to +5% performance boost
  return (coach.adaptability / 100) * 0.05;
}

/**
 * Calculate creativity impact on play variety and unpredictability
 */
export function getCreativityVariance(oc: Coach): number {
  if (!oc.creativity) return 0;
  
  // Higher creativity = more variance in outcomes (both good and bad)
  // Range: 0 to 0.15 (15% additional variance)
  return (oc.creativity / 100) * 0.15;
}

// ---------------------------
// VALIDATION & UTILITIES
// ---------------------------

/**
 * Validate coaching staff has all required coaches
 */
export function validateCoachingStaff(coaches: CoachingStaff): void {
  if (!coaches.headCoach) {
    throw new Error('CoachingStaff missing head coach');
  }
  if (!coaches.offensiveCoordinator) {
    throw new Error('CoachingStaff missing offensive coordinator');
  }
  if (!coaches.defensiveCoordinator) {
    throw new Error('CoachingStaff missing defensive coordinator');
  }
}

/**
 * Get default/neutral coach for testing or fallback
 * All attributes set to 50 (neutral)
 */
export function getNeutralCoach(role: string): Coach {
  return {
    id: 'neutral-' + role,
    full_name: 'Neutral Coach',
    role,
    leadership: 50,
    football_iq: 50,
    motivation: 50,
    adaptability: 50,
    aggressiveness: 50,
    talent_dev: 50,
    scheme_fit: 50,
    run_bias: 50,
    pass_bias: 50,
    tempo: 50,
    creativity: 50,
    red_zone_iq: 50,
    man_bias: 50,
    zone_bias: 50,
    blitz_rate: 50,
    turnover_focus: 50,
    bend_break: 50,
  };
}



