/**
 * Relationship Effects System
 * Calculates effects of relationships on gameplay
 */

import {
  Owner,
  Coach,
  ScoutRelationship,
  SeatTemperature,
  RecommendationSource,
  StakeholderReaction,
  ReactionType,
} from "./relationship-types";

// =============================================================================
// OWNER RELATIONSHIP EFFECTS
// =============================================================================

export interface OwnerRelationshipEffects {
  // Autonomy
  autonomyLevel: "full" | "high" | "normal" | "limited" | "minimal";
  needsApprovalFor: string[];
  canOverrule: boolean;

  // Budget
  freeAgentBudgetMultiplier: number;  // 0.5 to 1.5
  scoutingBudgetMultiplier: number;
  facilitiesInvestment: "increasing" | "stable" | "decreasing";

  // Job security
  jobSecurity: SeatTemperature;
  contractSituation: "extension_likely" | "stable" | "not_renewed" | "firing_imminent";

  // Owner behavior
  publicSupport: boolean;
  meddlingLevel: "none" | "suggestions" | "pressure" | "demands" | "overrules";
  checkInFrequency: "rare" | "occasional" | "frequent" | "constant";

  // Special situations
  mandatedTargets: string[];          // Players owner wants
  forbiddenMoves: string[];           // Moves owner won't allow
  ownerFavorites: string[];           // Players owner loves (harder to trade)
}

/**
 * Calculate owner relationship effects
 */
export function calculateOwnerEffects(owner: Owner): OwnerRelationshipEffects {
  const trust = owner.trust;
  const satisfaction = owner.satisfaction;
  const combined = (trust + satisfaction) / 2;

  // Autonomy
  let autonomyLevel: OwnerRelationshipEffects["autonomyLevel"];
  let needsApprovalFor: string[] = [];

  if (combined >= 85) {
    autonomyLevel = "full";
  } else if (combined >= 70) {
    autonomyLevel = "high";
    needsApprovalFor = ["major_trades"];
  } else if (combined >= 55) {
    autonomyLevel = "normal";
    needsApprovalFor = ["major_trades", "big_fa_signings"];
  } else if (combined >= 40) {
    autonomyLevel = "limited";
    needsApprovalFor = ["major_trades", "big_fa_signings", "first_round_picks", "extensions"];
  } else {
    autonomyLevel = "minimal";
    needsApprovalFor = ["most_personnel_decisions"];
  }

  // Budget multipliers based on spending willingness and trust
  const baseMultiplier = 0.7 + (owner.spendingWillingness / 100) * 0.6;
  const trustBonus = (trust - 50) / 200; // -0.25 to +0.25
  const freeAgentBudgetMultiplier = Math.max(0.5, Math.min(1.5, baseMultiplier + trustBonus));

  const scoutingBudgetMultiplier = 0.8 + (trust / 100) * 0.4;

  // Job security
  let jobSecurity: SeatTemperature;
  if (combined >= 80) jobSecurity = "safe";
  else if (combined >= 65) jobSecurity = "stable";
  else if (combined >= 50) jobSecurity = "lukewarm";
  else if (combined >= 35) jobSecurity = "warm";
  else if (combined >= 20) jobSecurity = "hot";
  else jobSecurity = "ejection_seat";

  // Meddling based on owner type and involvement
  let meddlingLevel: OwnerRelationshipEffects["meddlingLevel"];
  const meddlingScore = owner.involvement - (trust / 2);

  if (owner.type === "hands_off" || meddlingScore < 20) {
    meddlingLevel = "none";
  } else if (meddlingScore < 40) {
    meddlingLevel = "suggestions";
  } else if (meddlingScore < 60) {
    meddlingLevel = "pressure";
  } else if (meddlingScore < 80) {
    meddlingLevel = "demands";
  } else {
    meddlingLevel = "overrules";
  }

  // Check-in frequency
  let checkInFrequency: OwnerRelationshipEffects["checkInFrequency"];
  if (combined >= 75 && owner.type !== "meddler") {
    checkInFrequency = "rare";
  } else if (combined >= 55) {
    checkInFrequency = "occasional";
  } else if (combined >= 35) {
    checkInFrequency = "frequent";
  } else {
    checkInFrequency = "constant";
  }

  return {
    autonomyLevel,
    needsApprovalFor,
    canOverrule: owner.involvement >= 70 && trust < 50,
    freeAgentBudgetMultiplier,
    scoutingBudgetMultiplier,
    facilitiesInvestment: satisfaction >= 70 ? "increasing" : satisfaction >= 40 ? "stable" : "decreasing",
    jobSecurity,
    contractSituation: combined >= 80 ? "extension_likely" :
                       combined >= 50 ? "stable" :
                       combined >= 30 ? "not_renewed" : "firing_imminent",
    publicSupport: satisfaction >= 50,
    meddlingLevel,
    checkInFrequency,
    mandatedTargets: [],  // Would be populated from owner mandates
    forbiddenMoves: [],
    ownerFavorites: [],
  };
}

// =============================================================================
// COACH RELATIONSHIP EFFECTS
// =============================================================================

export interface CoachRelationshipEffects {
  // Player development
  rookieDevelopmentModifier: number;    // -20% to +20%
  veteranDevelopmentModifier: number;
  schemeLearnSpeed: number;             // 0.5 to 1.5

  // Performance
  schemeEffectivenessModifier: number;  // -15% to +15%
  gameplanQuality: number;              // 0-100
  halftimeAdjustmentBonus: number;

  // Locker room
  lockerRoomUnity: number;              // 0-100
  playerConfusion: boolean;             // Mixed messages
  coachCredibility: number;             // 0-100

  // Coordination
  draftsNonFitsWillingly: boolean;
  developNonFits: boolean;
  honestFeedback: boolean;
  schemeAdjustsToRoster: boolean;

  // Public
  unitedFront: boolean;
  mediaLeaks: boolean;
  publicBackstabbing: boolean;
}

/**
 * Calculate coach relationship effects
 */
export function calculateCoachEffects(coach: Coach): CoachRelationshipEffects {
  const trust = coach.trustInGM;
  const respect = coach.respectForGM;
  const alignment = coach.alignmentWithGM;
  const combined = (trust + respect + alignment) / 3;

  // Development modifiers
  const baseDevelopment = coach.playerDevelopment;
  const relationshipMod = (combined - 50) / 250; // -0.2 to +0.2
  const rookieDevelopmentModifier = relationshipMod + (coach.rookieIntegration - 50) / 500;
  const veteranDevelopmentModifier = relationshipMod + (coach.veteranManagement - 50) / 500;

  // Scheme effectiveness
  const schemeBase = 1.0;
  const alignmentMod = (alignment - 50) / 333; // -0.15 to +0.15
  const schemeEffectivenessModifier = alignmentMod;

  // Locker room
  let lockerRoomUnity = 70;
  if (combined >= 80) lockerRoomUnity = 90;
  else if (combined >= 60) lockerRoomUnity = 75;
  else if (combined >= 40) lockerRoomUnity = 55;
  else lockerRoomUnity = 35;

  // Adjust for public disagreements
  lockerRoomUnity -= coach.publicDisagreements * 5;
  lockerRoomUnity = Math.max(10, Math.min(100, lockerRoomUnity));

  // Player confusion when GM and coach don't align
  const playerConfusion = alignment < 50 && coach.publicDisagreements > 2;

  // Coordination
  const draftsNonFitsWillingly = trust >= 60 || coach.schemeFlexibility >= 70;
  const developNonFits = coach.schemeFlexibility >= 60 && trust >= 50;
  const honestFeedback = trust >= 50 && respect >= 50;
  const schemeAdjustsToRoster = coach.schemeFlexibility >= 50 && alignment >= 40;

  // Public relations
  const unitedFront = combined >= 60 && coach.publicDisagreements <= 1;
  const mediaLeaks = trust < 40 && coach.mediaPresence !== "reserved";
  const publicBackstabbing = trust < 25 && respect < 30;

  return {
    rookieDevelopmentModifier: Math.round(rookieDevelopmentModifier * 100) / 100,
    veteranDevelopmentModifier: Math.round(veteranDevelopmentModifier * 100) / 100,
    schemeLearnSpeed: 0.75 + (alignment / 200) + (coach.schemeComplexity < 50 ? 0.1 : -0.1),
    schemeEffectivenessModifier: Math.round(schemeEffectivenessModifier * 100) / 100,
    gameplanQuality: Math.round(combined * 0.3 + coach.leagueReputation * 0.4 + coach.gameManagement * 0.3),
    halftimeAdjustmentBonus: Math.round((coach.halftimeAdjustments - 50) / 10),
    lockerRoomUnity,
    playerConfusion,
    coachCredibility: Math.round((trust + respect) / 2),
    draftsNonFitsWillingly,
    developNonFits,
    honestFeedback,
    schemeAdjustsToRoster,
    unitedFront,
    mediaLeaks,
    publicBackstabbing,
  };
}

// =============================================================================
// SCOUT RELATIONSHIP EFFECTS
// =============================================================================

export interface ScoutRelationshipEffects {
  // Report quality
  reportQuality: "minimal" | "standard" | "detailed" | "exceptional";
  includesGutFeelings: boolean;
  admitsUncertainty: boolean;
  flagsCharacterIssues: boolean;
  hiddenGemChance: number;          // % chance to find late round steals

  // Effort and accuracy
  effortLevel: number;              // 0-100
  accuracyModifier: number;         // -10% to +10%
  extraWorkWillingness: boolean;

  // Communication
  biasLevel: number;                // How much they tell you what you want
  pushesBackOnBadIdeas: boolean;
  sharesIntelFreely: boolean;

  // Retention
  quittingRisk: number;             // 0-100
  poisoningTheWell: boolean;        // Negatively influencing other scouts
}

/**
 * Calculate scout relationship effects
 */
export function calculateScoutEffects(scout: ScoutRelationship): ScoutRelationshipEffects {
  const combined = (scout.trust + scout.respect + scout.morale) / 3;

  // Report quality
  let reportQuality: ScoutRelationshipEffects["reportQuality"];
  if (combined >= 85) reportQuality = "exceptional";
  else if (combined >= 70) reportQuality = "detailed";
  else if (combined >= 50) reportQuality = "standard";
  else reportQuality = "minimal";

  // Effort and extras
  const effortLevel = Math.min(100, scout.morale + (scout.loyalty / 2));
  const includesGutFeelings = scout.trust >= 70 && scout.willingToShareOpinion;
  const admitsUncertainty = scout.honesty >= 70 && scout.respect >= 60;
  const flagsCharacterIssues = scout.honesty >= 60;

  // Hidden gem chance (better scouts who like you find more)
  const hiddenGemChance = Math.round(
    (combined / 100) * 10 + (scout.trust >= 80 ? 5 : 0)
  );

  // Accuracy
  const accuracyModifier = (combined - 50) / 500; // -0.1 to +0.1

  // Bias (yes-men tell you what you want)
  const biasLevel = scout.isYesMan ? 70 : Math.max(0, 50 - scout.honesty);

  // Communication
  const pushesBackOnBadIdeas = scout.willingToPushBack && scout.respect >= 50;
  const sharesIntelFreely = scout.trust >= 60 && scout.morale >= 50;

  // Retention risks
  const quittingRisk = Math.min(100, Math.max(0,
    100 - scout.loyalty - (scout.morale / 2) + (scout.flightRisk / 2)
  ));
  const poisoningTheWell = scout.morale < 30 && scout.respect < 30;

  return {
    reportQuality,
    includesGutFeelings,
    admitsUncertainty,
    flagsCharacterIssues,
    hiddenGemChance,
    effortLevel: Math.round(effortLevel),
    accuracyModifier: Math.round(accuracyModifier * 100) / 100,
    extraWorkWillingness: scout.morale >= 60 && scout.loyalty >= 50,
    biasLevel: Math.round(biasLevel),
    pushesBackOnBadIdeas,
    sharesIntelFreely,
    quittingRisk: Math.round(quittingRisk),
    poisoningTheWell,
  };
}

// =============================================================================
// REACTION GENERATION
// =============================================================================

/**
 * Generate reaction to a decision
 */
export function generateReaction(
  source: RecommendationSource,
  sourceId: string,
  sourceName: string,
  decision: string,
  theirRecommendation: string,
  agreed: boolean,
  outcome?: "success" | "failure" | "pending"
): StakeholderReaction {
  let reaction: ReactionType;
  let trustChange = 0;
  let respectChange = 0;
  let satisfactionChange = 0;
  let message = "";

  if (agreed) {
    // You followed their advice
    if (outcome === "success") {
      reaction = "enthusiastic";
      trustChange = 8;
      respectChange = 5;
      satisfactionChange = 10;
      message = `Great call on ${decision}. This is why we work well together.`;
    } else if (outcome === "failure") {
      reaction = "disappointed";
      trustChange = -2;
      respectChange = 0;
      satisfactionChange = -5;
      message = `${decision} didn't work out. Not sure what went wrong.`;
    } else {
      reaction = "supportive";
      trustChange = 3;
      respectChange = 2;
      satisfactionChange = 3;
      message = `Glad you went with my recommendation on ${decision}.`;
    }
  } else {
    // You went against their advice
    if (outcome === "success") {
      reaction = "accepting";
      trustChange = 2;
      respectChange = 5;
      satisfactionChange = 0;
      message = `I had my doubts about ${decision}, but you proved me wrong. Nice job.`;
    } else if (outcome === "failure") {
      reaction = "frustrated";
      trustChange = -10;
      respectChange = -5;
      satisfactionChange = -8;
      message = `I told you ${theirRecommendation} was the right call. ${decision} was a mistake.`;
    } else {
      reaction = "neutral";
      trustChange = -2;
      respectChange = 0;
      satisfactionChange = -2;
      message = `You went a different direction on ${decision}. We'll see how it plays out.`;
    }
  }

  // Adjust based on source type
  if (source === "owner") {
    // Owners have stronger reactions
    trustChange = Math.round(trustChange * 1.3);
    satisfactionChange = Math.round(satisfactionChange * 1.5);
  } else if (source === "scout") {
    // Scouts care more about being heard than being right
    respectChange = Math.round(respectChange * 1.2);
  }

  return {
    source,
    sourceId,
    sourceName,
    reaction,
    isPublic: reaction === "furious" || (reaction === "frustrated" && Math.random() < 0.3),
    message,
    trustChange,
    respectChange,
    satisfactionChange,
  };
}

/**
 * Get reaction severity message templates
 */
export function getReactionMessage(
  reaction: ReactionType,
  context: string,
  sourceName: string
): string {
  const templates: Record<ReactionType, string[]> = {
    enthusiastic: [
      `${sourceName} is thrilled with the ${context} decision.`,
      `"This is exactly what we needed!" - ${sourceName}`,
      `${sourceName} can't stop praising your ${context} move.`,
    ],
    supportive: [
      `${sourceName} supports your ${context} decision.`,
      `${sourceName} nods approvingly at the ${context} choice.`,
      `"Good call." - ${sourceName} on ${context}`,
    ],
    accepting: [
      `${sourceName} accepts the ${context} decision, though had reservations.`,
      `${sourceName} is willing to see how ${context} plays out.`,
      `"Not what I would have done, but okay." - ${sourceName}`,
    ],
    neutral: [
      `${sourceName} had no strong feelings about ${context}.`,
      `${sourceName} shrugs at the ${context} decision.`,
      `"Whatever you think is best." - ${sourceName}`,
    ],
    disappointed: [
      `${sourceName} is disappointed with the ${context} decision.`,
      `${sourceName} expected a different ${context} outcome.`,
      `"I thought we were on the same page..." - ${sourceName}`,
    ],
    frustrated: [
      `${sourceName} is visibly frustrated after ${context}.`,
      `${sourceName} questions the ${context} decision.`,
      `"I don't understand the logic here." - ${sourceName}`,
    ],
    angry: [
      `${sourceName} is angry about ${context}.`,
      `${sourceName} storms out after the ${context} discussion.`,
      `"This is a mistake!" - ${sourceName}`,
    ],
    furious: [
      `${sourceName} is furious about ${context}. This could damage your relationship.`,
      `${sourceName} has lost faith in your judgment after ${context}.`,
      `"I can't work like this." - ${sourceName}`,
    ],
    resigned: [
      `${sourceName} seems resigned about ${context}.`,
      `${sourceName} has stopped arguing about ${context}.`,
      `"Do what you want." - ${sourceName}`,
    ],
  };

  const options = templates[reaction];
  return options[Math.floor(Math.random() * options.length)];
}

// =============================================================================
// RELATIONSHIP CHANGE CALCULATIONS
// =============================================================================

export interface RelationshipChange {
  entityType: "owner" | "coach" | "scout";
  entityId: string;
  entityName: string;
  field: "trust" | "respect" | "satisfaction" | "morale" | "loyalty";
  previousValue: number;
  change: number;
  newValue: number;
  reason: string;
}

/**
 * Apply relationship changes with bounds checking
 */
export function applyRelationshipChange(
  currentValue: number,
  change: number,
  min: number = 0,
  max: number = 100
): number {
  return Math.max(min, Math.min(max, currentValue + change));
}

/**
 * Calculate compound relationship change from multiple events
 */
export function calculateCompoundChange(
  changes: number[],
  diminishingReturns: boolean = true
): number {
  if (changes.length === 0) return 0;

  if (!diminishingReturns) {
    return changes.reduce((sum, c) => sum + c, 0);
  }

  // Sort by absolute value (apply biggest changes first)
  const sorted = [...changes].sort((a, b) => Math.abs(b) - Math.abs(a));

  let total = 0;
  let multiplier = 1.0;

  for (const change of sorted) {
    total += change * multiplier;
    multiplier *= 0.7; // Each subsequent change has 70% effect
  }

  return Math.round(total);
}

/**
 * Decay relationships over time (entropy)
 */
export function applyRelationshipDecay(
  value: number,
  baseline: number,
  decayRate: number = 0.02
): number {
  // Relationships drift toward a baseline over time
  if (value > baseline) {
    return Math.max(baseline, value - (value - baseline) * decayRate);
  } else if (value < baseline) {
    return Math.min(baseline, value + (baseline - value) * decayRate);
  }
  return value;
}

export type {
  OwnerRelationshipEffects,
  CoachRelationshipEffects,
  ScoutRelationshipEffects,
  RelationshipChange,
};
