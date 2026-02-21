/**
 * New Scouting Engine
 * Archetype-based scouting system with priority-based point allocation
 */

import { random } from "@/lib/utils";
import { Scout, ScoutArchetype, ScoutingActionType, PriorityLevel, ScoutedProspect, ScoutPersonality } from "./types";
import { applyArchetypeMultipliers, getPriorityFactor, calculateRegionalBonus, applyRegionalBonusToBand } from "./archetype-multipliers";
import { generateScoutNote, generateHeadlineOpinion, checkScoutDisagreement } from "./scout-personality";

export interface ProspectTrueData {
  true_overall: number;
  true_potential: number;
  position?: string;
  college?: string;
  college_conference?: string;
  
  // Physical attributes
  true_spd?: number;
  true_acc?: number;
  true_agi?: number;
  true_str?: number;
  
  // QB/Passing attributes
  true_thp?: number;
  true_sac?: number;
  true_mac?: number;
  true_dac?: number;
  true_tup?: number;
  true_pac?: number;
  true_dec?: number;
  true_awr?: number;
  
  // Ball carrier/Blocking
  true_btk?: number;
  true_car?: number;
  true_vsn?: number;
  true_rtr?: number;
  true_pblk?: number;
  true_rblk?: number;
  true_iblk?: number;
  true_agg?: number;
  
  // Receiving
  true_rls?: number;
  true_rte?: number;
  true_cth?: number;
  true_cit?: number;
  true_yac?: number;
  
  // Defensive line
  true_pmv?: number;
  true_fmv?: number;
  true_bsh?: number;
  true_pur?: number;
  
  // Linebacker/Defense
  true_tak?: number;
  true_cov?: number;
  
  // Coverage
  true_mcv?: number;
  true_zcv?: number;
  true_prs?: number;
  
  // Kicking
  true_kpw?: number;
  true_kac?: number;
  
  // Technical skills
  true_footwork?: number;
  true_hand_placement?: number;
  true_release_tech?: number;
  true_hand_tech?: number;
  true_mechanics?: number;
  true_decision_time?: number;
  true_leverage?: number;
  true_move_set?: number;
  true_backpedal?: number;
  true_ball_skills?: number;
  true_play_recognition?: number;
  
  // Mental/Character
  true_football_iq?: number;
  true_motor?: number;
  true_work_ethic?: number;
  true_coachability?: number;
  true_leadership?: number;
  true_durability?: number;
  true_consistency?: number;
  true_injury_risk?: number;
  
  // Projection/Scouting
  true_athletic_ceiling?: number;
  true_technique_ceiling?: number;
  true_mental_ceiling?: number;
  true_breakout_probability?: number;
  true_bust_probability?: number;
  
  // Backward compatibility - legacy simplified attributes
  true_speed?: number; // Maps to true_spd
  true_acceleration?: number; // Maps to true_acc
  true_agility?: number; // Maps to true_agi
  true_strength?: number; // Maps to true_str
  true_awareness?: number; // Maps to true_awr
  true_instincts?: number; // Maps to true_play_recognition
  true_technique?: number; // Maps to true_mechanics or true_footwork
  true_burst?: number; // Maps to true_acc
  true_mental_iq?: number; // Maps to true_football_iq
  true_competitiveness?: number; // Maps to true_motor
  true_bust_risk?: "low" | "medium" | "high";
  true_scheme_fit?: string;
  true_playstyle?: string;
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
  // New personality-driven fields
  scoutNote?: string;
  scoutHeadline?: string;
  scoutPersonality?: {
    type: string;
    biasDirection: number;
    riskTolerance: number;
  };
  // Regional bonus info
  regionalBonus?: {
    bonus: number;
    description: string;
    isHomeRegion: boolean;
  };
}

/**
 * Get position-specific traits for scouting reveals
 * Returns detailed attributes relevant to each position
 */
function getPositionSpecificTraits(prospect: ProspectTrueData): Array<{ key: string; value: number | undefined }> {
  const position = prospect.position;
  const traits: Array<{ key: string; value: number | undefined }> = [];
  
  // Always include these core attributes
  traits.push(
    { key: "awareness", value: prospect.true_awr },
    { key: "football_iq", value: prospect.true_football_iq },
    { key: "play_recognition", value: prospect.true_play_recognition }
  );
  
  switch (position) {
    case "QB":
      traits.push(
        { key: "throw_power", value: prospect.true_thp },
        { key: "short_accuracy", value: prospect.true_sac },
        { key: "medium_accuracy", value: prospect.true_mac },
        { key: "deep_accuracy", value: prospect.true_dac },
        { key: "throw_under_pressure", value: prospect.true_tup },
        { key: "mechanics", value: prospect.true_mechanics },
        { key: "decision_making", value: prospect.true_dec }
      );
      break;
      
    case "RB":
      traits.push(
        { key: "break_tackle", value: prospect.true_btk },
        { key: "carrying", value: prospect.true_car },
        { key: "vision", value: prospect.true_vsn },
        { key: "speed", value: prospect.true_spd },
        { key: "agility", value: prospect.true_agi },
        { key: "catching", value: prospect.true_cth },
        { key: "yac", value: prospect.true_yac }
      );
      break;
      
    case "WR":
    case "TE":
      traits.push(
        { key: "route_running", value: prospect.true_rte },
        { key: "release", value: prospect.true_rls },
        { key: "catching", value: prospect.true_cth },
        { key: "catch_in_traffic", value: prospect.true_cit },
        { key: "yac", value: prospect.true_yac },
        { key: "speed", value: prospect.true_spd },
        { key: "ball_skills", value: prospect.true_ball_skills }
      );
      if (position === "TE") {
        traits.push(
          { key: "run_blocking", value: prospect.true_rblk },
          { key: "strength", value: prospect.true_str }
        );
      }
      break;
      
    case "OT":
    case "OG":
    case "C":
      traits.push(
        { key: "pass_blocking", value: prospect.true_pblk },
        { key: "run_blocking", value: prospect.true_rblk },
        { key: "strength", value: prospect.true_str },
        { key: "footwork", value: prospect.true_footwork },
        { key: "hand_placement", value: prospect.true_hand_placement },
        { key: "leverage", value: prospect.true_leverage }
      );
      break;
      
    case "DE":
    case "DT":
      traits.push(
        { key: "power_moves", value: prospect.true_pmv },
        { key: "finesse_moves", value: prospect.true_fmv },
        { key: "block_shedding", value: prospect.true_bsh },
        { key: "pursuit", value: prospect.true_pur },
        { key: "tackling", value: prospect.true_tak },
        { key: "strength", value: prospect.true_str },
        { key: "move_set", value: prospect.true_move_set }
      );
      break;
      
    case "LB":
      traits.push(
        { key: "tackling", value: prospect.true_tak },
        { key: "pursuit", value: prospect.true_pur },
        { key: "block_shedding", value: prospect.true_bsh },
        { key: "coverage", value: prospect.true_cov },
        { key: "man_coverage", value: prospect.true_mcv },
        { key: "zone_coverage", value: prospect.true_zcv },
        { key: "speed", value: prospect.true_spd }
      );
      break;
      
    case "CB":
    case "S":
      traits.push(
        { key: "man_coverage", value: prospect.true_mcv },
        { key: "zone_coverage", value: prospect.true_zcv },
        { key: "press", value: prospect.true_prs },
        { key: "speed", value: prospect.true_spd },
        { key: "agility", value: prospect.true_agi },
        { key: "ball_skills", value: prospect.true_ball_skills },
        { key: "backpedal", value: prospect.true_backpedal }
      );
      if (position === "S") {
        traits.push(
          { key: "tackling", value: prospect.true_tak },
          { key: "pursuit", value: prospect.true_pur }
        );
      }
      break;
      
    case "K":
    case "P":
      traits.push(
        { key: "kick_power", value: prospect.true_kpw },
        { key: "kick_accuracy", value: prospect.true_kac },
        { key: "mechanics", value: prospect.true_mechanics }
      );
      break;
      
    default:
      // Generic physical attributes for unknown positions
      traits.push(
        { key: "speed", value: prospect.true_spd },
        { key: "strength", value: prospect.true_str },
        { key: "agility", value: prospect.true_agi }
      );
  }
  
  return traits;
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

  // Calculate regional bonus
  const regionalBonusResult = calculateRegionalBonus(
    scout.region,
    prospect.college || "",
    prospect.college_conference
  );

  // Calculate band sizes with regional bonus applied
  // OVR_band = ±(20 - evaluator_eval/5 × priority_factor)
  const baseOvrBand = Math.max(5, Math.round(20 - (evaluatorEval / 5) * priorityFactor));
  const basePotBand = Math.max(8, Math.round(25 - (evaluatorEval / 4) * priorityFactor));

  // Apply regional bonus - home region scouts get tighter bands
  const ovrBandSize = applyRegionalBonusToBand(baseOvrBand, regionalBonusResult.bonus);
  const potBandSize = applyRegionalBonusToBand(basePotBand, regionalBonusResult.bonus);
  
  // Confidence boosted by regional expertise
  const confidenceBoost = regionalBonusResult.isHomeRegion ? 10 : 0;

  const result: ScoutingResult = {
    est_overall_low: Math.max(0, prospect.true_overall - ovrBandSize),
    est_overall_high: Math.min(100, prospect.true_overall + ovrBandSize),
    est_potential_low: Math.max(0, prospect.true_potential - potBandSize),
    est_potential_high: Math.min(100, prospect.true_potential + potBandSize),
    trait_reveals: {},
    athletic_bands: {},
    psych_reveals: {},
    confidence: Math.min(100, Math.round(evaluatorEval * priorityFactor * 0.6) + confidenceBoost),
    regionalBonus: regionalBonusResult,
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

  // Generate personality-driven scout opinion
  if (scout.personality_type) {
    const personality: ScoutPersonality = {
      type: scout.personality_type as any,
      biasDirection: scout.personality_bias || 0,
      riskTolerance: scout.personality_risk_tolerance || 50,
      verbosity: (scout.personality_verbosity as "terse" | "normal" | "verbose") || "normal",
    };

    const estimatedOverall = Math.round(
      ((result.est_overall_low || 50) + (result.est_overall_high || 50)) / 2
    );

    result.scoutNote = generateScoutNote(
      scout.archetype,
      personality,
      estimatedOverall + personality.biasDirection, // Apply bias
      {
        hasBustRisk: prospect.true_bust_risk === "high",
        prospectName: prospect.position,
      }
    );

    result.scoutHeadline = generateHeadlineOpinion(
      scout.archetype,
      personality,
      estimatedOverall + personality.biasDirection
    );

    result.scoutPersonality = {
      type: personality.type,
      biasDirection: personality.biasDirection,
      riskTolerance: personality.riskTolerance,
    };
  }

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
  
  // Reveal traits based on position - now using detailed attributes
  const availableTraits = getPositionSpecificTraits(prospect);
  
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

  // Generate personality-driven scout opinion for tape review
  if (scout.personality_type) {
    const personality: ScoutPersonality = {
      type: scout.personality_type as any,
      biasDirection: scout.personality_bias || 0,
      riskTolerance: scout.personality_risk_tolerance || 50,
      verbosity: (scout.personality_verbosity as "terse" | "normal" | "verbose") || "normal",
    };

    // Estimate overall from traits
    const traitAvg = Object.values(result.trait_reveals)
      .map((t: any) => t.estimate || (t.low + t.high) / 2 || 50)
      .reduce((sum: number, val: number) => sum + val, 0) / Math.max(Object.keys(result.trait_reveals).length, 1);

    result.scoutNote = generateScoutNote(
      scout.archetype,
      personality,
      traitAvg + personality.biasDirection,
      {
        schemeFit: result.scheme_fit?.toLowerCase().includes("good")
          ? "good"
          : result.scheme_fit?.toLowerCase().includes("poor")
            ? "poor"
            : "average",
      }
    );

    result.scoutHeadline = generateHeadlineOpinion(
      scout.archetype,
      personality,
      traitAvg + personality.biasDirection
    );

    result.scoutPersonality = {
      type: personality.type,
      biasDirection: personality.biasDirection,
      riskTolerance: personality.riskTolerance,
    };
  }

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
    // Athletic Analyst reveals actual bands for detailed attributes
    const athleticAnalysis = effectiveAttributes.athletic_analysis;
    const error = Math.max(2, Math.round(12 - (athleticAnalysis / 10) * priorityFactor));
    
    // Use new detailed attribute names
    if (prospect.true_spd !== undefined) {
      result.athletic_bands.speed = {
        low: Math.max(0, prospect.true_spd - error),
        high: Math.min(100, prospect.true_spd + error),
      };
    }
    if (prospect.true_acc !== undefined) {
      result.athletic_bands.acceleration = {
        low: Math.max(0, prospect.true_acc - error),
        high: Math.min(100, prospect.true_acc + error),
      };
    }
    if (prospect.true_agi !== undefined) {
      result.athletic_bands.agility = {
        low: Math.max(0, prospect.true_agi - error),
        high: Math.min(100, prospect.true_agi + error),
      };
    }
    if (prospect.true_str !== undefined) {
      result.athletic_bands.strength = {
        low: Math.max(0, prospect.true_str - error),
        high: Math.min(100, prospect.true_str + error),
      };
    }
    // Also reveal athletic ceiling for prospects
    if (prospect.true_athletic_ceiling !== undefined) {
      result.athletic_bands.athletic_ceiling = {
        low: Math.max(0, prospect.true_athletic_ceiling - error),
        high: Math.min(100, prospect.true_athletic_ceiling + error),
      };
    }
    
    result.confidence = Math.min(100, Math.round(athleticAnalysis * priorityFactor * 0.8));
  } else {
    // Others see text only
    const speed = prospect.true_spd || prospect.true_speed;
    const acceleration = prospect.true_acc || prospect.true_acceleration;
    const agility = prospect.true_agi || prospect.true_agility;
    
    if (speed !== undefined) {
      if (speed >= 80) {
        result.athletic_bands.speed = "Elite";
      } else if (speed >= 65) {
        result.athletic_bands.speed = "Good";
      } else {
        result.athletic_bands.speed = "Average";
      }
    }
    if (acceleration !== undefined) {
      if (acceleration >= 80) {
        result.athletic_bands.acceleration = "Elite";
      } else if (acceleration >= 65) {
        result.athletic_bands.acceleration = "Good";
      } else {
        result.athletic_bands.acceleration = "Average";
      }
    }
    if (agility !== undefined) {
      if (agility >= 80) {
        result.athletic_bands.agility = "Elite";
      } else if (agility >= 65) {
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
    // Reveal mental/character attributes
    const error = Math.max(5, Math.round(15 - (psychInsight / 10) * priorityFactor));
    
    if (prospect.true_leadership !== undefined) {
      result.psych_reveals.leadership = {
        low: Math.max(0, prospect.true_leadership - error),
        high: Math.min(100, prospect.true_leadership + error),
      };
    }
    if (prospect.true_coachability !== undefined) {
      result.psych_reveals.coachability = {
        low: Math.max(0, prospect.true_coachability - error),
        high: Math.min(100, prospect.true_coachability + error),
      };
    }
    if (prospect.true_motor !== undefined) {
      result.psych_reveals.motor = {
        low: Math.max(0, prospect.true_motor - error),
        high: Math.min(100, prospect.true_motor + error),
      };
    }
    if (prospect.true_football_iq !== undefined) {
      result.psych_reveals.football_iq = {
        low: Math.max(0, prospect.true_football_iq - error),
        high: Math.min(100, prospect.true_football_iq + error),
      };
    }
    if (prospect.true_work_ethic !== undefined) {
      result.psych_reveals.work_ethic = {
        low: Math.max(0, prospect.true_work_ethic - error),
        high: Math.min(100, prospect.true_work_ethic + error),
      };
    }
    if (prospect.true_consistency !== undefined) {
      result.psych_reveals.consistency = {
        low: Math.max(0, prospect.true_consistency - error),
        high: Math.min(100, prospect.true_consistency + error),
      };
    }
    // Reveal mental ceiling for prospects
    if (prospect.true_mental_ceiling !== undefined) {
      result.psych_reveals.mental_ceiling = {
        low: Math.max(0, prospect.true_mental_ceiling - error),
        high: Math.min(100, prospect.true_mental_ceiling + error),
      };
    }
    
    result.confidence = Math.min(100, Math.round(psychInsight * priorityFactor * 0.8));
  } else {
    // Others get vague notes
    result.psych_reveals.personality = "Personality assessment: " + (random(1, 3) === 1 ? "Positive" : "Neutral");
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

/**
 * Convert draft prospect to ProspectTrueData for scouting
 * Maps all detailed attributes to the true_ prefix format
 */
export function prospectToTrueData(prospect: any): ProspectTrueData {
  return {
    true_overall: prospect.overall,
    true_potential: prospect.potential,
    position: prospect.position,
    college: prospect.college,
    college_conference: prospect.college_conference,
    
    // Physical attributes
    true_spd: prospect.spd,
    true_acc: prospect.acc,
    true_agi: prospect.agi,
    true_str: prospect.str,
    
    // QB/Passing attributes
    true_thp: prospect.thp,
    true_sac: prospect.sac,
    true_mac: prospect.mac,
    true_dac: prospect.dac,
    true_tup: prospect.tup,
    true_pac: prospect.pac,
    true_dec: prospect.dec,
    true_awr: prospect.awr,
    
    // Ball carrier/Blocking
    true_btk: prospect.btk,
    true_car: prospect.car,
    true_vsn: prospect.vsn,
    true_rtr: prospect.rtr,
    true_pblk: prospect.pblk,
    true_rblk: prospect.rblk,
    true_iblk: prospect.iblk,
    true_agg: prospect.agg,
    
    // Receiving
    true_rls: prospect.rls,
    true_rte: prospect.rte,
    true_cth: prospect.cth,
    true_cit: prospect.cit,
    true_yac: prospect.yac,
    
    // Defensive line
    true_pmv: prospect.pmv,
    true_fmv: prospect.fmv,
    true_bsh: prospect.bsh,
    true_pur: prospect.pur,
    
    // Linebacker/Defense
    true_tak: prospect.tak,
    true_cov: prospect.cov,
    
    // Coverage
    true_mcv: prospect.mcv,
    true_zcv: prospect.zcv,
    true_prs: prospect.prs,
    
    // Kicking
    true_kpw: prospect.kpw,
    true_kac: prospect.kac,
    
    // Technical skills
    true_footwork: prospect.footwork,
    true_hand_placement: prospect.hand_placement,
    true_release_tech: prospect.release_tech,
    true_hand_tech: prospect.hand_tech,
    true_mechanics: prospect.mechanics,
    true_decision_time: prospect.decision_time,
    true_leverage: prospect.leverage,
    true_move_set: prospect.move_set,
    true_backpedal: prospect.backpedal,
    true_ball_skills: prospect.ball_skills,
    true_play_recognition: prospect.play_recognition,
    
    // Mental/Character
    true_football_iq: prospect.football_iq,
    true_motor: prospect.motor,
    true_work_ethic: prospect.work_ethic,
    true_coachability: prospect.coachability,
    true_leadership: prospect.leadership,
    true_durability: prospect.durability,
    true_consistency: prospect.consistency,
    true_injury_risk: prospect.injury_risk,
    
    // Projection/Scouting
    true_athletic_ceiling: prospect.athletic_ceiling,
    true_technique_ceiling: prospect.technique_ceiling,
    true_mental_ceiling: prospect.mental_ceiling,
    true_breakout_probability: prospect.breakout_probability,
    true_bust_probability: prospect.bust_probability,
    
    // Calculate bust risk from bust probability
    true_bust_risk: prospect.bust_probability 
      ? (prospect.bust_probability > 60 ? "high" : prospect.bust_probability > 30 ? "medium" : "low")
      : undefined,
      
    // Backward compatibility mappings
    true_speed: prospect.spd,
    true_acceleration: prospect.acc,
    true_agility: prospect.agi,
    true_strength: prospect.str,
    true_awareness: prospect.awr,
    true_instincts: prospect.play_recognition,
    true_technique: prospect.mechanics || prospect.footwork,
    true_burst: prospect.acc,
    true_mental_iq: prospect.football_iq,
    true_competitiveness: prospect.motor,
  };
}
