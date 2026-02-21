export type SchemeType =
  | 'wideZone'
  | 'powerRun'
  | 'verticalPass'
  | 'westCoast'
  | 'airRaid'
  | 'rpo'
  | 'spreadOption'
  | 'cover1'
  | 'cover2'
  | 'cover3'
  | 'cover4'
  | 'cover6'
  | 'pressMan'
  | 'quarters'
  | 'Tampa2';

export type PlayerPosition =
  | 'QB'
  | 'RB'
  | 'WR'
  | 'TE'
  | 'OT'
  | 'OG'
  | 'C'
  | 'EDGE'
  | 'DE'
  | 'DT'
  | 'LB'
  | 'CB'
  | 'S'
  | 'K'
  | 'P';

export type PositionSpecificAttributeKey =
  | 'throwPower'
  | 'shortAccuracy'
  | 'midAccuracy'
  | 'deepAccuracy'
  | 'pocketPresence'
  | 'mobility'
  | 'decisionMaking'
  | 'playAction'
  | 'carrying'
  | 'breakTackle'
  | 'vision'
  | 'routeRunning'
  | 'catching'
  | 'passBlock'
  | 'speed'
  | 'power'
  | 'yacAbility'
  | 'separation'
  | 'contestedCatch'
  | 'blocking'
  | 'release'
  | 'runBlock'
  | 'strength'
  | 'technique'
  | 'awareness'
  | 'pulling'
  | 'passRushSpeed'
  | 'passRushPower'
  | 'passRushTechnique'
  | 'runDefense'
  | 'motor'
  | 'athleticism'
  | 'runStuff'
  | 'passRush'
  | 'anchor'
  | 'lateralMovement'
  | 'coverage'
  | 'tackling'
  | 'instincts'
  | 'rangeInZone'
  | 'manCoverage'
  | 'zoneCoverage'
  | 'press'
  | 'ballSkills'
  | 'coverageRange'
  | 'runSupport'
  | 'zoneDiagnosis'
  | 'kickPower'
  | 'kickAccuracy'
  | 'puntPower'
  | 'puntAccuracy'
  | 'hangTime';

export interface PlayerTrueRatings {
  playerId: string;
  position: PlayerPosition;
  age: number;
  potential: number;
  injuryProneness: number;
  durability: number;
  footballIQ: number;
  character: number;
  leadership: number;
  workEthic: number;
  clutch: number;
  spd: number;
  str: number;
  agi: number;
  acc: number;
  positionAttributes: Partial<Record<PositionSpecificAttributeKey, number>>;
}

export interface SchemeFitProfile {
  playerId: string;
  offensiveScheme?: SchemeType;
  defensiveScheme?: SchemeType;
  fitModifiers: Partial<Record<SchemeType, number>>;
}

export type DevelopmentTier = 'superstar' | 'star' | 'normal' | 'slow';
export type PlayerArc = 'rising' | 'peak' | 'declining';

export interface PlayerDevelopment {
  playerId: string;
  developmentTier: DevelopmentTier;
  peakAge: number;
  currentArc: PlayerArc;
  declineRate: number;
  breakoutProbability: number;
  bustRisk: number;
}

export type CharacterAssessment = 'elite' | 'good' | 'average' | 'concern' | 'red_flag';

export interface ScoutedAttributeEstimate {
  low: number;
  high: number;
  confidence: number;
}

export interface ScoutedPlayer {
  playerId: string;
  teamId: string;
  scoutedBy: string[];
  scoutingConfidence: number;
  estOverallLow: number;
  estOverallHigh: number;
  estPotentialLow: number;
  estPotentialHigh: number;
  attributeEstimates: Record<string, ScoutedAttributeEstimate>;
  schemeFitAssessment: SchemeType[];
  characterAssessment: CharacterAssessment;
  scoutNotes: string;
}

export interface HeadCoachPersonnel {
  gameManagement: number;
  playerDevelopment: number;
  playDesign: number;
  lockerRoom: number;
  recruiting: number;
  pressureHandling: number;
  adaptability: number;
  offensiveScheme: SchemeType;
  defensiveScheme: SchemeType;
  schemeFlexibility: number;
  personality: {
    egoLevel: number;
    playerFriendly: number;
    mediaRelations: number;
    loyaltyToStaff: number;
    riskTolerance: number;
  };
}

export interface CoordinatorPersonnel {
  coachId: string;
  role: 'OC' | 'DC' | 'ST' | 'QB' | 'RB' | 'WR' | 'OL' | 'DL' | 'LB' | 'DB';
  schemeExpertise: SchemeType[];
  playerDevelopmentBonus: number;
  recruitingInfluence: number;
  headCoachPotential: number;
  compatibility: number;
}

export interface CoachSimAttributes {
  coachId: string;
  role: string;
  leadership: number;
  footballIQ: number;
  motivation: number;
  adaptability: number;
  offensiveBias?: {
    runFrequency: number;
    deepPassRate: number;
    screenRate: number;
    rpoRate: number;
    aggressionOnFourthDown: number;
  };
  defensiveBias?: {
    blitzRate: number;
    coverageType: SchemeType;
    pressRate: number;
    safetyPosition: 'deep' | 'mixed' | 'box';
  };
}

export interface GMProfile {
  drafting: number;
  trading: number;
  freeAgency: number;
  capManagement: number;
  coachEvaluation: number;
  scoutManagement: number;
  riskTolerance: number;
  loyalty: number;
  schemeConviction: number;
}

export interface ScoutBias {
  type: 'overvalues' | 'undervalues';
  attribute: string;
  magnitude: number;
}

export interface ScoutProfile {
  scoutId: string;
  overallAccuracy: number;
  evaluation: number;
  footballIQ: number;
  athleticAnalysis: number;
  psychInsight: number;
  projectionAbility: number;
  positionSpecialties: Record<'QB' | 'skill' | 'OL' | 'DL' | 'LB' | 'DB' | 'ST', number>;
  confidence: number;
  bias: ScoutBias[];
  experience: number;
}

export interface OwnerProfile {
  spendingWillingness: number;
  patienceLevel: number;
  meddlingTendency: number;
  marketPressure: number;
  winNowBias: number;
  trustInGM: number;
  trustInHC: number;
  satisfactionLevel: number;
  patience: number;
  hotSeatThreshold: number;
  firingThreshold: number;
}

export type RelationshipEntityType = 'player' | 'coach' | 'coordinator' | 'gm' | 'owner' | 'fanBase' | 'media';

export type RelationshipEventType =
  | 'owner_overrides_draft_pick'
  | 'owner_approves_draft_strategy'
  | 'owner_forces_fa_signing'
  | 'season_exceeds_expectations'
  | 'season_misses_expectations'
  | 'playoff_appearance'
  | 'missed_playoffs_consecutive'
  | 'public_criticism_of_coach'
  | 'player_scheme_mismatch_drafted'
  | 'player_development_surge'
  | 'player_benched'
  | 'coach_goes_to_bat_for_player'
  | 'player_traded_despite_objection'
  | 'team_wins_streak'
  | 'team_loses_streak'
  | 'super_bowl_win'
  | 'locker_room_incident';

export interface RelationshipEvent {
  week: number;
  season: number;
  eventType: RelationshipEventType;
  deltaScore: number;
  description: string;
}

export interface Relationship {
  id: string;
  entityA: { type: RelationshipEntityType; id: string };
  entityB: { type: RelationshipEntityType; id: string };
  score: number;
  trend: 'improving' | 'stable' | 'deteriorating';
  history: RelationshipEvent[];
}

export interface TeamStrengthSnapshot {
  offensiveRating: number;
  defensiveRating: number;
  specialTeamsRating: number;
  chemistryModifier: number;
  schemeCoherenceModifier: number;
  depthModifier: number;
}

export interface TeamStrengthInput {
  players: Array<{
    playerId: string;
    position: PlayerPosition;
    isStarter: boolean;
    trueRatings: PlayerTrueRatings;
    schemeFit: SchemeFitProfile;
    inactive?: boolean;
  }>;
  headCoach: HeadCoachPersonnel;
  offensiveCoordinator?: CoordinatorPersonnel;
  defensiveCoordinator?: CoordinatorPersonnel;
  relationships: Relationship[];
  currentOffensiveScheme: SchemeType;
  currentDefensiveScheme: SchemeType;
}
