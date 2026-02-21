/**
 * NFL Player Contracts & Acquisition Types
 * Core data models for trades, free agency, and salary cap
 */

// =============================================================================
// CONTRACT TYPES
// =============================================================================

export interface Contract {
  playerId: string;
  teamId: string;

  // Core terms
  totalValue: number;         // Total contract value
  guaranteed: number;         // Fully guaranteed money
  years: number;              // Contract length
  signingBonus: number;       // Upfront bonus (prorated over years)

  // Year-by-year breakdown
  yearlyDetails: ContractYear[];

  // Status
  yearsRemaining: number;
  currentYear: number;        // Which year of contract (1-indexed)

  // Special clauses
  noTradeClause: boolean;
  voidYears: number;          // Fake years to spread cap hit
  optionYear?: ContractOption;
  incentives: ContractIncentive[];

  // Metadata
  signedDate: Date;
  expiresAfterSeason: number; // e.g., 2025
}

export interface ContractYear {
  year: number;               // Season year (e.g., 2025)
  baseSalary: number;
  signingBonusProration: number;
  rosterBonus: number;
  workoutBonus: number;
  otherBonus: number;

  // Calculated
  capHit: number;             // Total cap charge
  deadCap: number;            // Cost if cut/traded
  cashSpent: number;          // Actual money paid

  // Guarantees
  isFullyGuaranteed: boolean;
  guaranteedForInjury: boolean;
}

export interface ContractOption {
  year: number;
  type: "team" | "player" | "mutual";
  salary: number;
  bonus: number;
  exerciseDeadline: Date;
}

export interface ContractIncentive {
  id: string;
  description: string;
  type: "likely" | "unlikely";   // LTBE vs NLTBE for cap purposes
  amount: number;
  condition: IncentiveCondition;
}

export type IncentiveCondition =
  | { type: "games_played"; threshold: number }
  | { type: "snaps_percentage"; threshold: number }
  | { type: "pro_bowl" }
  | { type: "all_pro"; team: 1 | 2 }
  | { type: "playoff_appearance" }
  | { type: "super_bowl_win" }
  | { type: "passing_yards"; threshold: number }
  | { type: "rushing_yards"; threshold: number }
  | { type: "receiving_yards"; threshold: number }
  | { type: "touchdowns"; threshold: number }
  | { type: "sacks"; threshold: number }
  | { type: "interceptions"; threshold: number };

// =============================================================================
// PLAYER STATUS TYPES
// =============================================================================

export type FreeAgentStatus =
  | "signed"              // Under contract
  | "ufa"                 // Unrestricted Free Agent (4+ years)
  | "rfa"                 // Restricted Free Agent (3 years)
  | "erfa"                // Exclusive Rights FA (1-2 years)
  | "cut"                 // Released
  | "retired";

export type FranchiseTagType =
  | "exclusive"           // Can't negotiate with others
  | "non_exclusive"       // Can negotiate, team can match
  | "transition";         // Lower tag, easier to lose player

export interface PlayerContractStatus {
  playerId: string;
  status: FreeAgentStatus;
  yearsInLeague: number;

  // Current contract (if signed)
  contract?: Contract;

  // Tag status
  franchiseTagged: boolean;
  tagType?: FranchiseTagType;
  tagSalary?: number;

  // Market info
  projectedMarketValue?: number;
  topSuitors?: string[];      // Team IDs interested
}

// =============================================================================
// NFL PLAYER EXTENDED
// =============================================================================

export interface NFLPlayer {
  id: string;
  name: string;
  position: string;
  age: number;
  experience: number;         // Years in league

  // Team
  teamId: string | null;      // null if free agent
  jerseyNumber?: number;

  // Ratings
  overall: number;            // Current OVR (known, not projection)
  potential: number;          // Ceiling
  awareness: number;
  stamina: number;

  // Physical
  height: number;             // inches
  weight: number;             // lbs
  speed: number;
  strength: number;
  agility: number;

  // Position-specific attributes
  attributes: Record<string, number>;

  // Career arc
  peakAge: number;
  primeStart: number;
  primeEnd: number;
  declineRate: "slow" | "normal" | "fast";

  // Accolades
  proBowls: number;
  allPros: number;            // First team
  allProsSecond: number;      // Second team
  championships: number;

  // Status
  contractStatus: PlayerContractStatus;
  injuryStatus?: InjuryStatus;

  // Personality/preferences
  personality: PlayerPersonality;

  // For trade/FA
  tradeValue: number;         // Calculated value for trades
  marketValue: number;        // Expected FA contract AAV
}

export interface InjuryStatus {
  isInjured: boolean;
  type?: string;
  severity?: "minor" | "moderate" | "severe" | "career_threatening";
  weeksRemaining?: number;
  isOnIR: boolean;
  injuryHistory: PastInjury[];
}

export interface PastInjury {
  season: number;
  type: string;
  gamessMissed: number;
  severity: string;
}

export interface PlayerPersonality {
  // Contract preferences
  prioritizesMoney: number;       // 0-100
  prioritizesWinning: number;     // 0-100
  prioritizesRole: number;        // 0-100
  prioritizesLocation: number;    // 0-100

  // Location preferences
  preferredRegions: string[];     // "warm", "big_market", "hometown"
  avoidTeams: string[];           // Team IDs they won't sign with
  hometownTeam?: string;          // Team ID for hometown discount

  // Personality traits
  leadership: number;             // 0-100
  workEthic: number;
  durability: number;
  lockerRoomPresence: "positive" | "neutral" | "negative";

  // Agent
  agentDifficulty: "easy" | "normal" | "hard";
}

// =============================================================================
// SALARY CAP
// =============================================================================

export interface TeamCapSituation {
  teamId: string;
  season: number;

  // Cap numbers
  salaryCap: number;              // League cap (~$255M for 2024)
  totalCommitted: number;         // All contracts
  capSpace: number;               // Available space
  effectiveCapSpace: number;      // Adjusted for practice squad, etc.

  // Breakdown
  top51: number;                  // Top 51 contracts (offseason)
  deadMoney: number;              // From cuts/trades

  // By position group
  capByPosition: Record<string, number>;

  // Future outlook
  projectedCapNextYear: number;
  rolloverSpace: number;          // Can carry over

  // Upcoming events
  expiringContracts: string[];    // Player IDs
  potentialCuts: CutCandidate[];
  restructureCandidates: string[];
}

export interface CutCandidate {
  playerId: string;
  playerName: string;
  position: string;
  currentCapHit: number;
  deadCapIfCut: number;
  capSavings: number;
  recommendation: "cut" | "keep" | "restructure";
  reason: string;
}

// =============================================================================
// CAP OPERATIONS
// =============================================================================

export interface ContractRestructure {
  playerId: string;
  originalCapHit: number;
  newCapHit: number;
  capSavings: number;
  salaryConverted: number;        // Base salary -> signing bonus
  yearsToProrate: number;
  futureCapIncrease: number;      // Added to future years
}

export interface ContractExtension {
  playerId: string;
  yearsAdded: number;
  newTotalValue: number;
  newGuaranteed: number;
  newCapHit: number;              // This year's new cap hit
  capSavingsThisYear: number;
}

export interface PlayerCut {
  playerId: string;
  cutType: "pre_june1" | "post_june1";
  capSavings: number;
  deadCapHit: number;
  deadCapYear2?: number;          // For post-June 1
}

// =============================================================================
// CONSTANTS
// =============================================================================

// Salary cap (updates yearly)
export const SALARY_CAP_BY_YEAR: Record<number, number> = {
  2024: 255400000,
  2025: 272500000,  // Projected
  2026: 290000000,  // Projected
  2027: 305000000,  // Projected
};

// Minimum salaries by experience
export const MINIMUM_SALARY_BY_EXPERIENCE: Record<number, number> = {
  0: 795000,    // Rookie
  1: 915000,
  2: 990000,
  3: 1065000,
  4: 1185000,
  5: 1185000,
  6: 1185000,
  7: 1210000,   // 7+ years
};

// Franchise tag values by position (% of cap, approximate)
export const FRANCHISE_TAG_PERCENTAGE: Record<string, number> = {
  QB: 0.084,
  RB: 0.052,
  WR: 0.067,
  TE: 0.047,
  OT: 0.062,
  OG: 0.055,
  C: 0.055,
  DE: 0.065,
  DT: 0.054,
  LB: 0.058,
  CB: 0.062,
  S: 0.053,
  K: 0.022,
  P: 0.020,
};

// Position market value multipliers (relative to cap)
export const POSITION_VALUE_MULTIPLIERS: Record<string, number> = {
  QB: 1.5,      // Premium position
  EDGE: 1.2,
  OT: 1.1,
  WR: 1.0,
  CB: 1.0,
  DT: 0.9,
  S: 0.85,
  LB: 0.85,
  TE: 0.8,
  OG: 0.8,
  C: 0.75,
  RB: 0.6,      // Devalued position
  K: 0.3,
  P: 0.25,
};

// Age curves - when players typically peak/decline
export const POSITION_AGE_CURVES: Record<string, { peak: number; declineStart: number; cliff: number }> = {
  QB: { peak: 30, declineStart: 35, cliff: 40 },
  RB: { peak: 25, declineStart: 27, cliff: 30 },
  WR: { peak: 27, declineStart: 30, cliff: 33 },
  TE: { peak: 28, declineStart: 31, cliff: 34 },
  OT: { peak: 28, declineStart: 32, cliff: 36 },
  OG: { peak: 28, declineStart: 32, cliff: 36 },
  C: { peak: 28, declineStart: 32, cliff: 36 },
  DE: { peak: 27, declineStart: 30, cliff: 33 },
  DT: { peak: 27, declineStart: 30, cliff: 34 },
  LB: { peak: 27, declineStart: 29, cliff: 32 },
  CB: { peak: 26, declineStart: 29, cliff: 32 },
  S: { peak: 27, declineStart: 30, cliff: 33 },
  K: { peak: 32, declineStart: 38, cliff: 42 },
  P: { peak: 32, declineStart: 38, cliff: 42 },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get current salary cap for a season
 */
export function getSalaryCap(season: number): number {
  return SALARY_CAP_BY_YEAR[season] || SALARY_CAP_BY_YEAR[2024];
}

/**
 * Get minimum salary for a player based on experience
 */
export function getMinimumSalary(yearsExperience: number): number {
  if (yearsExperience >= 7) return MINIMUM_SALARY_BY_EXPERIENCE[7];
  return MINIMUM_SALARY_BY_EXPERIENCE[yearsExperience] || MINIMUM_SALARY_BY_EXPERIENCE[0];
}

/**
 * Calculate franchise tag value for a position
 */
export function getFranchiseTagValue(position: string, season: number): number {
  const cap = getSalaryCap(season);
  const percentage = FRANCHISE_TAG_PERCENTAGE[position] || 0.05;
  return Math.round(cap * percentage);
}

/**
 * Calculate dead cap if player is cut/traded
 */
export function calculateDeadCap(contract: Contract, cutYear: number): number {
  let deadCap = 0;

  // All remaining signing bonus prorations accelerate
  for (const year of contract.yearlyDetails) {
    if (year.year >= cutYear) {
      deadCap += year.signingBonusProration;
    }
  }

  // Current year guaranteed salary (if applicable)
  const currentYearDetails = contract.yearlyDetails.find(y => y.year === cutYear);
  if (currentYearDetails?.isFullyGuaranteed) {
    deadCap += currentYearDetails.baseSalary;
  }

  return deadCap;
}

/**
 * Calculate cap savings from cutting a player
 */
export function calculateCapSavings(contract: Contract, cutYear: number): number {
  const currentYearDetails = contract.yearlyDetails.find(y => y.year === cutYear);
  if (!currentYearDetails) return 0;

  const deadCap = calculateDeadCap(contract, cutYear);
  return currentYearDetails.capHit - deadCap;
}

/**
 * Determine free agent status based on years in league
 */
export function getFreeAgentStatus(yearsInLeague: number, hasContract: boolean): FreeAgentStatus {
  if (hasContract) return "signed";
  if (yearsInLeague >= 4) return "ufa";
  if (yearsInLeague === 3) return "rfa";
  return "erfa";
}

/**
 * Calculate player's age-adjusted value
 */
export function calculateAgeAdjustedValue(
  player: NFLPlayer,
  currentSeason: number
): number {
  const ageCurve = POSITION_AGE_CURVES[player.position] || POSITION_AGE_CURVES["WR"];

  let ageMultiplier = 1.0;

  if (player.age < ageCurve.peak) {
    // Still improving
    ageMultiplier = 0.9 + (player.age / ageCurve.peak) * 0.1;
  } else if (player.age < ageCurve.declineStart) {
    // In prime
    ageMultiplier = 1.0;
  } else if (player.age < ageCurve.cliff) {
    // Declining
    const declineYears = player.age - ageCurve.declineStart;
    const totalDeclineWindow = ageCurve.cliff - ageCurve.declineStart;
    ageMultiplier = 1.0 - (declineYears / totalDeclineWindow) * 0.4;
  } else {
    // Past cliff
    ageMultiplier = 0.5;
  }

  // Adjust based on player's specific decline rate
  if (player.declineRate === "slow") ageMultiplier *= 1.1;
  if (player.declineRate === "fast") ageMultiplier *= 0.9;

  return Math.round(player.overall * ageMultiplier);
}

/**
 * Project remaining good years for a player
 */
export function projectRemainingYears(player: NFLPlayer): number {
  const ageCurve = POSITION_AGE_CURVES[player.position] || POSITION_AGE_CURVES["WR"];

  let remainingYears = ageCurve.cliff - player.age;

  // Adjust for decline rate
  if (player.declineRate === "slow") remainingYears += 2;
  if (player.declineRate === "fast") remainingYears -= 1;

  // Minimum 1 year if not past cliff
  return Math.max(player.age >= ageCurve.cliff ? 0 : 1, remainingYears);
}

/**
 * Calculate expected market value (AAV) for a player
 */
export function calculateMarketValue(player: NFLPlayer, season: number): number {
  const cap = getSalaryCap(season);
  const positionMultiplier = POSITION_VALUE_MULTIPLIERS[player.position] || 0.5;

  // Base percentage of cap based on overall rating
  let capPercentage: number;
  if (player.overall >= 95) capPercentage = 0.08;
  else if (player.overall >= 90) capPercentage = 0.06;
  else if (player.overall >= 85) capPercentage = 0.045;
  else if (player.overall >= 80) capPercentage = 0.03;
  else if (player.overall >= 75) capPercentage = 0.02;
  else if (player.overall >= 70) capPercentage = 0.012;
  else capPercentage = 0.008;

  // Apply position multiplier
  capPercentage *= positionMultiplier;

  // Age adjustment
  const ageValue = calculateAgeAdjustedValue(player, season);
  const ageRatio = ageValue / player.overall;
  capPercentage *= ageRatio;

  // Accolades boost
  if (player.proBowls > 0) capPercentage *= 1.05;
  if (player.allPros > 0) capPercentage *= 1.15;

  return Math.round(cap * capPercentage);
}

export type {
  Contract,
  ContractYear,
  ContractOption,
  ContractIncentive,
  IncentiveCondition,
  PlayerContractStatus,
  NFLPlayer,
  InjuryStatus,
  PastInjury,
  PlayerPersonality,
  TeamCapSituation,
  CutCandidate,
  ContractRestructure,
  ContractExtension,
  PlayerCut,
};
