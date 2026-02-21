import {
  GMProgressionState,
  GMSeasonResult,
  GMSpecialization,
  CoachProgressionState,
  CoachSeasonResult,
  CoachSpecialization,
  ScoutProgressionState,
  ScoutSeasonResult,
} from "./development-types";

// ==========================================
// GM Progression System
// ==========================================

export interface GMSeasonContext {
  season: number;
  teamWins: number;
  teamLosses: number;
  playoffResult?: "wild_card" | "divisional" | "conference" | "super_bowl_loss" | "champion";
  draftGrade: string; // A+, A, A-, B+, etc.
  draftPicks: {
    round: number;
    playerName: string;
    position: string;
    gradeVsExpectation: number; // -2 to +2 (missed badly to exceeded)
  }[];
  trades: {
    won: boolean;
    value: number; // Trade value differential
  }[];
  freeAgencyMoves: {
    playerName: string;
    value: number; // Good value = positive, overpay = negative
  }[];
  capSituation: {
    currentCap: number;
    usedCap: number;
    deadCap: number;
    futureFlexibility: number; // 0-100
  };
  ownerExpectations: "rebuild" | "compete" | "championship";
  ownerPatience: number; // 0-100
}

/**
 * Process a GM's season and update their skills
 */
export function processGMSeason(
  gm: GMProgressionState,
  context: GMSeasonContext
): GMSeasonResult {
  const skillChanges: GMSeasonResult["skillChanges"] = [];

  // ==========================================
  // Drafting Skill
  // ==========================================
  let draftingChange = 0;
  let hits = 0;
  let misses = 0;

  for (const pick of context.draftPicks) {
    if (pick.gradeVsExpectation >= 1) {
      hits++;
      draftingChange += 0.5 * (pick.round <= 3 ? 2 : 1); // Early round hits matter more
    } else if (pick.gradeVsExpectation <= -1) {
      misses++;
      draftingChange -= 0.8 * (pick.round <= 3 ? 2 : 1); // Early round misses hurt more
    }
  }

  // Draft grade bonus
  const gradeValue: Record<string, number> = {
    "A+": 3,
    A: 2,
    "A-": 1.5,
    "B+": 1,
    B: 0.5,
    "B-": 0,
    "C+": -0.5,
    C: -1,
    "C-": -1.5,
    "D+": -2,
    D: -2.5,
    "D-": -3,
    F: -4,
  };
  draftingChange += gradeValue[context.draftGrade] || 0;

  if (draftingChange !== 0) {
    skillChanges.push({
      skill: "drafting",
      change: Math.round(draftingChange * 10) / 10,
      reason:
        draftingChange > 0
          ? `Strong draft class with ${hits} hits`
          : `Disappointing draft with ${misses} misses`,
    });
  }

  // ==========================================
  // Trading Skill
  // ==========================================
  let tradingChange = 0;
  let tradeWins = 0;
  let tradeLosses = 0;

  for (const trade of context.trades) {
    if (trade.won) {
      tradeWins++;
      tradingChange += 1 + trade.value / 100;
    } else {
      tradeLosses++;
      tradingChange -= 1.5 + Math.abs(trade.value) / 80;
    }
  }

  if (tradingChange !== 0) {
    skillChanges.push({
      skill: "trading",
      change: Math.round(tradingChange * 10) / 10,
      reason:
        tradingChange > 0
          ? `Won ${tradeWins} trades this season`
          : `Lost ${tradeLosses} trades this season`,
    });
  }

  // ==========================================
  // Free Agency Skill
  // ==========================================
  let faChange = 0;
  for (const move of context.freeAgencyMoves) {
    faChange += move.value / 50; // Scale down
  }

  if (faChange !== 0) {
    skillChanges.push({
      skill: "freeAgency",
      change: Math.round(faChange * 10) / 10,
      reason:
        faChange > 0
          ? "Made value signings in free agency"
          : "Overpaid in free agency",
    });
  }

  // ==========================================
  // Cap Management Skill
  // ==========================================
  let capChange = 0;
  const capUsagePercent =
    (context.capSituation.usedCap / context.capSituation.currentCap) * 100;
  const deadCapPercent =
    (context.capSituation.deadCap / context.capSituation.currentCap) * 100;

  // Reward flexibility, punish dead cap
  capChange += context.capSituation.futureFlexibility / 50 - 1;
  if (deadCapPercent > 15) {
    capChange -= (deadCapPercent - 15) / 10;
  }

  if (Math.abs(capChange) > 0.3) {
    skillChanges.push({
      skill: "capManagement",
      change: Math.round(capChange * 10) / 10,
      reason:
        capChange > 0
          ? "Managed cap effectively with future flexibility"
          : `${deadCapPercent.toFixed(1)}% dead cap is hurting the team`,
    });
  }

  // ==========================================
  // Talent Evaluation (based on overall results)
  // ==========================================
  let evalChange = 0;
  // If team is winning with young cheap players, evaluation is good
  const winPercent = context.teamWins / (context.teamWins + context.teamLosses);
  if (winPercent > 0.6 && capUsagePercent < 90) {
    evalChange = 1.5;
  } else if (winPercent < 0.4 && capUsagePercent > 95) {
    evalChange = -1.5;
  }

  if (evalChange !== 0) {
    skillChanges.push({
      skill: "talentEvaluation",
      change: Math.round(evalChange * 10) / 10,
      reason:
        evalChange > 0
          ? "Getting production from cost-effective players"
          : "Expensive roster underperforming",
    });
  }

  // ==========================================
  // Apply changes to skills
  // ==========================================
  const newSkills = { ...gm.skills };
  for (const change of skillChanges) {
    newSkills[change.skill] = Math.max(
      30,
      Math.min(99, newSkills[change.skill] + change.change)
    );
  }

  // ==========================================
  // Job Security
  // ==========================================
  let ownerTrust = 50; // Base

  // Winning matters
  if (context.playoffResult === "champion") {
    ownerTrust = 95;
  } else if (context.playoffResult === "super_bowl_loss") {
    ownerTrust = 85;
  } else if (context.playoffResult === "conference") {
    ownerTrust = 80;
  } else if (context.playoffResult) {
    ownerTrust = 70;
  } else if (winPercent >= 0.6) {
    ownerTrust = 65;
  } else if (winPercent >= 0.5) {
    ownerTrust = 55;
  } else if (winPercent >= 0.4) {
    ownerTrust = 40;
  } else {
    ownerTrust = 25;
  }

  // Expectations matter
  if (context.ownerExpectations === "championship" && !context.playoffResult) {
    ownerTrust -= 20;
  } else if (
    context.ownerExpectations === "rebuild" &&
    winPercent < 0.5
  ) {
    ownerTrust += 10; // Expected
  }

  // Owner patience modifies
  ownerTrust = ownerTrust * (0.5 + context.ownerPatience / 200);

  const hotSeat = ownerTrust < 35;
  const fireRisk = Math.max(0, (35 - ownerTrust) * 3);

  // ==========================================
  // Specialization Progress
  // ==========================================
  let specializationProgress: GMSeasonResult["specializationProgress"];

  // Check for specialization unlocks
  if (gm.skills.drafting >= 85 && !gm.specializations.includes("draft_guru")) {
    specializationProgress = {
      specialization: "draft_guru",
      progress: 100,
      unlocked: true,
    };
  } else if (gm.skills.trading >= 85 && !gm.specializations.includes("trade_master")) {
    specializationProgress = {
      specialization: "trade_master",
      progress: 100,
      unlocked: true,
    };
  } else if (gm.skills.capManagement >= 85 && !gm.specializations.includes("cap_wizard")) {
    specializationProgress = {
      specialization: "cap_wizard",
      progress: 100,
      unlocked: true,
    };
  }

  return {
    gmId: gm.gmId,
    season: context.season,
    draftGrade: context.draftGrade,
    tradeValue: context.trades.reduce((sum, t) => sum + t.value, 0),
    capHealth: context.capSituation.futureFlexibility,
    teamWins: context.teamWins,
    skillChanges,
    specializationProgress,
    ownerTrust,
    hotSeat,
    fireRisk,
  };
}

// ==========================================
// Coach Progression System
// ==========================================

export interface CoachSeasonContext {
  season: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  playoffResult?: string;
  playerDevelopment: {
    playerId: string;
    playerName: string;
    position: string;
    ovrChange: number;
  }[];
  schemeEffectiveness: {
    offensiveRank: number; // 1-32
    defensiveRank: number;
    specialTeamsRank: number;
  };
  inGameDecisions: {
    challengeWinRate: number; // 0-1
    fourthDownSuccessRate: number;
    timeoutEfficiency: number; // 0-100
  };
  halftimeAdjustments: number; // -50 to +50 point differential 2nd half vs 1st
  closeGameRecord: { wins: number; losses: number };
  blowoutWins: number;
  blowoutLosses: number;
  gmRelationship: number; // 0-100
  ownerExpectations: "rebuild" | "compete" | "championship";
}

/**
 * Process a coach's season and update their skills
 */
export function processCoachSeason(
  coach: CoachProgressionState,
  context: CoachSeasonContext
): CoachSeasonResult {
  const skillChanges: CoachSeasonResult["skillChanges"] = [];

  // ==========================================
  // Game Management
  // ==========================================
  let gameManagementChange = 0;

  // Close games show management ability
  const closeGameWinRate =
    context.closeGameRecord.wins /
    (context.closeGameRecord.wins + context.closeGameRecord.losses || 1);
  if (closeGameWinRate > 0.6) {
    gameManagementChange += 2;
  } else if (closeGameWinRate < 0.4) {
    gameManagementChange -= 1.5;
  }

  // Blowout losses hurt
  if (context.blowoutLosses > 4) {
    gameManagementChange -= 1;
  }

  if (gameManagementChange !== 0) {
    skillChanges.push({
      skill: "gameManagement",
      change: Math.round(gameManagementChange * 10) / 10,
      reason:
        gameManagementChange > 0
          ? `Excelled in close games (${context.closeGameRecord.wins}-${context.closeGameRecord.losses})`
          : "Struggled in close games",
    });
  }

  // ==========================================
  // Player Development
  // ==========================================
  let developmentChange = 0;
  const bigImprovements = context.playerDevelopment.filter(
    (p) => p.ovrChange >= 3
  );
  const bigDeclines = context.playerDevelopment.filter((p) => p.ovrChange <= -3);

  developmentChange += bigImprovements.length * 0.8;
  developmentChange -= bigDeclines.length * 0.5;

  if (developmentChange !== 0) {
    skillChanges.push({
      skill: "playerDevelopment",
      change: Math.round(developmentChange * 10) / 10,
      reason:
        developmentChange > 0
          ? `${bigImprovements.length} players made significant jumps`
          : "Multiple players regressed",
    });
  }

  // ==========================================
  // Scheme Design
  // ==========================================
  let schemeChange = 0;

  // Top 10 offense or defense
  if (context.schemeEffectiveness.offensiveRank <= 10) {
    schemeChange += 1.5;
  } else if (context.schemeEffectiveness.offensiveRank >= 25) {
    schemeChange -= 1;
  }

  if (context.schemeEffectiveness.defensiveRank <= 10) {
    schemeChange += 1.5;
  } else if (context.schemeEffectiveness.defensiveRank >= 25) {
    schemeChange -= 1;
  }

  if (schemeChange !== 0) {
    skillChanges.push({
      skill: "schemeDesign",
      change: Math.round(schemeChange * 10) / 10,
      reason:
        schemeChange > 0
          ? "Scheme produced top-tier results"
          : "Scheme struggled to generate production",
    });
  }

  // ==========================================
  // Adjustments
  // ==========================================
  let adjustmentChange = 0;

  // Halftime adjustments
  if (context.halftimeAdjustments > 20) {
    adjustmentChange += 2;
  } else if (context.halftimeAdjustments > 5) {
    adjustmentChange += 1;
  } else if (context.halftimeAdjustments < -15) {
    adjustmentChange -= 1.5;
  }

  if (adjustmentChange !== 0) {
    skillChanges.push({
      skill: "adjustments",
      change: Math.round(adjustmentChange * 10) / 10,
      reason:
        adjustmentChange > 0
          ? `Strong halftime adjustments (+${context.halftimeAdjustments} point differential)`
          : "Team faded in second halves",
    });
  }

  // ==========================================
  // Clock Management
  // ==========================================
  let clockChange = 0;
  if (context.inGameDecisions.timeoutEfficiency > 75) {
    clockChange = 1.5;
  } else if (context.inGameDecisions.timeoutEfficiency < 40) {
    clockChange = -1;
  }

  if (clockChange !== 0) {
    skillChanges.push({
      skill: "clockManagement",
      change: Math.round(clockChange * 10) / 10,
      reason:
        clockChange > 0
          ? "Efficient use of timeouts and clock"
          : "Poor timeout and clock decisions",
    });
  }

  // ==========================================
  // Challenge Decisions
  // ==========================================
  let challengeChange = 0;
  if (context.inGameDecisions.challengeWinRate > 0.7) {
    challengeChange = 1.5;
  } else if (context.inGameDecisions.challengeWinRate < 0.4) {
    challengeChange = -1;
  }

  if (challengeChange !== 0) {
    skillChanges.push({
      skill: "challengeDecisions",
      change: Math.round(challengeChange * 10) / 10,
      reason:
        challengeChange > 0
          ? `${Math.round(context.inGameDecisions.challengeWinRate * 100)}% challenge success rate`
          : "Wasted challenges on low-probability calls",
    });
  }

  // ==========================================
  // Job Security
  // ==========================================
  const winPercent = context.wins / (context.wins + context.losses + context.ties);
  let gmTrust = context.gmRelationship;
  let ownerTrust = 50;

  if (context.playoffResult === "champion") {
    ownerTrust = 98;
  } else if (context.playoffResult) {
    ownerTrust = 70 + (context.playoffResult === "conference" ? 15 : 5);
  } else if (winPercent >= 0.6) {
    ownerTrust = 65;
  } else if (winPercent >= 0.5) {
    ownerTrust = 50;
  } else if (winPercent >= 0.375) {
    ownerTrust = 35;
  } else {
    ownerTrust = 20;
  }

  // Expectations matter
  if (context.ownerExpectations === "championship" && !context.playoffResult) {
    ownerTrust -= 25;
  }

  const hotSeat = ownerTrust < 35 || gmTrust < 35;
  const fireRisk = Math.max(0, (35 - Math.min(ownerTrust, gmTrust)) * 3);

  return {
    coachId: coach.coachId,
    season: context.season,
    wins: context.wins,
    losses: context.losses,
    pointsFor: context.pointsFor,
    pointsAgainst: context.pointsAgainst,
    playoffResult: context.playoffResult,
    skillChanges,
    developmentSuccesses: bigImprovements.map((p) => ({
      playerId: p.playerId,
      playerName: p.playerName,
      ovrImprovement: p.ovrChange,
    })),
    gmTrust,
    ownerTrust,
    hotSeat,
    fireRisk,
  };
}

// ==========================================
// Scout Progression System
// ==========================================

export interface ScoutSeasonContext {
  season: number;
  reportsSubmitted: {
    playerId: string;
    playerName: string;
    position: string;
    region: string;
    projectedRound: number;
    projectedOVR: number;
    characterGrade: string;
    actualDraftRound?: number;
    actualOVR?: number;
  }[];
  travelMiles: number;
  proScoutingEvents: number;
  collegeSessions: number;
  networkingEvents: number;
  specialAssignments?: {
    type: "deep_dive" | "regional_coverage" | "combine_work";
    success: boolean;
  }[];
}

/**
 * Process a scout's season and update their skills
 */
export function processScoutSeason(
  scout: ScoutProgressionState,
  context: ScoutSeasonContext
): ScoutSeasonResult {
  const skillChanges: ScoutSeasonResult["skillChanges"] = [];

  // Calculate accuracy
  const accuracyResults: ScoutSeasonResult["accuracyResults"] = [];
  let accurateCount = 0;
  let totalEvaluated = 0;

  for (const report of context.reportsSubmitted) {
    if (report.actualDraftRound !== undefined) {
      const roundDiff = Math.abs(report.projectedRound - report.actualDraftRound);
      const accurate = roundDiff <= 1;

      if (accurate) accurateCount++;
      totalEvaluated++;

      accuracyResults.push({
        playerId: report.playerId,
        projectedRound: report.projectedRound,
        actualRound: report.actualDraftRound,
        projectedOVR: report.projectedOVR,
        actualOVR: report.actualOVR || report.projectedOVR,
        accurate,
      });
    }
  }

  const accuracyRate = totalEvaluated > 0 ? accurateCount / totalEvaluated : 0;

  // ==========================================
  // Physical Evaluation
  // ==========================================
  let physicalChange = 0;
  // More reps = better evaluation
  physicalChange += Math.min(2, context.reportsSubmitted.length / 20);

  // Accuracy bonus
  if (accuracyRate > 0.7) {
    physicalChange += 1.5;
  } else if (accuracyRate < 0.4) {
    physicalChange -= 1;
  }

  if (physicalChange !== 0) {
    skillChanges.push({
      skill: "physicalEvaluation",
      change: Math.round(physicalChange * 10) / 10,
      reason:
        physicalChange > 0
          ? `${Math.round(accuracyRate * 100)}% accuracy on evaluations`
          : "Evaluations missed the mark",
    });
  }

  // ==========================================
  // Character Assessment
  // ==========================================
  let characterChange = 0;
  // Special assignments for character work
  const characterAssignments = context.specialAssignments?.filter(
    (a) => a.type === "deep_dive"
  );
  if (characterAssignments) {
    const successRate =
      characterAssignments.filter((a) => a.success).length /
      characterAssignments.length;
    characterChange = successRate > 0.6 ? 1.5 : -0.5;
  }

  if (characterChange !== 0) {
    skillChanges.push({
      skill: "characterAssessment",
      change: Math.round(characterChange * 10) / 10,
      reason:
        characterChange > 0
          ? "Deep dive assignments yielded accurate character reads"
          : "Character assessments proved inaccurate",
    });
  }

  // ==========================================
  // Networking
  // ==========================================
  let networkingChange = 0;
  if (context.networkingEvents > 10) {
    networkingChange = 1.5;
  } else if (context.networkingEvents > 5) {
    networkingChange = 0.8;
  }

  if (networkingChange !== 0) {
    skillChanges.push({
      skill: "networking",
      change: Math.round(networkingChange * 10) / 10,
      reason: `Attended ${context.networkingEvents} networking events`,
    });
  }

  // ==========================================
  // XP and Leveling
  // ==========================================
  let xpGained = 0;

  // Base XP from reports
  xpGained += context.reportsSubmitted.length * 50;

  // Bonus for accurate evaluations
  xpGained += accurateCount * 100;

  // Travel and events
  xpGained += Math.floor(context.travelMiles / 100);
  xpGained += context.proScoutingEvents * 75;
  xpGained += context.collegeSessions * 50;

  const newXP = scout.xp + xpGained;
  const leveledUp = newXP >= scout.xpToNextLevel;
  const newLevel = leveledUp ? scout.level + 1 : scout.level;

  // ==========================================
  // Job Security
  // ==========================================
  // Scouts rarely get fired unless really bad
  const fireRisk = accuracyRate < 0.3 && context.reportsSubmitted.length > 20 ? 25 : 0;

  // Promotion eligibility
  const promotionEligible =
    scout.level >= 5 &&
    accuracyRate >= 0.65 &&
    scout.yearsExperience >= 5;

  return {
    scoutId: scout.scoutId,
    season: context.season,
    reportsSubmitted: context.reportsSubmitted.length,
    playersEvaluated: context.reportsSubmitted.length,
    travelMiles: context.travelMiles,
    accuracyResults,
    skillChanges,
    xpGained,
    leveledUp,
    newLevel: leveledUp ? newLevel : undefined,
    promotionEligible,
    fireRisk,
  };
}

// ==========================================
// Experience-Based Improvements
// ==========================================

/**
 * Apply experience-based improvements during offseason
 */
export function applyExperienceGains(
  gm: GMProgressionState
): { skill: string; gain: number }[] {
  const gains: { skill: string; gain: number }[] = [];

  // GMs with more experience are more stable
  if (gm.yearsExperience >= 5) {
    // Learning from mistakes bonus
    if (gm.trackRecord.draftMisses > 3) {
      const gain = Math.min(2, gm.learningFromMistakes / 30);
      if (gain > 0) {
        gains.push({ skill: "drafting", gain });
      }
    }

    if (gm.trackRecord.tradeFlops > 2) {
      const gain = Math.min(1.5, gm.learningFromMistakes / 40);
      if (gain > 0) {
        gains.push({ skill: "trading", gain });
      }
    }
  }

  // Championship experience
  if (gm.trackRecord.championships > 0) {
    gains.push({ skill: "talentEvaluation", gain: 0.5 });
  }

  // Successful rebuilds teach patience
  if (gm.trackRecord.successfulRebuilds > 0) {
    gains.push({ skill: "schemeRecognition", gain: 1 });
  }

  return gains;
}

/**
 * Apply coach experience gains
 */
export function applyCoachExperienceGains(
  coach: CoachProgressionState
): { skill: string; gain: number }[] {
  const gains: { skill: string; gain: number }[] = [];

  // Veteran coaches learn from failures
  if (coach.yearsExperience >= 5 && coach.trackRecord.losses > 50) {
    gains.push({
      skill: "adjustments",
      gain: Math.min(2, coach.learnFromLosses / 25),
    });
  }

  // Championship pedigree
  if (coach.trackRecord.championships > 0) {
    gains.push({ skill: "gameManagement", gain: 1 });
    gains.push({ skill: "motivation", gain: 0.5 });
  }

  // Successful player development
  if (coach.trackRecord.playersDeveloped > 10) {
    gains.push({ skill: "playerDevelopment", gain: 1 });
  }

  // Bust reclamation projects
  if (coach.trackRecord.bustReclamations > 2) {
    gains.push({ skill: "playerDevelopment", gain: 1.5 });
  }

  return gains;
}
