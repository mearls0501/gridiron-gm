/**
 * Pro Scouting System
 * Evaluating current NFL players for trades and free agency
 */

import {
  NFLPlayer,
  calculateAgeAdjustedValue,
  projectRemainingYears,
  calculateMarketValue,
  POSITION_AGE_CURVES,
  POSITION_VALUE_MULTIPLIERS,
} from "../players/player-contracts";

// =============================================================================
// PRO SCOUT TYPES
// =============================================================================

export interface ProScout {
  id: string;
  name: string;
  teamId: string;

  // Specialization
  specialty: ProScoutSpecialty;
  regionFocus?: string[];       // AFC East, NFC West, etc.

  // Skill ratings
  evaluation: number;           // 0-100, accuracy of assessments
  schemeAnalysis: number;       // How well they assess fit
  medicalInsight: number;       // Injury evaluation skill
  characterJudgment: number;    // Locker room/personality reads
  contractExpertise: number;    // Value assessment accuracy

  // Experience
  yearsExperience: number;
  level: number;                // 1-10
  xp: number;

  // Track record
  successfulRecommendations: number;
  missedEvaluations: number;
}

export type ProScoutSpecialty =
  | "generalist"           // Jack of all trades
  | "scheme_analyst"       // Expert at fit analysis
  | "medical_expert"       // Former trainer, injury specialist
  | "cap_specialist"       // Contract/cap expert
  | "character_evaluator"  // Background/personality expert
  | "film_grinder"         // Deep tape study
  | "analytics_expert";    // Numbers-focused evaluation

// =============================================================================
// SCOUTING REPORT TYPES
// =============================================================================

export interface ProScoutingReport {
  id: string;
  playerId: string;
  playerName: string;
  position: string;
  currentTeam: string;

  scoutId: string;
  scoutName: string;
  teamId: string;

  // Core grades
  currentGrade: string;         // A+ to F
  overallScore: number;         // 0-100

  // Projections
  projectedDecline: "minimal" | "moderate" | "significant" | "rapid";
  yearsRemaining: number;
  peakYearsPassed: boolean;

  // Fit analysis
  schemeFit: number;            // 0-100
  schemeFitGrade: string;
  schemeNotes: string;
  bestFitScheme: string;

  // Value assessment
  currentCapHit?: number;
  fairMarketValue: number;
  isOverpaid: boolean;
  isUnderpaid: boolean;
  valueGrade: string;
  tradeValue: string;           // "1st rounder", "Day 2 pick", etc.

  // Risk factors
  injuryRisk: "low" | "medium" | "high" | "very_high";
  injuryConcerns: string[];
  durabilityScore: number;      // 0-100

  // Character evaluation
  characterGrade: string;
  leadershipScore: number;
  lockerRoomFit: "positive" | "neutral" | "concerning";
  characterNotes: string;
  redFlags: string[];

  // Strengths and weaknesses
  strengths: string[];
  weaknesses: string[];
  keyAttributes: Record<string, { value: number; grade: string }>;

  // Recommendation
  recommendation: "must_acquire" | "pursue" | "monitor" | "avoid";
  acquisitionMethod: "trade" | "free_agency" | "either";
  summary: string;
  confidenceLevel: number;      // 0-100

  // Metadata
  createdAt: Date;
  lastUpdated: Date;
  scoutingCost: number;         // Resources spent
}

// =============================================================================
// SCOUTING ACTIONS
// =============================================================================

export type ProScoutingAction =
  | "full_evaluation"           // Complete scouting report
  | "scheme_fit_analysis"       // Just scheme fit
  | "medical_investigation"     // Deep injury analysis
  | "character_check"           // Background/personality
  | "contract_analysis"         // Value assessment
  | "quick_look"                // Surface-level evaluation
  | "trade_target_study"        // Full study for trade
  | "fa_target_study";          // Full study for free agency

export interface ProScoutingActionConfig {
  type: ProScoutingAction;
  name: string;
  description: string;
  cost: number;                 // Scouting points
  duration: number;             // Days to complete
  revealsData: string[];        // What info is unlocked
  requiredSpecialty?: ProScoutSpecialty;
}

export const PRO_SCOUTING_ACTIONS: Record<ProScoutingAction, ProScoutingActionConfig> = {
  full_evaluation: {
    type: "full_evaluation",
    name: "Full Evaluation",
    description: "Complete scouting report covering all aspects",
    cost: 25,
    duration: 7,
    revealsData: ["overall", "scheme_fit", "character", "medical", "contract", "recommendation"],
  },
  scheme_fit_analysis: {
    type: "scheme_fit_analysis",
    name: "Scheme Fit Analysis",
    description: "Analyze how player fits your system",
    cost: 10,
    duration: 3,
    revealsData: ["scheme_fit", "scheme_notes"],
    requiredSpecialty: "scheme_analyst",
  },
  medical_investigation: {
    type: "medical_investigation",
    name: "Medical Investigation",
    description: "Deep dive into injury history and durability",
    cost: 15,
    duration: 4,
    revealsData: ["injury_risk", "injury_concerns", "durability"],
    requiredSpecialty: "medical_expert",
  },
  character_check: {
    type: "character_check",
    name: "Character Check",
    description: "Background and personality assessment",
    cost: 12,
    duration: 5,
    revealsData: ["character", "leadership", "locker_room", "red_flags"],
    requiredSpecialty: "character_evaluator",
  },
  contract_analysis: {
    type: "contract_analysis",
    name: "Contract Analysis",
    description: "Assess value relative to contract",
    cost: 8,
    duration: 2,
    revealsData: ["fair_value", "trade_value", "is_overpaid"],
    requiredSpecialty: "cap_specialist",
  },
  quick_look: {
    type: "quick_look",
    name: "Quick Look",
    description: "Surface-level evaluation",
    cost: 3,
    duration: 1,
    revealsData: ["overall", "basic_recommendation"],
  },
  trade_target_study: {
    type: "trade_target_study",
    name: "Trade Target Study",
    description: "Full analysis for potential trade acquisition",
    cost: 20,
    duration: 5,
    revealsData: ["overall", "scheme_fit", "trade_value", "contract", "recommendation"],
  },
  fa_target_study: {
    type: "fa_target_study",
    name: "Free Agent Study",
    description: "Full analysis for potential FA signing",
    cost: 18,
    duration: 5,
    revealsData: ["overall", "scheme_fit", "fair_value", "character", "recommendation"],
  },
};

// =============================================================================
// GRADE HELPERS
// =============================================================================

function scoreToGrade(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "B-";
  if (score >= 65) return "C+";
  if (score >= 60) return "C";
  if (score >= 55) return "C-";
  if (score >= 50) return "D+";
  if (score >= 45) return "D";
  if (score >= 40) return "D-";
  return "F";
}

function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// =============================================================================
// EVALUATION FUNCTIONS
// =============================================================================

/**
 * Calculate scheme fit based on player attributes and team scheme
 */
export function evaluateSchemeFit(
  player: NFLPlayer,
  teamScheme: TeamScheme,
  scout: ProScout
): { score: number; notes: string; bestFit: string } {
  // Base fit calculation
  let baseFit = 70; // Default decent fit

  // Position-specific scheme considerations
  const schemeFits: Record<string, Record<string, number>> = {
    QB: {
      west_coast: player.attributes?.shortAccuracy || 75,
      air_raid: player.attributes?.deepAccuracy || 75,
      spread: player.attributes?.mobility || 70,
      pro_style: player.attributes?.awareness || 75,
      run_heavy: player.attributes?.handoff || 70,
    },
    RB: {
      zone_run: player.attributes?.vision || 75,
      power_run: player.attributes?.power || 75,
      spread: player.attributes?.receiving || 70,
      west_coast: player.attributes?.receiving || 72,
    },
    WR: {
      west_coast: player.attributes?.routeRunning || 75,
      air_raid: player.speed,
      spread: player.agility,
      possession: player.attributes?.catching || 75,
    },
    CB: {
      man_coverage: player.agility,
      zone_coverage: player.attributes?.awareness || 70,
      press: player.strength,
    },
  };

  // Get position-specific fit if available
  const positionFits = schemeFits[player.position];
  if (positionFits && positionFits[teamScheme.offenseScheme]) {
    baseFit = positionFits[teamScheme.offenseScheme];
  } else if (positionFits && positionFits[teamScheme.defenseScheme]) {
    baseFit = positionFits[teamScheme.defenseScheme];
  }

  // Scout skill adjustment
  const scoutSkillMod = (scout.schemeAnalysis - 70) / 100;
  baseFit = baseFit + random(-5, 5) + (baseFit * scoutSkillMod * 0.1);
  baseFit = Math.max(30, Math.min(100, baseFit));

  // Generate notes
  const notes = generateSchemeFitNotes(player, Math.round(baseFit), teamScheme);

  // Determine best fit scheme
  let bestFit = teamScheme.offenseScheme;
  if (["DE", "DT", "LB", "CB", "S"].includes(player.position)) {
    bestFit = teamScheme.defenseScheme;
  }

  return { score: Math.round(baseFit), notes, bestFit };
}

function generateSchemeFitNotes(player: NFLPlayer, fitScore: number, scheme: TeamScheme): string {
  if (fitScore >= 85) {
    return `${player.name} is an ideal fit for your ${scheme.offenseScheme} offense. His skill set aligns perfectly with what you're trying to do.`;
  } else if (fitScore >= 70) {
    return `${player.name} can work in your system, though he may need some adjustment period. His strengths translate reasonably well.`;
  } else if (fitScore >= 55) {
    return `${player.name} isn't a natural fit for your scheme. You'd be asking him to do things outside his comfort zone.`;
  } else {
    return `${player.name} would struggle in your system. His skills don't match what you need.`;
  }
}

/**
 * Evaluate injury risk and durability
 */
export function evaluateInjuryRisk(
  player: NFLPlayer,
  scout: ProScout
): {
  risk: "low" | "medium" | "high" | "very_high";
  concerns: string[];
  durabilityScore: number;
} {
  let durability = player.personality.durability || 75;
  const concerns: string[] = [];

  // Check injury history
  const injuries = player.injuryStatus?.injuryHistory || [];

  if (injuries.length === 0) {
    durability += 10;
  } else {
    // Recent injuries matter more
    const recentInjuries = injuries.filter(i => i.season >= new Date().getFullYear() - 2);

    if (recentInjuries.length >= 3) {
      durability -= 20;
      concerns.push("Frequent recent injuries");
    } else if (recentInjuries.length >= 2) {
      durability -= 10;
      concerns.push("Has missed time recently");
    }

    // Severe injuries
    const severeInjuries = injuries.filter(i => i.severity === "severe" || i.gamessMissed >= 8);
    if (severeInjuries.length > 0) {
      durability -= 15;
      concerns.push(`History of serious injuries (${severeInjuries.map(i => i.type).join(", ")})`);
    }

    // Recurring injuries
    const injuryTypes = injuries.map(i => i.type);
    const recurring = injuryTypes.filter((type, i) => injuryTypes.indexOf(type) !== i);
    if (recurring.length > 0) {
      durability -= 10;
      concerns.push(`Recurring ${recurring[0]} issues`);
    }
  }

  // Position-based injury risk
  const highRiskPositions = ["RB", "WR", "CB"];
  if (highRiskPositions.includes(player.position)) {
    durability -= 5;
  }

  // Age factor
  const ageCurve = POSITION_AGE_CURVES[player.position];
  if (player.age > ageCurve?.declineStart) {
    durability -= 10;
    concerns.push("Age increases injury risk");
  }

  // Scout skill adjustment
  const scoutMod = (scout.medicalInsight - 70) / 200;
  durability = durability + random(-5, 5) + (durability * scoutMod);
  durability = Math.max(20, Math.min(100, durability));

  // Determine risk level
  let risk: "low" | "medium" | "high" | "very_high";
  if (durability >= 80) risk = "low";
  else if (durability >= 65) risk = "medium";
  else if (durability >= 45) risk = "high";
  else risk = "very_high";

  return { risk, concerns, durabilityScore: Math.round(durability) };
}

/**
 * Evaluate character and locker room fit
 */
export function evaluateCharacter(
  player: NFLPlayer,
  scout: ProScout
): {
  grade: string;
  leadershipScore: number;
  lockerRoomFit: "positive" | "neutral" | "concerning";
  notes: string;
  redFlags: string[];
} {
  const personality = player.personality;
  const redFlags: string[] = [];

  // Calculate leadership score
  let leadership = personality.leadership + random(-5, 5);
  leadership = Math.max(0, Math.min(100, leadership));

  // Calculate overall character score
  let characterScore = (
    personality.workEthic * 0.4 +
    personality.leadership * 0.3 +
    (personality.lockerRoomPresence === "positive" ? 85 :
     personality.lockerRoomPresence === "neutral" ? 65 : 40) * 0.3
  );

  // Check for red flags
  if (personality.lockerRoomPresence === "negative") {
    redFlags.push("Known locker room issues");
    characterScore -= 15;
  }
  if (personality.workEthic < 50) {
    redFlags.push("Questions about work ethic");
    characterScore -= 10;
  }
  if (personality.agentDifficulty === "hard") {
    redFlags.push("Agent known to be difficult in negotiations");
  }

  // Scout skill adjustment
  const scoutMod = (scout.characterJudgment - 70) / 100;
  characterScore = characterScore + random(-5, 5) + (characterScore * scoutMod * 0.1);
  characterScore = Math.max(30, Math.min(100, characterScore));

  // Determine locker room fit
  let lockerRoomFit: "positive" | "neutral" | "concerning";
  if (characterScore >= 75 && redFlags.length === 0) {
    lockerRoomFit = "positive";
  } else if (characterScore >= 55 && redFlags.length <= 1) {
    lockerRoomFit = "neutral";
  } else {
    lockerRoomFit = "concerning";
  }

  // Generate notes
  let notes: string;
  if (lockerRoomFit === "positive") {
    notes = `${player.name} is a high-character individual. Teammates and coaches speak highly of his professionalism and leadership.`;
  } else if (lockerRoomFit === "neutral") {
    notes = `${player.name} is generally well-regarded, though not considered a vocal leader. No major concerns.`;
  } else {
    notes = `There are some concerns about ${player.name}'s fit in the locker room. Worth doing more diligence before acquiring.`;
  }

  return {
    grade: scoreToGrade(characterScore),
    leadershipScore: Math.round(leadership),
    lockerRoomFit,
    notes,
    redFlags,
  };
}

/**
 * Assess contract value
 */
export function evaluateContractValue(
  player: NFLPlayer,
  scout: ProScout,
  currentSeason: number
): {
  fairValue: number;
  tradeValue: string;
  isOverpaid: boolean;
  isUnderpaid: boolean;
  valueGrade: string;
} {
  const fairValue = calculateMarketValue(player, currentSeason);
  const currentCapHit = player.contractStatus.contract?.yearlyDetails
    .find(y => y.year === currentSeason)?.capHit || 0;

  // Compare current contract to fair value
  let valueRatio = currentCapHit > 0 ? fairValue / currentCapHit : 1;

  // Scout skill adjustment for accuracy
  const scoutMod = (scout.contractExpertise - 70) / 200;
  valueRatio = valueRatio + (valueRatio * scoutMod * random(-1, 1) * 0.1);

  const isOverpaid = valueRatio < 0.8;
  const isUnderpaid = valueRatio > 1.2;

  // Determine trade value
  let tradeValue: string;
  const ageValue = calculateAgeAdjustedValue(player, currentSeason);
  const yearsLeft = projectRemainingYears(player);

  if (ageValue >= 90 && yearsLeft >= 3) {
    tradeValue = "Multiple 1sts";
  } else if (ageValue >= 85 && yearsLeft >= 2) {
    tradeValue = "1st round pick";
  } else if (ageValue >= 80 && yearsLeft >= 2) {
    tradeValue = "2nd round pick";
  } else if (ageValue >= 75) {
    tradeValue = "Day 2 pick (2nd-3rd)";
  } else if (ageValue >= 70) {
    tradeValue = "Mid-round pick (4th-5th)";
  } else if (ageValue >= 65) {
    tradeValue = "Late-round pick";
  } else {
    tradeValue = "Minimal (7th or swap)";
  }

  // Adjust if overpaid (negative asset)
  if (isOverpaid && currentCapHit > fairValue * 1.5) {
    tradeValue = "Salary dump (team may need to add picks)";
  }

  // Value grade
  let valueScore = 70;
  if (isUnderpaid) valueScore = 90;
  else if (isOverpaid) valueScore = 45;

  return {
    fairValue: Math.round(fairValue),
    tradeValue,
    isOverpaid,
    isUnderpaid,
    valueGrade: scoreToGrade(valueScore),
  };
}

/**
 * Generate strengths and weaknesses
 */
export function evaluateStrengthsWeaknesses(
  player: NFLPlayer
): { strengths: string[]; weaknesses: string[] } {
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  // Physical attributes
  if (player.speed >= 90) strengths.push("Elite speed");
  else if (player.speed < 70) weaknesses.push("Limited speed");

  if (player.strength >= 90) strengths.push("Exceptional strength");
  else if (player.strength < 65) weaknesses.push("Lacks physicality");

  if (player.agility >= 88) strengths.push("Outstanding agility");

  // Overall/experience
  if (player.overall >= 90) strengths.push("Elite overall talent");
  if (player.experience >= 8) strengths.push("Veteran savvy");
  if (player.experience <= 1) weaknesses.push("Limited experience");

  // Accolades
  if (player.allPros > 0) strengths.push(`${player.allPros}x All-Pro selection(s)`);
  if (player.proBowls >= 3) strengths.push(`${player.proBowls}x Pro Bowler`);

  // Age
  const ageCurve = POSITION_AGE_CURVES[player.position];
  if (player.age >= ageCurve?.cliff) {
    weaknesses.push("Past prime years");
  } else if (player.age >= ageCurve?.declineStart) {
    weaknesses.push("Beginning age-related decline");
  }

  // Durability
  if (player.personality.durability >= 85) strengths.push("Durable");
  else if (player.personality.durability < 60) weaknesses.push("Injury prone");

  // Character
  if (player.personality.leadership >= 85) strengths.push("Strong leader");
  if (player.personality.workEthic >= 90) strengths.push("Elite work ethic");

  return { strengths: strengths.slice(0, 5), weaknesses: weaknesses.slice(0, 4) };
}

/**
 * Determine overall recommendation
 */
export function determineRecommendation(
  overallScore: number,
  schemeFit: number,
  injuryRisk: string,
  characterScore: number,
  isOverpaid: boolean
): {
  recommendation: "must_acquire" | "pursue" | "monitor" | "avoid";
  method: "trade" | "free_agency" | "either";
} {
  let score = overallScore;

  // Scheme fit adjustment
  if (schemeFit >= 85) score += 5;
  else if (schemeFit < 60) score -= 10;

  // Injury risk adjustment
  if (injuryRisk === "very_high") score -= 15;
  else if (injuryRisk === "high") score -= 8;
  else if (injuryRisk === "low") score += 3;

  // Character adjustment
  if (characterScore < 50) score -= 10;

  // Value adjustment
  if (isOverpaid) score -= 10;

  // Determine recommendation
  let recommendation: "must_acquire" | "pursue" | "monitor" | "avoid";
  if (score >= 85) recommendation = "must_acquire";
  else if (score >= 70) recommendation = "pursue";
  else if (score >= 55) recommendation = "monitor";
  else recommendation = "avoid";

  // Determine method
  let method: "trade" | "free_agency" | "either" = "either";
  if (isOverpaid) method = "free_agency"; // Wait until contract expires
  // Could add more logic based on contract situation

  return { recommendation, method };
}

// =============================================================================
// MAIN REPORT GENERATION
// =============================================================================

export interface TeamScheme {
  offenseScheme: string;
  defenseScheme: string;
  teamNeeds: string[];
}

/**
 * Generate a complete pro scouting report
 */
export function generateProScoutingReport(
  player: NFLPlayer,
  scout: ProScout,
  teamScheme: TeamScheme,
  currentSeason: number
): ProScoutingReport {
  // Overall evaluation
  const ageAdjustedValue = calculateAgeAdjustedValue(player, currentSeason);
  const yearsRemaining = projectRemainingYears(player);

  // Component evaluations
  const schemeFitResult = evaluateSchemeFit(player, teamScheme, scout);
  const injuryResult = evaluateInjuryRisk(player, scout);
  const characterResult = evaluateCharacter(player, scout);
  const contractResult = evaluateContractValue(player, scout, currentSeason);
  const { strengths, weaknesses } = evaluateStrengthsWeaknesses(player);

  // Decline projection
  const ageCurve = POSITION_AGE_CURVES[player.position];
  let projectedDecline: "minimal" | "moderate" | "significant" | "rapid";
  if (player.age < ageCurve.declineStart - 2) projectedDecline = "minimal";
  else if (player.age < ageCurve.declineStart) projectedDecline = "moderate";
  else if (player.age < ageCurve.cliff) projectedDecline = "significant";
  else projectedDecline = "rapid";

  // Overall score (weighted)
  const overallScore = Math.round(
    ageAdjustedValue * 0.35 +
    schemeFitResult.score * 0.25 +
    injuryResult.durabilityScore * 0.15 +
    (characterResult.grade.startsWith("A") ? 90 :
     characterResult.grade.startsWith("B") ? 75 :
     characterResult.grade.startsWith("C") ? 60 : 45) * 0.1 +
    (contractResult.isUnderpaid ? 90 : contractResult.isOverpaid ? 50 : 70) * 0.15
  );

  // Recommendation
  const { recommendation, method } = determineRecommendation(
    overallScore,
    schemeFitResult.score,
    injuryResult.risk,
    characterResult.leadershipScore,
    contractResult.isOverpaid
  );

  // Generate summary
  const summary = generateReportSummary(player, recommendation, overallScore, yearsRemaining);

  // Confidence based on scout skill
  const confidenceLevel = Math.min(95, Math.round(
    (scout.evaluation + scout.schemeAnalysis + scout.medicalInsight + scout.characterJudgment) / 4
  ));

  return {
    id: `pro-report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    playerId: player.id,
    playerName: player.name,
    position: player.position,
    currentTeam: player.teamId || "Free Agent",

    scoutId: scout.id,
    scoutName: scout.name,
    teamId: scout.teamId,

    currentGrade: scoreToGrade(overallScore),
    overallScore,

    projectedDecline,
    yearsRemaining,
    peakYearsPassed: player.age >= ageCurve.peak,

    schemeFit: schemeFitResult.score,
    schemeFitGrade: scoreToGrade(schemeFitResult.score),
    schemeNotes: schemeFitResult.notes,
    bestFitScheme: schemeFitResult.bestFit,

    currentCapHit: player.contractStatus.contract?.yearlyDetails
      .find(y => y.year === currentSeason)?.capHit,
    fairMarketValue: contractResult.fairValue,
    isOverpaid: contractResult.isOverpaid,
    isUnderpaid: contractResult.isUnderpaid,
    valueGrade: contractResult.valueGrade,
    tradeValue: contractResult.tradeValue,

    injuryRisk: injuryResult.risk,
    injuryConcerns: injuryResult.concerns,
    durabilityScore: injuryResult.durabilityScore,

    characterGrade: characterResult.grade,
    leadershipScore: characterResult.leadershipScore,
    lockerRoomFit: characterResult.lockerRoomFit,
    characterNotes: characterResult.notes,
    redFlags: characterResult.redFlags,

    strengths,
    weaknesses,
    keyAttributes: {}, // Could populate with position-specific

    recommendation,
    acquisitionMethod: method,
    summary,
    confidenceLevel,

    createdAt: new Date(),
    lastUpdated: new Date(),
    scoutingCost: PRO_SCOUTING_ACTIONS.full_evaluation.cost,
  };
}

function generateReportSummary(
  player: NFLPlayer,
  recommendation: string,
  overallScore: number,
  yearsRemaining: number
): string {
  const positionValue = POSITION_VALUE_MULTIPLIERS[player.position] || 0.5;

  if (recommendation === "must_acquire") {
    return `${player.name} is a top-tier talent who would significantly upgrade your roster. ` +
      `With ${yearsRemaining} productive years remaining, he's worth aggressive pursuit. ` +
      `This is a rare opportunity to add a difference-maker.`;
  } else if (recommendation === "pursue") {
    return `${player.name} would be a solid addition to your team. ` +
      `He grades out well (${overallScore}/100) and has ${yearsRemaining} good years left. ` +
      `Worth pursuing at the right price.`;
  } else if (recommendation === "monitor") {
    return `${player.name} has some appeal but also carries concerns. ` +
      `Keep an eye on his situation, but don't overpay. ` +
      `Could be a value add in the right circumstances.`;
  } else {
    return `We recommend avoiding ${player.name} at this time. ` +
      `The combination of ${yearsRemaining <= 1 ? "limited remaining years" : "fit concerns"} ` +
      `and risk factors make this an unappealing acquisition target.`;
  }
}

export type { ProScout, ProScoutingReport, TeamScheme };
