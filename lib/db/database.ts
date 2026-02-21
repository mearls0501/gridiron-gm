import Dexie, { Table } from "dexie";

// ==========================================
// Core Types
// ==========================================

export type SeasonPhase =
  | "offseason"
  | "free_agency"
  | "pre_draft"
  | "draft"
  | "post_draft"
  | "training_camp"
  | "preseason"
  | "regular_season"
  | "playoffs"
  | "super_bowl";

export type PersonnelStatus =
  | "active"
  | "available"
  | "retired"
  | "deceased"
  | "suspended"
  | "blacklisted";

export type FiringReason =
  | "poor_record"
  | "missed_playoffs"
  | "lost_locker_room"
  | "owner_impatience"
  | "scandal"
  | "philosophical_differences"
  | "new_ownership";

export type RetirementReason =
  | "age"
  | "health"
  | "family"
  | "burnout"
  | "fired_multiple_times"
  | "achieved_goals"
  | "scandal"
  | "voluntary";

// ==========================================
// Save Game
// ==========================================

export interface SaveGame {
  id: string;
  name: string;
  createdAt: Date;
  lastPlayedAt: Date;
  currentSeason: number;
  currentWeek: number;
  currentPhase: SeasonPhase;
  playerTeamId: string;
  playerGMId: string;
  settings: GameSettings;
  version: string;
}

export interface GameSettings {
  difficulty: "rookie" | "pro" | "all_pro" | "hall_of_fame";
  simSpeed: "fast" | "normal" | "detailed";
  injuryFrequency: "low" | "normal" | "high";
  tradeFrequency: "low" | "normal" | "high";
  autoSave: boolean;
  showTutorials: boolean;
}

// ==========================================
// Teams
// ==========================================

export interface Team {
  id: string;
  name: string;
  city: string;
  abbreviation: string;
  conference: "AFC" | "NFC";
  division: "North" | "South" | "East" | "West";

  // Current staff
  ownerId: string;
  gmId: string | null;
  coachId: string | null;
  scoutIds: string[];

  // Financials
  salaryCap: number;
  currentCapUsed: number;
  deadCap: number;

  // History
  championships: number;
  playoffAppearances: number;

  // Characteristics
  marketSize: "large" | "medium" | "small";
  fanbasePatience: number;
  historicalPrestige: number;

  // Player controlled?
  isPlayerControlled: boolean;
}

// ==========================================
// Base Person Interface
// ==========================================

export interface CareerHistoryEntry {
  teamId: string;
  teamName: string;
  role: string;
  startSeason: number;
  endSeason: number | null; // null = current
  endReason?: "fired" | "retired" | "resigned" | "promoted" | "hired_away" | "expired";
  achievements: string[];
  record?: { wins: number; losses: number; ties: number };
}

export interface BasePerson {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  birthYear: number;
  status: PersonnelStatus;
  retirementYear?: number;
  retirementReason?: RetirementReason;
  portraitSeed: number;
  careerHistory: CareerHistoryEntry[];
  createdInSeason: number;
}

// ==========================================
// Owners
// ==========================================

export type OwnerType =
  | "win_now"
  | "patient_builder"
  | "meddler"
  | "hands_off"
  | "penny_pincher"
  | "big_spender"
  | "legacy_obsessed"
  | "new_money"
  | "family_tradition";

export type OwnerPetPeeve =
  | "losing_seasons"
  | "empty_stadium"
  | "bad_press"
  | "player_drama"
  | "cap_hell"
  | "boring_offense"
  | "no_splash_moves"
  | "draft_busts";

export type OwnerPriority =
  | "championships"
  | "playoffs"
  | "winning_record"
  | "fan_excitement"
  | "fiscal_responsibility"
  | "community_image"
  | "draft_picks"
  | "star_players";

export interface SeasonSatisfaction {
  season: number;
  satisfaction: number;
  wins: number;
  playoffResult: string | null;
  notes: string[];
}

export interface Owner extends BasePerson {
  type: "owner";
  ownerType: OwnerType;
  wealth: "billionaire" | "multi_billionaire" | "mega_billionaire";
  ownershipStyle: "inherited" | "self_made" | "corporate" | "consortium";

  spendingWillingness: number;
  patienceLevel: number;
  meddlingTendency: number;
  mediaPresence: number;

  currentTeamId: string;
  satisfactionHistory: SeasonSatisfaction[];

  petPeeves: OwnerPetPeeve[];
  priorities: OwnerPriority[];

  // Current relationship metrics
  metrics: {
    trust: number;
    satisfaction: number;
    patience: number;
  };
  seatTemperature: "safe" | "stable" | "lukewarm" | "warm" | "hot" | "ejection_seat";
}

// ==========================================
// General Managers
// ==========================================

export interface GMSkills {
  drafting: number;
  trading: number;
  freeAgency: number;
  capManagement: number;
  scoutingOversight: number;
  coachRelations: number;
  mediaHandling: number;
  playerRelations: number;
}

export interface GMPersonality {
  riskTolerance: number;
  buildingStyle: "win_now" | "balanced" | "rebuild";
  draftPhilosophy: "best_available" | "need_based" | "trade_back" | "trade_up";
  faApproach: "aggressive" | "selective" | "conservative";
  tradeActivity: "very_active" | "moderate" | "rarely_trades";
}

export interface DraftPickResult {
  season: number;
  round: number;
  pick: number;
  playerId: string;
  playerName: string;
  position: string;
  teamId: string;
  grade?: "A+" | "A" | "B" | "C" | "D" | "F";
  careerAV?: number;
}

export interface TradeResult {
  season: number;
  teamId: string;
  sentAssets: string[];
  receivedAssets: string[];
  grade?: "won" | "fair" | "lost";
}

export interface GeneralManager extends BasePerson {
  type: "gm";

  skills: GMSkills;
  personality: GMPersonality;

  draftHistory: DraftPickResult[];
  tradeHistory: TradeResult[];

  careerWins: number;
  careerLosses: number;
  careerTies: number;
  playoffAppearances: number;
  championships: number;

  currentTeamId: string | null;
  contractYearsRemaining: number;
  salary: number;

  leagueReputation: number;
  mediaPerception: number;
}

// ==========================================
// Head Coaches
// ==========================================

export type CoachBackground =
  | "offensive_coordinator"
  | "defensive_coordinator"
  | "position_coach"
  | "college_coach"
  | "qb_guru"
  | "defensive_mastermind";

export type OffensiveScheme =
  | "west_coast"
  | "spread"
  | "air_raid"
  | "pro_style"
  | "power_run"
  | "zone_run"
  | "rpo_heavy"
  | "balanced";

export type DefensiveScheme =
  | "4-3_base"
  | "3-4_base"
  | "multiple"
  | "cover_2"
  | "cover_3"
  | "man_heavy"
  | "zone_heavy"
  | "aggressive_blitz";

export interface CoachSkills {
  gameManagement: number;
  playerDevelopment: number;
  playDesign: number;
  adjustments: number;
  motivation: number;
  discipline: number;
  talentEvaluation: number;
  mediaRelations: number;
}

export interface CoachPersonality {
  temperament: "fiery" | "calm" | "players_coach" | "disciplinarian";
  riskTaking: number;
  adaptability: number;
  egoLevel: number;
  loyaltyToPlayers: number;
}

export interface HeadCoach extends BasePerson {
  type: "coach";

  background: CoachBackground;
  offensiveScheme: OffensiveScheme;
  defensiveScheme: DefensiveScheme;

  skills: CoachSkills;
  personality: CoachPersonality;

  careerWins: number;
  careerLosses: number;
  careerTies: number;
  playoffWins: number;
  playoffLosses: number;
  championships: number;
  coachOfYearAwards: number;

  currentTeamId: string | null;
  contractYearsRemaining: number;
  salary: number;

  coachingTree: string[];
  mentorId?: string;

  // Relationship with current GM
  metrics?: {
    trust: number;
    respect: number;
    satisfaction: number;
  };
}

// ==========================================
// Scouts
// ==========================================

export type ScoutType =
  | "national"
  | "regional"
  | "pro_personnel"
  | "international"
  | "analytics";

export type ScoutArchetype =
  | "evaluator"
  | "tape_grinder"
  | "character_coach"
  | "athletic_analyst"
  | "regional_specialist"
  | "medical_expert"
  | "cap_specialist";

export interface ScoutSkills {
  athleticEvaluation: number;
  technicalEvaluation: number;
  characterAssessment: number;
  injuryAssessment: number;
  projectability: number;
  workEthic: number;
  networking: number;
}

export interface ScoutEvaluation {
  season: number;
  playerId: string;
  playerName: string;
  position: string;
  predictedGrade: number;
  actualPerformance?: number;
  accuracy?: number;
  wasHiddenGem: boolean;
  wasBust: boolean;
}

export interface Scout extends BasePerson {
  type: "scout";

  scoutType: ScoutType;
  archetype: ScoutArchetype;
  skills: ScoutSkills;

  evaluationHistory: ScoutEvaluation[];
  overallAccuracy: number;

  positionStrengths: string[];
  positionWeaknesses: string[];
  regionalExpertise: string[];

  currentTeamId: string | null;
  salary: number;

  morale: number;
  loyalty: number;
  yearsWithCurrentTeam: number;
}

// ==========================================
// Hiring Pool
// ==========================================

export interface HiringPoolEntry {
  id: string;
  personId: string;
  personType: "gm" | "coach" | "scout";
  addedSeason: number;
  isHot: boolean; // Recently fired but talented
  marketValue: number;
}

export interface Interview {
  id: string;
  candidateId: string;
  candidateType: "gm" | "coach" | "scout";
  teamId: string;
  stage: "initial" | "second" | "final" | "offer";
  interestLevel: number;
  teamInterest: number;
  competingOffers: string[];
  startedWeek: number;
  startedSeason: number;
}

// ==========================================
// Retired Personnel & Hall of Fame
// ==========================================

export interface RetiredPerson extends BasePerson {
  personType: "gm" | "coach" | "scout";
  hallOfFame: boolean;
  hofInductionYear?: number;
  legacyScore: number;

  // Career totals
  totalChampionships: number;
  totalPlayoffAppearances: number;
  totalWins?: number;
  totalLosses?: number;

  // Notable achievements
  achievements: string[];
}

// ==========================================
// Season History
// ==========================================

export interface SeasonRecord {
  id: string;
  season: number;
  teamId: string;

  // Record
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;

  // Standings
  divisionRank: number;
  conferenceRank: number;
  madePlayoffs: boolean;
  playoffResult?: string;

  // Staff at time
  gmId: string | null;
  coachId: string | null;

  // Expectations
  preseasonExpectation: "championship" | "playoffs" | "competitive" | "rebuilding";
}

// ==========================================
// Draft & Trade History
// ==========================================

export interface DraftRecord {
  id: string;
  season: number;
  teamId: string;
  round: number;
  pick: number;
  playerId: string;
  playerName: string;
  position: string;
  college: string;
  gmId: string | null;

  // Grading (filled later)
  grade?: string;
  careerAV?: number;
}

export interface TradeRecord {
  id: string;
  season: number;
  week: number;
  team1Id: string;
  team2Id: string;
  team1Assets: string[];
  team2Assets: string[];
  team1GMId: string | null;
  team2GMId: string | null;

  // Grading (filled later)
  team1Grade?: string;
  team2Grade?: string;
}

// ==========================================
// News & Events
// ==========================================

export type NewsType =
  | "hiring"
  | "firing"
  | "retirement"
  | "trade"
  | "signing"
  | "draft"
  | "injury"
  | "award"
  | "scandal"
  | "milestone"
  | "hof_induction";

export interface NewsItem {
  id: string;
  season: number;
  week: number;
  type: NewsType;
  headline: string;
  body: string;
  relatedPersonIds: string[];
  relatedTeamIds: string[];
  importance: "minor" | "moderate" | "major" | "breaking";
  createdAt: Date;
}

// ==========================================
// Database Class
// ==========================================

export class GridironGMDatabase extends Dexie {
  // Tables
  saveGames!: Table<SaveGame, string>;
  teams!: Table<Team, string>;
  owners!: Table<Owner, string>;
  generalManagers!: Table<GeneralManager, string>;
  headCoaches!: Table<HeadCoach, string>;
  scouts!: Table<Scout, string>;
  hiringPool!: Table<HiringPoolEntry, string>;
  interviews!: Table<Interview, string>;
  retiredPersonnel!: Table<RetiredPerson, string>;
  seasonRecords!: Table<SeasonRecord, string>;
  draftRecords!: Table<DraftRecord, string>;
  tradeRecords!: Table<TradeRecord, string>;
  newsItems!: Table<NewsItem, string>;

  constructor() {
    super("GridironGMDatabase");

    this.version(1).stores({
      saveGames: "id, name, lastPlayedAt",
      teams: "id, abbreviation, conference, division, gmId, coachId",
      owners: "id, currentTeamId, status, ownerType",
      generalManagers: "id, currentTeamId, status, [status+currentTeamId]",
      headCoaches: "id, currentTeamId, status, [status+currentTeamId]",
      scouts: "id, currentTeamId, status, scoutType, archetype",
      hiringPool: "id, personId, personType, addedSeason, isHot",
      interviews: "id, candidateId, teamId, stage, candidateType",
      retiredPersonnel: "id, personType, retirementYear, hallOfFame",
      seasonRecords: "id, season, teamId, [season+teamId]",
      draftRecords: "id, season, teamId, playerId, [season+teamId]",
      tradeRecords: "id, season, team1Id, team2Id",
      newsItems: "id, season, week, type, importance, createdAt",
    });
  }
}

// Singleton database instance
export const db = new GridironGMDatabase();

// ==========================================
// Utility Functions
// ==========================================

export function getFullName(person: BasePerson): string {
  return `${person.firstName} ${person.lastName}`;
}

export function calculateAge(birthYear: number, currentSeason: number): number {
  // Assuming season year = calendar year
  return currentSeason - birthYear;
}

export function getWinPercentage(wins: number, losses: number, ties: number): number {
  const total = wins + losses + ties;
  if (total === 0) return 0;
  return (wins + ties * 0.5) / total;
}
