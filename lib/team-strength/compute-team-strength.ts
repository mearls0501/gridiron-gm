import {
  CoachSimAttributes,
  HeadCoachPersonnel,
  PlayerPosition,
  PlayerTrueRatings,
  Relationship,
  SchemeType,
  TeamStrengthInput,
  TeamStrengthSnapshot,
} from '../ratings/normalized-schema-types';

const MIN_MODIFIER = 0.85;
const MAX_MODIFIER = 1.1;

const OFFENSE_POSITIONS: PlayerPosition[] = ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C'];
const DEFENSE_POSITIONS: PlayerPosition[] = ['EDGE', 'DE', 'DT', 'LB', 'CB', 'S'];
const SPECIAL_TEAMS_POSITIONS: PlayerPosition[] = ['K', 'P'];

const POSITION_OVERALL_WEIGHTS: Record<PlayerPosition, Record<string, number>> = {
  QB: {
    throwPower: 0.12,
    shortAccuracy: 0.18,
    midAccuracy: 0.14,
    deepAccuracy: 0.14,
    decisionMaking: 0.16,
    pocketPresence: 0.12,
    footballIQ: 0.08,
    clutch: 0.06,
  },
  RB: {
    carrying: 0.14,
    breakTackle: 0.18,
    vision: 0.18,
    speed: 0.14,
    power: 0.12,
    routeRunning: 0.08,
    catching: 0.08,
    durability: 0.08,
  },
  WR: {
    routeRunning: 0.22,
    separation: 0.2,
    catching: 0.18,
    yacAbility: 0.14,
    speed: 0.14,
    release: 0.08,
    contestedCatch: 0.04,
  },
  TE: {
    routeRunning: 0.16,
    catching: 0.16,
    blocking: 0.18,
    contestedCatch: 0.12,
    separation: 0.12,
    strength: 0.14,
    durability: 0.12,
  },
  OT: {
    passBlock: 0.28,
    runBlock: 0.24,
    technique: 0.18,
    awareness: 0.12,
    strength: 0.1,
    footballIQ: 0.08,
  },
  OG: {
    passBlock: 0.2,
    runBlock: 0.28,
    strength: 0.18,
    technique: 0.16,
    awareness: 0.1,
    pulling: 0.08,
  },
  C: {
    passBlock: 0.24,
    runBlock: 0.2,
    technique: 0.2,
    awareness: 0.14,
    footballIQ: 0.14,
    strength: 0.08,
  },
  EDGE: {
    passRushSpeed: 0.22,
    passRushPower: 0.18,
    passRushTechnique: 0.18,
    runDefense: 0.16,
    motor: 0.12,
    athleticism: 0.14,
  },
  DE: {
    passRushSpeed: 0.14,
    passRushPower: 0.2,
    passRushTechnique: 0.18,
    runDefense: 0.2,
    motor: 0.14,
    strength: 0.14,
  },
  DT: {
    runStuff: 0.26,
    passRush: 0.18,
    anchor: 0.2,
    strength: 0.18,
    lateralMovement: 0.1,
    motor: 0.08,
  },
  LB: {
    coverage: 0.18,
    runDefense: 0.2,
    passRush: 0.1,
    tackling: 0.2,
    instincts: 0.16,
    rangeInZone: 0.16,
  },
  CB: {
    manCoverage: 0.22,
    zoneCoverage: 0.2,
    press: 0.12,
    ballSkills: 0.16,
    speed: 0.2,
    tackling: 0.1,
  },
  S: {
    coverageRange: 0.22,
    runSupport: 0.16,
    ballSkills: 0.16,
    zoneDiagnosis: 0.18,
    tackling: 0.16,
    speed: 0.12,
  },
  K: {
    kickPower: 0.4,
    kickAccuracy: 0.45,
    hangTime: 0.15,
  },
  P: {
    puntPower: 0.4,
    puntAccuracy: 0.4,
    hangTime: 0.2,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  if (values.length === 0) return 50;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getAttribute(ratings: PlayerTrueRatings, key: string): number {
  switch (key) {
    case 'footballIQ':
      return ratings.footballIQ;
    case 'durability':
      return ratings.durability;
    case 'strength':
      return ratings.str;
    case 'speed':
      return ratings.spd;
    default:
      return ratings.positionAttributes[key as keyof typeof ratings.positionAttributes] ?? 50;
  }
}

export function computeDisplayedPlayerOverall(ratings: PlayerTrueRatings, position: PlayerPosition): number {
  const weights = POSITION_OVERALL_WEIGHTS[position];
  let weightedTotal = 0;
  let weightSum = 0;

  Object.entries(weights).forEach(([attribute, weight]) => {
    weightedTotal += getAttribute(ratings, attribute) * weight;
    weightSum += weight;
  });

  return clamp(weightedTotal / Math.max(weightSum, 1), 0, 100);
}

function computeEffectivePlayerOverall(
  ratings: PlayerTrueRatings,
  position: PlayerPosition,
  fitModifier: number,
): number {
  return clamp(computeDisplayedPlayerOverall(ratings, position) * fitModifier, 0, 100);
}

function computeUnitRating(
  input: TeamStrengthInput,
  positions: PlayerPosition[],
  scheme: SchemeType,
): number {
  const eligible = input.players.filter((player) =>
    player.isStarter && !player.inactive && positions.includes(player.position),
  );

  const effectiveOveralls = eligible.map((player) => {
    const fitModifier = player.schemeFit.fitModifiers[scheme] ?? 1;
    return computeEffectivePlayerOverall(player.trueRatings, player.position, fitModifier);
  });

  return average(effectiveOveralls);
}

function computeTeamChemistry(relationships: Relationship[]): number {
  if (relationships.length === 0) return 1;
  const chemistryEdges = relationships.filter((r) => {
    const pair = new Set([r.entityA.type, r.entityB.type]);
    return pair.has('player') || pair.has('coach');
  });

  if (chemistryEdges.length === 0) return 1;
  const normalized = average(chemistryEdges.map((edge) => edge.score)) / 100;
  return clamp(0.9 + normalized * 0.2, MIN_MODIFIER, MAX_MODIFIER);
}

function computeSchemeCoherence(input: TeamStrengthInput): number {
  const starters = input.players.filter((player) => player.isStarter && !player.inactive);
  if (starters.length === 0) return 1;

  const aligned = starters.filter((player) => {
    const offenseAligned = OFFENSE_POSITIONS.includes(player.position)
      ? (player.schemeFit.fitModifiers[input.currentOffensiveScheme] ?? 1) >= 1
      : true;
    const defenseAligned = DEFENSE_POSITIONS.includes(player.position)
      ? (player.schemeFit.fitModifiers[input.currentDefensiveScheme] ?? 1) >= 1
      : true;
    return offenseAligned && defenseAligned;
  }).length;

  const ratio = aligned / starters.length;
  return clamp(0.85 + ratio * 0.25, MIN_MODIFIER, MAX_MODIFIER);
}

function computeDepthModifier(input: TeamStrengthInput): number {
  const starters = input.players.filter((player) => player.isStarter);
  if (starters.length === 0) return 1;

  const inactiveCount = starters.filter((player) => player.inactive).length;
  const injuryPenalty = inactiveCount / starters.length;
  return clamp(1 - injuryPenalty * 0.15, 0.8, 1);
}

export function mapPersonnelToSimAttributes(
  coachId: string,
  role: string,
  coach: HeadCoachPersonnel,
): CoachSimAttributes {
  const iq = clamp(Math.round(coach.gameManagement * 0.55 + coach.playDesign * 0.45), 0, 100);
  const motivation = clamp(Math.round(coach.lockerRoom * 0.7 + coach.personality.playerFriendly * 0.3), 0, 100);

  return {
    coachId,
    role,
    leadership: clamp(Math.round(coach.lockerRoom * 0.6 + coach.pressureHandling * 0.4), 0, 100),
    footballIQ: iq,
    motivation,
    adaptability: coach.adaptability,
    offensiveBias: {
      runFrequency: clamp((100 - coach.personality.riskTolerance) / 100, 0, 1),
      deepPassRate: clamp(coach.personality.riskTolerance / 100, 0, 1),
      screenRate: clamp((coach.schemeFlexibility + coach.playerDevelopment) / 200, 0, 1),
      rpoRate: clamp((coach.playDesign + coach.schemeFlexibility) / 200, 0, 1),
      aggressionOnFourthDown: clamp(coach.personality.riskTolerance / 100, 0, 1),
    },
    defensiveBias: {
      blitzRate: clamp(coach.personality.riskTolerance / 100, 0, 1),
      coverageType: coach.defensiveScheme,
      pressRate: clamp((coach.playDesign + coach.personality.egoLevel) / 200, 0, 1),
      safetyPosition: coach.personality.riskTolerance >= 67 ? 'box' : coach.personality.riskTolerance >= 34 ? 'mixed' : 'deep',
    },
  };
}

export function computeTeamStrength(input: TeamStrengthInput): TeamStrengthSnapshot {
  const offensiveRating = computeUnitRating(input, OFFENSE_POSITIONS, input.currentOffensiveScheme);
  const defensiveRating = computeUnitRating(input, DEFENSE_POSITIONS, input.currentDefensiveScheme);
  const specialTeamsRating = computeUnitRating(input, SPECIAL_TEAMS_POSITIONS, input.currentOffensiveScheme);

  const chemistryModifier = computeTeamChemistry(input.relationships);
  const schemeCoherenceModifier = computeSchemeCoherence(input);
  const depthModifier = computeDepthModifier(input);

  return {
    offensiveRating,
    defensiveRating,
    specialTeamsRating,
    chemistryModifier,
    schemeCoherenceModifier,
    depthModifier,
  };
}
