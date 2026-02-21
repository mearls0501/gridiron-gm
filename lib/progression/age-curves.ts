import {
  PositionGroup,
  PositionAgeCurve,
  AgeCurvePoint,
  CareerPhase,
} from "./development-types";

// ==========================================
// Position-Specific Age Curves
// ==========================================

/**
 * NFL Position Age Curves
 *
 * Based on real NFL data:
 * - QBs peak late (28-35), can play into 40s
 * - RBs peak early (24-27), decline rapidly after 28
 * - WRs peak mid-career (26-30)
 * - TEs peak later (27-31) due to blocking development
 * - OL peak late (27-32), can play long
 * - DL peak mid (26-30)
 * - LBs peak early-mid (25-29)
 * - CBs peak early (24-28), speed-dependent
 * - Safeties peak mid (26-30), transition to mental game
 * - K/P can play forever (peak 28-38)
 */

export const POSITION_AGE_CURVES: Record<PositionGroup, PositionAgeCurve> = {
  qb: {
    position: "qb",
    peakAgeStart: 28,
    peakAgeEnd: 35,
    typicalRetirement: 40,
    earlyRetirement: 35,
    physicalAttributes: ["speed", "acceleration", "agility", "throwPower"],
    mentalAttributes: [
      "awareness",
      "playRecognition",
      "decisionMaking",
      "poise",
      "leadership",
    ],
    curve: generateQBCurve(),
  },

  rb: {
    position: "rb",
    peakAgeStart: 24,
    peakAgeEnd: 27,
    typicalRetirement: 32,
    earlyRetirement: 29,
    physicalAttributes: [
      "speed",
      "acceleration",
      "agility",
      "elusiveness",
      "breakTackle",
      "trucking",
    ],
    mentalAttributes: ["vision", "patience", "passProtection"],
    curve: generateRBCurve(),
  },

  wr: {
    position: "wr",
    peakAgeStart: 26,
    peakAgeEnd: 30,
    typicalRetirement: 35,
    earlyRetirement: 32,
    physicalAttributes: [
      "speed",
      "acceleration",
      "agility",
      "jumping",
      "separation",
    ],
    mentalAttributes: [
      "routeRunning",
      "releasePackage",
      "awareness",
      "catchInTraffic",
    ],
    curve: generateWRCurve(),
  },

  te: {
    position: "te",
    peakAgeStart: 27,
    peakAgeEnd: 31,
    typicalRetirement: 35,
    earlyRetirement: 32,
    physicalAttributes: ["speed", "acceleration", "blocking"],
    mentalAttributes: [
      "routeRunning",
      "awareness",
      "blocking",
      "releasePackage",
    ],
    curve: generateTECurve(),
  },

  ol: {
    position: "ol",
    peakAgeStart: 27,
    peakAgeEnd: 32,
    typicalRetirement: 37,
    earlyRetirement: 33,
    physicalAttributes: ["speed", "acceleration"],
    mentalAttributes: [
      "awareness",
      "passBlockTechnique",
      "runBlockTechnique",
      "identification",
    ],
    curve: generateOLCurve(),
  },

  dl: {
    position: "dl",
    peakAgeStart: 26,
    peakAgeEnd: 30,
    typicalRetirement: 34,
    earlyRetirement: 31,
    physicalAttributes: [
      "speed",
      "acceleration",
      "explosiveness",
      "bendability",
    ],
    mentalAttributes: ["passRushMoves", "awareness", "pursuit"],
    curve: generateDLCurve(),
  },

  lb: {
    position: "lb",
    peakAgeStart: 25,
    peakAgeEnd: 29,
    typicalRetirement: 34,
    earlyRetirement: 31,
    physicalAttributes: ["speed", "acceleration", "agility", "tackling"],
    mentalAttributes: ["playRecognition", "awareness", "zoneCoverage"],
    curve: generateLBCurve(),
  },

  cb: {
    position: "cb",
    peakAgeStart: 24,
    peakAgeEnd: 28,
    typicalRetirement: 33,
    earlyRetirement: 30,
    physicalAttributes: [
      "speed",
      "acceleration",
      "agility",
      "jumping",
      "manCoverage",
    ],
    mentalAttributes: ["awareness", "zoneCoverage", "playRecognition"],
    curve: generateCBCurve(),
  },

  safety: {
    position: "safety",
    peakAgeStart: 26,
    peakAgeEnd: 30,
    typicalRetirement: 35,
    earlyRetirement: 32,
    physicalAttributes: ["speed", "acceleration", "tackling"],
    mentalAttributes: [
      "awareness",
      "zoneCoverage",
      "playRecognition",
      "ballHawking",
    ],
    curve: generateSafetyCurve(),
  },

  k_p: {
    position: "k_p",
    peakAgeStart: 28,
    peakAgeEnd: 38,
    typicalRetirement: 42,
    earlyRetirement: 36,
    physicalAttributes: ["kickPower"],
    mentalAttributes: ["accuracy", "clutch", "consistency"],
    curve: generateKickerCurve(),
  },
};

// ==========================================
// Curve Generation Functions
// ==========================================

function generateQBCurve(): AgeCurvePoint[] {
  return [
    // Rookie years - learning
    { age: 21, physicalModifier: 0, mentalModifier: -15, injuryRiskModifier: 1.0, retirementChance: 0 },
    { age: 22, physicalModifier: 2, mentalModifier: -10, injuryRiskModifier: 1.0, retirementChance: 0 },
    { age: 23, physicalModifier: 4, mentalModifier: -5, injuryRiskModifier: 0.95, retirementChance: 0 },
    { age: 24, physicalModifier: 5, mentalModifier: 0, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 25, physicalModifier: 5, mentalModifier: 5, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 26, physicalModifier: 5, mentalModifier: 8, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 27, physicalModifier: 5, mentalModifier: 10, injuryRiskModifier: 0.9, retirementChance: 0 },
    // Peak years
    { age: 28, physicalModifier: 5, mentalModifier: 12, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 29, physicalModifier: 4, mentalModifier: 14, injuryRiskModifier: 0.95, retirementChance: 0 },
    { age: 30, physicalModifier: 3, mentalModifier: 15, injuryRiskModifier: 0.95, retirementChance: 0 },
    { age: 31, physicalModifier: 2, mentalModifier: 15, injuryRiskModifier: 1.0, retirementChance: 0.01 },
    { age: 32, physicalModifier: 0, mentalModifier: 15, injuryRiskModifier: 1.0, retirementChance: 0.02 },
    { age: 33, physicalModifier: -2, mentalModifier: 15, injuryRiskModifier: 1.05, retirementChance: 0.03 },
    { age: 34, physicalModifier: -4, mentalModifier: 14, injuryRiskModifier: 1.1, retirementChance: 0.05 },
    { age: 35, physicalModifier: -6, mentalModifier: 13, injuryRiskModifier: 1.15, retirementChance: 0.08 },
    // Veteran decline
    { age: 36, physicalModifier: -10, mentalModifier: 12, injuryRiskModifier: 1.2, retirementChance: 0.12 },
    { age: 37, physicalModifier: -14, mentalModifier: 10, injuryRiskModifier: 1.3, retirementChance: 0.18 },
    { age: 38, physicalModifier: -18, mentalModifier: 8, injuryRiskModifier: 1.4, retirementChance: 0.25 },
    { age: 39, physicalModifier: -22, mentalModifier: 5, injuryRiskModifier: 1.5, retirementChance: 0.35 },
    { age: 40, physicalModifier: -28, mentalModifier: 2, injuryRiskModifier: 1.6, retirementChance: 0.50 },
    { age: 41, physicalModifier: -35, mentalModifier: 0, injuryRiskModifier: 1.8, retirementChance: 0.65 },
    { age: 42, physicalModifier: -42, mentalModifier: -3, injuryRiskModifier: 2.0, retirementChance: 0.80 },
    { age: 43, physicalModifier: -50, mentalModifier: -6, injuryRiskModifier: 2.2, retirementChance: 0.90 },
  ];
}

function generateRBCurve(): AgeCurvePoint[] {
  // RBs peak early and decline fast due to wear
  return [
    { age: 21, physicalModifier: 5, mentalModifier: -10, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 22, physicalModifier: 8, mentalModifier: -5, injuryRiskModifier: 0.85, retirementChance: 0 },
    { age: 23, physicalModifier: 10, mentalModifier: 0, injuryRiskModifier: 0.85, retirementChance: 0 },
    // Peak years - short window
    { age: 24, physicalModifier: 12, mentalModifier: 5, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 25, physicalModifier: 12, mentalModifier: 8, injuryRiskModifier: 0.95, retirementChance: 0 },
    { age: 26, physicalModifier: 10, mentalModifier: 10, injuryRiskModifier: 1.0, retirementChance: 0 },
    { age: 27, physicalModifier: 6, mentalModifier: 10, injuryRiskModifier: 1.1, retirementChance: 0.02 },
    // Rapid decline
    { age: 28, physicalModifier: 0, mentalModifier: 10, injuryRiskModifier: 1.25, retirementChance: 0.05 },
    { age: 29, physicalModifier: -8, mentalModifier: 8, injuryRiskModifier: 1.4, retirementChance: 0.12 },
    { age: 30, physicalModifier: -16, mentalModifier: 5, injuryRiskModifier: 1.6, retirementChance: 0.22 },
    { age: 31, physicalModifier: -25, mentalModifier: 2, injuryRiskModifier: 1.8, retirementChance: 0.35 },
    { age: 32, physicalModifier: -35, mentalModifier: 0, injuryRiskModifier: 2.0, retirementChance: 0.50 },
    { age: 33, physicalModifier: -45, mentalModifier: -3, injuryRiskModifier: 2.2, retirementChance: 0.70 },
    { age: 34, physicalModifier: -55, mentalModifier: -6, injuryRiskModifier: 2.5, retirementChance: 0.85 },
  ];
}

function generateWRCurve(): AgeCurvePoint[] {
  return [
    { age: 21, physicalModifier: 5, mentalModifier: -12, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 22, physicalModifier: 8, mentalModifier: -8, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 23, physicalModifier: 10, mentalModifier: -4, injuryRiskModifier: 0.85, retirementChance: 0 },
    { age: 24, physicalModifier: 10, mentalModifier: 0, injuryRiskModifier: 0.85, retirementChance: 0 },
    { age: 25, physicalModifier: 10, mentalModifier: 4, injuryRiskModifier: 0.9, retirementChance: 0 },
    // Peak years
    { age: 26, physicalModifier: 8, mentalModifier: 8, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 27, physicalModifier: 6, mentalModifier: 10, injuryRiskModifier: 0.95, retirementChance: 0 },
    { age: 28, physicalModifier: 4, mentalModifier: 12, injuryRiskModifier: 1.0, retirementChance: 0 },
    { age: 29, physicalModifier: 0, mentalModifier: 12, injuryRiskModifier: 1.0, retirementChance: 0.01 },
    { age: 30, physicalModifier: -4, mentalModifier: 12, injuryRiskModifier: 1.05, retirementChance: 0.03 },
    // Decline
    { age: 31, physicalModifier: -10, mentalModifier: 10, injuryRiskModifier: 1.15, retirementChance: 0.06 },
    { age: 32, physicalModifier: -16, mentalModifier: 8, injuryRiskModifier: 1.25, retirementChance: 0.12 },
    { age: 33, physicalModifier: -22, mentalModifier: 5, injuryRiskModifier: 1.4, retirementChance: 0.20 },
    { age: 34, physicalModifier: -30, mentalModifier: 2, injuryRiskModifier: 1.6, retirementChance: 0.35 },
    { age: 35, physicalModifier: -38, mentalModifier: 0, injuryRiskModifier: 1.8, retirementChance: 0.50 },
    { age: 36, physicalModifier: -46, mentalModifier: -3, injuryRiskModifier: 2.0, retirementChance: 0.70 },
  ];
}

function generateTECurve(): AgeCurvePoint[] {
  // TEs develop later due to blocking complexity
  return [
    { age: 21, physicalModifier: 2, mentalModifier: -15, injuryRiskModifier: 1.0, retirementChance: 0 },
    { age: 22, physicalModifier: 4, mentalModifier: -12, injuryRiskModifier: 0.95, retirementChance: 0 },
    { age: 23, physicalModifier: 6, mentalModifier: -8, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 24, physicalModifier: 8, mentalModifier: -4, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 25, physicalModifier: 8, mentalModifier: 0, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 26, physicalModifier: 8, mentalModifier: 4, injuryRiskModifier: 0.9, retirementChance: 0 },
    // Peak years
    { age: 27, physicalModifier: 6, mentalModifier: 8, injuryRiskModifier: 0.95, retirementChance: 0 },
    { age: 28, physicalModifier: 4, mentalModifier: 10, injuryRiskModifier: 1.0, retirementChance: 0 },
    { age: 29, physicalModifier: 2, mentalModifier: 12, injuryRiskModifier: 1.0, retirementChance: 0 },
    { age: 30, physicalModifier: 0, mentalModifier: 12, injuryRiskModifier: 1.05, retirementChance: 0.01 },
    { age: 31, physicalModifier: -4, mentalModifier: 12, injuryRiskModifier: 1.1, retirementChance: 0.03 },
    // Decline
    { age: 32, physicalModifier: -10, mentalModifier: 10, injuryRiskModifier: 1.2, retirementChance: 0.06 },
    { age: 33, physicalModifier: -16, mentalModifier: 8, injuryRiskModifier: 1.35, retirementChance: 0.12 },
    { age: 34, physicalModifier: -24, mentalModifier: 5, injuryRiskModifier: 1.5, retirementChance: 0.22 },
    { age: 35, physicalModifier: -32, mentalModifier: 2, injuryRiskModifier: 1.7, retirementChance: 0.38 },
    { age: 36, physicalModifier: -40, mentalModifier: 0, injuryRiskModifier: 1.9, retirementChance: 0.55 },
    { age: 37, physicalModifier: -48, mentalModifier: -3, injuryRiskModifier: 2.1, retirementChance: 0.72 },
  ];
}

function generateOLCurve(): AgeCurvePoint[] {
  // OL age best - technique matters more than athleticism
  return [
    { age: 21, physicalModifier: 0, mentalModifier: -18, injuryRiskModifier: 1.0, retirementChance: 0 },
    { age: 22, physicalModifier: 2, mentalModifier: -14, injuryRiskModifier: 0.95, retirementChance: 0 },
    { age: 23, physicalModifier: 4, mentalModifier: -10, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 24, physicalModifier: 5, mentalModifier: -6, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 25, physicalModifier: 5, mentalModifier: -2, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 26, physicalModifier: 5, mentalModifier: 2, injuryRiskModifier: 0.9, retirementChance: 0 },
    // Peak years - long prime
    { age: 27, physicalModifier: 4, mentalModifier: 6, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 28, physicalModifier: 3, mentalModifier: 10, injuryRiskModifier: 0.95, retirementChance: 0 },
    { age: 29, physicalModifier: 2, mentalModifier: 12, injuryRiskModifier: 0.95, retirementChance: 0 },
    { age: 30, physicalModifier: 0, mentalModifier: 14, injuryRiskModifier: 1.0, retirementChance: 0 },
    { age: 31, physicalModifier: -2, mentalModifier: 14, injuryRiskModifier: 1.0, retirementChance: 0 },
    { age: 32, physicalModifier: -4, mentalModifier: 14, injuryRiskModifier: 1.05, retirementChance: 0.02 },
    // Gradual decline
    { age: 33, physicalModifier: -8, mentalModifier: 12, injuryRiskModifier: 1.1, retirementChance: 0.05 },
    { age: 34, physicalModifier: -12, mentalModifier: 10, injuryRiskModifier: 1.2, retirementChance: 0.10 },
    { age: 35, physicalModifier: -18, mentalModifier: 8, injuryRiskModifier: 1.3, retirementChance: 0.18 },
    { age: 36, physicalModifier: -24, mentalModifier: 5, injuryRiskModifier: 1.45, retirementChance: 0.28 },
    { age: 37, physicalModifier: -32, mentalModifier: 2, injuryRiskModifier: 1.6, retirementChance: 0.42 },
    { age: 38, physicalModifier: -40, mentalModifier: 0, injuryRiskModifier: 1.8, retirementChance: 0.58 },
    { age: 39, physicalModifier: -48, mentalModifier: -3, injuryRiskModifier: 2.0, retirementChance: 0.75 },
  ];
}

function generateDLCurve(): AgeCurvePoint[] {
  return [
    { age: 21, physicalModifier: 5, mentalModifier: -12, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 22, physicalModifier: 8, mentalModifier: -8, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 23, physicalModifier: 10, mentalModifier: -4, injuryRiskModifier: 0.85, retirementChance: 0 },
    { age: 24, physicalModifier: 10, mentalModifier: 0, injuryRiskModifier: 0.85, retirementChance: 0 },
    { age: 25, physicalModifier: 10, mentalModifier: 4, injuryRiskModifier: 0.9, retirementChance: 0 },
    // Peak years
    { age: 26, physicalModifier: 8, mentalModifier: 8, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 27, physicalModifier: 6, mentalModifier: 10, injuryRiskModifier: 0.95, retirementChance: 0 },
    { age: 28, physicalModifier: 4, mentalModifier: 12, injuryRiskModifier: 1.0, retirementChance: 0 },
    { age: 29, physicalModifier: 0, mentalModifier: 12, injuryRiskModifier: 1.0, retirementChance: 0 },
    { age: 30, physicalModifier: -4, mentalModifier: 12, injuryRiskModifier: 1.05, retirementChance: 0.02 },
    // Decline
    { age: 31, physicalModifier: -10, mentalModifier: 10, injuryRiskModifier: 1.15, retirementChance: 0.05 },
    { age: 32, physicalModifier: -16, mentalModifier: 8, injuryRiskModifier: 1.3, retirementChance: 0.10 },
    { age: 33, physicalModifier: -24, mentalModifier: 5, injuryRiskModifier: 1.45, retirementChance: 0.20 },
    { age: 34, physicalModifier: -32, mentalModifier: 2, injuryRiskModifier: 1.6, retirementChance: 0.35 },
    { age: 35, physicalModifier: -42, mentalModifier: 0, injuryRiskModifier: 1.8, retirementChance: 0.55 },
  ];
}

function generateLBCurve(): AgeCurvePoint[] {
  return [
    { age: 21, physicalModifier: 6, mentalModifier: -12, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 22, physicalModifier: 9, mentalModifier: -8, injuryRiskModifier: 0.85, retirementChance: 0 },
    { age: 23, physicalModifier: 10, mentalModifier: -4, injuryRiskModifier: 0.85, retirementChance: 0 },
    { age: 24, physicalModifier: 10, mentalModifier: 0, injuryRiskModifier: 0.85, retirementChance: 0 },
    // Peak years
    { age: 25, physicalModifier: 10, mentalModifier: 5, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 26, physicalModifier: 8, mentalModifier: 8, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 27, physicalModifier: 5, mentalModifier: 10, injuryRiskModifier: 0.95, retirementChance: 0 },
    { age: 28, physicalModifier: 2, mentalModifier: 12, injuryRiskModifier: 1.0, retirementChance: 0 },
    { age: 29, physicalModifier: -2, mentalModifier: 12, injuryRiskModifier: 1.05, retirementChance: 0.01 },
    // Decline
    { age: 30, physicalModifier: -8, mentalModifier: 10, injuryRiskModifier: 1.15, retirementChance: 0.04 },
    { age: 31, physicalModifier: -14, mentalModifier: 8, injuryRiskModifier: 1.3, retirementChance: 0.08 },
    { age: 32, physicalModifier: -22, mentalModifier: 5, injuryRiskModifier: 1.45, retirementChance: 0.15 },
    { age: 33, physicalModifier: -30, mentalModifier: 2, injuryRiskModifier: 1.6, retirementChance: 0.28 },
    { age: 34, physicalModifier: -40, mentalModifier: 0, injuryRiskModifier: 1.8, retirementChance: 0.45 },
    { age: 35, physicalModifier: -50, mentalModifier: -3, injuryRiskModifier: 2.0, retirementChance: 0.65 },
  ];
}

function generateCBCurve(): AgeCurvePoint[] {
  // CBs are most speed-dependent - decline early
  return [
    { age: 21, physicalModifier: 8, mentalModifier: -12, injuryRiskModifier: 0.85, retirementChance: 0 },
    { age: 22, physicalModifier: 10, mentalModifier: -8, injuryRiskModifier: 0.85, retirementChance: 0 },
    { age: 23, physicalModifier: 12, mentalModifier: -4, injuryRiskModifier: 0.85, retirementChance: 0 },
    // Peak years - short window
    { age: 24, physicalModifier: 12, mentalModifier: 0, injuryRiskModifier: 0.85, retirementChance: 0 },
    { age: 25, physicalModifier: 10, mentalModifier: 5, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 26, physicalModifier: 8, mentalModifier: 8, injuryRiskModifier: 0.95, retirementChance: 0 },
    { age: 27, physicalModifier: 4, mentalModifier: 10, injuryRiskModifier: 1.0, retirementChance: 0 },
    { age: 28, physicalModifier: 0, mentalModifier: 12, injuryRiskModifier: 1.0, retirementChance: 0.01 },
    // Decline - speed loss hurts
    { age: 29, physicalModifier: -8, mentalModifier: 12, injuryRiskModifier: 1.1, retirementChance: 0.04 },
    { age: 30, physicalModifier: -16, mentalModifier: 10, injuryRiskModifier: 1.25, retirementChance: 0.10 },
    { age: 31, physicalModifier: -24, mentalModifier: 8, injuryRiskModifier: 1.4, retirementChance: 0.20 },
    { age: 32, physicalModifier: -34, mentalModifier: 5, injuryRiskModifier: 1.6, retirementChance: 0.35 },
    { age: 33, physicalModifier: -44, mentalModifier: 2, injuryRiskModifier: 1.8, retirementChance: 0.55 },
    { age: 34, physicalModifier: -55, mentalModifier: 0, injuryRiskModifier: 2.0, retirementChance: 0.75 },
  ];
}

function generateSafetyCurve(): AgeCurvePoint[] {
  // Safeties age better - can transition to more zone/mental game
  return [
    { age: 21, physicalModifier: 4, mentalModifier: -12, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 22, physicalModifier: 7, mentalModifier: -8, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 23, physicalModifier: 9, mentalModifier: -4, injuryRiskModifier: 0.85, retirementChance: 0 },
    { age: 24, physicalModifier: 10, mentalModifier: 0, injuryRiskModifier: 0.85, retirementChance: 0 },
    { age: 25, physicalModifier: 10, mentalModifier: 4, injuryRiskModifier: 0.9, retirementChance: 0 },
    // Peak years
    { age: 26, physicalModifier: 8, mentalModifier: 8, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 27, physicalModifier: 6, mentalModifier: 10, injuryRiskModifier: 0.95, retirementChance: 0 },
    { age: 28, physicalModifier: 4, mentalModifier: 12, injuryRiskModifier: 1.0, retirementChance: 0 },
    { age: 29, physicalModifier: 0, mentalModifier: 14, injuryRiskModifier: 1.0, retirementChance: 0 },
    { age: 30, physicalModifier: -4, mentalModifier: 14, injuryRiskModifier: 1.05, retirementChance: 0.01 },
    // Gradual decline
    { age: 31, physicalModifier: -10, mentalModifier: 12, injuryRiskModifier: 1.15, retirementChance: 0.04 },
    { age: 32, physicalModifier: -16, mentalModifier: 10, injuryRiskModifier: 1.25, retirementChance: 0.08 },
    { age: 33, physicalModifier: -24, mentalModifier: 8, injuryRiskModifier: 1.4, retirementChance: 0.15 },
    { age: 34, physicalModifier: -32, mentalModifier: 5, injuryRiskModifier: 1.55, retirementChance: 0.28 },
    { age: 35, physicalModifier: -42, mentalModifier: 2, injuryRiskModifier: 1.7, retirementChance: 0.45 },
    { age: 36, physicalModifier: -52, mentalModifier: 0, injuryRiskModifier: 1.9, retirementChance: 0.65 },
  ];
}

function generateKickerCurve(): AgeCurvePoint[] {
  // Kickers/Punters age best - minimal physical decline
  return [
    { age: 21, physicalModifier: 0, mentalModifier: -10, injuryRiskModifier: 0.8, retirementChance: 0 },
    { age: 22, physicalModifier: 2, mentalModifier: -8, injuryRiskModifier: 0.8, retirementChance: 0 },
    { age: 23, physicalModifier: 3, mentalModifier: -5, injuryRiskModifier: 0.8, retirementChance: 0 },
    { age: 24, physicalModifier: 4, mentalModifier: -2, injuryRiskModifier: 0.8, retirementChance: 0 },
    { age: 25, physicalModifier: 5, mentalModifier: 0, injuryRiskModifier: 0.8, retirementChance: 0 },
    { age: 26, physicalModifier: 5, mentalModifier: 3, injuryRiskModifier: 0.8, retirementChance: 0 },
    { age: 27, physicalModifier: 5, mentalModifier: 5, injuryRiskModifier: 0.8, retirementChance: 0 },
    // Long peak
    { age: 28, physicalModifier: 5, mentalModifier: 8, injuryRiskModifier: 0.8, retirementChance: 0 },
    { age: 29, physicalModifier: 5, mentalModifier: 10, injuryRiskModifier: 0.85, retirementChance: 0 },
    { age: 30, physicalModifier: 4, mentalModifier: 12, injuryRiskModifier: 0.85, retirementChance: 0 },
    { age: 31, physicalModifier: 4, mentalModifier: 12, injuryRiskModifier: 0.85, retirementChance: 0 },
    { age: 32, physicalModifier: 3, mentalModifier: 14, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 33, physicalModifier: 3, mentalModifier: 14, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 34, physicalModifier: 2, mentalModifier: 14, injuryRiskModifier: 0.9, retirementChance: 0 },
    { age: 35, physicalModifier: 2, mentalModifier: 14, injuryRiskModifier: 0.95, retirementChance: 0 },
    { age: 36, physicalModifier: 0, mentalModifier: 12, injuryRiskModifier: 0.95, retirementChance: 0 },
    { age: 37, physicalModifier: 0, mentalModifier: 12, injuryRiskModifier: 1.0, retirementChance: 0.02 },
    { age: 38, physicalModifier: -2, mentalModifier: 10, injuryRiskModifier: 1.0, retirementChance: 0.05 },
    // Very gradual decline
    { age: 39, physicalModifier: -4, mentalModifier: 8, injuryRiskModifier: 1.1, retirementChance: 0.10 },
    { age: 40, physicalModifier: -6, mentalModifier: 6, injuryRiskModifier: 1.2, retirementChance: 0.15 },
    { age: 41, physicalModifier: -10, mentalModifier: 4, injuryRiskModifier: 1.3, retirementChance: 0.25 },
    { age: 42, physicalModifier: -14, mentalModifier: 2, injuryRiskModifier: 1.4, retirementChance: 0.38 },
    { age: 43, physicalModifier: -18, mentalModifier: 0, injuryRiskModifier: 1.5, retirementChance: 0.52 },
    { age: 44, physicalModifier: -24, mentalModifier: -2, injuryRiskModifier: 1.6, retirementChance: 0.68 },
    { age: 45, physicalModifier: -30, mentalModifier: -4, injuryRiskModifier: 1.8, retirementChance: 0.82 },
  ];
}

// ==========================================
// Utility Functions
// ==========================================

/**
 * Get the age curve data point for a specific age
 */
export function getAgeCurvePoint(
  position: PositionGroup,
  age: number
): AgeCurvePoint | null {
  const curve = POSITION_AGE_CURVES[position];
  if (!curve) return null;

  // Find exact match or interpolate
  const point = curve.curve.find((p) => p.age === age);
  if (point) return point;

  // If age is outside curve bounds, use closest endpoint
  const minAge = curve.curve[0].age;
  const maxAge = curve.curve[curve.curve.length - 1].age;

  if (age < minAge) return curve.curve[0];
  if (age > maxAge) return curve.curve[curve.curve.length - 1];

  // Interpolate between two points
  const lowerPoint = curve.curve.filter((p) => p.age < age).pop()!;
  const upperPoint = curve.curve.find((p) => p.age > age)!;

  const ratio = (age - lowerPoint.age) / (upperPoint.age - lowerPoint.age);

  return {
    age,
    physicalModifier: lerp(lowerPoint.physicalModifier, upperPoint.physicalModifier, ratio),
    mentalModifier: lerp(lowerPoint.mentalModifier, upperPoint.mentalModifier, ratio),
    injuryRiskModifier: lerp(lowerPoint.injuryRiskModifier, upperPoint.injuryRiskModifier, ratio),
    retirementChance: lerp(lowerPoint.retirementChance, upperPoint.retirementChance, ratio),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Determine career phase based on age and position
 */
export function determineCareerPhase(
  position: PositionGroup,
  age: number,
  yearsInLeague: number
): CareerPhase {
  const curve = POSITION_AGE_CURVES[position];

  if (yearsInLeague === 0) return "rookie";
  if (yearsInLeague <= 2) return "developing";

  if (age >= curve.peakAgeStart && age <= curve.peakAgeEnd) return "prime";

  if (age > curve.peakAgeEnd && age < curve.typicalRetirement - 2) return "veteran";

  if (age >= curve.typicalRetirement - 2 && age < curve.typicalRetirement) return "declining";

  return "twilight";
}

/**
 * Map NFL position to position group
 */
export function positionToGroup(position: string): PositionGroup {
  const positionMap: Record<string, PositionGroup> = {
    QB: "qb",
    HB: "rb",
    RB: "rb",
    FB: "rb",
    WR: "wr",
    TE: "te",
    LT: "ol",
    LG: "ol",
    C: "ol",
    RG: "ol",
    RT: "ol",
    OT: "ol",
    OG: "ol",
    OL: "ol",
    LE: "dl",
    RE: "dl",
    DT: "dl",
    DE: "dl",
    EDGE: "dl",
    NT: "dl",
    LOLB: "lb",
    MLB: "lb",
    ROLB: "lb",
    ILB: "lb",
    OLB: "lb",
    LB: "lb",
    CB: "cb",
    FS: "safety",
    SS: "safety",
    S: "safety",
    K: "k_p",
    P: "k_p",
  };

  return positionMap[position.toUpperCase()] || "wr"; // Default to WR curve
}

/**
 * Calculate expected remaining career years
 */
export function calculateRemainingCareer(
  position: PositionGroup,
  age: number,
  healthModifier: number = 1.0 // 0.5 = injury prone, 1.5 = iron man
): { expected: number; minimum: number; maximum: number } {
  const curve = POSITION_AGE_CURVES[position];

  const typicalEnd = curve.typicalRetirement;
  const earlyEnd = curve.earlyRetirement;
  const lateEnd = typicalEnd + 3;

  // Base remaining years
  const baseRemaining = Math.max(0, typicalEnd - age);

  // Adjust for health
  const adjustedRemaining = baseRemaining * healthModifier;

  return {
    expected: Math.round(adjustedRemaining),
    minimum: Math.max(0, Math.round(earlyEnd - age)),
    maximum: Math.max(0, Math.round(lateEnd - age)),
  };
}
