// ==========================================
// Scheme Fit System - Main Exports
// ==========================================

// Core types
export * from "./types";

// Archetype detection from player attributes
export {
  detectArchetype,
  getArchetypeDescription,
  getArchetypeKeyTraits,
  ARCHETYPE_REQUIREMENTS,
} from "./archetype-detection";

// Scheme fit matrices and configurations
export {
  OFFENSIVE_SCHEME_FITS,
  DEFENSIVE_SCHEME_FITS,
  getSchemeDescription,
  getSchemeKeyTraits,
  getSchemePosition,
} from "./scheme-fit-matrices";

// Scheme fit calculation engine
export {
  calculateSchemeFit,
  calculateDevelopmentImpact,
  calculateSeasonPerformance,
  evaluateRosterFit,
  type PlayerForFitCalculation,
} from "./scheme-fit-calculator";

// Disagreement detection and resolution
export {
  detectSchemeDisagreement,
  resolveDisagreement,
  analyzePlayerSchemeHistory,
  detectCareerResurrection,
  type GMEvaluation,
  type CoachUsage,
  type DisagreementContext,
  type ResolutionOutcome,
  type SchemeDisagreementHistory,
  type CareerResurrection,
} from "./scheme-disagreement";
