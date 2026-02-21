/**
 * Scout Development System
 * Handles scout experience, leveling, and attribute growth
 */

import { Scout, ScoutArchetype } from "./types";

export interface ScoutLevel {
  level: number;
  title: string;
  xpRequired: number;
  bonuses: {
    evaluationBonus: number;
    bandReduction: number; // Percentage reduction in accuracy bands
    specialtyUnlock?: string;
  };
}

// Level progression table
export const SCOUT_LEVELS: ScoutLevel[] = [
  { level: 1, title: "Rookie Scout", xpRequired: 0, bonuses: { evaluationBonus: 0, bandReduction: 0 } },
  { level: 2, title: "Area Scout", xpRequired: 100, bonuses: { evaluationBonus: 2, bandReduction: 5 } },
  { level: 3, title: "Regional Scout", xpRequired: 300, bonuses: { evaluationBonus: 4, bandReduction: 8 } },
  { level: 4, title: "National Scout", xpRequired: 600, bonuses: { evaluationBonus: 6, bandReduction: 12 } },
  { level: 5, title: "Senior Scout", xpRequired: 1000, bonuses: { evaluationBonus: 8, bandReduction: 15, specialtyUnlock: "secondary_archetype" } },
  { level: 6, title: "Director of Scouting", xpRequired: 1500, bonuses: { evaluationBonus: 10, bandReduction: 18 } },
  { level: 7, title: "VP of Player Personnel", xpRequired: 2200, bonuses: { evaluationBonus: 12, bandReduction: 22 } },
  { level: 8, title: "Executive Scout", xpRequired: 3000, bonuses: { evaluationBonus: 15, bandReduction: 25, specialtyUnlock: "regional_mastery" } },
  { level: 9, title: "Hall of Fame Scout", xpRequired: 4000, bonuses: { evaluationBonus: 18, bandReduction: 28 } },
  { level: 10, title: "Legend", xpRequired: 5500, bonuses: { evaluationBonus: 20, bandReduction: 30, specialtyUnlock: "perfect_recall" } },
];

export interface XPEvent {
  type: "scouting_action" | "accurate_prediction" | "bust_call" | "breakout_call" | "draft_class_complete" | "season_bonus";
  description: string;
  xpAmount: number;
  timestamp: Date;
}

export interface ScoutDevelopmentState {
  scoutId: string;
  currentXP: number;
  currentLevel: number;
  xpHistory: XPEvent[];
  seasonsActive: number;
  totalProspectsScouted: number;
  specialties: string[];
  retirementRisk: number; // 0-100, increases with age/seasons
}

/**
 * Get the level for a given XP amount
 */
export function getLevelForXP(xp: number): ScoutLevel {
  for (let i = SCOUT_LEVELS.length - 1; i >= 0; i--) {
    if (xp >= SCOUT_LEVELS[i].xpRequired) {
      return SCOUT_LEVELS[i];
    }
  }
  return SCOUT_LEVELS[0];
}

/**
 * Get XP needed for next level
 */
export function getXPForNextLevel(currentXP: number): { needed: number; progress: number; nextLevel: ScoutLevel | null } {
  const currentLevel = getLevelForXP(currentXP);
  const currentLevelIndex = SCOUT_LEVELS.findIndex(l => l.level === currentLevel.level);

  if (currentLevelIndex === SCOUT_LEVELS.length - 1) {
    // Max level
    return { needed: 0, progress: 100, nextLevel: null };
  }

  const nextLevel = SCOUT_LEVELS[currentLevelIndex + 1];
  const xpIntoCurrentLevel = currentXP - currentLevel.xpRequired;
  const xpNeededForNext = nextLevel.xpRequired - currentLevel.xpRequired;
  const progress = Math.round((xpIntoCurrentLevel / xpNeededForNext) * 100);

  return {
    needed: nextLevel.xpRequired - currentXP,
    progress,
    nextLevel,
  };
}

/**
 * Calculate XP from a scouting action
 */
export function calculateScoutingActionXP(
  actionType: "initial" | "game_tape" | "combine" | "interview" | "medical",
  scoutLevel: number
): number {
  const baseXP: Record<string, number> = {
    initial: 5,
    game_tape: 10,
    combine: 15,
    interview: 12,
    medical: 8,
  };

  // Higher level scouts gain less XP from routine actions
  const levelPenalty = Math.max(0.5, 1 - (scoutLevel - 1) * 0.05);

  return Math.round(baseXP[actionType] * levelPenalty);
}

/**
 * Calculate bonus XP from accurate predictions
 */
export function calculateAccuracyBonusXP(
  accuracy: number, // 0-100
  prospectRound: number, // 1-7
  scoutLevel: number
): number {
  if (accuracy < 70) return 0; // No bonus for inaccurate predictions

  // Higher round prospects give more XP (harder to evaluate late rounders)
  const roundMultiplier = 1 + (prospectRound - 1) * 0.1;

  // Base XP scales with accuracy
  let baseXP = 0;
  if (accuracy >= 95) baseXP = 50;
  else if (accuracy >= 90) baseXP = 35;
  else if (accuracy >= 85) baseXP = 25;
  else if (accuracy >= 80) baseXP = 15;
  else if (accuracy >= 70) baseXP = 8;

  // Level scaling
  const levelMultiplier = Math.max(0.5, 1 - (scoutLevel - 1) * 0.03);

  return Math.round(baseXP * roundMultiplier * levelMultiplier);
}

/**
 * Calculate XP for correctly calling bust/breakout
 */
export function calculateSpecialCallXP(
  callType: "bust" | "breakout",
  confidence: number, // How confident they were (prediction %)
  wasCorrect: boolean,
  scoutLevel: number
): number {
  if (!wasCorrect) return 0;

  // Higher confidence + correct = more XP
  const confidenceMultiplier = confidence / 100;
  const baseXP = callType === "breakout" ? 75 : 60; // Breakouts are rarer, worth more

  const levelMultiplier = Math.max(0.5, 1 - (scoutLevel - 1) * 0.02);

  return Math.round(baseXP * confidenceMultiplier * levelMultiplier);
}

/**
 * Calculate end-of-season bonus XP
 */
export function calculateSeasonBonusXP(
  prospectsScouted: number,
  averageAccuracy: number,
  scoutLevel: number
): number {
  let bonusXP = 0;

  // Volume bonus
  if (prospectsScouted >= 50) bonusXP += 50;
  else if (prospectsScouted >= 30) bonusXP += 30;
  else if (prospectsScouted >= 15) bonusXP += 15;

  // Accuracy bonus
  if (averageAccuracy >= 85) bonusXP += 75;
  else if (averageAccuracy >= 75) bonusXP += 50;
  else if (averageAccuracy >= 65) bonusXP += 25;

  const levelMultiplier = Math.max(0.3, 1 - (scoutLevel - 1) * 0.05);

  return Math.round(bonusXP * levelMultiplier);
}

/**
 * Apply level bonuses to scout attributes
 */
export function applyLevelBonuses(
  scout: Scout,
  level: ScoutLevel
): Scout {
  const bonusedScout = { ...scout };

  // Apply evaluation bonus
  bonusedScout.evaluation = Math.min(100, scout.evaluation + level.bonuses.evaluationBonus);

  // Apply proportional bonuses to other attributes
  const bonusMultiplier = 1 + (level.bonuses.evaluationBonus / 100);
  bonusedScout.football_iq = Math.min(100, Math.round(scout.football_iq * bonusMultiplier));
  bonusedScout.athletic_analysis = Math.min(100, Math.round(scout.athletic_analysis * bonusMultiplier));
  bonusedScout.psych_insight = Math.min(100, Math.round(scout.psych_insight * bonusMultiplier));

  return bonusedScout;
}

/**
 * Calculate retirement risk for a scout
 */
export function calculateRetirementRisk(
  seasonsActive: number,
  currentLevel: number,
  recentPerformance: "improving" | "stable" | "declining"
): number {
  let risk = 0;

  // Base risk increases with tenure
  if (seasonsActive >= 20) risk += 40;
  else if (seasonsActive >= 15) risk += 25;
  else if (seasonsActive >= 10) risk += 15;
  else if (seasonsActive >= 5) risk += 5;

  // High level scouts are more likely to retire to front office roles
  if (currentLevel >= 8) risk += 15;
  else if (currentLevel >= 6) risk += 10;

  // Declining performance increases risk
  if (recentPerformance === "declining") risk += 20;
  else if (recentPerformance === "stable") risk += 5;
  // Improving scouts are less likely to retire

  return Math.min(100, risk);
}

/**
 * Determine if scout retires this offseason
 */
export function checkRetirement(retirementRisk: number): boolean {
  return Math.random() * 100 < retirementRisk;
}

/**
 * Generate scout contract extension terms based on performance
 */
export function generateContractTerms(
  scout: Scout,
  level: ScoutLevel,
  averageAccuracy: number
): { yearsOffered: number; salaryPerYear: number; signingBonus: number } {
  // Base salary by level
  const baseSalaryByLevel: Record<number, number> = {
    1: 50000,
    2: 65000,
    3: 85000,
    4: 110000,
    5: 140000,
    6: 180000,
    7: 230000,
    8: 290000,
    9: 360000,
    10: 450000,
  };

  const baseSalary = baseSalaryByLevel[level.level] || 50000;

  // Accuracy bonus (up to 30% more)
  const accuracyMultiplier = 1 + Math.max(0, (averageAccuracy - 60) / 100);

  // Archetype premium (evaluators and tape grinders slightly more valuable)
  const archetypePremium =
    scout.archetype === "evaluator" ? 1.1 :
    scout.archetype === "tape_grinder" ? 1.08 :
    scout.archetype === "athletic_analyst" ? 1.05 : 1.0;

  const salaryPerYear = Math.round(baseSalary * accuracyMultiplier * archetypePremium);

  // Years offered based on level and accuracy
  let yearsOffered = 1;
  if (averageAccuracy >= 80 && level.level >= 5) yearsOffered = 4;
  else if (averageAccuracy >= 75 && level.level >= 4) yearsOffered = 3;
  else if (averageAccuracy >= 70 && level.level >= 3) yearsOffered = 2;

  // Signing bonus for high performers
  const signingBonus = averageAccuracy >= 85 ? Math.round(salaryPerYear * 0.25) : 0;

  return { yearsOffered, salaryPerYear, signingBonus };
}

/**
 * Process attribute growth after a season
 */
export function processSeasonGrowth(
  scout: Scout,
  xpGained: number,
  averageAccuracy: number
): { updatedScout: Scout; attributeChanges: Record<string, number> } {
  const changes: Record<string, number> = {};
  const updatedScout = { ...scout };

  // Scouts can grow or decline based on performance
  const growthFactor = averageAccuracy >= 75 ? 1 : averageAccuracy >= 65 ? 0 : -1;

  // Random attribute changes (1-3 points, can be negative)
  const attributes: (keyof Scout)[] = [
    "evaluation",
    "football_iq",
    "athletic_analysis",
    "psych_insight",
    "medical_read",
    "analytics",
    "confidence",
  ];

  // Pick 2-3 attributes to change
  const numChanges = 2 + Math.floor(Math.random() * 2);
  const attributesToChange = [...attributes]
    .sort(() => Math.random() - 0.5)
    .slice(0, numChanges);

  for (const attr of attributesToChange) {
    // Growth is more likely for younger scouts, decline for veterans
    const baseChange = growthFactor + Math.floor(Math.random() * 3) - 1;
    const change = Math.max(-3, Math.min(3, baseChange));

    if (change !== 0 && typeof updatedScout[attr] === "number") {
      const oldValue = updatedScout[attr] as number;
      const newValue = Math.max(30, Math.min(100, oldValue + change));
      (updatedScout[attr] as number) = newValue;
      changes[attr] = change;
    }
  }

  return { updatedScout, attributeChanges: changes };
}

export type { ScoutLevel, XPEvent, ScoutDevelopmentState };
