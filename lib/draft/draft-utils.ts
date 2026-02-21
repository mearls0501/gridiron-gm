/**
 * Draft Day Utilities
 * Helper functions for draft day experience
 */

import { random } from "@/lib/utils";

export interface DraftPick {
  pickNumber: number;
  round: number;
  originalTeamId: string;
  currentTeamId: string;
  prospectId?: string;
  prospectName?: string;
  position?: string;
  isTraded: boolean;
  tradedFrom?: string;
  timestamp?: Date;
}

export interface DraftProspect {
  id: string;
  name: string;
  position: string;
  college: string;
  consensusRank: number;
  yourBoardRank?: number;
  scoutedOverall?: { low: number; high: number };
  scoutedPotential?: { low: number; high: number };
  flags?: string[];
  scoutHeadline?: string;
}

export interface TradePackage {
  id: string;
  offeredBy: string;
  offeredTo: string;
  picksOffered: number[];
  picksRequested: number[];
  playersOffered?: string[];
  playersRequested?: string[];
  status: "pending" | "accepted" | "rejected" | "countered";
  expiresAt?: Date;
  message?: string;
}

export interface DraftAlert {
  id: string;
  type: "falling" | "rising" | "trade_up" | "trade_down" | "target_taken" | "value_pick" | "reach" | "phone_ringing";
  message: string;
  prospectId?: string;
  prospectName?: string;
  teamId?: string;
  urgency: "low" | "medium" | "high" | "critical";
  timestamp: Date;
  dismissed: boolean;
}

export interface ScoutReaction {
  scoutId: string;
  scoutName: string;
  archetype: string;
  prospectId: string;
  prospectName: string;
  reaction: string;
  sentiment: "positive" | "negative" | "neutral" | "shocked";
  timestamp: Date;
}

// Draft pick value chart (Jimmy Johnson style)
export const PICK_VALUE_CHART: Record<number, number> = {
  1: 3000, 2: 2600, 3: 2200, 4: 1800, 5: 1700,
  6: 1600, 7: 1500, 8: 1400, 9: 1350, 10: 1300,
  11: 1250, 12: 1200, 13: 1150, 14: 1100, 15: 1050,
  16: 1000, 17: 950, 18: 900, 19: 875, 20: 850,
  21: 800, 22: 780, 23: 760, 24: 740, 25: 720,
  26: 700, 27: 680, 28: 660, 29: 640, 30: 620,
  31: 600, 32: 590, 33: 580, 34: 560, 35: 550,
  36: 540, 37: 530, 38: 520, 39: 510, 40: 500,
  41: 490, 42: 480, 43: 470, 44: 460, 45: 450,
  46: 440, 47: 430, 48: 420, 49: 410, 50: 400,
  51: 390, 52: 380, 53: 370, 54: 360, 55: 350,
  56: 340, 57: 330, 58: 320, 59: 310, 60: 300,
  61: 292, 62: 284, 63: 276, 64: 270, 65: 265,
  // Rounds 3-7 continue decreasing
  66: 260, 67: 255, 68: 250, 69: 245, 70: 240,
  71: 235, 72: 230, 73: 225, 74: 220, 75: 215,
  76: 210, 77: 205, 78: 200, 79: 195, 80: 190,
  81: 185, 82: 180, 83: 175, 84: 170, 85: 165,
  86: 160, 87: 155, 88: 150, 89: 145, 90: 140,
  91: 136, 92: 132, 93: 128, 94: 124, 95: 120,
  96: 116, 97: 112, 98: 108, 99: 104, 100: 100,
};

// Get pick value (extrapolate for later picks)
export function getPickValue(pickNumber: number): number {
  if (PICK_VALUE_CHART[pickNumber]) {
    return PICK_VALUE_CHART[pickNumber];
  }
  // Extrapolate for picks 101+
  const baseValue = 100;
  const decrement = Math.max(1, Math.floor((pickNumber - 100) / 10));
  return Math.max(1, baseValue - (pickNumber - 100) * decrement);
}

// Calculate total value of a trade package
export function calculateTradeValue(picks: number[]): number {
  return picks.reduce((sum, pick) => sum + getPickValue(pick), 0);
}

// Evaluate if a trade is fair
export function evaluateTradeFairness(
  picksGiven: number[],
  picksReceived: number[]
): { difference: number; percentDiff: number; verdict: "steal" | "fair" | "overpay" | "bad" } {
  const givenValue = calculateTradeValue(picksGiven);
  const receivedValue = calculateTradeValue(picksReceived);
  const difference = receivedValue - givenValue;
  const percentDiff = givenValue > 0 ? (difference / givenValue) * 100 : 0;

  let verdict: "steal" | "fair" | "overpay" | "bad";
  if (percentDiff > 20) verdict = "steal";
  else if (percentDiff >= -10) verdict = "fair";
  else if (percentDiff >= -25) verdict = "overpay";
  else verdict = "bad";

  return { difference, percentDiff: Math.round(percentDiff), verdict };
}

// Generate trade offers from CPU teams
export function generateCPUTradeOffer(
  cpuTeamId: string,
  cpuPicks: number[],
  targetPick: number,
  urgency: "low" | "medium" | "high"
): TradePackage | null {
  const targetValue = getPickValue(targetPick);

  // CPU tries to offer fair value (with slight variance)
  const offerMultiplier = urgency === "high" ? 1.15 : urgency === "medium" ? 1.05 : 0.95;
  const targetOfferValue = targetValue * offerMultiplier;

  // Find combination of picks that meets value
  const availablePicks = cpuPicks.filter(p => p > targetPick).sort((a, b) => a - b);

  let bestOffer: number[] = [];
  let bestDiff = Infinity;

  // Try different combinations
  for (let i = 0; i < availablePicks.length; i++) {
    const pick1 = availablePicks[i];
    const value1 = getPickValue(pick1);

    if (Math.abs(value1 - targetOfferValue) < bestDiff) {
      bestOffer = [pick1];
      bestDiff = Math.abs(value1 - targetOfferValue);
    }

    // Try two-pick combos
    for (let j = i + 1; j < availablePicks.length; j++) {
      const pick2 = availablePicks[j];
      const totalValue = value1 + getPickValue(pick2);

      if (Math.abs(totalValue - targetOfferValue) < bestDiff) {
        bestOffer = [pick1, pick2];
        bestDiff = Math.abs(totalValue - targetOfferValue);
      }
    }
  }

  if (bestOffer.length === 0) return null;

  return {
    id: `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    offeredBy: cpuTeamId,
    offeredTo: "player", // Player's team
    picksOffered: bestOffer,
    picksRequested: [targetPick],
    status: "pending",
    expiresAt: new Date(Date.now() + 60000), // 1 minute to decide
    message: urgency === "high"
      ? "We really want this pick. Let's make a deal!"
      : "Interested in moving back?",
  };
}

// Check if a prospect is "falling" (drafted later than expected)
export function checkProspectFalling(
  prospect: DraftProspect,
  currentPick: number
): { isFalling: boolean; fallDistance: number } {
  const expectedPick = prospect.consensusRank;
  const fallDistance = currentPick - expectedPick;

  return {
    isFalling: fallDistance >= 10,
    fallDistance: Math.max(0, fallDistance),
  };
}

// Check if a pick was a "reach"
export function checkReach(
  prospect: DraftProspect,
  pickNumber: number
): { isReach: boolean; reachDistance: number } {
  const expectedPick = prospect.consensusRank;
  const reachDistance = expectedPick - pickNumber;

  return {
    isReach: reachDistance >= 15,
    reachDistance: Math.max(0, reachDistance),
  };
}

// Generate scout reaction to a pick
export function generateScoutReaction(
  scout: { id: string; name: string; archetype: string; personalityType?: string },
  prospect: DraftProspect,
  pickNumber: number,
  wasTargeted: boolean
): ScoutReaction {
  const { isReach, reachDistance } = checkReach(prospect, pickNumber);
  const { isFalling, fallDistance } = checkProspectFalling(prospect, pickNumber);

  let reaction: string;
  let sentiment: ScoutReaction["sentiment"];

  if (wasTargeted) {
    // Our guy got taken
    reaction = [
      `There goes ${prospect.name}. We had him high on our board.`,
      `Damn. ${prospect.name} was one of our targets.`,
      `${prospect.name}... that's a tough one to lose.`,
      `I liked ${prospect.name}. Someone beat us to him.`,
    ][random(0, 3)];
    sentiment = "negative";
  } else if (isReach) {
    // Reach pick
    const reachReactions = {
      evaluator: [
        `${prospect.name} at ${pickNumber}? That's a reach. I had him in the ${Math.ceil(prospect.consensusRank / 32)}th.`,
        `Interesting. ${reachDistance} picks early for ${prospect.name}.`,
      ],
      tape_grinder: [
        `Film doesn't support ${prospect.name} this high. They're reaching.`,
        `${prospect.name} has tape concerns. Bold pick.`,
      ],
      character_coach: [
        `${prospect.name} is a good kid, but this is aggressive.`,
        `Love the character, but ${pickNumber} is early for ${prospect.name}.`,
      ],
      athletic_analyst: [
        `${prospect.name}'s athleticism doesn't justify pick ${pickNumber}.`,
        `Testing doesn't support this. Major reach.`,
      ],
    };
    reaction = reachReactions[scout.archetype as keyof typeof reachReactions]?.[random(0, 1)] ||
      `${prospect.name} is a reach at ${pickNumber}.`;
    sentiment = "shocked";
  } else if (isFalling) {
    // Value pick
    reaction = [
      `${prospect.name} falling to ${pickNumber} is great value.`,
      `Steal alert! ${prospect.name} dropped ${fallDistance} spots.`,
      `Can't believe ${prospect.name} lasted this long.`,
    ][random(0, 2)];
    sentiment = "positive";
  } else {
    // Normal pick
    reaction = [
      `${prospect.name} to pick ${pickNumber}. Makes sense.`,
      `Solid pick. ${prospect.name} fits there.`,
      `${prospect.name} goes where expected.`,
      `No surprises here with ${prospect.name}.`,
    ][random(0, 3)];
    sentiment = "neutral";
  }

  return {
    scoutId: scout.id,
    scoutName: scout.name,
    archetype: scout.archetype,
    prospectId: prospect.id,
    prospectName: prospect.name,
    reaction,
    sentiment,
    timestamp: new Date(),
  };
}

// Generate draft alert
export function generateDraftAlert(
  type: DraftAlert["type"],
  prospect?: DraftProspect,
  teamId?: string,
  customMessage?: string
): DraftAlert {
  let message: string;
  let urgency: DraftAlert["urgency"];

  switch (type) {
    case "falling":
      message = customMessage || `${prospect?.name} is falling! Now available at your pick range.`;
      urgency = "high";
      break;
    case "rising":
      message = customMessage || `${prospect?.name} stock rising. Multiple teams showing interest.`;
      urgency = "medium";
      break;
    case "trade_up":
      message = customMessage || `Movement on the board! A team is trading up.`;
      urgency = "high";
      break;
    case "trade_down":
      message = customMessage || `Trade opportunity: Team looking to move back.`;
      urgency = "medium";
      break;
    case "target_taken":
      message = customMessage || `${prospect?.name} is off the board!`;
      urgency = "critical";
      break;
    case "value_pick":
      message = customMessage || `${prospect?.name} available at value! Consider moving up.`;
      urgency = "high";
      break;
    case "reach":
      message = customMessage || `Reach alert: ${prospect?.name} taken way above consensus.`;
      urgency = "low";
      break;
    case "phone_ringing":
      message = customMessage || `Incoming call! A team wants to discuss a trade.`;
      urgency = "critical";
      break;
    default:
      message = customMessage || "Draft update";
      urgency = "low";
  }

  return {
    id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    message,
    prospectId: prospect?.id,
    prospectName: prospect?.name,
    teamId,
    urgency,
    timestamp: new Date(),
    dismissed: false,
  };
}

// Calculate time pressure based on pick clock
export function calculateTimePressure(
  timeRemaining: number, // seconds
  totalTime: number // seconds
): { pressure: "relaxed" | "normal" | "urgent" | "critical"; percentRemaining: number } {
  const percentRemaining = (timeRemaining / totalTime) * 100;

  let pressure: "relaxed" | "normal" | "urgent" | "critical";
  if (percentRemaining > 60) pressure = "relaxed";
  else if (percentRemaining > 30) pressure = "normal";
  else if (percentRemaining > 10) pressure = "urgent";
  else pressure = "critical";

  return { pressure, percentRemaining: Math.round(percentRemaining) };
}

// Get round time limit
export function getRoundTimeLimit(round: number): number {
  switch (round) {
    case 1: return 600; // 10 minutes
    case 2: return 420; // 7 minutes
    default: return 300; // 5 minutes
  }
}

// Format pick as "Round X, Pick Y (Overall #Z)"
export function formatPick(pickNumber: number): string {
  const round = Math.ceil(pickNumber / 32);
  const pickInRound = ((pickNumber - 1) % 32) + 1;
  return `Round ${round}, Pick ${pickInRound} (#${pickNumber} overall)`;
}

// Historical trade comparisons
export const FAMOUS_TRADES = [
  {
    name: "RG3 Trade (2012)",
    description: "Rams traded #2 overall to Washington for #6, two 1sts, and a 2nd",
    picksMoved: 2,
    picksReceived: [6, 39, "2013 1st", "2014 1st"],
  },
  {
    name: "Julio Jones Trade (2011)",
    description: "Falcons traded five picks to move from #27 to #6",
    picksMoved: 6,
    picksGiven: [27, 59, 124, "2012 1st", "2012 4th"],
  },
  {
    name: "Trubisky Trade (2017)",
    description: "Bears traded from #3 to #2 for a 3rd and 4th rounder",
    picksMoved: 2,
    picksGiven: [3, 67, 111],
  },
];

export type { DraftPick, DraftProspect, TradePackage, DraftAlert, ScoutReaction };
