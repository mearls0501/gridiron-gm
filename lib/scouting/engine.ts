/**
 * New Scouting Engine
 * Archetype-based scouting system with priority-based point allocation
 */

import { random } from "@/lib/utils";
import { Scout, ScoutArchetype, ScoutingActionType, PriorityLevel, ScoutedProspect } from "./types";
import { applyArchetypeMultipliers, getPriorityFactor } from "./archetype-multipliers";

export interface ProspectTrueData {
  true_overall: number;
  true_potential: number;
  true_speed?: number;
  true_acceleration?: number;
  true_agility?: number;
  true_strength?: number;
  true_awareness?: number;
  true_instincts?: number;
  true_technique?: number;
  true_burst?: number;
  true_mental_iq?: number;
  true_competitiveness?: number;
  true_coachability?: number;
  true_leadership?: number;
  true_durability?: number;
  true_bust_risk?: "low" | "medium" | "high";
  true_scheme_fit?: string;
  true_playstyle?: string;
  position?: string;
}

export interface ScoutingResult {
  est_overall_low?: number;
  est_overall_high?: number;
  est_potential_low?: number;
  est_potential_high?: number;
  trait_reveals: Record<string, any>;
  athletic_bands: Record<string, any>;
  psych_reveals: Record<string, any>;
  scheme_fit?: string;
  confidence?: number;
  round_projection?: number;
  notes?: string;
}

/**
 * Perform initial scouting (1 point)
 * Reveals: OVR/POT bands, round projection, general traits
 */
export function performInitialScouting(
  scout: Scout,
  prospect: ProspectTrueData,
  priority: PriorityLevel
): ScoutingResult {
  const effectiveAttributes = applyArchetypeMultipliers(
    {
      evaluation: scout.evaluation,
      football_iq: scout.football_iq,
      athletic_analysis: scout.athletic_analysis,
      psych_insight: scout.psych_insight,
      medical_read: scout.medical_read,
      analytics: scout.analytics,
      confidence: scout.confidence,
      experience: scout.experience,
      communication: scout.communication,
    },
    scout.archetype
  );
  
  const priorityFactor = getPriorityFactor(priority);
  const evaluatorEval = effectiveAttributes.evaluation;
  
  // Calculate band sizes
  // OVR_band = ±(20 - evaluator_eval/5 × priority_factor)
  const ovrBandSize = Math.max(5, Math.round(20 - (evaluatorEval / 5) * priorityFactor));
  const potBandSize = Math.max(8, Math.round(25 - (evaluatorEval / 4) * priorityFactor));
  
  const result: ScoutingResult = {
    est_overall_low: Math.max(0, prospect.true_overall - ovrBandSize),
    est_overall_high: Math.min(100, prospect.true_overall + ovrBandSize),
    est_potential_low: Math.max(0, prospect.true_potential - potBandSize),
    est_potential_high: Math.min(100, prospect.true_potential + potBandSize),
    trait_reveals: {},
    athletic_bands: {},
    psych_reveals: {},
    confidence: Math.min(100, Math.round(evaluatorEval * priorityFactor * 0.6)),
  };
  
  // Round projection based on overall
  if (prospect.true_overall >= 85) {
    result.round_projection = random(1, 2);
  } else if (prospect.true_overall >= 75) {
    result.round_projection = random(1, 3);
  } else if (prospect.true_overall >= 65) {
    result.round_projection = random(2, 4);
  } else if (prospect.true_overall >= 55) {
    result.round_projection = random(3, 5);
  } else {
    result.round_projection = random(4, 7);
  }
  
  // General trait descriptors (vague)
  if (scout.archetype === "character_coach") {
    // Character Coach gets psych hints
    if (prospect.true_leadership && prospect.true_leadership >= 70) {
      result.psych_reveals.leadership_hint = "Strong leadership presence";
    } else if (prospect.true_leadership && prospect.true_leadership < 50) {
      result.psych_reveals.leadership_hint = "Quiet presence";
    }
  }
  
  if (scout.archetype === "athletic_analyst") {
    // Athletic Analyst gets athletic projection
    if (prospect.true_speed && prospect.true_speed >= 80) {
      result.athletic_bands.speed_hint = "Elite speed";
    } else if (prospect.true_speed && prospect.true_speed < 60) {
      result.athletic_bands.speed_hint = "Below average speed";
    } else {
      result.athletic_bands.speed_hint = "Average speed";
    }
  }
  
  result.notes = generateInitialNotes(scout, result);
  
  return result;
}

/**
 * Perform game tape review (3 points)
 * Reveals: Traits (Tape Grinder: 3-5, others: 1-2), technique bands, scheme fit
 */
export function performGameTapeReview(
  scout: Scout,
  prospect: ProspectTrueData,
  priority: PriorityLevel
): ScoutingResult {
  const effectiveAttributes = applyArchetypeMultipliers(
    {
      evaluation: scout.evaluation,
      football_iq: scout.football_iq,
      athletic_analysis: scout.athletic_analysis,
      psych_insight: scout.psych_insight,
      medical_read: scout.medical_read,
      analytics: scout.analytics,
      confidence: scout.confidence,
      experience: scout.experience,
      communication: scout.communication,
    },
    scout.archetype
  );
  
  const priorityFactor = getPriorityFactor(priority);
  const footballIQ = effectiveAttributes.football_iq;
  
  // Trait accuracy
  const traitAccuracy = footballIQ * priorityFactor;
  const bandShrink = Math.max(3, Math.round(footballIQ / 3 * priorityFactor));
  
  const result: ScoutingResult = {
    trait_reveals: {},
    athletic_bands: {},
    psych_reveals: {},
    confidence: Math.min(100, Math.round(traitAccuracy * 0.7)),
  };
  
  // Number of traits revealed depends on archetype
  let numTraits: number;
  if (scout.archetype === "tape_grinder") {
    numTraits = random(3, 5);
  } else {
    numTraits = random(1, 2);
  }
  
  // Reveal traits based on position and archetype strengths
  const availableTraits: Array<{ key: string; value: number | undefined }> = [
    { key: "awareness", value: prospect.true_awareness },
    { key: "instincts", value: prospect.true_instincts },
    { key: "technique", value: prospect.true_technique },
    { key: "mental_iq", value: prospect.true_mental_iq },
  ];
  
  // Add physical traits if available
  if (prospect.true_speed !== undefined) {
    availableTraits.push({ key: "speed", value: prospect.true_speed });
  }
  if (prospect.true_strength !== undefined) {
    availableTraits.push({ key: "strength", value: prospect.true_strength });
  }
  if (prospect.true_agility !== undefined) {
    availableTraits.push({ key: "agility", value: prospect.true_agility });
  }
  
  // Shuffle and pick traits
  const shuffled = availableTraits.sort(() => Math.random() - 0.5);
  const traitsToReveal = shuffled.slice(0, Math.min(numTraits, shuffled.length));
  
  for (const trait of traitsToReveal) {
    if (trait.value !== undefined) {
      const traitMin = Math.max(0, trait.value - bandShrink);
      const traitMax = Math.min(100, trait.value + bandShrink);
      result.trait_reveals[trait.key] = {
        low: traitMin,
        high: traitMax,
        estimate: random(traitMin, traitMax),
      };
    }
  }
  
  // Scheme fit (Tape Grinder is best at this)
  if (scout.archetype === "tape_grinder" && prospect.true_scheme_fit) {
    result.scheme_fit = prospect.true_scheme_fit;
  } else if (prospect.true_scheme_fit) {
    // Others get vague scheme fit
    result.scheme_fit = "Scheme fit: " + (Math.random() > 0.5 ? "Good" : "Average");
  }
  
  // Technique bands
  if (prospect.true_technique !== undefined) {
    const techMin = Math.max(0, prospect.true_technique - bandShrink);
    const techMax = Math.min(100, prospect.true_technique + bandShrink);
    result.trait_reveals.technique = {
      low: techMin,
      high: techMax,
      estimate: random(techMin, techMax),
    };
  }
  
  result.notes = generateTapeNotes(scout, result);
  
  return result;
}

/**
 * Perform combine scouting (offseason only)
 * Athletic Analyst: Reveals actual bands
 * Others: "Good/Average/Elite" text only
 */
export function performCombine(
  scout: Scout,
  prospect: ProspectTrueData,
  priority: PriorityLevel
): ScoutingResult {
  const effectiveAttributes = applyArchetypeMultipliers(
    {
      evaluation: scout.evaluation,
      football_iq: scout.football_iq,
      athletic_analysis: scout.athletic_analysis,
      psych_insight: scout.psych_insight,
      medical_read: scout.medical_read,
      analytics: scout.analytics,
      confidence: scout.confidence,
      experience: scout.experience,
      communication: scout.communication,
    },
    scout.archetype
  );
  
  const priorityFactor = getPriorityFactor(priority);
  const result: ScoutingResult = {
    trait_reveals: {},
    athletic_bands: {},
    psych_reveals: {},
  };
  
  if (scout.archetype === "athletic_analyst") {
    // Athletic Analyst reveals actual bands
    const athleticAnalysis = effectiveAttributes.athletic_analysis;
    const error = Math.max(2, Math.round(12 - (athleticAnalysis / 10) * priorityFactor));
    
    if (prospect.true_speed !== undefined) {
      result.athletic_bands.speed = {
        low: Math.max(0, prospect.true_speed - error),
        high: Math.min(100, prospect.true_speed + error),
      };
    }
    if (prospect.true_acceleration !== undefined) {
      result.athletic_bands.acceleration = {
        low: Math.max(0, prospect.true_acceleration - error),
        high: Math.min(100, prospect.true_acceleration + error),
      };
    }
    if (prospect.true_agility !== undefined) {
      result.athletic_bands.agility = {
        low: Math.max(0, prospect.true_agility - error),
        high: Math.min(100, prospect.true_agility + error),
      };
    }
    if (prospect.true_strength !== undefined) {
      result.athletic_bands.strength = {
        low: Math.max(0, prospect.true_strength - error),
        high: Math.min(100, prospect.true_strength + error),
      };
    }
    if (prospect.true_burst !== undefined) {
      result.athletic_bands.burst = {
        low: Math.max(0, prospect.true_burst - error),
        high: Math.min(100, prospect.true_burst + error),
      };
    }
    
    result.confidence = Math.min(100, Math.round(athleticAnalysis * priorityFactor * 0.8));
  } else {
    // Others see text only
    if (prospect.true_speed !== undefined) {
      if (prospect.true_speed >= 80) {
        result.athletic_bands.speed = "Elite";
      } else if (prospect.true_speed >= 65) {
        result.athletic_bands.speed = "Good";
      } else {
        result.athletic_bands.speed = "Average";
      }
    }
    if (prospect.true_acceleration !== undefined) {
      if (prospect.true_acceleration >= 80) {
        result.athletic_bands.acceleration = "Elite";
      } else if (prospect.true_acceleration >= 65) {
        result.athletic_bands.acceleration = "Good";
      } else {
        result.athletic_bands.acceleration = "Average";
      }
    }
    if (prospect.true_agility !== undefined) {
      if (prospect.true_agility >= 80) {
        result.athletic_bands.agility = "Elite";
      } else if (prospect.true_agility >= 65) {
        result.athletic_bands.agility = "Good";
      } else {
        result.athletic_bands.agility = "Average";
      }
    }
    
    result.confidence = 50; // Low confidence for non-specialists
  }
  
  result.notes = generateCombineNotes(scout, result);
  
  return result;
}

/**
 * Perform interview (offseason only)
 * Character Coach: Reveals bust/boom risk accurately
 * Others: Vague personality notes
 */
export function performInterview(
  scout: Scout,
  prospect: ProspectTrueData,
  priority: PriorityLevel
): ScoutingResult {
  const effectiveAttributes = applyArchetypeMultipliers(
    {
      evaluation: scout.evaluation,
      football_iq: scout.football_iq,
      athletic_analysis: scout.athletic_analysis,
      psych_insight: scout.psych_insight,
      medical_read: scout.medical_read,
      analytics: scout.analytics,
      confidence: scout.confidence,
      experience: scout.experience,
      communication: scout.communication,
    },
    scout.archetype
  );
  
  const priorityFactor = getPriorityFactor(priority);
  const result: ScoutingResult = {
    trait_reveals: {},
    athletic_bands: {},
    psych_reveals: {},
  };
  
  if (scout.archetype === "character_coach") {
    // Character Coach reveals accurate bust/boom risk
    const psychInsight = effectiveAttributes.psych_insight;
    const bustAccuracy = psychInsight * 0.5 * priorityFactor;
    
    if (prospect.true_bust_risk) {
      // High accuracy reveal
      const accuracy = Math.min(100, Math.round(bustAccuracy));
      result.psych_reveals.bust_risk = {
        value: prospect.true_bust_risk,
        confidence: accuracy >= 70 ? "high" : accuracy >= 50 ? "medium" : "low",
      };
    }
    
    // Reveal character traits
    if (prospect.true_leadership !== undefined) {
      const error = Math.max(5, Math.round(15 - (psychInsight / 10) * priorityFactor));
      result.psych_reveals.leadership = {
        low: Math.max(0, prospect.true_leadership - error),
        high: Math.min(100, prospect.true_leadership + error),
      };
    }
    if (prospect.true_coachability !== undefined) {
      const error = Math.max(5, Math.round(15 - (psychInsight / 10) * priorityFactor));
      result.psych_reveals.coachability = {
        low: Math.max(0, prospect.true_coachability - error),
        high: Math.min(100, prospect.true_coachability + error),
      };
    }
    if (prospect.true_competitiveness !== undefined) {
      const error = Math.max(5, Math.round(15 - (psychInsight / 10) * priorityFactor));
      result.psych_reveals.competitiveness = {
        low: Math.max(0, prospect.true_competitiveness - error),
        high: Math.min(100, prospect.true_competitiveness + error),
      };
    }
    
    result.confidence = Math.min(100, Math.round(psychInsight * priorityFactor * 0.8));
  } else {
    // Others get vague notes
    result.psych_reveals.personality = "Personality assessment: " + random(1, 3) === 1 ? "Positive" : "Neutral";
    result.confidence = 30; // Low confidence
  }
  
  result.notes = generateInterviewNotes(scout, result);
  
  return result;
}

/**
 * Perform medical evaluation (offseason only)
 * Character Coach: Reliable durability assessment
 * Others: "Medical: Uncertain"
 */
export function performMedical(
  scout: Scout,
  prospect: ProspectTrueData,
  priority: PriorityLevel
): ScoutingResult {
  const effectiveAttributes = applyArchetypeMultipliers(
    {
      evaluation: scout.evaluation,
      football_iq: scout.football_iq,
      athletic_analysis: scout.athletic_analysis,
      psych_insight: scout.psych_insight,
      medical_read: scout.medical_read,
      analytics: scout.analytics,
      confidence: scout.confidence,
      experience: scout.experience,
      communication: scout.communication,
    },
    scout.archetype
  );
  
  const priorityFactor = getPriorityFactor(priority);
  const result: ScoutingResult = {
    trait_reveals: {},
    athletic_bands: {},
    psych_reveals: {},
  };
  
  if (scout.archetype === "character_coach") {
    // Character Coach gets reliable assessment
    const medicalRead = effectiveAttributes.medical_read;
    
    if (prospect.true_durability !== undefined) {
      if (prospect.true_durability >= 75) {
        result.psych_reveals.durability = "Low durability risk";
      } else if (prospect.true_durability >= 50) {
        result.psych_reveals.durability = "Moderate durability risk";
      } else {
        result.psych_reveals.durability = "High durability risk";
      }
    }
    
    result.confidence = Math.min(100, Math.round(medicalRead * priorityFactor * 0.8));
  } else {
    // Others get uncertain
    result.psych_reveals.durability = "Medical: Uncertain";
    result.confidence = 20; // Very low confidence
  }
  
  result.notes = generateMedicalNotes(scout, result);
  
  return result;
}

/**
 * Merge scouting results into existing scouted prospect data
 */
export function mergeScoutingResults(
  existing: Partial<ScoutedProspect>,
  newResult: ScoutingResult
): Partial<ScoutedProspect> {
  const merged: Partial<ScoutedProspect> = {
    ...existing,
    trait_reveals: { ...(existing.trait_reveals || {}), ...newResult.trait_reveals },
    athletic_bands: { ...(existing.athletic_bands || {}), ...newResult.athletic_bands },
    psych_reveals: { ...(existing.psych_reveals || {}), ...newResult.psych_reveals },
  };
  
  // Keep tighter ranges
  if (newResult.est_overall_low !== undefined && newResult.est_overall_high !== undefined) {
    const newRange = newResult.est_overall_high - newResult.est_overall_low;
    const existingRange = existing.est_overall_high && existing.est_overall_low
      ? existing.est_overall_high - existing.est_overall_low
      : Infinity;
    
    if (newRange < existingRange) {
      merged.est_overall_low = newResult.est_overall_low;
      merged.est_overall_high = newResult.est_overall_high;
    } else if (existing.est_overall_low !== undefined && existing.est_overall_high !== undefined) {
      merged.est_overall_low = existing.est_overall_low;
      merged.est_overall_high = existing.est_overall_high;
    } else {
      merged.est_overall_low = newResult.est_overall_low;
      merged.est_overall_high = newResult.est_overall_high;
    }
  }
  
  if (newResult.est_potential_low !== undefined && newResult.est_potential_high !== undefined) {
    const newRange = newResult.est_potential_high - newResult.est_potential_low;
    const existingRange = existing.est_potential_high && existing.est_potential_low
      ? existing.est_potential_high - existing.est_potential_low
      : Infinity;
    
    if (newRange < existingRange) {
      merged.est_potential_low = newResult.est_potential_low;
      merged.est_potential_high = newResult.est_potential_high;
    } else if (existing.est_potential_low !== undefined && existing.est_potential_high !== undefined) {
      merged.est_potential_low = existing.est_potential_low;
      merged.est_potential_high = existing.est_potential_high;
    } else {
      merged.est_potential_low = newResult.est_potential_low;
      merged.est_potential_high = newResult.est_potential_high;
    }
  }
  
  if (newResult.scheme_fit) {
    merged.scheme_fit = newResult.scheme_fit;
  }
  
  if (newResult.confidence !== undefined) {
    merged.confidence = Math.max(existing.confidence || 0, newResult.confidence);
  }
  
  return merged;
}

// Helper functions for generating notes
function generateInitialNotes(scout: Scout, result: ScoutingResult): string {
  const notes: string[] = [];
  notes.push(`${scout.name} (${scout.archetype}) completed initial scouting.`);
  
  if (result.est_overall_low !== undefined && result.est_overall_high !== undefined) {
    notes.push(`Overall range: ${result.est_overall_low}-${result.est_overall_high}`);
  }
  
  if (result.round_projection) {
    notes.push(`Projected round: ${result.round_projection}`);
  }
  
  return notes.join(" ");
}

function generateTapeNotes(scout: Scout, result: ScoutingResult): string {
  const notes: string[] = [];
  notes.push(`${scout.name} completed game tape review.`);
  
  const traitCount = Object.keys(result.trait_reveals).length;
  if (traitCount > 0) {
    notes.push(`Revealed ${traitCount} trait(s).`);
  }
  
  if (result.scheme_fit) {
    notes.push(result.scheme_fit);
  }
  
  return notes.join(" ");
}

function generateCombineNotes(scout: Scout, result: ScoutingResult): string {
  const notes: string[] = [];
  notes.push(`${scout.name} attended combine.`);
  
  if (scout.archetype === "athletic_analyst") {
    const bandCount = Object.keys(result.athletic_bands).length;
    notes.push(`Measured ${bandCount} athletic attribute(s) with high accuracy.`);
  } else {
    notes.push("General athletic assessment completed.");
  }
  
  return notes.join(" ");
}

function generateInterviewNotes(scout: Scout, result: ScoutingResult): string {
  const notes: string[] = [];
  notes.push(`${scout.name} conducted interview.`);
  
  if (scout.archetype === "character_coach") {
    notes.push("Detailed character assessment completed.");
  } else {
    notes.push("Basic personality notes recorded.");
  }
  
  return notes.join(" ");
}

function generateMedicalNotes(scout: Scout, result: ScoutingResult): string {
  const notes: string[] = [];
  notes.push(`${scout.name} reviewed medical records.`);
  
  if (scout.archetype === "character_coach") {
    notes.push("Medical evaluation completed.");
  } else {
    notes.push("Medical review inconclusive.");
  }
  
  return notes.join(" ");
}
