/**
 * Player & Staff Development System
 *
 * This module handles progression and regression for all game entities:
 * - Players: Age curves, skill development, retirement
 * - GMs: Drafting, trading, cap management skills
 * - Coaches: Game management, player development, scheme design
 * - Scouts: Evaluation accuracy, networking, specializations
 *
 * Key Features:
 * - Position-specific age curves (RBs peak early, QBs peak late)
 * - Scheme fit impacts development rates
 * - Coach quality affects player growth
 * - Season transition processing for batch updates
 * - Retirement and firing systems
 * - Headline generation for narrative
 */

// Types
export type {
  // Position and Career Types
  PositionGroup,
  CareerPhase,
  DevelopmentTrajectory,

  // Age Curves
  AgeCurvePoint,
  PositionAgeCurve,

  // Player Development
  PlayerProgressionState,
  InjuryRecord,
  SeasonDevelopmentResult,
  AttributeChange,
  DevelopmentReason,
  DevelopmentFactors,
  DevelopmentMultipliers,

  // GM Progression
  GMProgressionState,
  GMSpecialization,
  GMSeasonResult,

  // Coach Progression
  CoachProgressionState,
  CoachSpecialization,
  CoachSeasonResult,

  // Scout Progression
  ScoutProgressionState,
  ScoutSeasonResult,

  // Season Transition
  SeasonTransitionInput,
  SeasonTransitionOutput,
  TeamSeasonResult,
  DraftPickResult,
  RetirementReason,
  SeasonHeadline,
} from "./development-types";

// Age Curves
export {
  POSITION_AGE_CURVES,
  getAgeCurvePoint,
  determineCareerPhase,
  positionToGroup,
  calculateRemainingCareer,
} from "./age-curves";

// Player Development
export {
  processPlayerSeason,
  processTeamDevelopment,
  evaluateRetirement,
} from "./player-development";

export type { PlayerForDevelopment, RetirementDecision } from "./player-development";

// Staff Development
export {
  processGMSeason,
  processCoachSeason,
  processScoutSeason,
  applyExperienceGains,
  applyCoachExperienceGains,
} from "./staff-development";

export type {
  GMSeasonContext,
  CoachSeasonContext,
  ScoutSeasonContext,
} from "./staff-development";

// Season Transition
export {
  processSeasonTransition,
  processLeagueSeasonEnd,
  ageEntities,
} from "./season-transition";

export type { SeasonTransitionConfig } from "./season-transition";
