import { random } from "@/lib/utils";

export type ScoutingMethod =
  | "initial"
  | "tape"
  | "combine"
  | "pro_day"
  | "workout"
  | "medical"
  | "character"
  | "team_interview";

export type ScoutingStaffRole =
  | "director"
  | "national"
  | "regional"
  | "position";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ScoutingStaff {
  id: string;
  team_id: string;
  name: string;
  role: ScoutingStaffRole;
  scouting_accuracy: number;
  experience: number;
  specialty?: string;
  region?: string;
  trait_evaluation?: number;
  character_evaluation?: number;
}

export interface ScoutingReport {
  overall_min?: number;
  overall_max?: number;
  overall_estimate?: number;
  potential_min?: number;
  potential_max?: number;
  potential_estimate?: number;
  accuracy_percentage: number;
  confidence_level: ConfidenceLevel;
  traits_scouted: Record<
    string,
    { value: number; confidence: ConfidenceLevel }
  >;
  character_assessment?: Record<string, any>;
  injury_risk?: "low" | "medium" | "high";
  scheme_fit?: string;
  scout_notes?: string;
}

export interface ProspectScoutingData {
  true_overall: number;
  true_potential: number;
  true_traits: Record<string, number>;
  character?: Record<string, any>;
  injury_history?: string[];
  scheme_fit?: string;
}

/**
 * Calculate scouting accuracy based on staff, method, and other factors
 */
export function calculateScoutingAccuracy(
  staff: ScoutingStaff,
  method: ScoutingMethod,
  prospectPosition?: string,
  prospectRegion?: string,
  timeDecay: number = 0
): number {
  let accuracy = staff.scouting_accuracy;

  // Regional bonus
  if (staff.role === "regional" && staff.region && prospectRegion) {
    if (staff.region === prospectRegion) {
      accuracy += 15; // Significant bonus in home region
    } else {
      accuracy -= 10; // Penalty outside region
    }
  }

  // Position specialty bonus
  if (staff.role === "position" && staff.specialty === prospectPosition) {
    accuracy += 12;
  }

  // Experience bonus (diminishing returns)
  accuracy += Math.min(staff.experience * 0.5, 10);

  // Method bonuses
  const methodBonuses: Record<ScoutingMethod, number> = {
    initial: 0,
    tape: 10,
    combine: 15,
    pro_day: 20,
    workout: 25,
    medical: 0, // Medical doesn't affect overall accuracy, just reveals injury info
    character: 0, // Character doesn't affect overall accuracy
    team_interview: 0, // Team interview doesn't affect overall accuracy
  };
  accuracy += methodBonuses[method] || 0;

  // Director bonus
  if (staff.role === "director") {
    accuracy += 5;
  }

  // National scout bonus
  if (staff.role === "national") {
    accuracy += 8;
  }

  // Time decay (early scouting is less accurate)
  accuracy -= timeDecay;

  // Add random variance (±5-15 points)
  const variance = random(-15, 15);
  accuracy += variance;

  // Clamp between 0 and 100
  return Math.max(0, Math.min(100, Math.round(accuracy)));
}

/**
 * Calculate scouting progress based on total points invested
 * 100 points = fully scouted (100% progress)
 */
export function calculateScoutingProgress(totalPoints: number): number {
  // Cap at 100 points for 100% progress
  return Math.min(100, Math.round((totalPoints / 100) * 100));
}

/**
 * Generate a scouting report based on true ratings, accuracy, and total points invested
 */
export function generateScoutingReport(
  trueData: ProspectScoutingData,
  accuracy: number,
  method: ScoutingMethod,
  staff: ScoutingStaff,
  totalPointsInvested: number = 0,
  existingReport?: Partial<ScoutingReport>
): ScoutingReport {
  const scoutingProgress = calculateScoutingProgress(totalPointsInvested);

  // Base confidence on both accuracy and progress
  // You need both high accuracy AND enough points to get high confidence
  const effectiveAccuracy = Math.min(accuracy, scoutingProgress);
  const confidenceLevel: ConfidenceLevel =
    effectiveAccuracy >= 80 && scoutingProgress >= 70
      ? "high"
      : effectiveAccuracy >= 60 && scoutingProgress >= 40
        ? "medium"
        : "low";

  // Calculate rating ranges based on effective accuracy
  // More points = tighter ranges
  const baseRangeSize = Math.max(5, Math.round((100 - effectiveAccuracy) / 3));
  const progressMultiplier = 1 + (100 - scoutingProgress) / 100; // Wider ranges with less progress
  const rangeSize = Math.max(2, Math.round(baseRangeSize * progressMultiplier));

  // Only reveal ratings if we have enough progress
  let overallMin: number | undefined;
  let overallMax: number | undefined;
  let overallEstimate: number | undefined;
  let potentialMin: number | undefined;
  let potentialMax: number | undefined;
  let potentialEstimate: number | undefined;

  if (scoutingProgress >= 5) {
    // At 5% progress (5 pts), reveal very wide overall range
    overallMin = Math.max(
      0,
      trueData.true_overall - Math.max(20, rangeSize * 3)
    );
    overallMax = Math.min(
      100,
      trueData.true_overall + Math.max(20, rangeSize * 3)
    );
    overallEstimate = random(overallMin, overallMax);
  }

  if (scoutingProgress >= 15) {
    // At 15% progress (15 pts), reveal potential range
    potentialMin = Math.max(
      0,
      trueData.true_potential - Math.max(20, rangeSize * 3)
    );
    potentialMax = Math.min(
      100,
      trueData.true_potential + Math.max(20, rangeSize * 3)
    );
    potentialEstimate = random(potentialMin, potentialMax);
  }

  // Merge with existing report if available (progressive revelation)
  if (existingReport) {
    // Keep tighter ranges from previous scouting if they exist
    if (
      existingReport.overall_min !== undefined &&
      existingReport.overall_max !== undefined
    ) {
      const existingRange =
        existingReport.overall_max - existingReport.overall_min;
      const newRange =
        overallMax && overallMin ? overallMax - overallMin : Infinity;
      if (existingRange < newRange) {
        overallMin = existingReport.overall_min;
        overallMax = existingReport.overall_max;
        overallEstimate = existingReport.overall_estimate;
      }
    }
    if (
      existingReport.potential_min !== undefined &&
      existingReport.potential_max !== undefined
    ) {
      const existingRange =
        existingReport.potential_max - existingReport.potential_min;
      const newRange =
        potentialMax && potentialMin ? potentialMax - potentialMin : Infinity;
      if (existingRange < newRange) {
        potentialMin = existingReport.potential_min;
        potentialMax = existingReport.potential_max;
        potentialEstimate = existingReport.potential_estimate;
      }
    }
  }

  // Generate trait scouting based on method and progress
  // Merge with existing traits
  const traitsScouted: Record<
    string,
    { value: number; confidence: ConfidenceLevel }
  > = existingReport?.traits_scouted || {};

  // Traits revealed based on method and progress
  if (
    scoutingProgress >= 30 &&
    (method === "combine" || method === "pro_day" || method === "workout")
  ) {
    // Physical traits are more visible at combine/pro day/workout
    for (const [trait, trueValue] of Object.entries(trueData.true_traits)) {
      if (["speed", "strength", "agility"].includes(trait.toLowerCase())) {
        const traitAccuracy = Math.min(
          accuracy + (method === "workout" ? 10 : 5),
          scoutingProgress
        );
        const traitRange = Math.max(3, Math.round((100 - traitAccuracy) / 6));
        const traitMin = Math.max(0, trueValue - traitRange);
        const traitMax = Math.min(100, trueValue + traitRange);
        const traitValue = random(traitMin, traitMax);
        const traitConfidence: ConfidenceLevel =
          traitAccuracy >= 80 && scoutingProgress >= 60
            ? "high"
            : traitAccuracy >= 60 && scoutingProgress >= 40
              ? "medium"
              : "low";

        // Only update if we don't have it or if new one is more accurate
        if (
          !traitsScouted[trait] ||
          (traitsScouted[trait].confidence === "low" &&
            traitConfidence !== "low")
        ) {
          traitsScouted[trait] = {
            value: traitValue,
            confidence: traitConfidence,
          };
        }
      }
    }
  } else if (scoutingProgress >= 40 && method === "tape") {
    // Tape reveals some traits but less accurately, needs more progress
    const tapeAccuracy = Math.min(accuracy - 5, scoutingProgress);
    for (const [trait, trueValue] of Object.entries(trueData.true_traits)) {
      if (Math.random() > 0.5) {
        // 50% chance to reveal trait from tape
        const traitRange = Math.max(5, Math.round((100 - tapeAccuracy) / 5));
        const traitMin = Math.max(0, trueValue - traitRange);
        const traitMax = Math.min(100, trueValue + traitRange);
        const traitValue = random(traitMin, traitMax);
        const traitConfidence: ConfidenceLevel =
          tapeAccuracy >= 75 && scoutingProgress >= 60
            ? "high"
            : tapeAccuracy >= 55 && scoutingProgress >= 40
              ? "medium"
              : "low";

        if (
          !traitsScouted[trait] ||
          (traitsScouted[trait].confidence === "low" &&
            traitConfidence !== "low")
        ) {
          traitsScouted[trait] = {
            value: traitValue,
            confidence: traitConfidence,
          };
        }
      }
    }
  }

  // Character assessment (only if character method or workout, and enough progress)
  let characterAssessment: Record<string, any> | undefined =
    existingReport?.character_assessment;
  if (
    scoutingProgress >= 50 &&
    (method === "character" || method === "team_interview" || method === "workout")
  ) {
    characterAssessment = {
      work_ethic:
        trueData.character?.work_ethic ||
        characterAssessment?.work_ethic ||
        "unknown",
      leadership:
        trueData.character?.leadership ||
        characterAssessment?.leadership ||
        "unknown",
      coachability:
        trueData.character?.coachability ||
        characterAssessment?.coachability ||
        "unknown",
    };
  }

  // Injury risk (only if medical method and enough progress)
  let injuryRisk = existingReport?.injury_risk;
  if (scoutingProgress >= 30 && method === "medical") {
    injuryRisk = assessInjuryRisk(trueData.injury_history);
  }

  // Scheme fit (only if tape/workout and enough progress)
  let schemeFit = existingReport?.scheme_fit;
  if (scoutingProgress >= 50 && (method === "tape" || method === "workout")) {
    schemeFit = trueData.scheme_fit;
  }

  // Scout notes - merge with existing or generate new
  let scoutNotes: string;
  if (scoutingProgress >= 10) {
    // At 10% progress, start generating basic notes
    const newNotes = generateScoutNotes(
      trueData,
      overallEstimate || trueData.true_overall,
      potentialEstimate || trueData.true_potential,
      confidenceLevel,
      staff
    );
    const existingNotes = existingReport?.scout_notes || "";
    if (existingNotes) {
      scoutNotes = `${existingNotes}\n\n${newNotes}`;
    } else {
      scoutNotes = newNotes;
    }
  } else if (scoutingProgress >= 1) {
    // At 1% progress (1 pt), just basic info
    scoutNotes =
      existingReport?.scout_notes ||
      `Initial scouting complete. Basic information gathered. More scouting needed for detailed assessment.`;
  } else {
    scoutNotes = existingReport?.scout_notes || "";
  }

  return {
    overall_min: overallMin,
    overall_max: overallMax,
    overall_estimate: overallEstimate,
    potential_min: potentialMin,
    potential_max: potentialMax,
    potential_estimate: potentialEstimate,
    accuracy_percentage: effectiveAccuracy,
    confidence_level: confidenceLevel,
    traits_scouted: traitsScouted,
    character_assessment: characterAssessment,
    injury_risk: injuryRisk,
    scheme_fit: schemeFit,
    scout_notes: scoutNotes,
  };
}

/**
 * Generate scout notes based on scouting data
 */
function generateScoutNotes(
  trueData: ProspectScoutingData,
  overallEstimate: number,
  potentialEstimate: number,
  confidence: ConfidenceLevel,
  _staff: ScoutingStaff
): string {
  const notes: string[] = [];

  // Overall assessment
  if (overallEstimate >= 85) {
    notes.push("Elite prospect with franchise-changing potential.");
  } else if (overallEstimate >= 75) {
    notes.push("Strong prospect with starter potential.");
  } else if (overallEstimate >= 65) {
    notes.push("Solid prospect, likely role player.");
  } else {
    notes.push("Depth prospect with limited upside.");
  }

  // Potential vs overall
  if (potentialEstimate > overallEstimate + 10) {
    notes.push(
      "High upside - could develop significantly with proper coaching."
    );
  } else if (potentialEstimate < overallEstimate - 5) {
    notes.push("Limited growth potential - may have already peaked.");
  }

  // Character concerns
  if (trueData.character) {
    if (trueData.character.work_ethic === "poor") {
      notes.push("⚠️ Work ethic concerns raised by college coaches.");
    }
    if (trueData.character.leadership === "excellent") {
      notes.push("Natural leader with strong intangibles.");
    }
  }

  // Injury concerns
  if (trueData.injury_history && trueData.injury_history.length > 2) {
    notes.push("⚠️ Multiple injury concerns in college career.");
  }

  // Scheme fit
  if (trueData.scheme_fit) {
    notes.push(`Scheme fit: ${trueData.scheme_fit}`);
  }

  // Confidence note
  if (confidence === "low") {
    notes.push("(Low confidence - needs more scouting)");
  }

  return notes.join(" ");
}

/**
 * Assess injury risk based on history
 */
function assessInjuryRisk(history?: string[]): "low" | "medium" | "high" {
  if (!history || history.length === 0) return "low";
  if (history.length >= 3) return "high";
  if (history.length >= 2) return "medium";
  return "low";
}

/**
 * Get scouting cost for a method
 */
export function getScoutingCost(method: ScoutingMethod): number {
  const costs: Record<ScoutingMethod, number> = {
    initial: 1,
    tape: 3,
    combine: 5,
    pro_day: 6,
    workout: 12,
    medical: 4,
    character: 3,
    team_interview: 3,
  };
  return costs[method] || 1;
}

/**
 * Get time required for scouting (in days)
 */
export function getScoutingTime(method: ScoutingMethod): number {
  const times: Record<ScoutingMethod, number> = {
    initial: 1,
    tape: 7,
    combine: 1, // Event-based
    pro_day: 1, // Event-based
    workout: 3,
    medical: 5,
    character: 3,
    team_interview: 3,
  };
  return times[method] || 1;
}

/**
 * Determine best scout for a prospect
 */
export function selectBestScout(
  staff: ScoutingStaff[],
  prospectPosition?: string,
  prospectRegion?: string
): ScoutingStaff | null {
  if (staff.length === 0) return null;

  // Score each scout
  const scored = staff.map((scout) => {
    let score = scout.scouting_accuracy;

    // Regional match
    if (scout.role === "regional" && scout.region && prospectRegion) {
      score += scout.region === prospectRegion ? 20 : -15;
    }

    // Position match
    if (scout.role === "position" && scout.specialty === prospectPosition) {
      score += 15;
    }

    // Role bonuses
    if (scout.role === "director") score += 10;
    if (scout.role === "national") score += 8;

    return { scout, score };
  });

  // Return highest scoring scout
  scored.sort((a, b) => b.score - a.score);
  return scored[0].scout;
}

/**
 * Calculate prospect region from college
 */
export function getProspectRegion(college?: string | null): string | undefined {
  if (!college) return undefined;

  const regionMap: Record<string, string> = {
    Alabama: "southeast",
    Georgia: "southeast",
    LSU: "southeast",
    "Florida State": "southeast",
    Miami: "southeast",
    Clemson: "southeast",
    "Ohio State": "midwest",
    Michigan: "midwest",
    Texas: "southwest",
    Oregon: "west_coast",
    USC: "west_coast",
    "Notre Dame": "midwest",
  };

  return regionMap[college] || undefined;
}
