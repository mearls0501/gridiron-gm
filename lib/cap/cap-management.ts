/**
 * Salary Cap Management System
 * Tools for managing team salary cap, restructures, extensions, and cuts
 */

import {
  Contract,
  ContractYear,
  TeamCapSituation,
  CutCandidate,
  ContractRestructure,
  ContractExtension,
  PlayerCut,
  NFLPlayer,
  getSalaryCap,
  getMinimumSalary,
  calculateDeadCap,
  calculateCapSavings,
  calculateMarketValue,
  POSITION_VALUE_MULTIPLIERS,
} from "../players/player-contracts";

// =============================================================================
// CAP SITUATION CALCULATION
// =============================================================================

export interface RosterPlayer {
  playerId: string;
  playerName: string;
  position: string;
  overall: number;
  age: number;
  contract: Contract;
}

/**
 * Calculate full team cap situation
 */
export function calculateTeamCapSituation(
  teamId: string,
  roster: RosterPlayer[],
  season: number
): TeamCapSituation {
  const salaryCap = getSalaryCap(season);

  let totalCommitted = 0;
  let deadMoney = 0;
  const capByPosition: Record<string, number> = {};
  const expiringContracts: string[] = [];
  const potentialCuts: CutCandidate[] = [];
  const restructureCandidates: string[] = [];

  // Calculate current year commitments
  for (const player of roster) {
    const contract = player.contract;
    const currentYearDetails = contract.yearlyDetails.find(y => y.year === season);

    if (!currentYearDetails) continue;

    const capHit = currentYearDetails.capHit;
    totalCommitted += capHit;

    // Track by position
    if (!capByPosition[player.position]) {
      capByPosition[player.position] = 0;
    }
    capByPosition[player.position] += capHit;

    // Check if expiring
    if (contract.yearsRemaining <= 1) {
      expiringContracts.push(player.playerId);
    }

    // Evaluate as potential cut
    const cutCandidate = evaluateCutCandidate(player, season);
    if (cutCandidate.recommendation !== "keep") {
      potentialCuts.push(cutCandidate);
    }

    // Check if restructure candidate (significant cap hit, years remaining)
    if (capHit >= 10000000 && contract.yearsRemaining >= 2) {
      restructureCandidates.push(player.playerId);
    }
  }

  const capSpace = salaryCap - totalCommitted;

  // Calculate effective cap (accounting for practice squad, etc.)
  const practiceSquadCost = 12 * getMinimumSalary(0); // ~12 practice squad players
  const effectiveCapSpace = capSpace - practiceSquadCost;

  // Project next year
  let projectedNextYear = 0;
  for (const player of roster) {
    const nextYearDetails = player.contract.yearlyDetails.find(y => y.year === season + 1);
    if (nextYearDetails) {
      projectedNextYear += nextYearDetails.capHit;
    }
  }

  // Rollover (can carry up to full cap space)
  const rolloverSpace = capSpace > 0 ? capSpace : 0;

  return {
    teamId,
    season,
    salaryCap,
    totalCommitted,
    capSpace,
    effectiveCapSpace,
    top51: totalCommitted, // Simplified - would calculate actual top 51
    deadMoney,
    capByPosition,
    projectedCapNextYear: projectedNextYear,
    rolloverSpace,
    expiringContracts,
    potentialCuts: potentialCuts.sort((a, b) => b.capSavings - a.capSavings),
    restructureCandidates,
  };
}

/**
 * Evaluate a player as a potential cut
 */
export function evaluateCutCandidate(
  player: RosterPlayer,
  season: number
): CutCandidate {
  const contract = player.contract;
  const currentYearDetails = contract.yearlyDetails.find(y => y.year === season);

  if (!currentYearDetails) {
    return {
      playerId: player.playerId,
      playerName: player.playerName,
      position: player.position,
      currentCapHit: 0,
      deadCapIfCut: 0,
      capSavings: 0,
      recommendation: "keep",
      reason: "No contract details for current year",
    };
  }

  const capHit = currentYearDetails.capHit;
  const deadCap = calculateDeadCap(contract, season);
  const capSavings = capHit - deadCap;

  // Determine recommendation
  let recommendation: "cut" | "keep" | "restructure";
  let reason: string;

  // Calculate if overpaid
  const positionMult = POSITION_VALUE_MULTIPLIERS[player.position] || 0.5;
  const expectedCapHit = (player.overall / 100) * getSalaryCap(season) * positionMult * 0.03;
  const isOverpaid = capHit > expectedCapHit * 1.5;
  const isSeverelyOverpaid = capHit > expectedCapHit * 2;

  // Factor in dead cap ratio
  const deadCapRatio = capHit > 0 ? deadCap / capHit : 0;

  if (isSeverelyOverpaid && deadCapRatio < 0.5 && capSavings > 5000000) {
    recommendation = "cut";
    reason = `Severely overpaid (${Math.round((capHit / expectedCapHit) * 100)}% of expected value). Cap savings: $${(capSavings / 1000000).toFixed(1)}M`;
  } else if (isOverpaid && deadCapRatio < 0.4 && capSavings > 3000000) {
    recommendation = "cut";
    reason = `Overpaid relative to production. Cap savings: $${(capSavings / 1000000).toFixed(1)}M`;
  } else if (isOverpaid && deadCapRatio >= 0.4 && contract.yearsRemaining >= 2) {
    recommendation = "restructure";
    reason = `Overpaid but dead cap too high to cut. Consider restructure.`;
  } else if (player.age >= 32 && player.overall < 75 && capSavings > 2000000) {
    recommendation = "cut";
    reason = `Aging player with declining production. Cap savings: $${(capSavings / 1000000).toFixed(1)}M`;
  } else {
    recommendation = "keep";
    reason = `Contract is reasonable relative to production`;
  }

  return {
    playerId: player.playerId,
    playerName: player.playerName,
    position: player.position,
    currentCapHit: capHit,
    deadCapIfCut: deadCap,
    capSavings,
    recommendation,
    reason,
  };
}

// =============================================================================
// CAP OPERATIONS
// =============================================================================

/**
 * Calculate a contract restructure
 * Converting salary to bonus spreads cap hit over remaining years
 */
export function calculateRestructure(
  player: RosterPlayer,
  salaryToConvert: number,
  season: number
): ContractRestructure | null {
  const contract = player.contract;
  const currentYearDetails = contract.yearlyDetails.find(y => y.year === season);

  if (!currentYearDetails) return null;

  // Can only convert up to base salary
  const maxConvertible = currentYearDetails.baseSalary;
  const actualConversion = Math.min(salaryToConvert, maxConvertible);

  if (actualConversion <= 0) return null;

  // Spread over remaining years
  const yearsRemaining = contract.yearsRemaining;
  const prorationPerYear = Math.round(actualConversion / yearsRemaining);

  // Calculate new cap hit this year
  const originalCapHit = currentYearDetails.capHit;
  const newCapHit = originalCapHit - actualConversion + prorationPerYear;
  const capSavings = originalCapHit - newCapHit;

  // Calculate future cap increase
  const futureCapIncrease = prorationPerYear * (yearsRemaining - 1);

  return {
    playerId: player.playerId,
    originalCapHit,
    newCapHit,
    capSavings,
    salaryConverted: actualConversion,
    yearsToProrate: yearsRemaining,
    futureCapIncrease,
  };
}

/**
 * Apply a restructure to a contract
 */
export function applyRestructure(
  contract: Contract,
  restructure: ContractRestructure,
  season: number
): Contract {
  const updatedContract = { ...contract };
  const updatedYears = [...contract.yearlyDetails];

  const prorationPerYear = Math.round(restructure.salaryConverted / restructure.yearsToProrate);

  for (let i = 0; i < updatedYears.length; i++) {
    const year = updatedYears[i];

    if (year.year === season) {
      // Current year: reduce salary, add proration
      updatedYears[i] = {
        ...year,
        baseSalary: year.baseSalary - restructure.salaryConverted,
        signingBonusProration: year.signingBonusProration + prorationPerYear,
        capHit: restructure.newCapHit,
      };
    } else if (year.year > season) {
      // Future years: add proration
      updatedYears[i] = {
        ...year,
        signingBonusProration: year.signingBonusProration + prorationPerYear,
        capHit: year.capHit + prorationPerYear,
      };
    }
  }

  updatedContract.yearlyDetails = updatedYears;
  updatedContract.signingBonus = contract.signingBonus + restructure.salaryConverted;

  return updatedContract;
}

/**
 * Calculate a contract extension
 */
export function calculateExtension(
  player: RosterPlayer,
  newYears: number,
  newTotalValue: number,
  newGuaranteed: number,
  season: number
): ContractExtension {
  const contract = player.contract;
  const currentYearDetails = contract.yearlyDetails.find(y => y.year === season);

  if (!currentYearDetails) {
    throw new Error("Cannot extend - no current year details");
  }

  // Calculate new AAV
  const totalYears = contract.yearsRemaining + newYears;
  const newAAV = newTotalValue / totalYears;

  // New signing bonus (typically front-loaded guarantees)
  const newSigningBonus = Math.round(newGuaranteed * 0.5);
  const prorationPerYear = Math.round(newSigningBonus / totalYears);

  // New cap hit this year (old cap hit - old proration + new proration)
  const newCapHit = currentYearDetails.baseSalary + prorationPerYear;
  const capSavingsThisYear = currentYearDetails.capHit - newCapHit;

  return {
    playerId: player.playerId,
    yearsAdded: newYears,
    newTotalValue,
    newGuaranteed,
    newCapHit,
    capSavingsThisYear,
  };
}

/**
 * Build a new contract from extension terms
 */
export function buildExtendedContract(
  existingContract: Contract,
  extension: ContractExtension,
  season: number
): Contract {
  const totalYears = existingContract.yearsRemaining + extension.yearsAdded;
  const aav = extension.newTotalValue / totalYears;
  const signingBonus = Math.round(extension.newGuaranteed * 0.5);
  const prorationPerYear = Math.round(signingBonus / totalYears);

  const yearlyDetails: ContractYear[] = [];
  let remainingGuaranteed = extension.newGuaranteed - signingBonus;

  for (let i = 0; i < totalYears; i++) {
    const year = season + i;

    // Escalating salary structure
    const salaryMultiplier = 0.7 + (i / totalYears) * 0.6;
    const baseSalary = Math.round(aav * salaryMultiplier);

    const isGuaranteed = remainingGuaranteed > baseSalary;
    if (isGuaranteed) remainingGuaranteed -= baseSalary;

    const rosterBonus = i >= 2 ? Math.round(baseSalary * 0.1) : 0;
    const capHit = baseSalary + prorationPerYear + rosterBonus;

    yearlyDetails.push({
      year,
      baseSalary,
      signingBonusProration: prorationPerYear,
      rosterBonus,
      workoutBonus: Math.round(baseSalary * 0.02),
      otherBonus: 0,
      capHit,
      deadCap: prorationPerYear * (totalYears - i) + (isGuaranteed ? baseSalary : 0),
      cashSpent: baseSalary + (i === 0 ? signingBonus : 0) + rosterBonus,
      isFullyGuaranteed: isGuaranteed,
      guaranteedForInjury: i < 2,
    });
  }

  return {
    playerId: existingContract.playerId,
    teamId: existingContract.teamId,
    totalValue: extension.newTotalValue,
    guaranteed: extension.newGuaranteed,
    years: totalYears,
    signingBonus,
    yearlyDetails,
    yearsRemaining: totalYears,
    currentYear: 1,
    noTradeClause: existingContract.noTradeClause,
    voidYears: 0,
    incentives: existingContract.incentives,
    signedDate: new Date(),
    expiresAfterSeason: season + totalYears - 1,
  };
}

/**
 * Calculate the impact of cutting a player
 */
export function calculateCut(
  player: RosterPlayer,
  cutType: "pre_june1" | "post_june1",
  season: number
): PlayerCut {
  const contract = player.contract;
  const currentYearDetails = contract.yearlyDetails.find(y => y.year === season);

  if (!currentYearDetails) {
    return {
      playerId: player.playerId,
      cutType,
      capSavings: 0,
      deadCapHit: 0,
    };
  }

  const capHit = currentYearDetails.capHit;

  if (cutType === "pre_june1") {
    // All remaining bonus accelerates to current year
    const deadCap = calculateDeadCap(contract, season);
    const capSavings = capHit - deadCap;

    return {
      playerId: player.playerId,
      cutType,
      capSavings: Math.max(0, capSavings),
      deadCapHit: deadCap,
    };
  } else {
    // Post-June 1: dead cap splits over two years
    const totalDeadCap = calculateDeadCap(contract, season);

    // Current year: just this year's proration
    const deadCapYear1 = currentYearDetails.signingBonusProration;

    // Next year: remaining prorations
    const deadCapYear2 = totalDeadCap - deadCapYear1;

    const capSavings = capHit - deadCapYear1;

    return {
      playerId: player.playerId,
      cutType,
      capSavings: Math.max(0, capSavings),
      deadCapHit: deadCapYear1,
      deadCapYear2,
    };
  }
}

// =============================================================================
// CAP PROJECTIONS
// =============================================================================

export interface CapProjection {
  season: number;
  projectedCap: number;
  projectedCommitments: number;
  projectedSpace: number;
  expiringContracts: number;
  keyDecisions: string[];
}

/**
 * Project cap situation for multiple years
 */
export function projectCapSituation(
  roster: RosterPlayer[],
  currentSeason: number,
  yearsToProject: number = 3
): CapProjection[] {
  const projections: CapProjection[] = [];

  for (let i = 0; i <= yearsToProject; i++) {
    const season = currentSeason + i;
    const projectedCap = getSalaryCap(season);

    let projectedCommitments = 0;
    let expiringContracts = 0;
    const keyDecisions: string[] = [];

    for (const player of roster) {
      const yearDetails = player.contract.yearlyDetails.find(y => y.year === season);

      if (yearDetails) {
        projectedCommitments += yearDetails.capHit;

        // Check for expiring contracts
        if (player.contract.expiresAfterSeason === season) {
          expiringContracts++;

          if (player.overall >= 80) {
            keyDecisions.push(`${player.playerName} (${player.position}) contract expires`);
          }
        }

        // Check for option years
        if (player.contract.optionYear?.year === season) {
          keyDecisions.push(`${player.playerName} (${player.position}) option decision`);
        }
      }
    }

    projections.push({
      season,
      projectedCap,
      projectedCommitments,
      projectedSpace: projectedCap - projectedCommitments,
      expiringContracts,
      keyDecisions,
    });
  }

  return projections;
}

// =============================================================================
// CAP SPACE CREATION STRATEGIES
// =============================================================================

export interface CapSpaceStrategy {
  type: "cut" | "restructure" | "trade" | "extension";
  playerId: string;
  playerName: string;
  capSavings: number;
  deadCapCost: number;
  futureImpact: number;        // Negative = future cap increase
  recommendation: string;
  risk: "low" | "medium" | "high";
}

/**
 * Generate strategies to create cap space
 */
export function generateCapSpaceStrategies(
  roster: RosterPlayer[],
  targetSpace: number,
  season: number
): CapSpaceStrategy[] {
  const strategies: CapSpaceStrategy[] = [];

  for (const player of roster) {
    const contract = player.contract;
    const currentYearDetails = contract.yearlyDetails.find(y => y.year === season);

    if (!currentYearDetails) continue;

    // Cut strategy
    const cutResult = calculateCut(player, "pre_june1", season);
    if (cutResult.capSavings > 1000000) {
      strategies.push({
        type: "cut",
        playerId: player.playerId,
        playerName: player.playerName,
        capSavings: cutResult.capSavings,
        deadCapCost: cutResult.deadCapHit,
        futureImpact: 0,
        recommendation: `Release ${player.playerName} for $${(cutResult.capSavings / 1000000).toFixed(1)}M in cap space`,
        risk: player.overall >= 80 ? "high" : player.overall >= 70 ? "medium" : "low",
      });
    }

    // Post-June 1 cut strategy
    const postJune1Cut = calculateCut(player, "post_june1", season);
    if (postJune1Cut.capSavings > cutResult.capSavings + 2000000) {
      strategies.push({
        type: "cut",
        playerId: player.playerId,
        playerName: player.playerName,
        capSavings: postJune1Cut.capSavings,
        deadCapCost: postJune1Cut.deadCapHit,
        futureImpact: -(postJune1Cut.deadCapYear2 || 0),
        recommendation: `Post-June 1 release of ${player.playerName} for $${(postJune1Cut.capSavings / 1000000).toFixed(1)}M (but $${((postJune1Cut.deadCapYear2 || 0) / 1000000).toFixed(1)}M dead cap next year)`,
        risk: "medium",
      });
    }

    // Restructure strategy
    if (contract.yearsRemaining >= 2 && currentYearDetails.baseSalary >= 5000000) {
      const maxRestructure = Math.round(currentYearDetails.baseSalary * 0.8);
      const restructure = calculateRestructure(player, maxRestructure, season);

      if (restructure && restructure.capSavings >= 3000000) {
        strategies.push({
          type: "restructure",
          playerId: player.playerId,
          playerName: player.playerName,
          capSavings: restructure.capSavings,
          deadCapCost: 0,
          futureImpact: -restructure.futureCapIncrease,
          recommendation: `Restructure ${player.playerName}'s deal to save $${(restructure.capSavings / 1000000).toFixed(1)}M (adds $${(restructure.futureCapIncrease / 1000000).toFixed(1)}M to future years)`,
          risk: "low",
        });
      }
    }
  }

  // Sort by cap savings
  strategies.sort((a, b) => b.capSavings - a.capSavings);

  return strategies;
}

/**
 * Find combination of moves to reach target cap space
 */
export function findOptimalCapStrategy(
  strategies: CapSpaceStrategy[],
  targetSpace: number,
  maxFutureImpact: number = -50000000
): CapSpaceStrategy[] {
  const selectedStrategies: CapSpaceStrategy[] = [];
  let currentSavings = 0;
  let totalFutureImpact = 0;

  // Greedy algorithm - could be improved with dynamic programming
  for (const strategy of strategies) {
    if (currentSavings >= targetSpace) break;

    // Check if adding this would exceed future impact limit
    if (totalFutureImpact + strategy.futureImpact < maxFutureImpact) continue;

    // Prefer restructures over cuts for key players
    if (strategy.risk === "high" && currentSavings + strategy.capSavings > targetSpace * 1.2) {
      continue; // Don't cut key player if we'd go way over target
    }

    selectedStrategies.push(strategy);
    currentSavings += strategy.capSavings;
    totalFutureImpact += strategy.futureImpact;
  }

  return selectedStrategies;
}

// =============================================================================
// DEAD MONEY TRACKING
// =============================================================================

export interface DeadMoneyEntry {
  playerId: string;
  playerName: string;
  amount: number;
  reason: "cut" | "trade" | "retired";
  originalContract: string;
  yearsRemaining: number;
}

/**
 * Get all dead money entries for a team
 */
export function getDeadMoneyBreakdown(
  deadMoneyEntries: DeadMoneyEntry[],
  season: number
): {
  total: number;
  entries: DeadMoneyEntry[];
  byReason: Record<string, number>;
} {
  const currentYearEntries = deadMoneyEntries.filter(e => e.yearsRemaining > 0);

  const total = currentYearEntries.reduce((sum, e) => sum + e.amount, 0);

  const byReason: Record<string, number> = {
    cut: 0,
    trade: 0,
    retired: 0,
  };

  for (const entry of currentYearEntries) {
    byReason[entry.reason] += entry.amount;
  }

  return {
    total,
    entries: currentYearEntries,
    byReason,
  };
}

export type {
  RosterPlayer,
  CapProjection,
  CapSpaceStrategy,
  DeadMoneyEntry,
};
