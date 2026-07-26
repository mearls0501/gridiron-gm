// @ts-nocheck
/**
 * Recommendation System
 * Generates recommendations from Owner, Coach, and Scouts
 */

import {
  Owner,
  Coach,
  ScoutRelationship,
  Recommendation,
  RecommendedAction,
  RecommendationType,
  Disagreement,
  DisagreementParty,
} from "./relationship-types";

// =============================================================================
// DRAFT RECOMMENDATIONS
// =============================================================================

export interface DraftContext {
  pickNumber: number;
  round: number;
  teamNeeds: string[];
  availableProspects: ProspectInfo[];
}

export interface ProspectInfo {
  id: string;
  name: string;
  position: string;
  overall: number;
  potential: number;
  consensusRank: number;
  schemeFit: number;
  character: number;
  hometown?: string;
  college: string;
  isLocalProduct: boolean;
  hasStarPower: boolean;
  scoutGrades: Record<string, { grade: string; rank: number }>;
}

/**
 * Generate owner's draft recommendation
 */
export function generateOwnerDraftRecommendation(
  owner: Owner,
  context: DraftContext
): Recommendation | null {
  const { pickNumber, availableProspects } = context;

  // Owner only cares about high picks usually
  if (pickNumber > 50 && owner.involvement < 70) {
    return null;
  }

  let targetProspect: ProspectInfo | null = null;
  let reasoning = "";
  let confidence = 50;

  // Different owner types have different priorities
  switch (owner.type) {
    case "win_now":
      // Wants best immediate contributor
      targetProspect = availableProspects
        .sort((a, b) => b.overall - a.overall)[0];
      reasoning = `${targetProspect.name} can contribute right away. We need to win now.`;
      confidence = 75;
      break;

    case "big_spender":
    case "prestige":
      // Wants star power, marketable names
      targetProspect = availableProspects
        .filter(p => p.hasStarPower || p.consensusRank <= 10)
        .sort((a, b) => b.overall - a.overall)[0];
      if (targetProspect) {
        reasoning = `${targetProspect.name} is a name. He'll sell jerseys and put butts in seats.`;
        confidence = 70;
      }
      break;

    case "patient_builder":
      // Wants high potential
      targetProspect = availableProspects
        .sort((a, b) => b.potential - a.potential)[0];
      reasoning = `${targetProspect.name} has the highest ceiling. Building for the future.`;
      confidence = 65;
      break;

    case "meddler":
      // Has strong opinions, sometimes irrational
      // Might prefer local guy or "their guy"
      const localGuy = availableProspects.find(p => p.isLocalProduct);
      if (localGuy && pickNumber <= 32) {
        targetProspect = localGuy;
        reasoning = `${targetProspect.name} is a local kid. The fans would love it.`;
        confidence = 80;
      } else {
        targetProspect = availableProspects[Math.floor(Math.random() * Math.min(5, availableProspects.length))];
        reasoning = `I've been watching tape. ${targetProspect.name} is my guy.`;
        confidence = 60;
      }
      break;

    default:
      // Most owners just want good players
      if (pickNumber <= 20) {
        targetProspect = availableProspects
          .sort((a, b) => (b.overall + b.potential) / 2 - (a.overall + a.potential) / 2)[0];
        reasoning = `${targetProspect.name} looks like a franchise player.`;
        confidence = 55;
      }
  }

  if (!targetProspect) return null;

  return {
    id: `rec-owner-draft-${Date.now()}`,
    timestamp: new Date(),
    source: "owner",
    sourceId: owner.id,
    sourceName: owner.name,
    type: "draft_target",
    category: "personnel",
    action: {
      description: `Draft ${targetProspect.name}`,
      prospectId: targetProspect.id,
      prospectName: targetProspect.name,
      position: targetProspect.position,
    },
    reasoning,
    confidence,
    urgency: pickNumber <= 10 ? "high" : "medium",
    status: "pending",
  };
}

/**
 * Generate coach's draft recommendation
 */
export function generateCoachDraftRecommendation(
  coach: Coach,
  context: DraftContext
): Recommendation {
  const { teamNeeds, availableProspects } = context;

  // Score prospects based on coach preferences
  const scoredProspects = availableProspects.map(prospect => {
    let score = 0;

    // Scheme fit is huge for coaches
    score += prospect.schemeFit * (coach.traitPreferences.schemeFit / 100) * 2;

    // Position priority
    const posPriority = coach.positionPriorities[prospect.position] || 5;
    score += posPriority * 5;

    // Need bonus
    if (teamNeeds.includes(prospect.position)) {
      const needIndex = teamNeeds.indexOf(prospect.position);
      score += (10 - needIndex) * 3;
    }

    // Character matters to some coaches
    score += prospect.character * (coach.traitPreferences.character / 100);

    // Athleticism vs experience based on coach type
    if (coach.personality === "developer") {
      score += prospect.potential * 0.5;
    } else if (coach.personality === "old_school") {
      score += prospect.overall * 0.3;
    }

    return { prospect, score };
  });

  scoredProspects.sort((a, b) => b.score - a.score);
  const topPick = scoredProspects[0].prospect;

  // Generate reasoning based on why they like the player
  const reasons: string[] = [];
  if (topPick.schemeFit >= 80) {
    reasons.push("perfect fit for our system");
  }
  if (teamNeeds.slice(0, 2).includes(topPick.position)) {
    reasons.push("fills a critical need");
  }
  if (topPick.character >= 85) {
    reasons.push("high-character kid");
  }

  const reasoning = `${topPick.name} is ${reasons.length > 0 ? reasons.join(", ") : "a solid player"}. ` +
    `He fits what we're trying to do ${coach.offenseScheme ? "on offense" : "on defense"}.`;

  return {
    id: `rec-coach-draft-${Date.now()}`,
    timestamp: new Date(),
    source: "coach",
    sourceId: coach.id,
    sourceName: coach.name,
    type: "draft_target",
    category: "personnel",
    action: {
      description: `Draft ${topPick.name}`,
      prospectId: topPick.id,
      prospectName: topPick.name,
      position: topPick.position,
    },
    reasoning,
    confidence: Math.min(95, Math.round(scoredProspects[0].score)),
    urgency: "high",
    status: "pending",
  };
}

/**
 * Generate scout's draft recommendation
 */
export function generateScoutDraftRecommendation(
  scout: ScoutRelationship,
  scoutGrade: { grade: string; rank: number },
  prospect: ProspectInfo,
  allProspects: ProspectInfo[],
  context: DraftContext
): Recommendation {
  // Find scout's top-ranked available prospect
  const scoutRankedProspects = allProspects
    .filter(p => p.scoutGrades[scout.scoutId])
    .sort((a, b) => a.scoutGrades[scout.scoutId].rank - b.scoutGrades[scout.scoutId].rank);

  const topChoice = scoutRankedProspects[0];

  // Confidence based on how strongly they feel
  const rankDiff = topChoice.consensusRank - topChoice.scoutGrades[scout.scoutId].rank;
  let confidence = 70;
  if (Math.abs(rankDiff) > 15) {
    confidence = 85; // Strong conviction
  } else if (Math.abs(rankDiff) > 5) {
    confidence = 75;
  }

  // Modify based on relationship
  if (!scout.willingToShareOpinion) {
    confidence -= 10;
  }
  if (scout.isYesMan) {
    // Might just agree with consensus
    confidence -= 15;
  }

  let reasoning: string;
  if (rankDiff > 10) {
    reasoning = `${topChoice.name} is being undervalued. He's better than his ranking suggests. ` +
      `My tape shows a ${topChoice.scoutGrades[scout.scoutId].grade} grade.`;
  } else if (rankDiff < -10) {
    reasoning = `I know ${topChoice.name} is highly ranked, but I have concerns. ` +
      `Still our best option here though.`;
  } else {
    reasoning = `${topChoice.name} is the best player available at ${context.pickNumber}. ` +
      `Solid ${topChoice.scoutGrades[scout.scoutId].grade} grade.`;
  }

  return {
    id: `rec-scout-${scout.scoutId}-draft-${Date.now()}`,
    timestamp: new Date(),
    source: "scout",
    sourceId: scout.scoutId,
    sourceName: scout.scoutName,
    type: "draft_target",
    category: "personnel",
    action: {
      description: `Draft ${topChoice.name}`,
      prospectId: topChoice.id,
      prospectName: topChoice.name,
      position: topChoice.position,
    },
    reasoning,
    confidence,
    urgency: "high",
    status: "pending",
  };
}

// =============================================================================
// FREE AGENCY RECOMMENDATIONS
// =============================================================================

export interface FreeAgentContext {
  playerId: string;
  playerName: string;
  position: string;
  age: number;
  overall: number;
  marketValue: number;
  teamNeeds: string[];
  capSpace: number;
}

/**
 * Generate owner's FA recommendation
 */
export function generateOwnerFARecommendation(
  owner: Owner,
  context: FreeAgentContext
): Recommendation | null {
  const { playerName, position, overall, marketValue, capSpace } = context;

  // Owner might not care about mid-tier FAs
  if (overall < 80 && owner.involvement < 60) {
    return null;
  }

  let recommendation: "sign" | "pass" | null = null;
  let reasoning = "";
  let confidence = 50;

  // Check budget
  const willingness = owner.spendingWillingness;
  const canAfford = capSpace >= marketValue;

  if (overall >= 88) {
    // Star player - most owners want
    if (canAfford || willingness >= 70) {
      recommendation = "sign";
      reasoning = `${playerName} is a star. Get it done.`;
      confidence = 85;
    } else if (willingness < 40) {
      recommendation = "pass";
      reasoning = `${playerName} is too expensive. Find a cheaper option.`;
      confidence = 70;
    }
  } else if (owner.type === "penny_pincher") {
    if (marketValue > capSpace * 0.15) {
      recommendation = "pass";
      reasoning = `That's too much money for ${playerName}. Build through the draft.`;
      confidence = 80;
    }
  } else if (owner.type === "win_now") {
    if (overall >= 82) {
      recommendation = "sign";
      reasoning = `${playerName} helps us win now. Make it happen.`;
      confidence = 70;
    }
  }

  if (!recommendation) return null;

  return {
    id: `rec-owner-fa-${Date.now()}`,
    timestamp: new Date(),
    source: "owner",
    sourceId: owner.id,
    sourceName: owner.name,
    type: recommendation === "sign" ? "free_agent_sign" : "free_agent_avoid",
    category: "personnel",
    action: {
      description: recommendation === "sign" ? `Sign ${playerName}` : `Pass on ${playerName}`,
      playerId: context.playerId,
      playerName,
      position,
      contractValue: marketValue,
    },
    reasoning,
    confidence,
    urgency: overall >= 85 ? "high" : "medium",
    status: "pending",
  };
}

/**
 * Generate coach's FA recommendation
 */
export function generateCoachFARecommendation(
  coach: Coach,
  context: FreeAgentContext,
  schemeFit: number
): Recommendation {
  const { playerName, position, overall, age, teamNeeds } = context;

  let type: "want" | "need" | "okay" | "dont_want";
  let reasoning: string;
  let confidence: number;

  // Evaluate based on scheme fit and need
  const isNeed = teamNeeds.slice(0, 3).includes(position);
  const posPriority = coach.positionPriorities[position] || 5;

  if (schemeFit >= 85 && isNeed) {
    type = "need";
    reasoning = `${playerName} is exactly what we need. Perfect scheme fit and addresses a hole.`;
    confidence = 90;
  } else if (schemeFit >= 80 || (schemeFit >= 70 && isNeed)) {
    type = "want";
    reasoning = `I like ${playerName}. ${schemeFit >= 80 ? "Fits our system well" : "Fills a need"}.`;
    confidence = 75;
  } else if (schemeFit >= 60) {
    type = "okay";
    reasoning = `${playerName} could work, but he's not ideal for what we do.`;
    confidence = 55;
  } else {
    type = "dont_want";
    reasoning = `${playerName} doesn't fit our scheme. We'd be asking him to do things he can't.`;
    confidence = 70;
  }

  // Age concerns for certain coach types
  if (coach.personality === "developer" && age >= 30) {
    confidence -= 10;
    reasoning += " Also concerned about his age.";
  }

  return {
    id: `rec-coach-fa-${Date.now()}`,
    timestamp: new Date(),
    source: "coach",
    sourceId: coach.id,
    sourceName: coach.name,
    type: type === "dont_want" ? "free_agent_avoid" : "free_agent_sign",
    category: "personnel",
    action: {
      description: type === "dont_want" ? `Avoid ${playerName}` : `${type === "need" ? "Must sign" : "Consider"} ${playerName}`,
      playerId: context.playerId,
      playerName,
      position,
    },
    reasoning,
    confidence,
    urgency: type === "need" ? "high" : "medium",
    status: "pending",
  };
}

// =============================================================================
// DISAGREEMENT DETECTION
// =============================================================================

export interface RecommendationSet {
  owner?: Recommendation;
  coach?: Recommendation;
  scouts: Recommendation[];
}

/**
 * Detect disagreements between stakeholders
 */
export function detectDisagreements(
  recommendations: RecommendationSet,
  decisionType: string
): Disagreement | null {
  const parties: DisagreementParty[] = [];

  // Extract all unique recommendations
  const allRecs = [
    recommendations.owner,
    recommendations.coach,
    ...recommendations.scouts,
  ].filter(Boolean) as Recommendation[];

  if (allRecs.length < 2) return null;

  // Group by recommended action
  const byAction = new Map<string, Recommendation[]>();
  for (const rec of allRecs) {
    const key = rec.action.prospectId || rec.action.playerId || rec.action.description;
    if (!byAction.has(key)) {
      byAction.set(key, []);
    }
    byAction.get(key)!.push(rec);
  }

  // If everyone agrees, no disagreement
  if (byAction.size === 1) return null;

  // Build parties
  for (const rec of allRecs) {
    parties.push({
      source: rec.source,
      sourceId: rec.sourceId,
      sourceName: rec.sourceName,
      position: rec.action.description,
      reasoning: rec.reasoning,
      flexibility: rec.confidence < 70 ? 70 : 30, // Less confident = more flexible
    });
  }

  // Determine importance
  let importance: Disagreement["importance"] = "minor";
  if (decisionType.includes("draft") && recommendations.owner) {
    importance = "major"; // Owner involved in draft = big deal
  }
  if (byAction.size >= 3) {
    importance = "major"; // Everyone wants different things
  }
  if (allRecs.some(r => r.confidence >= 85)) {
    importance = "major"; // Someone feels very strongly
  }

  return {
    id: `disagree-${Date.now()}`,
    timestamp: new Date(),
    type: decisionType.includes("draft") ? "draft_pick" : "free_agent_priority",
    parties,
    importance,
    visibility: recommendations.owner ? "staff" : "private",
    resolved: false,
    reactions: [],
  };
}

/**
 * Get consensus recommendation (if any)
 */
export function findConsensus(recommendations: RecommendationSet): Recommendation | null {
  const allRecs = [
    recommendations.owner,
    recommendations.coach,
    ...recommendations.scouts,
  ].filter(Boolean) as Recommendation[];

  if (allRecs.length < 2) return allRecs[0] || null;

  // Group by recommended action
  const byAction = new Map<string, Recommendation[]>();
  for (const rec of allRecs) {
    const key = rec.action.prospectId || rec.action.playerId || rec.action.description;
    if (!byAction.has(key)) {
      byAction.set(key, []);
    }
    byAction.get(key)!.push(rec);
  }

  // Find majority
  let majority: Recommendation[] = [];
  for (const recs of byAction.values()) {
    if (recs.length > majority.length) {
      majority = recs;
    }
  }

  // Need at least 50% agreement for consensus
  if (majority.length >= allRecs.length / 2) {
    // Return highest confidence from majority
    return majority.sort((a, b) => b.confidence - a.confidence)[0];
  }

  return null;
}

/**
 * Generate "what if you ignore them" warning
 */
export function generateIgnoreWarning(
  recommendation: Recommendation
): string {
  const { source, sourceName, confidence } = recommendation;

  if (source === "owner" && confidence >= 70) {
    return `Warning: Ignoring ${sourceName}'s recommendation may affect your job security.`;
  }

  if (source === "coach" && confidence >= 80) {
    return `Warning: ${sourceName} feels strongly about this. Going against may create tension.`;
  }

  if (source === "scout" && confidence >= 85) {
    return `Warning: ${sourceName} has high conviction here. Ignoring may affect their morale.`;
  }

  return "";
}

export type {
  DraftContext,
  ProspectInfo,
  FreeAgentContext,
  RecommendationSet,
};
