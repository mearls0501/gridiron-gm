/**
 * Mock Draft Simulator
 * Simulates drafts based on scouted intel to predict prospect availability
 */

import { random } from "@/lib/utils";

export interface MockDraftProspect {
  id: string;
  name: string;
  position: string;
  college: string;

  // Consensus ranking (public perception)
  consensusRank: number;

  // Your scouted data
  scoutedOverallMid?: number;
  scoutedPotentialMid?: number;
  yourBoardRank?: number;

  // Team interest factors
  needMultiplier: Record<string, number>; // teamId -> multiplier (higher = more interested)
}

export interface MockDraftTeam {
  id: string;
  name: string;
  abbreviation: string;
  pickNumbers: number[];
  needs: string[]; // Position needs in order of priority
  tendencies: {
    bpaWeight: number; // 0-100, higher = more likely to take best available
    reachThreshold: number; // How far they'll reach for a need (0-20)
    tradeUpLikelihood: number; // 0-100
    tradeDownLikelihood: number; // 0-100
  };
}

export interface MockDraftPick {
  pickNumber: number;
  round: number;
  teamId: string;
  teamName: string;
  prospectId: string;
  prospectName: string;
  position: string;
  consensusRank: number;
  wasReach: boolean; // Drafted higher than consensus
  wasDrop: boolean; // Drafted lower than consensus
  tradeUp?: boolean;
  tradeDown?: boolean;
}

export interface MockDraftResult {
  picks: MockDraftPick[];
  yourPickAvailability: Record<number, MockDraftProspect[]>; // pick# -> available prospects
  prospectProbabilities: Record<string, AvailabilityProbability>;
}

export interface AvailabilityProbability {
  prospectId: string;
  prospectName: string;
  position: string;
  consensusRank: number;
  pickProbabilities: {
    pickNumber: number;
    availablePercent: number;
    takenPercent: number;
  }[];
  expectedPick: number; // Average pick number when taken
  variance: number; // How much the pick varies
}

/**
 * Calculate draft value for a prospect based on team preferences
 */
function calculateDraftValue(
  prospect: MockDraftProspect,
  team: MockDraftTeam,
  pickNumber: number,
  availableProspects: MockDraftProspect[]
): number {
  // Base value from consensus rank
  const consensusValue = 100 - (prospect.consensusRank / availableProspects.length) * 100;

  // Need bonus
  const needIndex = team.needs.indexOf(prospect.position);
  const needBonus = needIndex === -1 ? 0 : (team.needs.length - needIndex) * 5;

  // Team-specific interest
  const interestMultiplier = prospect.needMultiplier[team.id] || 1.0;

  // BPA vs Need balance
  const bpaValue = consensusValue * (team.tendencies.bpaWeight / 100);
  const needValue = needBonus * ((100 - team.tendencies.bpaWeight) / 100);

  // Randomness factor
  const randomFactor = random(-5, 5);

  return (bpaValue + needValue) * interestMultiplier + randomFactor;
}

/**
 * Simulate a single mock draft
 */
export function simulateMockDraft(
  prospects: MockDraftProspect[],
  teams: MockDraftTeam[],
  totalPicks: number = 256
): MockDraftPick[] {
  const picks: MockDraftPick[] = [];
  const availableProspects = [...prospects].sort((a, b) => a.consensusRank - b.consensusRank);
  const takenProspectIds = new Set<string>();

  // Build pick order
  const pickOrder: { pickNumber: number; teamId: string }[] = [];
  for (let pick = 1; pick <= totalPicks; pick++) {
    const team = teams.find((t) => t.pickNumbers.includes(pick));
    if (team) {
      pickOrder.push({ pickNumber: pick, teamId: team.id });
    }
  }

  // Simulate each pick
  for (const { pickNumber, teamId } of pickOrder) {
    const team = teams.find((t) => t.id === teamId)!;
    const round = Math.ceil(pickNumber / 32);

    // Get available prospects
    const available = availableProspects.filter((p) => !takenProspectIds.has(p.id));

    if (available.length === 0) break;

    // Calculate value for each prospect
    const prospectValues = available.map((p) => ({
      prospect: p,
      value: calculateDraftValue(p, team, pickNumber, available),
    }));

    // Sort by value and add some randomness to top choices
    prospectValues.sort((a, b) => b.value - a.value);

    // Pick from top 3 with weighted randomness
    const topChoices = prospectValues.slice(0, 3);
    const weights = [0.6, 0.3, 0.1];
    const roll = Math.random();
    let selected = topChoices[0].prospect;

    if (topChoices.length >= 2 && roll > weights[0]) {
      if (topChoices.length >= 3 && roll > weights[0] + weights[1]) {
        selected = topChoices[2].prospect;
      } else {
        selected = topChoices[1].prospect;
      }
    }

    // Record the pick
    const wasReach = selected.consensusRank > pickNumber + 15;
    const wasDrop = pickNumber > selected.consensusRank + 20;

    picks.push({
      pickNumber,
      round,
      teamId: team.id,
      teamName: team.name,
      prospectId: selected.id,
      prospectName: selected.name,
      position: selected.position,
      consensusRank: selected.consensusRank,
      wasReach,
      wasDrop,
    });

    takenProspectIds.add(selected.id);
  }

  return picks;
}

/**
 * Run multiple mock draft simulations
 */
export function runMockDraftSimulations(
  prospects: MockDraftProspect[],
  teams: MockDraftTeam[],
  numSimulations: number = 100,
  yourPickNumbers: number[] = []
): MockDraftResult {
  const allSimulations: MockDraftPick[][] = [];

  // Run simulations
  for (let i = 0; i < numSimulations; i++) {
    const result = simulateMockDraft(prospects, teams);
    allSimulations.push(result);
  }

  // Calculate prospect availability probabilities
  const prospectProbabilities: Record<string, AvailabilityProbability> = {};

  for (const prospect of prospects) {
    const pickResults: number[] = [];

    for (const sim of allSimulations) {
      const pick = sim.find((p) => p.prospectId === prospect.id);
      if (pick) {
        pickResults.push(pick.pickNumber);
      }
    }

    if (pickResults.length === 0) continue;

    // Calculate probabilities for each pick
    const maxPick = Math.max(...pickResults) + 10;
    const pickProbabilities: { pickNumber: number; availablePercent: number; takenPercent: number }[] = [];

    for (let pick = 1; pick <= Math.min(maxPick, 256); pick++) {
      const availableCount = pickResults.filter((p) => p >= pick).length;
      const takenAtPick = pickResults.filter((p) => p === pick).length;

      pickProbabilities.push({
        pickNumber: pick,
        availablePercent: Math.round((availableCount / numSimulations) * 100),
        takenPercent: Math.round((takenAtPick / numSimulations) * 100),
      });
    }

    // Calculate stats
    const expectedPick = Math.round(pickResults.reduce((a, b) => a + b, 0) / pickResults.length);
    const variance = Math.round(
      Math.sqrt(
        pickResults.reduce((sum, p) => sum + Math.pow(p - expectedPick, 2), 0) / pickResults.length
      )
    );

    prospectProbabilities[prospect.id] = {
      prospectId: prospect.id,
      prospectName: prospect.name,
      position: prospect.position,
      consensusRank: prospect.consensusRank,
      pickProbabilities,
      expectedPick,
      variance,
    };
  }

  // Calculate availability at your picks
  const yourPickAvailability: Record<number, MockDraftProspect[]> = {};

  for (const pickNumber of yourPickNumbers) {
    const availabilityAtPick: Map<string, number> = new Map();

    for (const sim of allSimulations) {
      const takenIds = new Set(
        sim.filter((p) => p.pickNumber < pickNumber).map((p) => p.prospectId)
      );

      for (const prospect of prospects) {
        if (!takenIds.has(prospect.id)) {
          availabilityAtPick.set(
            prospect.id,
            (availabilityAtPick.get(prospect.id) || 0) + 1
          );
        }
      }
    }

    // Get prospects available >50% of the time, sorted by consensus rank
    const likelyAvailable = prospects
      .filter((p) => (availabilityAtPick.get(p.id) || 0) / numSimulations >= 0.5)
      .sort((a, b) => a.consensusRank - b.consensusRank);

    yourPickAvailability[pickNumber] = likelyAvailable;
  }

  // Return the last simulation as the "current" mock
  return {
    picks: allSimulations[allSimulations.length - 1],
    yourPickAvailability,
    prospectProbabilities,
  };
}

/**
 * Generate default team tendencies based on team philosophy
 */
export function generateTeamTendencies(): MockDraftTeam["tendencies"] {
  return {
    bpaWeight: random(40, 80),
    reachThreshold: random(5, 15),
    tradeUpLikelihood: random(10, 40),
    tradeDownLikelihood: random(10, 40),
  };
}

/**
 * Calculate value picks - prospects you rank higher than consensus
 */
export function findValuePicks(
  prospects: MockDraftProspect[],
  probabilities: Record<string, AvailabilityProbability>,
  yourPickNumbers: number[]
): { prospect: MockDraftProspect; valueDiff: number; availableAtPick: number }[] {
  const valuePicks: { prospect: MockDraftProspect; valueDiff: number; availableAtPick: number }[] = [];

  for (const prospect of prospects) {
    if (!prospect.yourBoardRank) continue;

    const valueDiff = prospect.consensusRank - prospect.yourBoardRank;

    // Only consider prospects you rank significantly higher
    if (valueDiff >= 10) {
      const prob = probabilities[prospect.id];
      if (!prob) continue;

      // Find which of your picks they're most likely available at
      for (const pick of yourPickNumbers) {
        const pickProb = prob.pickProbabilities.find((p) => p.pickNumber === pick);
        if (pickProb && pickProb.availablePercent >= 30) {
          valuePicks.push({
            prospect,
            valueDiff,
            availableAtPick: pick,
          });
          break;
        }
      }
    }
  }

  return valuePicks.sort((a, b) => b.valueDiff - a.valueDiff);
}

/**
 * Find prospects that are falling (drafted later than consensus)
 */
export function findFallingProspects(
  picks: MockDraftPick[],
  currentPick: number
): MockDraftPick[] {
  return picks
    .filter((p) => p.pickNumber <= currentPick && p.wasDrop)
    .sort((a, b) => (b.pickNumber - b.consensusRank) - (a.pickNumber - a.consensusRank));
}

/**
 * Find reaches (prospects drafted much higher than consensus)
 */
export function findReaches(picks: MockDraftPick[]): MockDraftPick[] {
  return picks
    .filter((p) => p.wasReach)
    .sort((a, b) => (a.consensusRank - a.pickNumber) - (b.consensusRank - b.pickNumber));
}

export type {
  MockDraftProspect,
  MockDraftTeam,
  MockDraftPick,
  MockDraftResult,
  AvailabilityProbability,
};
