// ==========================================
// Player/Staff Progression & Development Types
// ==========================================

// Position groups for age curves
export type PositionGroup =
  | "qb"
  | "rb"
  | "wr"
  | "te"
  | "ol"
  | "dl"
  | "lb"
  | "cb"
  | "safety"
  | "k_p";

// Player career phase
export type CareerPhase =
  | "rookie"      // Year 1
  | "developing"  // Years 2-3
  | "prime"       // Years 4-8 (varies by position)
  | "veteran"     // Post-prime but still productive
  | "declining"   // Significant regression
  | "twilight";   // Final years

// Development trajectory
export type DevelopmentTrajectory =
  | "star"        // Elite ceiling, fast development
  | "starter"     // Solid starter potential
  | "contributor" // Role player
  | "backup"      // Depth piece
  | "bust";       // Failed to develop

// ==========================================
// Age Curve Definitions
// ==========================================

export interface AgeCurvePoint {
  age: number;
  physicalModifier: number;    // -100 to +100
  mentalModifier: number;      // -100 to +100
  injuryRiskModifier: number;  // Multiplier (1.0 = baseline)
  retirementChance: number;    // 0-1 probability
}

export interface PositionAgeCurve {
  position: PositionGroup;
  peakAgeStart: number;
  peakAgeEnd: number;
  typicalRetirement: number;
  earlyRetirement: number;      // Age at which early retirement possible
  physicalAttributes: string[]; // Which attributes decline faster
  mentalAttributes: string[];   // Which attributes improve/hold
  curve: AgeCurvePoint[];
}

// ==========================================
// Player Development
// ==========================================

export interface PlayerProgressionState {
  playerId: string;
  currentAge: number;
  yearsInLeague: number;
  careerPhase: CareerPhase;
  trajectory: DevelopmentTrajectory;

  // Potential and ceiling
  potentialOVR: number;       // Maximum possible overall
  currentOVR: number;
  ceilingRemaining: number;   // How much growth potential remains

  // Development tracking
  developmentRate: number;    // 0.5 to 2.0 multiplier
  trainingFocus?: string;     // Attribute being trained

  // Health and durability
  injuryHistory: InjuryRecord[];
  durabilityRating: number;   // Affects regression rate

  // Performance context
  schemeFitLevel: number;     // 0-100, affects development
  playingTimePercent: number; // Snap percentage
  coachDevelopmentBonus: number; // From coach skill
}

export interface InjuryRecord {
  season: number;
  week: number;
  type: string;
  severity: "minor" | "moderate" | "major" | "career_threatening";
  gamesOut: number;
  permanentImpact: number; // Lasting attribute reduction
}

export interface SeasonDevelopmentResult {
  playerId: string;
  season: number;

  // Overall changes
  previousOVR: number;
  newOVR: number;
  ovrChange: number;

  // Attribute changes
  attributeChanges: AttributeChange[];

  // Phase transition
  previousPhase: CareerPhase;
  newPhase: CareerPhase;
  phaseChanged: boolean;

  // Trajectory update
  trajectoryChange?: {
    previous: DevelopmentTrajectory;
    new: DevelopmentTrajectory;
    reason: string;
  };

  // Narrative
  developmentNarrative: string;
  breakoutCandidate: boolean;
  declineWarning: boolean;
}

export interface AttributeChange {
  attribute: string;
  previousValue: number;
  newValue: number;
  change: number;
  reason: DevelopmentReason;
}

export type DevelopmentReason =
  | "age_progression"
  | "age_regression"
  | "training"
  | "game_experience"
  | "scheme_fit"
  | "coaching"
  | "injury_impact"
  | "natural_growth"
  | "physical_decline"
  | "mental_maturity";

// ==========================================
// Staff Progression
// ==========================================

// GM Progression
export interface GMProgressionState {
  gmId: string;
  yearsExperience: number;
  currentTeamTenure: number;

  // Skill ratings (0-100)
  skills: {
    drafting: number;
    trading: number;
    freeAgency: number;
    capManagement: number;
    talentEvaluation: number;
    schemeRecognition: number;
    relationshipBuilding: number;
  };

  // Track record affects skill changes
  trackRecord: {
    playoffAppearances: number;
    championships: number;
    draftHits: number;       // Players who exceeded expectations
    draftMisses: number;     // Players who busted
    tradeSteals: number;     // Won trades
    tradeFlops: number;      // Lost trades
    successfulRebuilds: number;
  };

  // Development
  specializations: GMSpecialization[];
  learningFromMistakes: number; // Reduces repeat errors
}

export type GMSpecialization =
  | "draft_guru"
  | "trade_master"
  | "cap_wizard"
  | "talent_evaluator"
  | "relationship_builder"
  | "scheme_architect";

export interface GMSeasonResult {
  gmId: string;
  season: number;

  // Performance metrics
  draftGrade: string;
  tradeValue: number;
  capHealth: number;
  teamWins: number;

  // Skill changes
  skillChanges: {
    skill: keyof GMProgressionState["skills"];
    change: number;
    reason: string;
  }[];

  // Specialization progress
  specializationProgress?: {
    specialization: GMSpecialization;
    progress: number;
    unlocked: boolean;
  };

  // Job security
  ownerTrust: number;
  hotSeat: boolean;
  fireRisk: number;
}

// Coach Progression
export interface CoachProgressionState {
  coachId: string;
  yearsExperience: number;
  currentTeamTenure: number;

  // Skill ratings (0-100)
  skills: {
    gameManagement: number;
    playerDevelopment: number;
    schemeDesign: number;
    motivation: number;
    adjustments: number;
    clockManagement: number;
    challengeDecisions: number;
  };

  // Scheme mastery
  schemeMastery: {
    scheme: string;
    mastery: number; // 0-100
    yearsRunning: number;
  }[];

  // Track record
  trackRecord: {
    wins: number;
    losses: number;
    playoffWins: number;
    championships: number;
    playersDeveloped: number;   // Players who improved significantly
    bustReclamations: number;   // "Busts" who became starters
  };

  // Learning
  adaptability: number;          // Ability to change schemes
  learnFromLosses: number;       // Improvement after bad games
}

export type CoachSpecialization =
  | "player_whisperer"
  | "scheme_innovator"
  | "game_manager"
  | "motivator"
  | "developer"
  | "adjustment_master";

export interface CoachSeasonResult {
  coachId: string;
  season: number;

  // Team performance
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  playoffResult?: string;

  // Skill changes
  skillChanges: {
    skill: keyof CoachProgressionState["skills"];
    change: number;
    reason: string;
  }[];

  // Player development success
  developmentSuccesses: {
    playerId: string;
    playerName: string;
    ovrImprovement: number;
  }[];

  // Job security
  gmTrust: number;
  ownerTrust: number;
  hotSeat: boolean;
  fireRisk: number;
}

// Scout Progression
export interface ScoutProgressionState {
  scoutId: string;
  yearsExperience: number;

  // Core skills (0-100)
  skills: {
    physicalEvaluation: number;
    characterAssessment: number;
    schemeProjection: number;
    comparisons: number;
    reporting: number;
    networking: number;
  };

  // Experience points and level
  xp: number;
  level: number;
  xpToNextLevel: number;

  // Track record
  trackRecord: {
    reportsSubmitted: number;
    accuratePredictions: number;    // Within 1 round of actual draft
    discoveredGems: number;         // Late rounders who became starters
    missedBusts: number;            // High grades on busts
    correctWarnings: number;        // Warned about busts that busted
  };

  // Specializations
  positionExpertise: {
    position: string;
    expertise: number; // 0-100
    reportsOnPosition: number;
  }[];

  // Regional knowledge
  regionalKnowledge: {
    region: string;
    familiarity: number; // 0-100
    connections: number;
  }[];
}

export interface ScoutSeasonResult {
  scoutId: string;
  season: number;

  // Activity
  reportsSubmitted: number;
  playersEvaluated: number;
  travelMiles: number;

  // Accuracy tracking
  accuracyResults: {
    playerId: string;
    projectedRound: number;
    actualRound: number;
    projectedOVR: number;
    actualOVR: number;
    accurate: boolean;
  }[];

  // Skill changes
  skillChanges: {
    skill: keyof ScoutProgressionState["skills"];
    change: number;
    reason: string;
  }[];

  // XP and leveling
  xpGained: number;
  leveledUp: boolean;
  newLevel?: number;

  // Career
  promotionEligible: boolean;
  fireRisk: number;
}

// ==========================================
// Season Transition
// ==========================================

export interface SeasonTransitionInput {
  season: number;

  // All entities to process
  players: PlayerProgressionState[];
  gms: GMProgressionState[];
  coaches: CoachProgressionState[];
  scouts: ScoutProgressionState[];

  // Context
  teamResults: Map<string, TeamSeasonResult>;
  draftResults: Map<string, DraftPickResult[]>;
}

export interface TeamSeasonResult {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  playoffResult?: "wild_card" | "divisional" | "conference" | "super_bowl_loss" | "champion";
  draftGrade: string;
}

export interface DraftPickResult {
  round: number;
  pick: number;
  playerId: string;
  playerName: string;
  position: string;

  // First year results
  gamesPlayed: number;
  gamesStarted: number;
  performanceGrade: string;
  rookieOVR: number;
}

export interface SeasonTransitionOutput {
  season: number;

  // Progression results
  playerResults: SeasonDevelopmentResult[];
  gmResults: GMSeasonResult[];
  coachResults: CoachSeasonResult[];
  scoutResults: ScoutSeasonResult[];

  // Retirements
  retirements: {
    entityType: "player" | "gm" | "coach" | "scout";
    entityId: string;
    name: string;
    age: number;
    reason: RetirementReason;
    hallOfFameEligible: boolean;
  }[];

  // Firings
  firings: {
    entityType: "gm" | "coach" | "scout";
    entityId: string;
    name: string;
    teamId: string;
    reason: string;
  }[];

  // Hires needed
  hiringNeeds: {
    teamId: string;
    position: "gm" | "coach" | "scout";
    urgency: "immediate" | "offseason";
  }[];

  // Headlines
  headlines: SeasonHeadline[];
}

export type RetirementReason =
  | "age"
  | "injury"
  | "burnout"
  | "family"
  | "pursue_other_opportunities"
  | "on_top"
  | "lost_passion";

export interface SeasonHeadline {
  type: "breakout" | "decline" | "retirement" | "firing" | "resurrection" | "bust" | "gem";
  entityId: string;
  entityName: string;
  headline: string;
  subheadline: string;
  importance: "major" | "minor";
}

// ==========================================
// Development Factors
// ==========================================

export interface DevelopmentFactors {
  // Base factors
  age: number;
  yearsInLeague: number;
  positionGroup: PositionGroup;

  // Performance context
  playingTimePercent: number;    // 0-100
  starterStatus: boolean;
  performanceRating: number;     // How well they played

  // Scheme and coaching
  schemeFit: number;             // 0-100
  coachDevelopmentSkill: number; // 0-100
  schemeStability: boolean;      // Same scheme as last year?

  // Physical
  currentInjury: boolean;
  injuryHistorySeverity: number; // 0-100
  durabilityRating: number;

  // Mental/intangibles
  workEthic: number;             // 0-100
  footballIQ: number;            // 0-100
  coachability: number;          // 0-100

  // Team context
  teamQuality: number;           // 0-100
  veteranMentors: boolean;       // Good vet at position?
  competitionLevel: number;      // Quality of practice competition
}

export interface DevelopmentMultipliers {
  ageMultiplier: number;         // From age curve
  playingTimeMultiplier: number; // More reps = faster growth
  schemeFitMultiplier: number;   // Good fit = better development
  coachingMultiplier: number;    // Good coach = faster growth
  workEthicMultiplier: number;   // Hard workers develop faster
  injuryMultiplier: number;      // Injuries slow development
  mentorMultiplier: number;      // Veterans help young players

  // Combined
  totalMultiplier: number;
}
