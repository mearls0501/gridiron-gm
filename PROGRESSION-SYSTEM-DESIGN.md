# Gridiron GM - Progression & Regression System Design

## Overview

This document outlines the comprehensive progression/regression system for all entities in Gridiron GM: Players, Scouts, GMs, and Coaches. The goal is to create realistic career arcs where performance, age, scheme fit, and coaching all influence development.

---

## Part 1: Player Progression System

### 1.1 Age Curves by Position

NFL players have position-specific prime windows and decline rates.

```typescript
interface PositionAgeCurve {
  position: string;
  developmentYears: [number, number];  // Age range for rapid growth
  primeYears: [number, number];        // Peak performance window
  declineStart: number;                // When decline begins
  declineRate: number;                 // Annual decline percentage
  cliffAge: number;                    // Steep decline begins
  retirementAge: { avg: number; min: number; max: number };
}

const POSITION_AGE_CURVES: Record<string, PositionAgeCurve> = {
  QB: {
    developmentYears: [22, 26],
    primeYears: [27, 35],
    declineStart: 36,
    declineRate: 0.02,      // 2% per year
    cliffAge: 40,
    retirementAge: { avg: 38, min: 32, max: 45 }
  },
  RB: {
    developmentYears: [21, 24],
    primeYears: [24, 27],    // RBs peak early, decline fast
    declineStart: 28,
    declineRate: 0.04,       // 4% per year - harsh
    cliffAge: 30,
    retirementAge: { avg: 29, min: 26, max: 34 }
  },
  WR: {
    developmentYears: [21, 24],
    primeYears: [25, 30],
    declineStart: 31,
    declineRate: 0.03,
    cliffAge: 33,
    retirementAge: { avg: 32, min: 28, max: 38 }
  },
  TE: {
    developmentYears: [22, 25],
    primeYears: [26, 31],
    declineStart: 32,
    declineRate: 0.025,
    cliffAge: 34,
    retirementAge: { avg: 33, min: 29, max: 37 }
  },
  OL: {  // OT, OG, C
    developmentYears: [22, 25],
    primeYears: [26, 32],
    declineStart: 33,
    declineRate: 0.02,
    cliffAge: 36,
    retirementAge: { avg: 34, min: 30, max: 40 }
  },
  DL: {  // DE, DT
    developmentYears: [22, 25],
    primeYears: [25, 30],
    declineStart: 31,
    declineRate: 0.03,
    cliffAge: 33,
    retirementAge: { avg: 32, min: 28, max: 36 }
  },
  LB: {
    developmentYears: [22, 25],
    primeYears: [25, 29],
    declineStart: 30,
    declineRate: 0.035,
    cliffAge: 32,
    retirementAge: { avg: 31, min: 27, max: 35 }
  },
  CB: {
    developmentYears: [21, 24],
    primeYears: [24, 29],    // CBs need speed - decline early
    declineStart: 30,
    declineRate: 0.04,
    cliffAge: 32,
    retirementAge: { avg: 31, min: 27, max: 34 }
  },
  S: {
    developmentYears: [22, 25],
    primeYears: [25, 30],
    declineStart: 31,
    declineRate: 0.03,
    cliffAge: 33,
    retirementAge: { avg: 32, min: 28, max: 36 }
  },
  K: {
    developmentYears: [22, 26],
    primeYears: [27, 38],    // Kickers age well
    declineStart: 39,
    declineRate: 0.015,
    cliffAge: 42,
    retirementAge: { avg: 40, min: 35, max: 48 }
  },
  P: {
    developmentYears: [22, 26],
    primeYears: [27, 36],
    declineStart: 37,
    declineRate: 0.02,
    cliffAge: 40,
    retirementAge: { avg: 38, min: 33, max: 45 }
  }
};
```

### 1.2 Development Factors

```typescript
interface DevelopmentFactors {
  // Base factors
  age: number;
  potential: number;                    // 0-99, ceiling
  currentRating: number;                // 0-99, current
  gapToPotential: number;               // potential - current

  // Performance factors
  snapsPlayed: number;                  // Playing time matters
  performanceRating: number;            // How well they played

  // External factors
  coachDevelopmentSkill: number;        // Coach's ability
  positionCoachRating: number;          // Position-specific coach
  schemeFit: FitLevel;                  // From scheme-fit system

  // Character factors
  workEthic: number;                    // Player attribute
  coachability: number;                 // Player attribute
  footballIQ: number;                   // Player attribute

  // Injury factors
  gamesInjured: number;                 // Setback from injuries
  majorInjuryThisSeason: boolean;       // Significant regression risk
}

interface DevelopmentResult {
  overallChange: number;                // -10 to +8
  attributeChanges: Record<string, number>;
  potentialChange: number;              // Usually 0 or negative

  // Breakdown
  baseGrowth: number;                   // From age/potential
  performanceBonus: number;             // From playing well
  coachingBonus: number;                // From good coaching
  schemeFitModifier: number;            // From scheme fit
  ageModifier: number;                  // Positive (young) or negative (old)
  injuryPenalty: number;                // From injuries

  narrative: string;                    // Story explanation
}
```

### 1.3 Development Calculation

```typescript
function calculatePlayerDevelopment(factors: DevelopmentFactors): DevelopmentResult {
  const curve = POSITION_AGE_CURVES[factors.position];
  let totalChange = 0;
  let narrative = "";

  // === AGE-BASED MODIFIER ===
  let ageModifier = 0;

  if (factors.age < curve.developmentYears[0]) {
    // Too young - still raw
    ageModifier = 1.0;
    narrative = "Still developing physically.";
  } else if (factors.age >= curve.developmentYears[0] && factors.age <= curve.developmentYears[1]) {
    // Development years - RAPID growth potential
    ageModifier = 1.5;
    narrative = "In prime development years.";
  } else if (factors.age >= curve.primeYears[0] && factors.age <= curve.primeYears[1]) {
    // Prime years - slower growth, at peak
    ageModifier = 0.3;
    narrative = "In prime, incremental gains.";
  } else if (factors.age > curve.primeYears[1] && factors.age < curve.declineStart) {
    // Post-prime but not declining
    ageModifier = 0;
    narrative = "Maintaining abilities.";
  } else if (factors.age >= curve.declineStart && factors.age < curve.cliffAge) {
    // Decline phase
    const yearsDecline = factors.age - curve.declineStart;
    ageModifier = -(curve.declineRate * yearsDecline * 100);
    narrative = `Athletic decline has begun (${yearsDecline} years past prime).`;
  } else if (factors.age >= curve.cliffAge) {
    // Cliff - steep decline
    const yearsOverCliff = factors.age - curve.cliffAge;
    ageModifier = -((curve.declineRate * 2) * (yearsOverCliff + 2) * 100);
    narrative = `Steep athletic decline.`;
  }

  // === BASE GROWTH ===
  // More room to grow = more potential growth
  const gapModifier = Math.min(factors.gapToPotential / 20, 1.5);
  const baseGrowth = factors.gapToPotential > 0 ?
    Math.floor(2 * gapModifier * (ageModifier > 0 ? ageModifier : 0.5)) : 0;

  // === PERFORMANCE BONUS ===
  let performanceBonus = 0;
  if (factors.performanceRating >= 85) {
    performanceBonus = 3;  // Excellent season
  } else if (factors.performanceRating >= 75) {
    performanceBonus = 2;  // Good season
  } else if (factors.performanceRating >= 65) {
    performanceBonus = 1;  // Solid season
  } else if (factors.performanceRating < 50) {
    performanceBonus = -1; // Bad season hurts confidence
  }

  // Playing time modifier
  const snapModifier = Math.min(factors.snapsPlayed / 800, 1.0); // ~50 snaps/game * 16
  performanceBonus *= snapModifier;

  // === COACHING BONUS ===
  const coachingAvg = (factors.coachDevelopmentSkill + factors.positionCoachRating) / 2;
  let coachingBonus = 0;
  if (coachingAvg >= 80) {
    coachingBonus = 2;
  } else if (coachingAvg >= 65) {
    coachingBonus = 1;
  } else if (coachingAvg < 40) {
    coachingBonus = -1; // Bad coaching hurts development
  }

  // === SCHEME FIT MODIFIER ===
  let schemeFitModifier = 0;
  switch (factors.schemeFit) {
    case "perfect":
      schemeFitModifier = 2;   // Scheme unlocks potential
      break;
    case "good":
      schemeFitModifier = 1;
      break;
    case "acceptable":
      schemeFitModifier = 0;
      break;
    case "poor":
      schemeFitModifier = -2;  // Wrong scheme stunts growth
      break;
    case "terrible":
      schemeFitModifier = -4;  // Severe developmental damage
      break;
  }

  // === CHARACTER MODIFIERS ===
  const characterBonus =
    ((factors.workEthic - 50) / 50) +
    ((factors.coachability - 50) / 50) +
    ((factors.footballIQ - 50) / 100);

  // === INJURY PENALTY ===
  let injuryPenalty = 0;
  if (factors.majorInjuryThisSeason) {
    injuryPenalty = -3;
    narrative += " Major injury setback.";
  } else if (factors.gamesInjured >= 8) {
    injuryPenalty = -2;
  } else if (factors.gamesInjured >= 4) {
    injuryPenalty = -1;
  }

  // === TOTAL CALCULATION ===
  totalChange = Math.round(
    baseGrowth +
    performanceBonus +
    coachingBonus +
    schemeFitModifier +
    characterBonus +
    ageModifier +
    injuryPenalty
  );

  // Bound the change
  totalChange = Math.max(-10, Math.min(8, totalChange));

  // Ensure rating doesn't exceed potential (unless in prime development)
  const newRating = factors.currentRating + totalChange;
  if (newRating > factors.potential && ageModifier < 1.5) {
    totalChange = factors.potential - factors.currentRating;
  }

  // === POTENTIAL CHANGE ===
  let potentialChange = 0;
  if (factors.schemeFit === "poor" || factors.schemeFit === "terrible") {
    potentialChange = -1;  // Wrong scheme can permanently damage ceiling
  }
  if (factors.majorInjuryThisSeason) {
    potentialChange -= 2;  // Major injuries lower ceiling
  }
  if (factors.age >= curve.cliffAge) {
    potentialChange = Math.max(potentialChange, -3);  // Steep decline
  }

  return {
    overallChange: totalChange,
    attributeChanges: calculateAttributeChanges(factors, totalChange),
    potentialChange,
    baseGrowth,
    performanceBonus: Math.round(performanceBonus),
    coachingBonus,
    schemeFitModifier,
    ageModifier: Math.round(ageModifier),
    injuryPenalty,
    narrative
  };
}
```

### 1.4 Attribute-Specific Development

Different attributes develop and decline at different rates.

```typescript
type AttributeType = "physical" | "technical" | "mental";

const ATTRIBUTE_TYPES: Record<string, AttributeType> = {
  // Physical - decline faster, develop in youth
  speed: "physical",
  acceleration: "physical",
  agility: "physical",
  strength: "physical",
  jumping: "physical",
  stamina: "physical",

  // Technical - develop with experience, decline slowly
  route_running: "technical",
  catching: "technical",
  throwing_accuracy: "technical",
  pass_blocking: "technical",
  run_blocking: "technical",
  tackling: "technical",
  coverage: "technical",

  // Mental - improve with experience, don't decline
  awareness: "mental",
  football_iq: "mental",
  vision: "mental",
  decision_making: "mental",
  anticipation: "mental"
};

const ATTRIBUTE_DEVELOPMENT_RATES: Record<AttributeType, {
  youngBonus: number;      // Extra growth when young
  primeGrowth: number;     // Growth during prime
  declineRate: number;     // Decline rate post-prime
  experienceBonus: number; // Bonus from playing more
}> = {
  physical: {
    youngBonus: 1.5,
    primeGrowth: 0.2,
    declineRate: 0.06,     // Physical attributes decline fastest
    experienceBonus: 0.1
  },
  technical: {
    youngBonus: 1.0,
    primeGrowth: 0.5,
    declineRate: 0.02,     // Technical skills last longer
    experienceBonus: 0.4
  },
  mental: {
    youngBonus: 0.5,
    primeGrowth: 0.8,
    declineRate: 0.0,      // Mental attributes don't decline (wisdom!)
    experienceBonus: 0.6
  }
};
```

---

## Part 2: Scout Progression System

### 2.1 Scout Career Arc

Scouts already have an XP system, but let's enhance it.

```typescript
interface ScoutCareerArc {
  level: number;              // 1-10
  xp: number;
  seasonsActive: number;

  // Skill ratings (evolve over time)
  skills: {
    evaluation: number;       // Core scouting ability
    athleticAnalysis: number; // Reading athletic traits
    technicalAnalysis: number;// Reading technique
    characterAssessment: number; // Reading personality
    footballIQ: number;       // Understanding the game
    networking: number;       // Finding hidden gems
  };

  // Accuracy tracking
  careerAccuracy: number;
  recentAccuracy: number;     // Last 3 seasons
  trend: "improving" | "stable" | "declining";

  // Specializations (unlocked with levels)
  specializations: string[];
  positionStrengths: string[];
  positionWeaknesses: string[];

  // Reputation
  leagueReputation: number;   // Affects hiring value
  notableHits: number;        // Career great evaluations
  notableMisses: number;      // Career busts called wrong
}

// Scout skill progression per season
function progressScoutSkills(
  scout: Scout,
  seasonPerformance: {
    evaluationsCompleted: number;
    accuracyScore: number;
    hiddenGemsFound: number;
    bustsCalled: number;
  }
): ScoutSkillChanges {
  const changes: Record<string, number> = {};

  // Base improvement from experience
  if (scout.seasonsActive < 10) {
    changes.evaluation = 1;
    changes.footballIQ = 1;
  }

  // Performance-based improvement
  if (seasonPerformance.accuracyScore >= 75) {
    changes.evaluation = (changes.evaluation || 0) + 2;
    changes.technicalAnalysis = 1;
  } else if (seasonPerformance.accuracyScore < 50) {
    // Poor performance can cause regression
    changes.evaluation = (changes.evaluation || 0) - 1;
  }

  // Hidden gem bonus
  if (seasonPerformance.hiddenGemsFound >= 2) {
    changes.networking = 2;
    changes.characterAssessment = 1;
  }

  // Volume matters
  if (seasonPerformance.evaluationsCompleted >= 100) {
    changes.athleticAnalysis = 1;
  }

  // Age-based decline (scouts get slower, not worse at evaluating)
  if (scout.age >= 58) {
    changes.stamina = -1; // Can't travel as much
    changes.networking = (changes.networking || 0) - 1;
  }

  return changes;
}
```

---

## Part 3: GM Progression System

### 3.1 GM Skill Development

GMs improve through experience and success.

```typescript
interface GMProgressionFactors {
  // Season results
  teamWins: number;
  teamLosses: number;
  madePlayoffs: boolean;
  playoffWins: number;
  wonChampionship: boolean;

  // Draft performance
  draftGrade: "A+" | "A" | "B" | "C" | "D" | "F";

  // Trade performance
  tradesWon: number;
  tradesLost: number;

  // Financial management
  capSituation: "healthy" | "tight" | "trouble";
  deadCapPercentage: number;

  // Relationship outcomes
  ownerSatisfaction: number;
  coachRelationship: number;
  playerHappiness: number;

  // Years of experience
  yearsAsGM: number;
  age: number;
}

interface GMSkillChanges {
  drafting: number;
  trading: number;
  freeAgency: number;
  capManagement: number;
  scoutingOversight: number;
  coachRelations: number;
  mediaHandling: number;
  playerRelations: number;
}

function progressGMSkills(gm: GeneralManager, factors: GMProgressionFactors): GMSkillChanges {
  const changes: GMSkillChanges = {
    drafting: 0,
    trading: 0,
    freeAgency: 0,
    capManagement: 0,
    scoutingOversight: 0,
    coachRelations: 0,
    mediaHandling: 0,
    playerRelations: 0
  };

  // === EXPERIENCE BASELINE ===
  // Young GMs improve faster
  const experienceMultiplier = factors.yearsAsGM < 5 ? 1.5 :
                               factors.yearsAsGM < 10 ? 1.0 : 0.5;

  // === DRAFT PERFORMANCE ===
  switch (factors.draftGrade) {
    case "A+":
      changes.drafting = 3;
      changes.scoutingOversight = 2;
      break;
    case "A":
      changes.drafting = 2;
      changes.scoutingOversight = 1;
      break;
    case "B":
      changes.drafting = 1;
      break;
    case "D":
      changes.drafting = -1;
      break;
    case "F":
      changes.drafting = -2;
      changes.scoutingOversight = -1;
      break;
  }

  // === TRADE PERFORMANCE ===
  const tradeBalance = factors.tradesWon - factors.tradesLost;
  if (tradeBalance >= 3) {
    changes.trading = 2;
  } else if (tradeBalance >= 1) {
    changes.trading = 1;
  } else if (tradeBalance <= -2) {
    changes.trading = -1;
  }

  // === CAP MANAGEMENT ===
  if (factors.capSituation === "healthy" && factors.deadCapPercentage < 5) {
    changes.capManagement = 2;
  } else if (factors.capSituation === "trouble" || factors.deadCapPercentage > 15) {
    changes.capManagement = -2;
    changes.freeAgency = -1;
  }

  // === RELATIONSHIP MANAGEMENT ===
  if (factors.ownerSatisfaction >= 80) {
    changes.mediaHandling = 1;
  }
  if (factors.coachRelationship >= 75) {
    changes.coachRelations = 1;
  } else if (factors.coachRelationship < 40) {
    changes.coachRelations = -1;
  }
  if (factors.playerHappiness >= 75) {
    changes.playerRelations = 1;
  }

  // === WINNING MATTERS ===
  if (factors.wonChampionship) {
    // Championship GMs get overall boost
    Object.keys(changes).forEach(key => {
      changes[key as keyof GMSkillChanges] += 1;
    });
  } else if (factors.playoffWins >= 2) {
    changes.drafting += 1;
    changes.trading += 1;
  } else if (factors.teamWins < 6) {
    // Losing damages skills through bad habits/desperation
    changes.trading = Math.min(changes.trading, -1);
    changes.freeAgency = Math.min(changes.freeAgency, -1);
  }

  // Apply experience multiplier
  Object.keys(changes).forEach(key => {
    changes[key as keyof GMSkillChanges] = Math.round(
      changes[key as keyof GMSkillChanges] * experienceMultiplier
    );
  });

  // === AGE DECLINE ===
  if (gm.age >= 65) {
    // Older GMs may lose some edge
    changes.mediaHandling = Math.min(changes.mediaHandling, -1);
  }

  return changes;
}
```

### 3.2 GM Reputation System

```typescript
interface GMReputation {
  leagueWide: number;           // 0-100, affects trade leverage
  draftReputation: number;      // Known as good/bad drafter
  tradeReputation: number;      // Known as trade winner/loser
  playerReputation: number;     // Do players want to play for them?

  // Historical tracking
  championshipsWon: number;
  playoffAppearances: number;
  winningSeasons: number;
  losingSeasons: number;

  // Notable events
  biggestWins: string[];        // Great moves
  biggestMistakes: string[];    // Bad moves that haunt them
}

// Reputation affects:
// - Trade negotiations (high rep = better deals)
// - Free agent interest (players want to play for winners)
// - Owner patience (proven GMs get more leeway)
// - Media treatment (benefit of the doubt)
```

---

## Part 4: Coach Progression System

### 4.1 Coach Skill Development

```typescript
interface CoachProgressionFactors {
  // Season results
  teamWins: number;
  teamLosses: number;
  pointsFor: number;
  pointsAgainst: number;
  madePlayoffs: boolean;
  playoffWins: number;
  wonChampionship: boolean;

  // Player development
  playersImproved: number;      // Players who got better
  playersDeclined: number;      // Players who got worse
  rookiePerformance: number;    // How well rookies played

  // Scheme effectiveness
  offensiveRank: number;        // 1-32
  defensiveRank: number;        // 1-32

  // In-game performance
  fourthDownSuccess: number;    // Aggressiveness results
  challengeSuccess: number;     // Game management
  closeGameRecord: { wins: number; losses: number };

  // Relationships
  playerBuyIn: number;          // Do players believe?
  gmRelationship: number;

  // Experience
  yearsAsHC: number;
  age: number;
}

function progressCoachSkills(
  coach: HeadCoach,
  factors: CoachProgressionFactors
): CoachSkillChanges {
  const changes: CoachSkillChanges = {
    gameManagement: 0,
    playerDevelopment: 0,
    playDesign: 0,
    adjustments: 0,
    motivation: 0,
    discipline: 0,
    talentEvaluation: 0,
    mediaRelations: 0
  };

  const experienceMultiplier = factors.yearsAsHC < 5 ? 1.5 :
                               factors.yearsAsHC < 10 ? 1.0 : 0.5;

  // === PLAYER DEVELOPMENT RESULTS ===
  const devBalance = factors.playersImproved - factors.playersDeclined;
  if (devBalance >= 5) {
    changes.playerDevelopment = 3;
  } else if (devBalance >= 2) {
    changes.playerDevelopment = 2;
  } else if (devBalance < -2) {
    changes.playerDevelopment = -2;
  }

  if (factors.rookiePerformance >= 75) {
    changes.playerDevelopment += 1;
    changes.talentEvaluation += 1;
  }

  // === SCHEME EFFECTIVENESS ===
  // Offensive coach background
  if (coach.background === "offensive_coordinator" || coach.background === "qb_guru") {
    if (factors.offensiveRank <= 10) {
      changes.playDesign = 2;
    } else if (factors.offensiveRank >= 25) {
      changes.playDesign = -1;
    }
  }
  // Defensive coach background
  if (coach.background === "defensive_coordinator" || coach.background === "defensive_mastermind") {
    if (factors.defensiveRank <= 10) {
      changes.playDesign = 2;
    } else if (factors.defensiveRank >= 25) {
      changes.playDesign = -1;
    }
  }

  // === GAME MANAGEMENT ===
  if (factors.fourthDownSuccess >= 60) {
    changes.gameManagement = 1;
  }
  if (factors.closeGameRecord.wins > factors.closeGameRecord.losses + 2) {
    changes.gameManagement += 2;
    changes.adjustments += 1;
  } else if (factors.closeGameRecord.losses > factors.closeGameRecord.wins + 2) {
    changes.gameManagement -= 1;
    changes.adjustments -= 1;
  }

  // === MOTIVATION & DISCIPLINE ===
  if (factors.playerBuyIn >= 80) {
    changes.motivation = 2;
  } else if (factors.playerBuyIn < 50) {
    changes.motivation = -2;
    changes.discipline = -1;
  }

  // === WINNING ===
  if (factors.wonChampionship) {
    Object.keys(changes).forEach(key => {
      changes[key as keyof CoachSkillChanges] += 1;
    });
  } else if (factors.teamWins >= 12) {
    changes.playDesign += 1;
    changes.adjustments += 1;
  } else if (factors.teamWins <= 4) {
    changes.playDesign = Math.min(changes.playDesign, -1);
    changes.motivation = Math.min(changes.motivation, -1);
  }

  // Apply experience multiplier
  Object.keys(changes).forEach(key => {
    changes[key as keyof CoachSkillChanges] = Math.round(
      changes[key as keyof CoachSkillChanges] * experienceMultiplier
    );
  });

  // === AGE DECLINE ===
  if (coach.age >= 68) {
    changes.motivation = Math.min(changes.motivation, -1);
  }

  return changes;
}
```

### 4.2 Coaching Tree & Mentorship

```typescript
interface CoachingTreeNode {
  coachId: string;
  mentorId?: string;
  proteges: string[];

  // Inherited tendencies
  inheritedTraits: {
    offensivePhilosophy?: string;
    defensivePhilosophy?: string;
    playerDevelopmentStyle?: string;
  };

  // Success tracking
  combinedChampionships: number;  // This coach + all proteges
  treePrestige: number;           // How respected is this tree?
}

// Coaches who learned from successful coaches:
// - Start with slight skill bonus
// - Inherit some scheme tendencies
// - Get reputation boost from mentor's success
```

---

## Part 5: Season Transition System

### 5.1 End of Season Processing

```typescript
interface SeasonTransitionResult {
  // Player changes
  playerDevelopment: {
    playerId: string;
    overallChange: number;
    potentialChange: number;
    narrative: string;
  }[];

  playerRetirements: {
    playerId: string;
    reason: "age" | "injury" | "voluntary" | "cut";
    careerSummary: string;
  }[];

  // Staff changes
  scoutProgression: {
    scoutId: string;
    xpGained: number;
    levelUp: boolean;
    skillChanges: Record<string, number>;
  }[];

  gmProgression: {
    gmId: string;
    skillChanges: Record<string, number>;
    reputationChange: number;
  }[];

  coachProgression: {
    coachId: string;
    skillChanges: Record<string, number>;
  }[];

  // Firings and retirements
  staffRetirements: {
    personId: string;
    type: "gm" | "coach" | "scout";
    reason: string;
  }[];

  staffFirings: {
    personId: string;
    type: "gm" | "coach";
    teamId: string;
    reason: string;
  }[];

  // New personnel
  newPersonnel: {
    gms: GeneralManager[];
    coaches: HeadCoach[];
    scouts: Scout[];
  };

  // Hall of Fame
  hofInductees: RetiredPerson[];
}

async function processSeasonTransition(
  season: number,
  allTeams: Team[]
): Promise<SeasonTransitionResult> {
  const result: SeasonTransitionResult = {
    playerDevelopment: [],
    playerRetirements: [],
    scoutProgression: [],
    gmProgression: [],
    coachProgression: [],
    staffRetirements: [],
    staffFirings: [],
    newPersonnel: { gms: [], coaches: [], scouts: [] },
    hofInductees: []
  };

  // 1. Process player development/decline
  for (const team of allTeams) {
    const players = await getTeamRoster(team.id);
    const coach = await getCoach(team.coachId);

    for (const player of players) {
      const factors = buildDevelopmentFactors(player, coach, team);
      const devResult = calculatePlayerDevelopment(factors);

      result.playerDevelopment.push({
        playerId: player.id,
        overallChange: devResult.overallChange,
        potentialChange: devResult.potentialChange,
        narrative: devResult.narrative
      });

      // Apply changes
      await updatePlayerRating(player.id, devResult);
    }
  }

  // 2. Check for player retirements
  const retirementResults = await processPlayerRetirements(season);
  result.playerRetirements = retirementResults;

  // 3. Process scout progression
  const scouts = await getAllActiveScouts();
  for (const scout of scouts) {
    const performance = await getScoutSeasonPerformance(scout.id, season);
    const changes = progressScoutSkills(scout, performance);
    const xp = calculateScoutXP(performance);

    result.scoutProgression.push({
      scoutId: scout.id,
      xpGained: xp,
      levelUp: await applyScoutXP(scout.id, xp),
      skillChanges: changes
    });
  }

  // 4. Process GM progression
  const gms = await getAllActiveGMs();
  for (const gm of gms) {
    const factors = await buildGMProgressionFactors(gm.id, season);
    const changes = progressGMSkills(gm, factors);

    result.gmProgression.push({
      gmId: gm.id,
      skillChanges: changes,
      reputationChange: calculateReputationChange(factors)
    });

    await applyGMSkillChanges(gm.id, changes);
  }

  // 5. Process coach progression
  const coaches = await getAllActiveCoaches();
  for (const coach of coaches) {
    const factors = await buildCoachProgressionFactors(coach.id, season);
    const changes = progressCoachSkills(coach, factors);

    result.coachProgression.push({
      coachId: coach.id,
      skillChanges: changes
    });

    await applyCoachSkillChanges(coach.id, changes);
  }

  // 6. Process staff retirements and firings
  // (Uses existing lifecycle-manager.ts)

  // 7. Generate new personnel for hiring pool

  // 8. Age everyone by 1 year

  return result;
}
```

---

## Part 6: Implementation Files

```
lib/progression/
├── index.ts                      # Module exports
├── types.ts                      # All progression types
├── age-curves.ts                 # Position-specific aging
├── player-development.ts         # Player progression/regression
├── attribute-development.ts      # Per-attribute changes
├── scout-progression.ts          # Scout XP and skills
├── gm-progression.ts             # GM skill development
├── coach-progression.ts          # Coach skill development
├── reputation-system.ts          # GM/Coach reputation
├── season-transition.ts          # End of season processing
└── retirement-calculator.ts      # Retirement decisions
```

---

## Part 7: Implementation Phases

### Phase 9A: Player Age Curves (1 week) ✅ COMPLETE
- [x] Position-specific age curves
- [x] Development years bonuses
- [x] Decline calculation
- [x] Cliff age handling

**Implemented in:** `lib/progression/age-curves.ts`
- Complete age curves for all 10 position groups (QB, RB, WR, TE, OL, DL, LB, CB, Safety, K/P)
- Physical vs mental attribute modifiers by age
- Injury risk modifiers
- Retirement chance by age
- Helper functions: `getAgeCurvePoint()`, `determineCareerPhase()`, `positionToGroup()`, `calculateRemainingCareer()`

### Phase 9B: Player Development Engine (2 weeks) ✅ COMPLETE
- [x] Factor collection
- [x] Development calculation
- [x] Attribute-specific changes
- [x] Potential adjustment

**Implemented in:** `lib/progression/player-development.ts`
- `processPlayerSeason()` - Main development processor
- `calculateDevelopmentMultipliers()` - Age, playing time, scheme fit, coaching, work ethic, injury, mentor multipliers
- `processTeamDevelopment()` - Batch process all players on a team
- `evaluateRetirement()` - Retirement decision logic with multiple factors
- Career phase tracking and trajectory changes (star → bust, bust → starter, etc.)
- Development narrative generation

### Phase 9C: Staff Progression (2 weeks) ✅ COMPLETE
- [x] Scout skill progression (enhance existing)
- [x] GM skill progression (new)
- [x] Coach skill progression (new)
- [x] Reputation systems

**Implemented in:** `lib/progression/staff-development.ts`
- `processGMSeason()` - GM skill progression based on draft grades, trades, cap management, team performance
- `processCoachSeason()` - Coach skill progression based on player development, scheme effectiveness, game management
- `processScoutSeason()` - Scout skill progression based on evaluation accuracy, networking, travel
- Specialization unlocks for all staff types
- Job security and firing risk calculations
- Experience-based skill gains

### Phase 9D: Season Transition (1 week) ✅ COMPLETE
- [x] Batch processing
- [x] Database updates
- [x] News generation
- [x] UI integration

**Implemented in:** `lib/progression/season-transition.ts`
- `processSeasonTransition()` - Main season-end processor
- `processLeagueSeasonEnd()` - Batch process all 32 teams
- `ageEntities()` - Increment age for all entities
- Headline generation for breakouts, declines, retirements, firings
- Hiring needs tracking
- Configurable settings (enable/disable retirements, firings, headlines)

---

This comprehensive system creates realistic career arcs for all entities in the game, where success breeds more success, age catches up with everyone, and scheme fit matters for development.

---

## Implementation Summary

All phases are now complete. The progression system is implemented across the following files:

```
lib/progression/
├── development-types.ts      # All progression/development types
├── age-curves.ts             # Position-specific aging curves
├── player-development.ts     # Player progression/regression engine
├── staff-development.ts      # GM, Coach, Scout progression
├── season-transition.ts      # End of season batch processing
├── development-index.ts      # Module exports for development system
│
├── types.ts                  # Game progression types (stages, checklists)
├── checklist.ts              # Game stage progression (existing)
└── task-validator.ts         # Task validation (existing)
```

### Key Features Implemented:

1. **Position-Specific Age Curves** - RBs peak at 24-27, QBs at 28-35, etc.
2. **Physical vs Mental Attributes** - Physical decline faster, mental attributes peak later
3. **Development Multipliers** - Playing time, scheme fit, coaching quality, work ethic all matter
4. **Career Phases** - Rookie → Developing → Prime → Veteran → Declining → Twilight
5. **Trajectory Tracking** - Star → Starter → Contributor → Backup → Bust
6. **GM/Coach/Scout Progression** - Skills improve/decline based on performance
7. **Retirement System** - Age, injuries, market interest, legacy all factor in
8. **Firing System** - Job security based on results vs expectations
9. **Season Headlines** - Breakouts, declines, resurrections, firings generate narratives
