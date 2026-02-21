/**
 * Archetype multipliers for scout attributes
 * These multipliers are applied to base attributes when calculating scouting effectiveness
 */

import { ScoutArchetype } from "./types";

export interface ArchetypeMultipliers {
  evaluation: number;
  football_iq: number;
  athletic_analysis: number;
  psych_insight: number;
  medical_read: number;
  analytics: number;
  confidence: number;
  experience: number;
  communication: number;
}

export const ARCHETYPE_MULTIPLIERS: Record<
  ScoutArchetype,
  ArchetypeMultipliers
> = {
  evaluator: {
    evaluation: 1.5,
    football_iq: 0.9,
    athletic_analysis: 0.8,
    psych_insight: 0.8,
    medical_read: 0.9,
    analytics: 1.3,
    confidence: 1.1,
    experience: 1.0,
    communication: 1.0,
  },
  tape_grinder: {
    evaluation: 1.0,
    football_iq: 1.5,
    athletic_analysis: 0.8,
    psych_insight: 0.8,
    medical_read: 0.9,
    analytics: 0.9,
    confidence: 1.0,
    experience: 1.0,
    communication: 1.0,
  },
  character_coach: {
    evaluation: 0.9,
    football_iq: 0.8,
    athletic_analysis: 0.8,
    psych_insight: 1.5,
    medical_read: 1.2,
    analytics: 0.9,
    confidence: 1.0,
    experience: 1.0,
    communication: 1.1,
  },
  athletic_analyst: {
    evaluation: 0.9,
    football_iq: 0.8,
    athletic_analysis: 1.5,
    psych_insight: 0.8,
    medical_read: 0.9,
    analytics: 1.2,
    confidence: 1.0,
    experience: 1.0,
    communication: 1.0,
  },
};

/**
 * Apply archetype multipliers to a scout's effective attributes
 */
export function applyArchetypeMultipliers(
  baseAttributes: {
    evaluation: number;
    football_iq: number;
    athletic_analysis: number;
    psych_insight: number;
    medical_read: number;
    analytics: number;
    confidence: number;
    experience: number;
    communication: number;
  },
  archetype: ScoutArchetype
): ArchetypeMultipliers {
  const multipliers = ARCHETYPE_MULTIPLIERS[archetype];
  
  return {
    evaluation: Math.min(100, Math.round(baseAttributes.evaluation * multipliers.evaluation)),
    football_iq: Math.min(100, Math.round(baseAttributes.football_iq * multipliers.football_iq)),
    athletic_analysis: Math.min(100, Math.round(baseAttributes.athletic_analysis * multipliers.athletic_analysis)),
    psych_insight: Math.min(100, Math.round(baseAttributes.psych_insight * multipliers.psych_insight)),
    medical_read: Math.min(100, Math.round(baseAttributes.medical_read * multipliers.medical_read)),
    analytics: Math.min(100, Math.round(baseAttributes.analytics * multipliers.analytics)),
    confidence: Math.min(100, Math.round(baseAttributes.confidence * multipliers.confidence)),
    experience: baseAttributes.experience, // Experience doesn't get multiplied
    communication: Math.min(100, Math.round(baseAttributes.communication * multipliers.communication)),
  };
}

/**
 * Get priority factor for calculations
 * Higher priority = better accuracy
 */
export function getPriorityFactor(priority: number): number {
  switch (priority) {
    case 1:
      return 1.4; // Primary gets 40% bonus
    case 2:
      return 1.2; // Secondary gets 20% bonus
    case 3:
      return 1.0; // Tertiary gets no bonus
    case 4:
      return 0.8; // Quaternary gets penalty
    default:
      return 1.0;
  }
}

