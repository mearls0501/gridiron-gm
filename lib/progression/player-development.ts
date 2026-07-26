// @ts-nocheck
import {
  PlayerProgressionState,
  SeasonDevelopmentResult,
  AttributeChange,
  DevelopmentReason,
  DevelopmentFactors,
  DevelopmentMultipliers,
  CareerPhase,
  DevelopmentTrajectory,
  PositionGroup,
  InjuryRecord,
} from "./development-types";
import {
  POSITION_AGE_CURVES,
  getAgeCurvePoint,
  determineCareerPhase,
  positionToGroup,
} from "./age-curves";

// ==========================================
// Player Development Engine
// ==========================================

/**
 * Process a player's development for one season
 */
export function processPlayerSeason(
  state: PlayerProgressionState,
  position: string,
  attributes: Record<string, number>,
  factors: DevelopmentFactors
): SeasonDevelopmentResult {
  const posGroup = positionToGroup(position);
  const curve = POSITION_AGE_CURVES[posGroup];
  const agePoint = getAgeCurvePoint(posGroup, state.currentAge);

  // Calculate development multipliers
  const multipliers = calculateDevelopmentMultipliers(factors, agePoint!);

  // Track attribute changes
  const attributeChanges: AttributeChange[] = [];

  // Separate physical and mental attributes
  const physicalAttrs = curve.physicalAttributes;
  const mentalAttrs = curve.mentalAttributes;

  // Process each attribute
  for (const [attr, value] of Object.entries(attributes)) {
    const isPhysical = physicalAttrs.includes(attr);
    const isMental = mentalAttrs.includes(attr);

    let change = calculateAttributeChange(
      attr,
      value,
      isPhysical,
      isMental,
      state,
      factors,
      multipliers,
      agePoint!
    );

    if (change !== 0) {
      attributeChanges.push({
        attribute: attr,
        previousValue: value,
        newValue: Math.max(0, Math.min(99, value + change)),
        change,
        reason: determineChangeReason(isPhysical, isMental, change, state.careerPhase),
      });
    }
  }

  // Calculate overall change
  const ovrChange = calculateOverallChange(attributeChanges, position);
  const newOVR = Math.max(40, Math.min(99, state.currentOVR + ovrChange));

  // Check for phase transition
  const newPhase = determineCareerPhase(posGroup, state.currentAge, state.yearsInLeague);
  const phaseChanged = newPhase !== state.careerPhase;

  // Check for trajectory changes
  const trajectoryChange = evaluateTrajectoryChange(state, ovrChange, factors, newPhase);

  // Generate narrative
  const narrative = generateDevelopmentNarrative(
    state,
    ovrChange,
    attributeChanges,
    phaseChanged,
    newPhase,
    factors
  );

  return {
    playerId: state.playerId,
    season: factors.yearsInLeague + 1,
    previousOVR: state.currentOVR,
    newOVR,
    ovrChange,
    attributeChanges,
    previousPhase: state.careerPhase,
    newPhase,
    phaseChanged,
    trajectoryChange,
    developmentNarrative: narrative,
    breakoutCandidate: ovrChange >= 5 && state.careerPhase === "developing",
    declineWarning: ovrChange <= -3 && state.currentAge > 28,
  };
}

/**
 * Calculate development multipliers based on various factors
 */
function calculateDevelopmentMultipliers(
  factors: DevelopmentFactors,
  agePoint: { physicalModifier: number; mentalModifier: number }
): DevelopmentMultipliers {
  // Age multiplier - young players develop faster
  let ageMultiplier = 1.0;
  if (factors.age < 25) {
    ageMultiplier = 1.3 - (factors.age - 21) * 0.075; // 1.3 at 21, 1.0 at 25
  } else if (factors.age > 30) {
    ageMultiplier = 0.7 - (factors.age - 30) * 0.05; // Decreasing after 30
  }
  ageMultiplier = Math.max(0.2, Math.min(1.5, ageMultiplier));

  // Playing time multiplier - more reps = faster development
  let playingTimeMultiplier = 0.5 + (factors.playingTimePercent / 100) * 0.7;
  // Starters get bonus
  if (factors.starterStatus) {
    playingTimeMultiplier *= 1.15;
  }

  // Scheme fit multiplier - good fit = better development
  let schemeFitMultiplier = 0.7 + (factors.schemeFit / 100) * 0.6;

  // Coaching multiplier
  let coachingMultiplier = 0.8 + (factors.coachDevelopmentSkill / 100) * 0.4;

  // Work ethic multiplier
  let workEthicMultiplier = 0.7 + (factors.workEthic / 100) * 0.6;

  // Injury multiplier - injuries slow development
  let injuryMultiplier = 1.0;
  if (factors.currentInjury) {
    injuryMultiplier = 0.3;
  } else if (factors.injuryHistorySeverity > 50) {
    injuryMultiplier = 0.7 + (100 - factors.injuryHistorySeverity) / 166;
  }

  // Mentor multiplier - veterans help young players
  let mentorMultiplier = factors.veteranMentors ? 1.15 : 1.0;
  // Only applies to young players
  if (factors.yearsInLeague > 4) {
    mentorMultiplier = 1.0;
  }

  // Calculate total
  const totalMultiplier =
    ageMultiplier *
    playingTimeMultiplier *
    schemeFitMultiplier *
    coachingMultiplier *
    workEthicMultiplier *
    injuryMultiplier *
    mentorMultiplier;

  return {
    ageMultiplier,
    playingTimeMultiplier,
    schemeFitMultiplier,
    coachingMultiplier,
    workEthicMultiplier,
    injuryMultiplier,
    mentorMultiplier,
    totalMultiplier: Math.max(0.1, Math.min(2.5, totalMultiplier)),
  };
}

/**
 * Calculate change for a single attribute
 */
function calculateAttributeChange(
  attr: string,
  currentValue: number,
  isPhysical: boolean,
  isMental: boolean,
  state: PlayerProgressionState,
  factors: DevelopmentFactors,
  multipliers: DevelopmentMultipliers,
  agePoint: { physicalModifier: number; mentalModifier: number; injuryRiskModifier: number }
): number {
  let baseChange = 0;

  // Phase-based development
  switch (state.careerPhase) {
    case "rookie":
      baseChange = isPhysical ? 2 : 3; // Rookies learn fast
      break;
    case "developing":
      baseChange = isPhysical ? 1.5 : 2.5;
      break;
    case "prime":
      baseChange = isPhysical ? 0 : 1; // Physical holds steady, mental still grows
      break;
    case "veteran":
      baseChange = isPhysical ? -1 : 0.5;
      break;
    case "declining":
      baseChange = isPhysical ? -2.5 : -0.5;
      break;
    case "twilight":
      baseChange = isPhysical ? -4 : -1;
      break;
  }

  // Apply age curve modifiers
  if (isPhysical) {
    // Physical attributes follow the age curve closely
    const curveEffect = agePoint.physicalModifier / 20; // -5 to +5 range
    baseChange += curveEffect;
  } else if (isMental) {
    // Mental attributes peak later
    const curveEffect = agePoint.mentalModifier / 30; // Smaller effect
    baseChange += curveEffect;
  }

  // Apply multipliers
  let change = baseChange * multipliers.totalMultiplier;

  // Ceiling limits - can't go above potential
  if (currentValue >= state.potentialOVR + 5) {
    change = Math.min(change, 0); // Can't improve beyond ceiling
  }

  // Floor limits - players don't drop below a base competence quickly
  const minimumForPosition = 30;
  if (currentValue + change < minimumForPosition) {
    change = minimumForPosition - currentValue;
  }

  // Training focus bonus
  if (factors.trainFocus === attr) {
    change += 1.5;
  }

  // Add randomness (-1 to +1)
  change += (Math.random() - 0.5) * 2;

  return Math.round(change * 10) / 10; // Round to 1 decimal
}

function determineChangeReason(
  isPhysical: boolean,
  isMental: boolean,
  change: number,
  phase: CareerPhase
): DevelopmentReason {
  if (phase === "rookie" || phase === "developing") {
    if (change > 0) return isMental ? "mental_maturity" : "natural_growth";
  }

  if (phase === "declining" || phase === "twilight") {
    if (change < 0) return isPhysical ? "physical_decline" : "age_regression";
  }

  if (change > 0) {
    return isMental ? "game_experience" : "training";
  }

  return isPhysical ? "age_regression" : "age_progression";
}

/**
 * Calculate overall rating change from attribute changes
 */
function calculateOverallChange(
  changes: AttributeChange[],
  position: string
): number {
  if (changes.length === 0) return 0;

  // Weight changes by importance to position
  const positionWeights = getPositionAttributeWeights(position);

  let weightedSum = 0;
  let totalWeight = 0;

  for (const change of changes) {
    const weight = positionWeights[change.attribute] || 1;
    weightedSum += change.change * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;
}

/**
 * Get attribute weights for position (important attrs weighted higher)
 */
function getPositionAttributeWeights(position: string): Record<string, number> {
  const weights: Record<string, Record<string, number>> = {
    QB: {
      throwPower: 3,
      throwAccuracyShort: 3,
      throwAccuracyMid: 3,
      throwAccuracyDeep: 3,
      playRecognition: 2,
      awareness: 2,
      speed: 1,
    },
    RB: {
      speed: 3,
      acceleration: 3,
      agility: 2,
      elusiveness: 2,
      breakTackle: 2,
      vision: 2,
      carrying: 2,
    },
    WR: {
      speed: 3,
      acceleration: 2,
      routeRunning: 3,
      catching: 3,
      separation: 2,
      release: 2,
    },
    // Add more positions as needed
  };

  return weights[position.toUpperCase()] || {};
}

/**
 * Evaluate if player's trajectory should change
 */
function evaluateTrajectoryChange(
  state: PlayerProgressionState,
  ovrChange: number,
  factors: DevelopmentFactors,
  newPhase: CareerPhase
): { previous: DevelopmentTrajectory; new: DevelopmentTrajectory; reason: string } | undefined {
  const prev = state.trajectory;
  let newTrajectory = prev;
  let reason = "";

  // Check for bust trajectory
  if (
    prev === "star" &&
    state.yearsInLeague >= 3 &&
    state.currentOVR < 70 &&
    ovrChange <= 0
  ) {
    newTrajectory = "starter";
    reason = "Hasn't developed to elite level as projected";
  }

  if (
    prev === "starter" &&
    state.yearsInLeague >= 3 &&
    state.currentOVR < 60 &&
    ovrChange < 0
  ) {
    newTrajectory = "contributor";
    reason = "Struggling to develop into starter role";
  }

  if (
    state.yearsInLeague >= 4 &&
    state.currentOVR < 55 &&
    newPhase === "prime"
  ) {
    newTrajectory = "bust";
    reason = "Failed to develop NFL-caliber skills";
  }

  // Check for positive trajectory changes (late bloomer)
  if (
    prev === "contributor" &&
    ovrChange >= 5 &&
    state.currentOVR >= 70
  ) {
    newTrajectory = "starter";
    reason = "Breakout performance, showing starter ability";
  }

  if (
    prev === "starter" &&
    ovrChange >= 5 &&
    state.currentOVR >= 85
  ) {
    newTrajectory = "star";
    reason = "Developed into elite player";
  }

  if (newTrajectory !== prev) {
    return { previous: prev, new: newTrajectory, reason };
  }

  return undefined;
}

/**
 * Generate narrative text about player's development
 */
function generateDevelopmentNarrative(
  state: PlayerProgressionState,
  ovrChange: number,
  changes: AttributeChange[],
  phaseChanged: boolean,
  newPhase: CareerPhase,
  factors: DevelopmentFactors
): string {
  const narratives: string[] = [];

  // Overall trajectory
  if (ovrChange >= 5) {
    narratives.push("had a breakout year, making significant strides in his development");
  } else if (ovrChange >= 2) {
    narratives.push("continued to develop, showing improvement across the board");
  } else if (ovrChange >= 0) {
    narratives.push("maintained his level of play, holding steady");
  } else if (ovrChange >= -2) {
    narratives.push("showed some regression, taking a slight step back");
  } else {
    narratives.push("struggled this season, showing significant decline");
  }

  // Specific attribute highlights
  const bigGains = changes.filter((c) => c.change >= 3);
  const bigLosses = changes.filter((c) => c.change <= -3);

  if (bigGains.length > 0) {
    const attr = bigGains[0].attribute.replace(/([A-Z])/g, " $1").toLowerCase();
    narratives.push(`His ${attr} improved dramatically`);
  }

  if (bigLosses.length > 0) {
    const attr = bigLosses[0].attribute.replace(/([A-Z])/g, " $1").toLowerCase();
    narratives.push(`His ${attr} noticeably declined`);
  }

  // Phase transition
  if (phaseChanged) {
    switch (newPhase) {
      case "prime":
        narratives.push("He's entering his prime years");
        break;
      case "veteran":
        narratives.push("He's now a seasoned veteran, relying more on experience");
        break;
      case "declining":
        narratives.push("Father Time is catching up, as decline has set in");
        break;
      case "twilight":
        narratives.push("He's in the twilight of his career");
        break;
    }
  }

  // Scheme fit impact
  if (factors.schemeFit < 50) {
    narratives.push("His development was hindered by poor scheme fit");
  } else if (factors.schemeFit > 80) {
    narratives.push("The scheme fit helped maximize his potential");
  }

  // Coaching impact
  if (factors.coachDevelopmentSkill > 85) {
    narratives.push("Excellent coaching helped accelerate his growth");
  }

  return narratives.join(". ") + ".";
}

// ==========================================
// Batch Processing
// ==========================================

export interface PlayerForDevelopment {
  playerId: string;
  name: string;
  position: string;
  age: number;
  yearsInLeague: number;
  currentOVR: number;
  potentialOVR: number;
  trajectory: DevelopmentTrajectory;
  attributes: Record<string, number>;
  injuryHistory: InjuryRecord[];
}

/**
 * Process development for all players on a team
 */
export function processTeamDevelopment(
  players: PlayerForDevelopment[],
  teamFactors: {
    coachDevelopmentSkill: number;
    offensiveScheme: string;
    defensiveScheme: string;
    teamQuality: number;
    schemeFits: Map<string, number>; // playerId -> fit score
    playingTimes: Map<string, number>; // playerId -> snap %
    starters: Set<string>; // playerId set
    mentorsByPosition: Map<string, boolean>; // position -> has mentor
  }
): SeasonDevelopmentResult[] {
  const results: SeasonDevelopmentResult[] = [];

  for (const player of players) {
    // Build progression state
    const state: PlayerProgressionState = {
      playerId: player.playerId,
      currentAge: player.age,
      yearsInLeague: player.yearsInLeague,
      careerPhase: determineCareerPhase(
        positionToGroup(player.position),
        player.age,
        player.yearsInLeague
      ),
      trajectory: player.trajectory,
      potentialOVR: player.potentialOVR,
      currentOVR: player.currentOVR,
      ceilingRemaining: player.potentialOVR - player.currentOVR,
      developmentRate: 1.0,
      injuryHistory: player.injuryHistory,
      durabilityRating: 75, // Could be calculated from injury history
      schemeFitLevel: teamFactors.schemeFits.get(player.playerId) || 50,
      playingTimePercent: teamFactors.playingTimes.get(player.playerId) || 20,
      coachDevelopmentBonus: teamFactors.coachDevelopmentSkill / 100,
    };

    // Build development factors
    const factors: DevelopmentFactors = {
      age: player.age,
      yearsInLeague: player.yearsInLeague,
      positionGroup: positionToGroup(player.position),
      playingTimePercent: state.playingTimePercent,
      starterStatus: teamFactors.starters.has(player.playerId),
      performanceRating: 50 + (Math.random() - 0.5) * 30, // Simulated performance
      schemeFit: state.schemeFitLevel,
      coachDevelopmentSkill: teamFactors.coachDevelopmentSkill,
      schemeStability: true, // Would track scheme changes
      currentInjury: false, // Would check injury status
      injuryHistorySeverity: calculateInjurySeverity(player.injuryHistory),
      durabilityRating: state.durabilityRating,
      workEthic: 70 + Math.random() * 20, // Would be player attribute
      footballIQ: 65 + Math.random() * 25,
      coachability: 70 + Math.random() * 20,
      teamQuality: teamFactors.teamQuality,
      veteranMentors: teamFactors.mentorsByPosition.get(player.position) || false,
      competitionLevel: teamFactors.teamQuality * 0.7 + Math.random() * 30,
    };

    const result = processPlayerSeason(state, player.position, player.attributes, factors);
    results.push(result);
  }

  return results;
}

function calculateInjurySeverity(injuries: InjuryRecord[]): number {
  if (injuries.length === 0) return 0;

  let severity = 0;
  for (const injury of injuries) {
    switch (injury.severity) {
      case "minor":
        severity += 5;
        break;
      case "moderate":
        severity += 15;
        break;
      case "major":
        severity += 30;
        break;
      case "career_threatening":
        severity += 50;
        break;
    }
  }

  return Math.min(100, severity);
}

// ==========================================
// Retirement Logic
// ==========================================

export interface RetirementDecision {
  willRetire: boolean;
  reason?: string;
  confidence: number; // How likely this decision is
}

export function evaluateRetirement(
  player: {
    name: string;
    age: number;
    position: string;
    currentOVR: number;
    careerEarnings: number;
    championships: number;
    allProSelections: number;
    yearsInLeague: number;
  },
  context: {
    hasContract: boolean;
    marketInterest: boolean;
    injuredLastSeason: boolean;
    majorInjuryHistory: boolean;
    familyConsiderations: boolean;
  }
): RetirementDecision {
  const posGroup = positionToGroup(player.position);
  const curve = POSITION_AGE_CURVES[posGroup];
  const agePoint = getAgeCurvePoint(posGroup, player.age);

  if (!agePoint) {
    return { willRetire: false, confidence: 0.5 };
  }

  // Base retirement chance from age curve
  let retireChance = agePoint.retirementChance;

  // Modifiers
  // Low OVR increases retirement chance
  if (player.currentOVR < 60) {
    retireChance += 0.15;
  } else if (player.currentOVR < 70) {
    retireChance += 0.08;
  }

  // No contract and no interest
  if (!context.hasContract && !context.marketInterest) {
    retireChance += 0.25;
  }

  // Major injuries push players out
  if (context.majorInjuryHistory) {
    retireChance += 0.15;
  }
  if (context.injuredLastSeason) {
    retireChance += 0.10;
  }

  // Legacy players might retire on top
  if (player.championships > 0 && player.age >= curve.peakAgeEnd) {
    retireChance += 0.10;
  }
  if (player.allProSelections >= 5) {
    retireChance += 0.05; // HOF players know when to walk away
  }

  // Family considerations
  if (context.familyConsiderations && player.yearsInLeague >= 10) {
    retireChance += 0.20;
  }

  // High earners might not need the money
  if (player.careerEarnings > 100_000_000) {
    retireChance += 0.08;
  }

  // Make decision
  const willRetire = Math.random() < retireChance;

  // Determine reason
  let reason: string | undefined;
  if (willRetire) {
    if (context.majorInjuryHistory || context.injuredLastSeason) {
      reason = "Decided to prioritize long-term health over playing career";
    } else if (!context.hasContract && !context.marketInterest) {
      reason = "Unable to find a team willing to sign";
    } else if (player.championships > 0 && player.age >= curve.peakAgeEnd) {
      reason = "Retiring as a champion, on his own terms";
    } else if (context.familyConsiderations) {
      reason = "Stepping away to spend more time with family";
    } else if (player.age >= curve.typicalRetirement) {
      reason = "Age caught up, decides to hang up the cleats";
    } else {
      reason = "Decided it was time to move on";
    }
  }

  return {
    willRetire,
    reason,
    confidence: retireChance,
  };
}
