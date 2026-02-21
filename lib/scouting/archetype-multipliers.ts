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

/**
 * Regional Scout Bonuses
 * Scouts get accuracy bonuses when evaluating players from their region
 */
export type ScoutRegion = "SEC" | "Big Ten" | "Pac-12" | "ACC" | "Big 12" | "Independent";

export interface RegionalBonusResult {
  bonus: number; // Multiplier (1.0 = no bonus, 1.15 = 15% bonus)
  description: string;
  isHomeRegion: boolean;
}

// Conference to region mapping
const COLLEGE_TO_CONFERENCE: Record<string, ScoutRegion> = {
  // SEC
  "Alabama": "SEC",
  "Arkansas": "SEC",
  "Auburn": "SEC",
  "Florida": "SEC",
  "Georgia": "SEC",
  "Kentucky": "SEC",
  "LSU": "SEC",
  "Mississippi": "SEC",
  "Mississippi State": "SEC",
  "Missouri": "SEC",
  "Oklahoma": "SEC",
  "South Carolina": "SEC",
  "Tennessee": "SEC",
  "Texas": "SEC",
  "Texas A&M": "SEC",
  "Vanderbilt": "SEC",

  // Big Ten
  "Illinois": "Big Ten",
  "Indiana": "Big Ten",
  "Iowa": "Big Ten",
  "Maryland": "Big Ten",
  "Michigan": "Big Ten",
  "Michigan State": "Big Ten",
  "Minnesota": "Big Ten",
  "Nebraska": "Big Ten",
  "Northwestern": "Big Ten",
  "Ohio State": "Big Ten",
  "Oregon": "Big Ten",
  "Penn State": "Big Ten",
  "Purdue": "Big Ten",
  "Rutgers": "Big Ten",
  "UCLA": "Big Ten",
  "USC": "Big Ten",
  "Washington": "Big Ten",
  "Wisconsin": "Big Ten",

  // ACC
  "Boston College": "ACC",
  "California": "ACC",
  "Clemson": "ACC",
  "Duke": "ACC",
  "Florida State": "ACC",
  "Georgia Tech": "ACC",
  "Louisville": "ACC",
  "Miami": "ACC",
  "NC State": "ACC",
  "North Carolina": "ACC",
  "Pittsburgh": "ACC",
  "SMU": "ACC",
  "Stanford": "ACC",
  "Syracuse": "ACC",
  "Virginia": "ACC",
  "Virginia Tech": "ACC",
  "Wake Forest": "ACC",

  // Big 12
  "Arizona": "Big 12",
  "Arizona State": "Big 12",
  "Baylor": "Big 12",
  "BYU": "Big 12",
  "Cincinnati": "Big 12",
  "Colorado": "Big 12",
  "Houston": "Big 12",
  "Iowa State": "Big 12",
  "Kansas": "Big 12",
  "Kansas State": "Big 12",
  "Oklahoma State": "Big 12",
  "TCU": "Big 12",
  "Texas Tech": "Big 12",
  "UCF": "Big 12",
  "Utah": "Big 12",
  "West Virginia": "Big 12",

  // Independent
  "Notre Dame": "Independent",
  "UConn": "Independent",
  "UMass": "Independent",
  "Army": "Independent",
  "Navy": "Independent",
};

/**
 * Get the conference for a college
 */
export function getCollegeConference(college: string): ScoutRegion | null {
  // Direct lookup
  if (COLLEGE_TO_CONFERENCE[college]) {
    return COLLEGE_TO_CONFERENCE[college];
  }

  // Partial match (for variations like "University of Alabama" vs "Alabama")
  const normalizedCollege = college.toLowerCase().replace(/university of |state$/gi, "").trim();

  for (const [collegeName, conference] of Object.entries(COLLEGE_TO_CONFERENCE)) {
    const normalizedKey = collegeName.toLowerCase().replace(/university of |state$/gi, "").trim();
    if (normalizedCollege.includes(normalizedKey) || normalizedKey.includes(normalizedCollege)) {
      return conference;
    }
  }

  // Default to "Other" for unknown colleges
  return null;
}

/**
 * Calculate regional bonus for a scout evaluating a prospect
 *
 * @param scoutRegion - The scout's assigned region
 * @param prospectCollege - The prospect's college
 * @param prospectConference - The prospect's conference (if already known)
 * @returns RegionalBonusResult with bonus multiplier and description
 */
export function calculateRegionalBonus(
  scoutRegion: ScoutRegion | string | undefined,
  prospectCollege: string,
  prospectConference?: ScoutRegion | string | null
): RegionalBonusResult {
  if (!scoutRegion) {
    return {
      bonus: 1.0,
      description: "No regional specialization",
      isHomeRegion: false,
    };
  }

  // Get prospect's conference
  const conference = prospectConference || getCollegeConference(prospectCollege);

  if (!conference) {
    return {
      bonus: 1.0,
      description: "Prospect from unknown conference",
      isHomeRegion: false,
    };
  }

  // Check if scout's region matches prospect's conference
  if (scoutRegion === conference) {
    return {
      bonus: 1.15, // 15% accuracy bonus for home region
      description: `${scoutRegion} specialist bonus`,
      isHomeRegion: true,
    };
  }

  // Adjacent region bonuses (partial familiarity)
  const adjacentRegions: Record<ScoutRegion, ScoutRegion[]> = {
    "SEC": ["ACC", "Big 12"],
    "Big Ten": ["ACC", "Big 12"],
    "ACC": ["SEC", "Big Ten"],
    "Big 12": ["SEC", "Pac-12"],
    "Pac-12": ["Big 12", "Big Ten"],
    "Independent": ["SEC", "Big Ten", "ACC"], // Notre Dame is midwest, so familiar with nearby
  };

  if (adjacentRegions[scoutRegion as ScoutRegion]?.includes(conference as ScoutRegion)) {
    return {
      bonus: 1.05, // 5% bonus for adjacent regions
      description: `Familiar with ${conference} region`,
      isHomeRegion: false,
    };
  }

  return {
    bonus: 1.0,
    description: "Outside regional expertise",
    isHomeRegion: false,
  };
}

/**
 * Apply regional bonus to scouting accuracy
 * This should be called when calculating band sizes
 *
 * @param baseBandSize - The original band size (e.g., ±15 for OVR)
 * @param regionalBonus - The regional bonus multiplier
 * @returns Adjusted band size (smaller = more accurate)
 */
export function applyRegionalBonusToBand(baseBandSize: number, regionalBonus: number): number {
  // Higher bonus = smaller band (more accurate)
  // E.g., 15% bonus (1.15) reduces band by ~13%
  return Math.max(3, Math.round(baseBandSize / regionalBonus));
}

// Export the college mapping for UI use
export { COLLEGE_TO_CONFERENCE };

