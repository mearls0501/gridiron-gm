/**
 * Player Trade Evaluation System
 * Handles evaluating and executing trades involving NFL players
 */

import {
  NFLPlayer,
  Contract,
  calculateAgeAdjustedValue,
  projectRemainingYears,
  calculateMarketValue,
  calculateDeadCap,
  getSalaryCap,
  POSITION_VALUE_MULTIPLIERS,
  POSITION_AGE_CURVES,
} from "../players/player-contracts";
import { getPickValue, calculateTradeValue } from "../draft/draft-utils";

// =============================================================================
// TRADE TYPES
// =============================================================================

export interface PlayerTradePackage {
  id: string;
  timestamp: Date;

  // Teams involved
  team1Id: string;
  team1Name: string;
  team2Id: string;
  team2Name: string;

  // Assets exchanged
  team1Sends: TradeAssets;
  team2Sends: TradeAssets;

  // Evaluation
  team1Value: number;
  team2Value: number;
  fairnessRating: number;         // -100 to +100 (positive = team1 wins)

  // Status
  status: "proposed" | "pending" | "accepted" | "rejected" | "countered" | "expired";
  expiresAt?: Date;
  counterOfferId?: string;

  // Metadata
  initiatedBy: string;            // Team ID
  message?: string;
  cpuEvaluation?: CPUTradeEvaluation;
}

export interface TradeAssets {
  players: TradedPlayer[];
  draftPicks: TradedPick[];
  cashConsideration?: number;     // Cash in trade (rare)
}

export interface TradedPlayer {
  playerId: string;
  playerName: string;
  position: string;
  overall: number;
  age: number;
  contractYearsRemaining: number;
  currentCapHit: number;
  tradeValue: number;             // Calculated value
}

export interface TradedPick {
  round: number;
  year: number;
  originalTeam: string;
  pickValue: number;              // Calculated value
  projectedPick?: number;         // If known
}

export interface CPUTradeEvaluation {
  willAccept: boolean;
  reasoning: string;
  counterOffer?: Partial<TradeAssets>;
  interestLevel: number;          // 0-100
}

// =============================================================================
// VALUE CALCULATION
// =============================================================================

/**
 * Calculate trade value for a player
 */
export function calculatePlayerTradeValue(
  player: NFLPlayer,
  currentSeason: number
): number {
  // Base value from rating
  const ageAdjustedOvr = calculateAgeAdjustedValue(player, currentSeason);
  const yearsRemaining = projectRemainingYears(player);

  // Convert OVR to approximate pick value
  // Elite players (90+) = 1st round value
  // Very good (85-89) = 2nd round value
  // Good (80-84) = 3rd round value
  // Average (75-79) = 4th-5th round value
  // Below average (<75) = late round or minimal

  let baseValue: number;
  if (ageAdjustedOvr >= 95) baseValue = 3500;      // Top 3 pick value
  else if (ageAdjustedOvr >= 92) baseValue = 2500; // Top 10 pick
  else if (ageAdjustedOvr >= 90) baseValue = 2000; // Mid 1st
  else if (ageAdjustedOvr >= 87) baseValue = 1500; // Late 1st
  else if (ageAdjustedOvr >= 85) baseValue = 1000; // Early 2nd
  else if (ageAdjustedOvr >= 82) baseValue = 700;  // Late 2nd
  else if (ageAdjustedOvr >= 80) baseValue = 500;  // 3rd round
  else if (ageAdjustedOvr >= 77) baseValue = 350;  // 4th round
  else if (ageAdjustedOvr >= 75) baseValue = 200;  // 5th round
  else if (ageAdjustedOvr >= 72) baseValue = 100;  // 6th round
  else baseValue = 50;                              // 7th or less

  // Position value multiplier
  const positionMult = POSITION_VALUE_MULTIPLIERS[player.position] || 0.7;
  baseValue *= positionMult;

  // Years remaining multiplier (more years = more value)
  const yearsMult = Math.min(1.3, 0.7 + (yearsRemaining * 0.15));
  baseValue *= yearsMult;

  // Contract adjustment
  const contract = player.contractStatus.contract;
  if (contract) {
    const currentYearCap = contract.yearlyDetails.find(y => y.year === currentSeason)?.capHit || 0;
    const fairValue = calculateMarketValue(player, currentSeason);

    // Underpaid = bonus, overpaid = penalty
    if (currentYearCap > fairValue * 1.3) {
      // Significantly overpaid - reduce value
      baseValue *= 0.6;
    } else if (currentYearCap > fairValue * 1.1) {
      // Slightly overpaid
      baseValue *= 0.85;
    } else if (currentYearCap < fairValue * 0.8) {
      // Great value contract
      baseValue *= 1.2;
    }
  }

  // Accolades boost
  if (player.allPros > 0) baseValue *= 1.1;
  if (player.proBowls >= 3) baseValue *= 1.05;

  return Math.round(baseValue);
}

/**
 * Calculate total value of trade assets
 */
export function calculateTradeAssetsValue(assets: TradeAssets): number {
  let totalValue = 0;

  // Player values
  for (const player of assets.players) {
    totalValue += player.tradeValue;
  }

  // Pick values
  for (const pick of assets.draftPicks) {
    totalValue += pick.pickValue;
  }

  // Cash (minimal impact)
  if (assets.cashConsideration) {
    totalValue += assets.cashConsideration / 100000; // $1M = ~10 points
  }

  return totalValue;
}

/**
 * Evaluate trade fairness
 */
export function evaluateTradeFairness(
  team1Assets: TradeAssets,
  team2Assets: TradeAssets
): {
  team1Value: number;
  team2Value: number;
  difference: number;
  percentDiff: number;
  verdict: "steal" | "good" | "fair" | "overpay" | "bad";
  winningTeam: 1 | 2 | null;
} {
  const team1Value = calculateTradeAssetsValue(team1Assets);
  const team2Value = calculateTradeAssetsValue(team2Assets);
  const difference = team2Value - team1Value;
  const avgValue = (team1Value + team2Value) / 2;
  const percentDiff = avgValue > 0 ? (difference / avgValue) * 100 : 0;

  let verdict: "steal" | "good" | "fair" | "overpay" | "bad";
  let winningTeam: 1 | 2 | null = null;

  if (percentDiff > 30) {
    verdict = "steal";
    winningTeam = 1;
  } else if (percentDiff > 15) {
    verdict = "good";
    winningTeam = 1;
  } else if (percentDiff >= -15) {
    verdict = "fair";
  } else if (percentDiff >= -30) {
    verdict = "overpay";
    winningTeam = 2;
  } else {
    verdict = "bad";
    winningTeam = 2;
  }

  return {
    team1Value,
    team2Value,
    difference,
    percentDiff: Math.round(percentDiff),
    verdict,
    winningTeam,
  };
}

// =============================================================================
// CPU TRADE AI
// =============================================================================

export interface CPUTradePreferences {
  teamId: string;
  isRebuilding: boolean;
  isContending: boolean;
  capSpace: number;
  needs: string[];               // Position needs
  corePlayersIds: string[];      // Won't trade these
  tradablePlayerIds: string[];   // Open to moving these
}

/**
 * CPU evaluates whether to accept a trade
 */
export function cpuEvaluateTrade(
  trade: PlayerTradePackage,
  cpuPreferences: CPUTradePreferences,
  isTeam1: boolean
): CPUTradeEvaluation {
  const cpuSends = isTeam1 ? trade.team1Sends : trade.team2Sends;
  const cpuReceives = isTeam1 ? trade.team2Sends : trade.team1Sends;

  const cpuSendsValue = calculateTradeAssetsValue(cpuSends);
  const cpuReceivesValue = calculateTradeAssetsValue(cpuReceives);

  let interestLevel = 50;
  const reasons: string[] = [];

  // Basic value check
  const valueDiff = cpuReceivesValue - cpuSendsValue;
  const valueRatio = cpuSendsValue > 0 ? cpuReceivesValue / cpuSendsValue : 1;

  if (valueRatio < 0.75) {
    interestLevel -= 30;
    reasons.push("Offer is significantly below value");
  } else if (valueRatio < 0.9) {
    interestLevel -= 15;
    reasons.push("Offer is slightly below value");
  } else if (valueRatio > 1.1) {
    interestLevel += 15;
    reasons.push("Good value in return");
  } else if (valueRatio > 1.25) {
    interestLevel += 25;
    reasons.push("Excellent value in return");
  }

  // Check if trading core players
  const tradingCorePlayers = cpuSends.players.filter(
    p => cpuPreferences.corePlayersIds.includes(p.playerId)
  );
  if (tradingCorePlayers.length > 0) {
    interestLevel -= 40;
    reasons.push(`Would have to give up core player(s): ${tradingCorePlayers.map(p => p.playerName).join(", ")}`);
  }

  // Need-based evaluation
  const receivedPositions = cpuReceives.players.map(p => p.position);
  const needsFilled = receivedPositions.filter(pos => cpuPreferences.needs.includes(pos));
  if (needsFilled.length > 0) {
    interestLevel += needsFilled.length * 10;
    reasons.push(`Fills needs at: ${needsFilled.join(", ")}`);
  }

  // Rebuilding team wants picks
  if (cpuPreferences.isRebuilding) {
    const picksReceived = cpuReceives.draftPicks.length;
    const picksSent = cpuSends.draftPicks.length;
    if (picksReceived > picksSent) {
      interestLevel += (picksReceived - picksSent) * 8;
      reasons.push("Acquiring draft capital for rebuild");
    }

    // Less interested in older players
    const olderPlayers = cpuReceives.players.filter(p => p.age >= 28);
    if (olderPlayers.length > 0) {
      interestLevel -= olderPlayers.length * 10;
      reasons.push("Receiving players don't fit rebuild timeline");
    }
  }

  // Contending team values win-now pieces
  if (cpuPreferences.isContending) {
    const impactPlayers = cpuReceives.players.filter(p => p.overall >= 80);
    if (impactPlayers.length > 0) {
      interestLevel += impactPlayers.length * 12;
      reasons.push("Adding impact players for contention");
    }

    // Less willing to trade good players
    const goodPlayersSent = cpuSends.players.filter(p => p.overall >= 80);
    if (goodPlayersSent.length > 0) {
      interestLevel -= goodPlayersSent.length * 15;
      reasons.push("Reluctant to part with contributors while contending");
    }
  }

  // Cap considerations
  const capImpact = calculateTradeCapImpact(cpuSends, cpuReceives);
  if (cpuPreferences.capSpace < 10000000 && capImpact.netCapChange > 5000000) {
    interestLevel -= 15;
    reasons.push("Trade creates cap issues");
  } else if (cpuPreferences.capSpace < 10000000 && capImpact.netCapChange < -5000000) {
    interestLevel += 10;
    reasons.push("Trade provides cap relief");
  }

  // Normalize interest
  interestLevel = Math.max(0, Math.min(100, interestLevel));

  // Make decision
  const willAccept = interestLevel >= 60 && valueRatio >= 0.85;

  // Generate counter offer if close but not accepting
  let counterOffer: Partial<TradeAssets> | undefined;
  if (!willAccept && interestLevel >= 40 && valueRatio >= 0.7) {
    counterOffer = generateCounterOffer(cpuSends, cpuReceives, cpuPreferences);
  }

  return {
    willAccept,
    reasoning: reasons.join(". ") || "Standard evaluation",
    counterOffer,
    interestLevel,
  };
}

function generateCounterOffer(
  cpuSends: TradeAssets,
  cpuReceives: TradeAssets,
  preferences: CPUTradePreferences
): Partial<TradeAssets> | undefined {
  const cpuSendsValue = calculateTradeAssetsValue(cpuSends);
  const cpuReceivesValue = calculateTradeAssetsValue(cpuReceives);
  const shortfall = cpuSendsValue - cpuReceivesValue;

  if (shortfall <= 0) return undefined;

  // CPU wants more value - request additional picks
  const additionalPicks: TradedPick[] = [];

  if (shortfall >= 500) {
    additionalPicks.push({
      round: shortfall >= 1500 ? 1 : shortfall >= 800 ? 2 : 3,
      year: new Date().getFullYear() + 1,
      originalTeam: "",
      pickValue: shortfall >= 1500 ? 1500 : shortfall >= 800 ? 800 : 400,
    });
  } else if (shortfall >= 200) {
    additionalPicks.push({
      round: shortfall >= 350 ? 4 : 5,
      year: new Date().getFullYear() + 1,
      originalTeam: "",
      pickValue: shortfall >= 350 ? 350 : 200,
    });
  }

  if (additionalPicks.length === 0) return undefined;

  return {
    draftPicks: [...cpuReceives.draftPicks, ...additionalPicks],
    players: cpuReceives.players,
  };
}

/**
 * Calculate cap impact of a trade
 */
export function calculateTradeCapImpact(
  sending: TradeAssets,
  receiving: TradeAssets
): {
  capCleared: number;
  capAdded: number;
  netCapChange: number;
  deadCap: number;
} {
  let capCleared = 0;
  let deadCap = 0;

  for (const player of sending.players) {
    capCleared += player.currentCapHit;
    // Note: In real implementation, would calculate dead cap from full contract
    // For now, estimate as 20% of cap hit
    deadCap += player.currentCapHit * 0.2;
  }

  let capAdded = 0;
  for (const player of receiving.players) {
    capAdded += player.currentCapHit;
  }

  return {
    capCleared,
    capAdded,
    netCapChange: capAdded - capCleared + deadCap,
    deadCap,
  };
}

// =============================================================================
// TRADE BLOCK
// =============================================================================

export interface TradeBlockPlayer {
  playerId: string;
  playerName: string;
  position: string;
  overall: number;
  age: number;
  contractYearsRemaining: number;
  capHit: number;
  askingPrice: "high" | "medium" | "low";
  reason?: string;
  dateAdded: Date;
  inquiries: TradeInquiry[];
}

export interface TradeInquiry {
  teamId: string;
  teamName: string;
  timestamp: Date;
  seriousness: "casual" | "interested" | "serious";
  proposedAssets?: Partial<TradeAssets>;
}

/**
 * Generate CPU interest in trade block players
 */
export function generateTradeBlockInquiries(
  blockPlayer: TradeBlockPlayer,
  cpuTeams: CPUTradePreferences[],
  playerData: NFLPlayer
): TradeInquiry[] {
  const inquiries: TradeInquiry[] = [];

  for (const team of cpuTeams) {
    // Check if team has need for this position
    const hasNeed = team.needs.includes(blockPlayer.position);
    if (!hasNeed && Math.random() > 0.2) continue; // Low chance without need

    // Check if can afford
    if (team.capSpace < blockPlayer.capHit * 0.5) continue;

    // Rebuilding teams less interested in veterans
    if (team.isRebuilding && blockPlayer.age >= 28) {
      if (Math.random() > 0.3) continue;
    }

    // Contending teams more interested in impact players
    if (team.isContending && blockPlayer.overall < 78) {
      if (Math.random() > 0.4) continue;
    }

    // Determine interest level
    let seriousness: "casual" | "interested" | "serious";
    const interestScore = (
      (hasNeed ? 30 : 0) +
      (team.isContending && blockPlayer.overall >= 82 ? 25 : 0) +
      (blockPlayer.askingPrice === "low" ? 20 : blockPlayer.askingPrice === "medium" ? 10 : 0) +
      Math.random() * 30
    );

    if (interestScore >= 70) seriousness = "serious";
    else if (interestScore >= 45) seriousness = "interested";
    else seriousness = "casual";

    // Generate proposed assets for serious inquiries
    let proposedAssets: Partial<TradeAssets> | undefined;
    if (seriousness === "serious") {
      const playerValue = calculatePlayerTradeValue(playerData, new Date().getFullYear());
      proposedAssets = generateProposedAssets(playerValue, blockPlayer.askingPrice);
    }

    inquiries.push({
      teamId: team.teamId,
      teamName: team.teamId, // Would be replaced with actual name
      timestamp: new Date(),
      seriousness,
      proposedAssets,
    });
  }

  return inquiries;
}

function generateProposedAssets(
  targetValue: number,
  askingPrice: "high" | "medium" | "low"
): Partial<TradeAssets> {
  // Adjust offer based on asking price
  const multiplier = askingPrice === "low" ? 1.1 : askingPrice === "medium" ? 0.95 : 0.85;
  const offerValue = targetValue * multiplier;

  const picks: TradedPick[] = [];

  // Build package of picks to match value
  let remainingValue = offerValue;
  const currentYear = new Date().getFullYear();

  if (remainingValue >= 1500) {
    picks.push({ round: 1, year: currentYear + 1, originalTeam: "", pickValue: 1500 });
    remainingValue -= 1500;
  }
  if (remainingValue >= 700) {
    picks.push({ round: 2, year: currentYear + 1, originalTeam: "", pickValue: 700 });
    remainingValue -= 700;
  }
  if (remainingValue >= 350) {
    picks.push({ round: 3, year: currentYear + 1, originalTeam: "", pickValue: 350 });
    remainingValue -= 350;
  }
  if (remainingValue >= 150) {
    picks.push({ round: 4, year: currentYear + 1, originalTeam: "", pickValue: 200 });
    remainingValue -= 200;
  }

  return {
    draftPicks: picks,
    players: [],
  };
}

// =============================================================================
// TRADE DEADLINE
// =============================================================================

export interface TradeDeadlineEvent {
  seasonWeek: number;           // Week of the deadline
  isActive: boolean;
  hoursRemaining: number;

  // Activity
  leagueWideTrades: CompletedTrade[];
  rumors: TradeRumor[];
  yourIncomingOffers: PlayerTradePackage[];
  yourOutgoingOffers: PlayerTradePackage[];
}

export interface CompletedTrade {
  id: string;
  timestamp: Date;
  team1Name: string;
  team2Name: string;
  headline: string;            // "Team A acquires WR Smith from Team B"
  team1Sends: string[];        // Simplified ["WR Smith", "2025 2nd"]
  team2Sends: string[];
}

export interface TradeRumor {
  id: string;
  type: "interest" | "shopping" | "close" | "done";
  headline: string;
  teams: string[];
  players?: string[];
  reliability: number;         // 0-100, how likely it's true
  timestamp: Date;
}

/**
 * Generate trade deadline activity
 */
export function generateTradeDeadlineActivity(
  cpuTeams: CPUTradePreferences[],
  allPlayers: Map<string, NFLPlayer>
): { trades: CompletedTrade[]; rumors: TradeRumor[] } {
  const trades: CompletedTrade[] = [];
  const rumors: TradeRumor[] = [];

  // Contending teams looking to buy
  const buyers = cpuTeams.filter(t => t.isContending && t.capSpace > 5000000);

  // Rebuilding teams looking to sell
  const sellers = cpuTeams.filter(t => t.isRebuilding && t.tradablePlayerIds.length > 0);

  // Generate some completed trades
  const numTrades = Math.floor(Math.random() * 3) + 1; // 1-3 trades

  for (let i = 0; i < numTrades && buyers.length > 0 && sellers.length > 0; i++) {
    const buyer = buyers[Math.floor(Math.random() * buyers.length)];
    const seller = sellers[Math.floor(Math.random() * sellers.length)];

    if (seller.tradablePlayerIds.length === 0) continue;

    const playerId = seller.tradablePlayerIds[0];
    const player = allPlayers.get(playerId);
    if (!player) continue;

    trades.push({
      id: `trade-${Date.now()}-${i}`,
      timestamp: new Date(),
      team1Name: buyer.teamId,
      team2Name: seller.teamId,
      headline: `${buyer.teamId} acquires ${player.position} ${player.name} from ${seller.teamId}`,
      team1Sends: ["2025 3rd round pick", "2026 5th round pick"],
      team2Sends: [`${player.position} ${player.name}`],
    });

    // Remove from arrays to avoid duplicates
    sellers.splice(sellers.indexOf(seller), 1);
  }

  // Generate rumors
  const rumorCount = Math.floor(Math.random() * 5) + 3; // 3-7 rumors

  for (let i = 0; i < rumorCount; i++) {
    const type: TradeRumor["type"] = ["interest", "shopping", "close", "done"][
      Math.floor(Math.random() * 4)
    ] as TradeRumor["type"];

    let headline: string;
    const team1 = cpuTeams[Math.floor(Math.random() * cpuTeams.length)];
    const team2 = cpuTeams[Math.floor(Math.random() * cpuTeams.length)];

    switch (type) {
      case "interest":
        headline = `${team1.teamId} showing interest in ${team2.teamId} players`;
        break;
      case "shopping":
        headline = `${team1.teamId} actively shopping veterans ahead of deadline`;
        break;
      case "close":
        headline = `${team1.teamId} and ${team2.teamId} close to completing a deal`;
        break;
      case "done":
        headline = `Sources: Deal between ${team1.teamId} and ${team2.teamId} is done, pending physical`;
        break;
    }

    rumors.push({
      id: `rumor-${Date.now()}-${i}`,
      type,
      headline,
      teams: [team1.teamId, team2.teamId],
      reliability: Math.floor(Math.random() * 50) + 30, // 30-80%
      timestamp: new Date(),
    });
  }

  return { trades, rumors };
}

// =============================================================================
// TRADE HISTORY & ANALYSIS
// =============================================================================

export interface TradeGrade {
  tradeId: string;
  timestamp: Date;
  immediate: string;           // A+ to F, day-of grade
  oneYear?: string;            // Grade after 1 year (if available)
  threeYear?: string;          // Grade after 3 years (if available)
  analysis: string;
  winnerSoFar?: string;        // Team ID
}

/**
 * Grade a completed trade
 */
export function gradeCompletedTrade(
  trade: PlayerTradePackage,
  retrospective: boolean = false
): TradeGrade {
  const { team1Value, team2Value, verdict, winningTeam } = evaluateTradeFairness(
    trade.team1Sends,
    trade.team2Sends
  );

  let immediateGrade: string;
  if (verdict === "fair") {
    immediateGrade = ["B+", "B", "B-"][Math.floor(Math.random() * 3)];
  } else if (verdict === "good") {
    immediateGrade = winningTeam === 1 ? "A-" : "C+";
  } else if (verdict === "steal") {
    immediateGrade = winningTeam === 1 ? "A" : "C-";
  } else if (verdict === "overpay") {
    immediateGrade = winningTeam === 1 ? "C-" : "A-";
  } else {
    immediateGrade = winningTeam === 1 ? "D" : "A";
  }

  const analysis = generateTradeAnalysis(trade, verdict, winningTeam);

  return {
    tradeId: trade.id,
    timestamp: trade.timestamp,
    immediate: immediateGrade,
    analysis,
    winnerSoFar: winningTeam ? (winningTeam === 1 ? trade.team1Id : trade.team2Id) : undefined,
  };
}

function generateTradeAnalysis(
  trade: PlayerTradePackage,
  verdict: string,
  winningTeam: 1 | 2 | null
): string {
  const team1Players = trade.team1Sends.players.map(p => p.playerName).join(", ") || "picks";
  const team2Players = trade.team2Sends.players.map(p => p.playerName).join(", ") || "picks";

  if (verdict === "fair") {
    return `A balanced trade where both teams addressed needs. ${trade.team1Name} gets ${team2Players} while ${trade.team2Name} receives ${team1Players}. Time will tell who wins.`;
  } else if (winningTeam === 1) {
    return `${trade.team1Name} appears to have gotten the better end of this deal, acquiring ${team2Players} at a favorable price. ${trade.team2Name} may have been desperate to move on.`;
  } else {
    return `${trade.team2Name} seems to have won this trade, getting ${team1Players} in exchange. ${trade.team1Name} may have overpaid to address an urgent need.`;
  }
}

export type {
  PlayerTradePackage,
  TradeAssets,
  TradedPlayer,
  TradedPick,
  CPUTradeEvaluation,
  CPUTradePreferences,
  TradeBlockPlayer,
  TradeInquiry,
  TradeDeadlineEvent,
  CompletedTrade,
  TradeRumor,
  TradeGrade,
};
