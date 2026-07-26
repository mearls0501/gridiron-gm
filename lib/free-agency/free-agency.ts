// @ts-nocheck
/**
 * Free Agency System
 * Handles free agent classification, contract negotiations, and signings
 */

import {
  NFLPlayer,
  Contract,
  ContractYear,
  ContractIncentive,
  PlayerPersonality,
  calculateMarketValue,
  calculateAgeAdjustedValue,
  projectRemainingYears,
  getSalaryCap,
  getMinimumSalary,
  getFranchiseTagValue,
  POSITION_AGE_CURVES,
  POSITION_VALUE_MULTIPLIERS,
} from "../players/player-contracts";

// =============================================================================
// FREE AGENCY TYPES
// =============================================================================

export interface FreeAgent {
  player: NFLPlayer;
  agentType: "ufa" | "rfa" | "erfa";
  formerTeam: string;
  formerTeamName: string;

  // Market info
  marketValue: number;          // Expected AAV
  projectedContract: ProjectedContract;
  tier: FreeAgentTier;

  // Interest
  interestedTeams: TeamInterest[];
  visits: TeamVisit[];
  offers: ContractOffer[];

  // Player preferences
  preferences: SigningPreferences;

  // Status
  status: "available" | "visiting" | "negotiating" | "signed" | "tagged";
  signedWith?: string;
  signedContract?: Contract;

  // Timeline
  daysOnMarket: number;
  willingness: number;          // 0-100, decreases over time
}

export type FreeAgentTier =
  | "elite"         // Top players at position
  | "starter"       // Clear starters
  | "solid"         // Good depth/situational starters
  | "depth"         // Roster depth
  | "minimum";      // League minimum players

export interface ProjectedContract {
  years: number;
  totalValue: number;
  averagePerYear: number;
  guaranteedMoney: number;
  guaranteedPercent: number;
}

export interface SigningPreferences {
  // Priorities (should sum to 100)
  moneyWeight: number;
  winningWeight: number;
  roleWeight: number;
  locationWeight: number;

  // Specific preferences
  preferredDestinations: string[];    // Team IDs
  avoidTeams: string[];
  wantsStartingRole: boolean;
  wantsContender: boolean;
  hometownTeam?: string;
  hasNoTaxPreference: boolean;        // Prefers no state income tax

  // Deal breakers
  minimumGuaranteed: number;
  minimumYears: number;
  maximumYears: number;
}

export interface TeamInterest {
  teamId: string;
  teamName: string;
  interestLevel: number;        // 0-100
  need: number;                 // How much they need this position
  canAfford: boolean;
  capSpace: number;
  isContender: boolean;
  hasVisited: boolean;
  hasOffered: boolean;
}

export interface TeamVisit {
  teamId: string;
  teamName: string;
  date: Date;
  duration: "half_day" | "full_day";
  outcome: "positive" | "neutral" | "negative" | "pending";
  interestChange: number;       // How much player interest changed
  notes: string;
}

// =============================================================================
// CONTRACT OFFERS
// =============================================================================

export interface ContractOffer {
  id: string;
  playerId: string;
  teamId: string;
  teamName: string;

  // Terms
  years: number;
  totalValue: number;
  guaranteed: number;
  signingBonus: number;

  // Year breakdown
  yearlyBreakdown: ContractOfferYear[];

  // Clauses
  noTradeClause: boolean;
  optionYear?: {
    year: number;
    type: "team" | "player";
    salary: number;
  };
  incentives: ContractIncentive[];

  // Status
  status: "pending" | "accepted" | "rejected" | "countered" | "expired" | "withdrawn";
  expiresAt: Date;
  submittedAt: Date;

  // Evaluation
  playerInterest: number;       // 0-100
  marketComparison: "above" | "at" | "below";
  ranking: number;              // Where this offer ranks among all offers
}

export interface ContractOfferYear {
  year: number;
  baseSalary: number;
  signingBonusProration: number;
  rosterBonus: number;
  capHit: number;
  guaranteed: boolean;
}

export interface CounterOffer {
  originalOfferId: string;
  requestedChanges: {
    totalValue?: number;
    guaranteed?: number;
    years?: number;
    noTradeClause?: boolean;
  };
  message: string;
}

// =============================================================================
// FREE AGENCY CALENDAR
// =============================================================================

export interface FreeAgencyCalendar {
  currentPhase: FreeAgencyPhase;
  currentDate: Date;
  events: FreeAgencyEvent[];
}

export type FreeAgencyPhase =
  | "pre_free_agency"      // Before March
  | "tag_window"           // March 1-3: Franchise tag window
  | "legal_tampering"      // March 4-6: Can negotiate, not sign
  | "free_agency_open"     // March 7+: Can sign
  | "post_draft"           // After draft: UDFAs
  | "training_camp"        // July: Camp cuts
  | "regular_season"       // In-season signings
  | "off_season";          // General offseason

export interface FreeAgencyEvent {
  date: Date;
  type: "signing" | "visit" | "tag" | "offer" | "withdrawal" | "market_update";
  headline: string;
  details: string;
  teams: string[];
  playerId?: string;
  playerName?: string;
}

export const FREE_AGENCY_PHASES: Record<FreeAgencyPhase, { name: string; description: string }> = {
  pre_free_agency: {
    name: "Pre-Free Agency",
    description: "Teams preparing for free agency. No contact with other teams' players.",
  },
  tag_window: {
    name: "Franchise Tag Window",
    description: "Teams can apply franchise or transition tags to retain players.",
  },
  legal_tampering: {
    name: "Legal Tampering Period",
    description: "Teams can negotiate with pending free agents but cannot sign contracts.",
  },
  free_agency_open: {
    name: "Free Agency Open",
    description: "Free agents can officially sign with new teams.",
  },
  post_draft: {
    name: "Post-Draft",
    description: "Undrafted free agents can sign with teams.",
  },
  training_camp: {
    name: "Training Camp",
    description: "Teams making roster cuts. Released players become free agents.",
  },
  regular_season: {
    name: "Regular Season",
    description: "In-season free agent signings available.",
  },
  off_season: {
    name: "Off-Season",
    description: "General offseason period.",
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Determine free agent tier based on rating and age
 */
export function determineFreeAgentTier(player: NFLPlayer): FreeAgentTier {
  const ageAdjusted = calculateAgeAdjustedValue(player, new Date().getFullYear());

  if (ageAdjusted >= 88) return "elite";
  if (ageAdjusted >= 80) return "starter";
  if (ageAdjusted >= 72) return "solid";
  if (ageAdjusted >= 65) return "depth";
  return "minimum";
}

/**
 * Project contract for a free agent
 */
export function projectContract(
  player: NFLPlayer,
  currentSeason: number
): ProjectedContract {
  const marketValue = calculateMarketValue(player, currentSeason);
  const yearsRemaining = projectRemainingYears(player);
  const tier = determineFreeAgentTier(player);

  // Determine contract length
  let years: number;
  if (tier === "elite") {
    years = Math.min(5, Math.max(3, yearsRemaining));
  } else if (tier === "starter") {
    years = Math.min(4, Math.max(2, yearsRemaining));
  } else if (tier === "solid") {
    years = Math.min(3, Math.max(1, yearsRemaining));
  } else {
    years = Math.min(2, Math.max(1, yearsRemaining));
  }

  const totalValue = marketValue * years;

  // Guaranteed money varies by tier
  let guaranteedPercent: number;
  if (tier === "elite") guaranteedPercent = 0.55;
  else if (tier === "starter") guaranteedPercent = 0.40;
  else if (tier === "solid") guaranteedPercent = 0.30;
  else guaranteedPercent = 0.15;

  const guaranteedMoney = Math.round(totalValue * guaranteedPercent);

  return {
    years,
    totalValue,
    averagePerYear: marketValue,
    guaranteedMoney,
    guaranteedPercent: Math.round(guaranteedPercent * 100),
  };
}

/**
 * Generate signing preferences for a player
 */
export function generateSigningPreferences(player: NFLPlayer): SigningPreferences {
  const personality = player.personality;

  // Base weights from personality
  let moneyWeight = personality.prioritizesMoney;
  let winningWeight = personality.prioritizesWinning;
  let roleWeight = personality.prioritizesRole;
  let locationWeight = personality.prioritizesLocation;

  // Normalize to 100
  const total = moneyWeight + winningWeight + roleWeight + locationWeight;
  moneyWeight = Math.round((moneyWeight / total) * 100);
  winningWeight = Math.round((winningWeight / total) * 100);
  roleWeight = Math.round((roleWeight / total) * 100);
  locationWeight = 100 - moneyWeight - winningWeight - roleWeight;

  // Determine minimums based on market value
  const projectedContract = projectContract(player, new Date().getFullYear());
  const minimumGuaranteed = Math.round(projectedContract.guaranteedMoney * 0.7);

  // Years preference based on age
  const ageCurve = POSITION_AGE_CURVES[player.position];
  const minimumYears = player.age >= ageCurve?.declineStart ? 1 : 2;
  const maximumYears = player.age >= ageCurve?.cliff ? 2 : 5;

  return {
    moneyWeight,
    winningWeight,
    roleWeight,
    locationWeight,
    preferredDestinations: personality.preferredRegions || [],
    avoidTeams: personality.avoidTeams || [],
    wantsStartingRole: player.overall >= 78,
    wantsContender: winningWeight >= 30,
    hometownTeam: personality.hometownTeam,
    hasNoTaxPreference: locationWeight >= 25,
    minimumGuaranteed,
    minimumYears,
    maximumYears,
  };
}

// =============================================================================
// CONTRACT EVALUATION
// =============================================================================

/**
 * Calculate player's interest in an offer
 */
export function evaluateContractOffer(
  offer: ContractOffer,
  player: NFLPlayer,
  preferences: SigningPreferences,
  teamInfo: {
    isContender: boolean;
    wouldBeStarter: boolean;
    location: string;
    isHometown: boolean;
    hasNoStateTax: boolean;
    currentRecord: string;
  },
  marketContext: {
    projectedContract: ProjectedContract;
    otherOffers: ContractOffer[];
  }
): {
  interest: number;
  factors: { factor: string; impact: number; detail: string }[];
  willAccept: boolean;
  counterRequest?: CounterOffer;
} {
  const factors: { factor: string; impact: number; detail: string }[] = [];
  let baseInterest = 50;

  // === MONEY FACTOR ===
  const marketAAV = marketContext.projectedContract.averagePerYear;
  const offerAAV = offer.totalValue / offer.years;
  const moneyRatio = offerAAV / marketAAV;

  let moneyImpact = 0;
  if (moneyRatio >= 1.2) {
    moneyImpact = 25;
    factors.push({ factor: "Money", impact: moneyImpact, detail: "Well above market value" });
  } else if (moneyRatio >= 1.05) {
    moneyImpact = 15;
    factors.push({ factor: "Money", impact: moneyImpact, detail: "Above market value" });
  } else if (moneyRatio >= 0.95) {
    moneyImpact = 5;
    factors.push({ factor: "Money", impact: moneyImpact, detail: "At market value" });
  } else if (moneyRatio >= 0.85) {
    moneyImpact = -10;
    factors.push({ factor: "Money", impact: moneyImpact, detail: "Below market value" });
  } else {
    moneyImpact = -25;
    factors.push({ factor: "Money", impact: moneyImpact, detail: "Significantly below market" });
  }

  // Weight by priority
  moneyImpact *= (preferences.moneyWeight / 100);
  baseInterest += moneyImpact;

  // === GUARANTEED MONEY ===
  const guaranteedRatio = offer.guaranteed / marketContext.projectedContract.guaranteedMoney;
  let guaranteedImpact = 0;

  if (guaranteedRatio >= 1.2) {
    guaranteedImpact = 15;
    factors.push({ factor: "Guaranteed", impact: guaranteedImpact, detail: "Excellent security" });
  } else if (guaranteedRatio >= 0.9) {
    guaranteedImpact = 5;
    factors.push({ factor: "Guaranteed", impact: guaranteedImpact, detail: "Fair guarantees" });
  } else if (guaranteedRatio < 0.7) {
    guaranteedImpact = -15;
    factors.push({ factor: "Guaranteed", impact: guaranteedImpact, detail: "Low guarantees" });
  }

  baseInterest += guaranteedImpact * 0.7; // Guarantees always matter

  // === WINNING FACTOR ===
  let winningImpact = 0;
  if (teamInfo.isContender) {
    winningImpact = 20;
    factors.push({ factor: "Winning", impact: winningImpact, detail: "Championship contender" });
  } else if (teamInfo.currentRecord.includes("winning")) {
    winningImpact = 8;
    factors.push({ factor: "Winning", impact: winningImpact, detail: "Competitive team" });
  } else {
    winningImpact = -5;
    factors.push({ factor: "Winning", impact: winningImpact, detail: "Rebuilding team" });
  }

  winningImpact *= (preferences.winningWeight / 100);
  baseInterest += winningImpact;

  // === ROLE FACTOR ===
  let roleImpact = 0;
  if (preferences.wantsStartingRole) {
    if (teamInfo.wouldBeStarter) {
      roleImpact = 15;
      factors.push({ factor: "Role", impact: roleImpact, detail: "Guaranteed starting role" });
    } else {
      roleImpact = -20;
      factors.push({ factor: "Role", impact: roleImpact, detail: "Would be backup" });
    }
  } else {
    if (teamInfo.wouldBeStarter) {
      roleImpact = 8;
      factors.push({ factor: "Role", impact: roleImpact, detail: "Starting opportunity" });
    }
  }

  roleImpact *= (preferences.roleWeight / 100);
  baseInterest += roleImpact;

  // === LOCATION FACTOR ===
  let locationImpact = 0;
  if (teamInfo.isHometown) {
    locationImpact = 20;
    factors.push({ factor: "Location", impact: locationImpact, detail: "Hometown team!" });
  } else if (preferences.hasNoTaxPreference && teamInfo.hasNoStateTax) {
    locationImpact = 10;
    factors.push({ factor: "Location", impact: locationImpact, detail: "No state income tax" });
  } else if (preferences.avoidTeams.includes(offer.teamId)) {
    locationImpact = -30;
    factors.push({ factor: "Location", impact: locationImpact, detail: "Wants to avoid this team" });
  }

  locationImpact *= (preferences.locationWeight / 100);
  baseInterest += locationImpact;

  // === CONTRACT LENGTH ===
  let lengthImpact = 0;
  if (offer.years < preferences.minimumYears) {
    lengthImpact = -15;
    factors.push({ factor: "Length", impact: lengthImpact, detail: "Too short" });
  } else if (offer.years > preferences.maximumYears) {
    lengthImpact = -10;
    factors.push({ factor: "Length", impact: lengthImpact, detail: "Too long" });
  }

  baseInterest += lengthImpact;

  // === NO TRADE CLAUSE ===
  if (offer.noTradeClause && player.proBowls > 0) {
    factors.push({ factor: "NTC", impact: 5, detail: "No-trade clause included" });
    baseInterest += 5;
  }

  // === COMPARE TO OTHER OFFERS ===
  if (marketContext.otherOffers.length > 0) {
    const bestOtherOffer = Math.max(...marketContext.otherOffers.map(o => o.totalValue));
    if (offer.totalValue < bestOtherOffer * 0.9) {
      const betterOfferImpact = -10;
      factors.push({ factor: "Competition", impact: betterOfferImpact, detail: "Better offers exist" });
      baseInterest += betterOfferImpact;
    }
  }

  // Normalize interest to 0-100
  const interest = Math.max(0, Math.min(100, Math.round(baseInterest)));

  // Determine if will accept
  const willAccept = interest >= 70 && offer.guaranteed >= preferences.minimumGuaranteed;

  // Generate counter request if close but not accepting
  let counterRequest: CounterOffer | undefined;
  if (!willAccept && interest >= 50) {
    counterRequest = {
      originalOfferId: offer.id,
      requestedChanges: {},
      message: "",
    };

    if (moneyRatio < 1.0) {
      counterRequest.requestedChanges.totalValue = Math.round(marketAAV * offer.years * 1.05);
      counterRequest.message = "Looking for something closer to market value.";
    }
    if (guaranteedRatio < 0.9) {
      counterRequest.requestedChanges.guaranteed = Math.round(
        marketContext.projectedContract.guaranteedMoney * 0.95
      );
      counterRequest.message += " Need more guaranteed money for security.";
    }
    if (offer.years < preferences.minimumYears) {
      counterRequest.requestedChanges.years = preferences.minimumYears;
      counterRequest.message += ` Looking for at least ${preferences.minimumYears} years.`;
    }
  }

  return {
    interest,
    factors,
    willAccept,
    counterRequest,
  };
}

// =============================================================================
// CPU TEAM FREE AGENCY BEHAVIOR
// =============================================================================

export interface CPUFreeAgencyPreferences {
  teamId: string;
  teamName: string;
  capSpace: number;
  maxSpendOnSinglePlayer: number;
  isContending: boolean;
  needs: string[];              // Position priorities
  aggressiveness: number;       // 0-100
  preferYouth: boolean;
}

/**
 * CPU team evaluates a free agent
 */
export function cpuEvaluateFreeAgent(
  freeAgent: FreeAgent,
  cpu: CPUFreeAgencyPreferences
): {
  interested: boolean;
  interestLevel: number;
  wouldOffer: boolean;
  maxOffer: number;
  reasoning: string;
} {
  const player = freeAgent.player;
  const currentSeason = new Date().getFullYear();
  const marketValue = freeAgent.marketValue;

  let interestLevel = 30; // Base interest
  const reasons: string[] = [];

  // Check if can afford
  if (cpu.capSpace < marketValue * 0.7) {
    return {
      interested: false,
      interestLevel: 0,
      wouldOffer: false,
      maxOffer: 0,
      reasoning: "Cannot afford player",
    };
  }

  // Position need
  const positionNeedIndex = cpu.needs.indexOf(player.position);
  if (positionNeedIndex === 0) {
    interestLevel += 35;
    reasons.push("Fills top need");
  } else if (positionNeedIndex >= 0 && positionNeedIndex <= 2) {
    interestLevel += 20;
    reasons.push("Addresses a need");
  } else if (positionNeedIndex === -1) {
    interestLevel -= 15;
    reasons.push("Not a position of need");
  }

  // Player quality
  const ageAdjusted = calculateAgeAdjustedValue(player, currentSeason);
  if (ageAdjusted >= 85) {
    interestLevel += 25;
    reasons.push("Elite talent");
  } else if (ageAdjusted >= 78) {
    interestLevel += 15;
    reasons.push("Quality starter");
  } else if (ageAdjusted < 70) {
    interestLevel -= 10;
    reasons.push("Limited upside");
  }

  // Age consideration
  const yearsRemaining = projectRemainingYears(player);
  if (cpu.preferYouth && yearsRemaining < 3) {
    interestLevel -= 15;
    reasons.push("Prefer younger players");
  }
  if (!cpu.isContending && yearsRemaining < 2) {
    interestLevel -= 20;
    reasons.push("Doesn't fit rebuild timeline");
  }

  // Contender bonus for impact players
  if (cpu.isContending && ageAdjusted >= 80) {
    interestLevel += 15;
    reasons.push("Win-now addition");
  }

  // Aggressiveness factor
  interestLevel = interestLevel * (0.7 + (cpu.aggressiveness / 100) * 0.6);

  interestLevel = Math.max(0, Math.min(100, Math.round(interestLevel)));

  const interested = interestLevel >= 40;
  const wouldOffer = interestLevel >= 55 && cpu.capSpace >= marketValue * 0.8;

  // Calculate max offer
  let maxOffer = 0;
  if (wouldOffer) {
    const baseOffer = marketValue;
    const needMultiplier = positionNeedIndex === 0 ? 1.1 : positionNeedIndex <= 2 ? 1.0 : 0.9;
    const aggressivenessMultiplier = 0.9 + (cpu.aggressiveness / 100) * 0.2;

    maxOffer = Math.min(
      cpu.maxSpendOnSinglePlayer,
      Math.round(baseOffer * needMultiplier * aggressivenessMultiplier)
    );
  }

  return {
    interested,
    interestLevel,
    wouldOffer,
    maxOffer,
    reasoning: reasons.join(". "),
  };
}

/**
 * Generate CPU team's contract offer
 */
export function generateCPUOffer(
  freeAgent: FreeAgent,
  cpu: CPUFreeAgencyPreferences,
  maxOffer: number
): ContractOffer {
  const player = freeAgent.player;
  const projected = freeAgent.projectedContract;
  const currentSeason = new Date().getFullYear();

  // Determine years
  const yearsRemaining = projectRemainingYears(player);
  let years = Math.min(projected.years, yearsRemaining);
  if (cpu.preferYouth) years = Math.min(years, 2);

  // Calculate total value
  const aav = Math.min(maxOffer, freeAgent.marketValue * (0.95 + Math.random() * 0.15));
  const totalValue = Math.round(aav * years);

  // Calculate guaranteed
  const tier = freeAgent.tier;
  let guaranteedPercent = tier === "elite" ? 0.5 : tier === "starter" ? 0.35 : 0.25;
  if (cpu.aggressiveness >= 70) guaranteedPercent += 0.1;
  const guaranteed = Math.round(totalValue * guaranteedPercent);

  // Signing bonus (typically 40-60% of guaranteed)
  const signingBonus = Math.round(guaranteed * (0.4 + Math.random() * 0.2));

  // Build yearly breakdown
  const yearlyBreakdown: ContractOfferYear[] = [];
  const bonusProration = Math.round(signingBonus / years);
  let remainingGuaranteed = guaranteed - signingBonus;

  for (let i = 0; i < years; i++) {
    const year = currentSeason + i;
    // Escalating salaries
    const salaryPercent = 0.7 + (i / years) * 0.6;
    const baseSalary = Math.round((totalValue / years) * salaryPercent);

    const isGuaranteed = remainingGuaranteed > 0;
    if (isGuaranteed) remainingGuaranteed -= baseSalary;

    yearlyBreakdown.push({
      year,
      baseSalary,
      signingBonusProration: bonusProration,
      rosterBonus: i > 0 ? Math.round(baseSalary * 0.1) : 0,
      capHit: baseSalary + bonusProration + (i > 0 ? Math.round(baseSalary * 0.1) : 0),
      guaranteed: isGuaranteed,
    });
  }

  return {
    id: `offer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    playerId: player.id,
    teamId: cpu.teamId,
    teamName: cpu.teamName,
    years,
    totalValue,
    guaranteed,
    signingBonus,
    yearlyBreakdown,
    noTradeClause: false,
    incentives: [],
    status: "pending",
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
    submittedAt: new Date(),
    playerInterest: 0, // Will be calculated
    marketComparison: totalValue >= freeAgent.marketValue * years ? "above" : "below",
    ranking: 0,
  };
}

// =============================================================================
// RECRUITING ACTIONS
// =============================================================================

export type RecruitingAction =
  | "facility_tour"
  | "coach_meeting"
  | "player_endorsement"
  | "improved_offer"
  | "hometown_pitch";

export interface RecruitingActionConfig {
  type: RecruitingAction;
  name: string;
  description: string;
  interestBoost: number;        // Base interest increase
  cost: number;                 // Cap/resource cost
  requirements?: string;
  cooldown: number;             // Days before can use again
}

export const RECRUITING_ACTIONS: Record<RecruitingAction, RecruitingActionConfig> = {
  facility_tour: {
    type: "facility_tour",
    name: "Facility Tour",
    description: "Show the player your world-class facilities",
    interestBoost: 8,
    cost: 0,
    cooldown: 0,
  },
  coach_meeting: {
    type: "coach_meeting",
    name: "Coach Meeting",
    description: "Head coach explains the vision and player's role",
    interestBoost: 12,
    cost: 0,
    cooldown: 1,
  },
  player_endorsement: {
    type: "player_endorsement",
    name: "Player Endorsement",
    description: "Have a current player recruit the free agent",
    interestBoost: 15,
    cost: 0,
    requirements: "Must have player at same position or from same college",
    cooldown: 2,
  },
  improved_offer: {
    type: "improved_offer",
    name: "Improved Offer",
    description: "Sweeten the deal with more money or guarantees",
    interestBoost: 20,
    cost: 5000000,              // Additional cap commitment
    cooldown: 1,
  },
  hometown_pitch: {
    type: "hometown_pitch",
    name: "Hometown Pitch",
    description: "Appeal to the player's connection to the area",
    interestBoost: 25,
    cost: 0,
    requirements: "Only works if player has connection to your city",
    cooldown: 0,
  },
};

/**
 * Apply recruiting action effect
 */
export function applyRecruitingAction(
  action: RecruitingAction,
  freeAgent: FreeAgent,
  teamId: string,
  hasConnection: boolean = false
): {
  success: boolean;
  interestChange: number;
  message: string;
} {
  const config = RECRUITING_ACTIONS[action];

  // Check requirements
  if (action === "hometown_pitch" && !hasConnection) {
    return {
      success: false,
      interestChange: 0,
      message: "Player has no connection to your city",
    };
  }

  if (action === "player_endorsement" && !hasConnection) {
    return {
      success: false,
      interestChange: 0,
      message: "No suitable player to make endorsement",
    };
  }

  // Calculate actual boost (with some randomness)
  const baseBoost = config.interestBoost;
  const variance = Math.floor(Math.random() * 10) - 5; // -5 to +5
  let actualBoost = baseBoost + variance;

  // Player personality affects receptiveness
  const personality = freeAgent.player.personality;
  if (action === "facility_tour" && personality.prioritizesLocation > 30) {
    actualBoost *= 1.2;
  }
  if (action === "coach_meeting" && personality.workEthic > 70) {
    actualBoost *= 1.3;
  }
  if (action === "improved_offer" && personality.prioritizesMoney > 40) {
    actualBoost *= 1.4;
  }
  if (action === "hometown_pitch") {
    actualBoost *= 1.5; // Always impactful when applicable
  }

  actualBoost = Math.round(actualBoost);

  // Update interest in team
  const teamInterest = freeAgent.interestedTeams.find(t => t.teamId === teamId);
  if (teamInterest) {
    teamInterest.interestLevel = Math.min(100, teamInterest.interestLevel + actualBoost);
  }

  const messages: Record<RecruitingAction, string> = {
    facility_tour: `${freeAgent.player.name} was impressed by the facilities (+${actualBoost} interest)`,
    coach_meeting: `${freeAgent.player.name} connected with the coaching staff (+${actualBoost} interest)`,
    player_endorsement: `The player endorsement resonated with ${freeAgent.player.name} (+${actualBoost} interest)`,
    improved_offer: `${freeAgent.player.name} appreciates the improved terms (+${actualBoost} interest)`,
    hometown_pitch: `${freeAgent.player.name} was moved by the hometown appeal (+${actualBoost} interest)`,
  };

  return {
    success: true,
    interestChange: actualBoost,
    message: messages[action],
  };
}

// =============================================================================
// FREE AGENCY MARKET SIMULATION
// =============================================================================

/**
 * Simulate a day of free agency activity
 */
export function simulateFreeAgencyDay(
  freeAgents: FreeAgent[],
  cpuTeams: CPUFreeAgencyPreferences[],
  currentPhase: FreeAgencyPhase
): FreeAgencyEvent[] {
  const events: FreeAgencyEvent[] = [];

  // Only process signings if FA is open
  if (currentPhase !== "free_agency_open" && currentPhase !== "regular_season") {
    return events;
  }

  for (const fa of freeAgents) {
    if (fa.status !== "available" && fa.status !== "negotiating") continue;

    // Increase days on market
    fa.daysOnMarket++;

    // Decrease willingness over time (players get anxious)
    if (fa.daysOnMarket > 7) {
      fa.willingness = Math.max(40, fa.willingness - 2);
    }

    // CPU teams make decisions
    for (const cpu of cpuTeams) {
      const evaluation = cpuEvaluateFreeAgent(fa, cpu);

      if (evaluation.wouldOffer && !fa.offers.find(o => o.teamId === cpu.teamId)) {
        // Generate and submit offer
        const offer = generateCPUOffer(fa, cpu, evaluation.maxOffer);

        // Evaluate player's interest
        const offerEval = evaluateContractOffer(
          offer,
          fa.player,
          fa.preferences,
          {
            isContender: cpu.isContending,
            wouldBeStarter: true, // Simplified
            location: cpu.teamId,
            isHometown: fa.preferences.hometownTeam === cpu.teamId,
            hasNoStateTax: false,
            currentRecord: cpu.isContending ? "10-6 (winning)" : "5-11",
          },
          {
            projectedContract: fa.projectedContract,
            otherOffers: fa.offers,
          }
        );

        offer.playerInterest = offerEval.interest;
        fa.offers.push(offer);

        events.push({
          date: new Date(),
          type: "offer",
          headline: `${cpu.teamName} offers ${fa.player.position} ${fa.player.name}`,
          details: `${offer.years} years, $${(offer.totalValue / 1000000).toFixed(1)}M`,
          teams: [cpu.teamId],
          playerId: fa.player.id,
          playerName: fa.player.name,
        });

        // Check if player accepts immediately (high interest + good offer)
        if (offerEval.willAccept && offerEval.interest >= 80) {
          fa.status = "signed";
          fa.signedWith = cpu.teamId;
          offer.status = "accepted";

          events.push({
            date: new Date(),
            type: "signing",
            headline: `${fa.player.name} signs with ${cpu.teamName}!`,
            details: `${offer.years} year, $${(offer.totalValue / 1000000).toFixed(1)}M deal ($${(offer.guaranteed / 1000000).toFixed(1)}M guaranteed)`,
            teams: [cpu.teamId, fa.formerTeam],
            playerId: fa.player.id,
            playerName: fa.player.name,
          });

          break;
        }
      }
    }

    // Check if player accepts best existing offer (if on market too long)
    if (fa.status === "available" && fa.daysOnMarket >= 14 && fa.offers.length > 0) {
      const bestOffer = fa.offers.reduce((best, current) =>
        current.playerInterest > best.playerInterest ? current : best
      );

      if (bestOffer.playerInterest >= 60) {
        fa.status = "signed";
        fa.signedWith = bestOffer.teamId;
        bestOffer.status = "accepted";

        events.push({
          date: new Date(),
          type: "signing",
          headline: `${fa.player.name} signs with ${bestOffer.teamName}`,
          details: `${bestOffer.years} year, $${(bestOffer.totalValue / 1000000).toFixed(1)}M deal`,
          teams: [bestOffer.teamId, fa.formerTeam],
          playerId: fa.player.id,
          playerName: fa.player.name,
        });
      }
    }
  }

  return events;
}

export type {
  FreeAgent,
  ProjectedContract,
  TeamInterest,
  TeamVisit,
  ContractOffer,
  ContractOfferYear,
  CounterOffer,
  FreeAgencyCalendar,
  FreeAgencyEvent,
  CPUFreeAgencyPreferences,
};
