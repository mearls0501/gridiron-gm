/**
 * CPU Team Scouting AI
 * Intelligent scouting behavior for AI-controlled teams
 */

import { random } from "@/lib/utils";
import { Scout, ScoutArchetype, PriorityLevel } from "./types";
import { ProspectTrueData, ScoutingResult, performInitialScouting, performGameTapeReview, performCombine, performInterview, performMedical } from "./engine";

export interface CPUTeam {
  id: string;
  name: string;
  scouts: Scout[];
  scoutingBudget: number; // Weekly points available
  draftPicks: number[];
  positionNeeds: { position: string; priority: "critical" | "high" | "medium" | "low" }[];
  philosophy: CPUScoutingPhilosophy;
}

export interface CPUScoutingPhilosophy {
  riskTolerance: "aggressive" | "balanced" | "conservative";
  focusArea: "best_available" | "need_based" | "balanced";
  scoutingDepth: "shallow" | "medium" | "deep"; // How many prospects they scout
  roundFocus: number[]; // Which rounds they focus on (e.g., [1, 2] = only early rounds)
}

export interface CPUScoutingAction {
  teamId: string;
  scoutId: string;
  prospectId: string;
  actionType: "initial" | "game_tape" | "combine" | "interview" | "medical";
  week: number;
  priority: PriorityLevel;
}

export interface CPUScoutingPlan {
  teamId: string;
  weeklyActions: CPUScoutingAction[];
  targetProspects: { prospectId: string; priority: "must_scout" | "should_scout" | "optional" }[];
  bigBoard: { prospectId: string; rank: number; scoutingLevel: number }[];
}

/**
 * Generate CPU team scouting philosophy based on team characteristics
 */
export function generateCPUPhilosophy(
  teamWins: number,
  teamCapSpace: number,
  hasQB: boolean
): CPUScoutingPhilosophy {
  // Bad teams are more aggressive, good teams more conservative
  let riskTolerance: CPUScoutingPhilosophy["riskTolerance"] = "balanced";
  if (teamWins <= 4) riskTolerance = "aggressive";
  else if (teamWins >= 11) riskTolerance = "conservative";

  // Teams with cap space focus on BPA, tight teams focus on needs
  let focusArea: CPUScoutingPhilosophy["focusArea"] = "balanced";
  if (teamCapSpace > 50000000) focusArea = "best_available";
  else if (teamCapSpace < 15000000) focusArea = "need_based";

  // Bad teams scout deeper into the draft
  let scoutingDepth: CPUScoutingPhilosophy["scoutingDepth"] = "medium";
  if (teamWins <= 5) scoutingDepth = "deep";
  else if (teamWins >= 10) scoutingDepth = "shallow";

  // Determine round focus based on draft position
  const roundFocus = teamWins <= 4 ? [1, 2, 3] : teamWins <= 8 ? [1, 2, 3, 4] : [2, 3, 4, 5];

  return { riskTolerance, focusArea, scoutingDepth, roundFocus };
}

/**
 * Determine which prospects a CPU team should target for scouting
 */
export function generateTargetProspects(
  team: CPUTeam,
  allProspects: { id: string; position: string; consensusRank: number; overall: number }[],
  currentWeek: number
): { prospectId: string; priority: "must_scout" | "should_scout" | "optional" }[] {
  const targets: { prospectId: string; priority: "must_scout" | "should_scout" | "optional" }[] = [];

  // Get team's draft range
  const earliestPick = Math.min(...team.draftPicks);
  const latestPick = Math.max(...team.draftPicks);

  // Define scouting range based on philosophy
  const rangeExpansion = team.philosophy.scoutingDepth === "deep" ? 40 :
                         team.philosophy.scoutingDepth === "medium" ? 25 : 15;

  const minRank = Math.max(1, earliestPick - rangeExpansion);
  const maxRank = latestPick + rangeExpansion;

  // Get critical needs
  const criticalNeeds = team.positionNeeds
    .filter(n => n.priority === "critical" || n.priority === "high")
    .map(n => n.position);

  for (const prospect of allProspects) {
    // Skip if way outside our range
    if (prospect.consensusRank < minRank - 20 || prospect.consensusRank > maxRank + 20) {
      continue;
    }

    let priority: "must_scout" | "should_scout" | "optional" = "optional";

    // Must scout: Top prospects near our picks + critical needs
    if (prospect.consensusRank >= earliestPick - 10 && prospect.consensusRank <= earliestPick + 15) {
      priority = "must_scout";
    } else if (criticalNeeds.includes(prospect.position) && prospect.consensusRank <= maxRank) {
      priority = team.philosophy.focusArea === "need_based" ? "must_scout" : "should_scout";
    } else if (prospect.consensusRank >= minRank && prospect.consensusRank <= maxRank) {
      priority = "should_scout";
    }

    if (priority !== "optional" || Math.random() < 0.2) {
      targets.push({ prospectId: prospect.id, priority });
    }
  }

  // Limit total targets based on depth
  const maxTargets = team.philosophy.scoutingDepth === "deep" ? 80 :
                     team.philosophy.scoutingDepth === "medium" ? 50 : 30;

  return targets
    .sort((a, b) => {
      const priorityOrder = { must_scout: 0, should_scout: 1, optional: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, maxTargets);
}

/**
 * Generate weekly scouting actions for a CPU team
 */
export function generateWeeklyActions(
  team: CPUTeam,
  targetProspects: { prospectId: string; priority: "must_scout" | "should_scout" | "optional" }[],
  alreadyScoutedActions: Map<string, Set<string>>, // prospectId -> Set of completed action types
  currentWeek: number,
  phase: "regular_season" | "bowl_season" | "senior_bowl" | "combine" | "pro_days" | "pre_draft"
): CPUScoutingAction[] {
  const actions: CPUScoutingAction[] = [];
  let remainingBudget = team.scoutingBudget;

  // Cost of each action
  const actionCosts: Record<string, number> = {
    initial: 1,
    game_tape: 3,
    combine: 5,
    interview: 3,
    medical: 4,
  };

  // Available actions by phase
  const phaseActions: Record<string, string[]> = {
    regular_season: ["initial", "game_tape"],
    bowl_season: ["initial", "game_tape"],
    senior_bowl: ["initial", "game_tape", "interview"],
    combine: ["combine", "interview", "medical"],
    pro_days: ["combine", "interview"],
    pre_draft: ["interview", "medical"],
  };

  const availableActionTypes = phaseActions[phase] || ["initial"];

  // Sort prospects by priority and target them
  const prioritizedProspects = [...targetProspects].sort((a, b) => {
    const order = { must_scout: 0, should_scout: 1, optional: 2 };
    return order[a.priority] - order[b.priority];
  });

  // Assign scouts to prospects
  const scoutAssignments = new Map<string, Scout>();
  for (const scout of team.scouts) {
    // Each scout can handle ~5-8 prospects efficiently
    const unassignedPriority = prioritizedProspects
      .filter(p => !scoutAssignments.has(p.prospectId))
      .slice(0, 6);

    for (const target of unassignedPriority) {
      scoutAssignments.set(target.prospectId, scout);
    }
  }

  // Generate actions
  for (const target of prioritizedProspects) {
    if (remainingBudget <= 0) break;

    const scout = scoutAssignments.get(target.prospectId) || team.scouts[0];
    if (!scout) continue;

    const completedActions = alreadyScoutedActions.get(target.prospectId) || new Set();

    // Determine what action to take
    let actionType: string | null = null;

    // Priority determines scouting depth
    if (!completedActions.has("initial") && availableActionTypes.includes("initial")) {
      actionType = "initial";
    } else if (target.priority === "must_scout") {
      // Must scout: Do everything available
      for (const type of availableActionTypes) {
        if (!completedActions.has(type)) {
          actionType = type;
          break;
        }
      }
    } else if (target.priority === "should_scout") {
      // Should scout: Initial + maybe one more
      if (completedActions.size < 2) {
        for (const type of availableActionTypes) {
          if (!completedActions.has(type)) {
            actionType = type;
            break;
          }
        }
      }
    }

    if (actionType && actionCosts[actionType] <= remainingBudget) {
      const priority: PriorityLevel =
        target.priority === "must_scout" ? 1 :
        target.priority === "should_scout" ? 2 : 3;

      actions.push({
        teamId: team.id,
        scoutId: scout.id,
        prospectId: target.prospectId,
        actionType: actionType as "initial" | "game_tape" | "combine" | "interview" | "medical",
        week: currentWeek,
        priority,
      });

      remainingBudget -= actionCosts[actionType];
    }
  }

  return actions;
}

/**
 * Execute CPU scouting actions and update their knowledge
 */
export function executeCPUScoutingActions(
  actions: CPUScoutingAction[],
  scouts: Scout[],
  prospects: ProspectTrueData[]
): Map<string, ScoutingResult> {
  const results = new Map<string, ScoutingResult>();

  for (const action of actions) {
    const scout = scouts.find(s => s.id === action.scoutId);
    const prospect = prospects.find(p => (p as any).id === action.prospectId);

    if (!scout || !prospect) continue;

    let result: ScoutingResult;

    switch (action.actionType) {
      case "initial":
        result = performInitialScouting(scout, prospect, action.priority);
        break;
      case "game_tape":
        result = performGameTapeReview(scout, prospect, action.priority, {});
        break;
      case "combine":
        result = performCombine(scout, prospect, action.priority, {});
        break;
      case "interview":
        result = performInterview(scout, prospect, action.priority, {});
        break;
      case "medical":
        result = performMedical(scout, prospect, action.priority, {});
        break;
      default:
        continue;
    }

    // Merge with existing results
    const existingResult = results.get(action.prospectId);
    if (existingResult) {
      // Narrow bands if new scouting
      if (result.est_overall_low !== undefined && existingResult.est_overall_low !== undefined) {
        result.est_overall_low = Math.max(result.est_overall_low, existingResult.est_overall_low);
        result.est_overall_high = Math.min(result.est_overall_high!, existingResult.est_overall_high!);
      }
      // Merge trait reveals
      result.trait_reveals = { ...existingResult.trait_reveals, ...result.trait_reveals };
      result.athletic_bands = { ...existingResult.athletic_bands, ...result.athletic_bands };
      result.psych_reveals = { ...existingResult.psych_reveals, ...result.psych_reveals };
    }

    results.set(action.prospectId, result);
  }

  return results;
}

/**
 * Generate CPU big board based on scouting results
 */
export function generateCPUBigBoard(
  team: CPUTeam,
  scoutingResults: Map<string, ScoutingResult>,
  prospects: { id: string; position: string; consensusRank: number }[]
): { prospectId: string; rank: number; cpuRating: number }[] {
  const board: { prospectId: string; rank: number; cpuRating: number }[] = [];

  for (const prospect of prospects) {
    const result = scoutingResults.get(prospect.id);

    // Calculate CPU rating
    let cpuRating: number;

    if (result && result.est_overall_low !== undefined && result.est_overall_high !== undefined) {
      // Use scouted data
      const scoutedMid = (result.est_overall_low + result.est_overall_high) / 2;

      // Apply team philosophy
      let philosophyAdjustment = 0;
      if (team.philosophy.focusArea === "need_based") {
        const needPriority = team.positionNeeds.find(n => n.position === prospect.position);
        if (needPriority?.priority === "critical") philosophyAdjustment = 10;
        else if (needPriority?.priority === "high") philosophyAdjustment = 5;
      }

      // Risk adjustment
      if (team.philosophy.riskTolerance === "conservative" && result.psych_reveals?.bustRisk) {
        philosophyAdjustment -= result.psych_reveals.bustRisk / 5;
      } else if (team.philosophy.riskTolerance === "aggressive" && result.psych_reveals?.breakoutChance) {
        philosophyAdjustment += result.psych_reveals.breakoutChance / 10;
      }

      cpuRating = scoutedMid + philosophyAdjustment;
    } else {
      // Use consensus rank as fallback
      cpuRating = 100 - (prospect.consensusRank / 2);
    }

    // Add some randomness
    cpuRating += random(-3, 3);

    board.push({
      prospectId: prospect.id,
      rank: 0, // Will be assigned after sorting
      cpuRating: Math.round(cpuRating),
    });
  }

  // Sort by rating and assign ranks
  board.sort((a, b) => b.cpuRating - a.cpuRating);
  board.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  return board;
}

/**
 * Determine CPU draft pick based on their big board and available players
 */
export function getCPUDraftPick(
  team: CPUTeam,
  bigBoard: { prospectId: string; rank: number; cpuRating: number }[],
  availableProspects: Set<string>,
  pickNumber: number
): string | null {
  // Filter to available prospects
  const availableOnBoard = bigBoard
    .filter(entry => availableProspects.has(entry.prospectId))
    .slice(0, 10); // Consider top 10 available

  if (availableOnBoard.length === 0) return null;

  // Usually take top available, but add some variance
  const roll = Math.random();
  if (roll < 0.7) {
    return availableOnBoard[0].prospectId;
  } else if (roll < 0.9 && availableOnBoard.length >= 2) {
    return availableOnBoard[1].prospectId;
  } else if (availableOnBoard.length >= 3) {
    return availableOnBoard[2].prospectId;
  }

  return availableOnBoard[0].prospectId;
}

export type { CPUTeam, CPUScoutingPhilosophy, CPUScoutingAction, CPUScoutingPlan };
