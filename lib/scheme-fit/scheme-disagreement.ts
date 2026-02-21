import {
  SchemeDisagreement,
  SchemeResolution,
  SchemeFitResult,
  PlayerArchetype,
  FitLevel,
} from "./types";
import { v4 as uuidv4 } from "uuid";

// ==========================================
// Scheme Disagreement Detection
// ==========================================

export interface GMEvaluation {
  playerId: string;
  playerName: string;
  projectedRole: string;
  draftRound?: number;
  investmentLevel: "high" | "medium" | "low";
  evaluationNotes: string;
}

export interface CoachUsage {
  playerId: string;
  primaryRole: string;
  snapPercentage: number;
  schemeRole: string;
  coachNotes: string;
}

export interface DisagreementContext {
  season: number;
  week: number;
  teamId: string;
  gmId: string;
  coachId: string;
  gmName: string;
  coachName: string;
}

export function detectSchemeDisagreement(
  gmEvaluation: GMEvaluation,
  coachUsage: CoachUsage,
  schemeFit: SchemeFitResult,
  context: DisagreementContext
): SchemeDisagreement | null {
  // No disagreement if fit is good
  if (schemeFit.fitLevel === "perfect" || schemeFit.fitLevel === "good") {
    return null;
  }

  // No disagreement if player wasn't a significant investment
  if (gmEvaluation.investmentLevel === "low" && schemeFit.fitLevel === "acceptable") {
    return null;
  }

  // Check for role mismatch
  const roleMismatch = detectRoleMismatch(
    gmEvaluation.projectedRole,
    coachUsage.primaryRole,
    schemeFit.archetype
  );

  if (!roleMismatch && schemeFit.fitLevel === "acceptable") {
    return null;
  }

  // Calculate severity
  let severity: SchemeDisagreement["severity"];
  if (schemeFit.fitLevel === "terrible") {
    severity = "critical";
  } else if (schemeFit.fitLevel === "poor" && gmEvaluation.investmentLevel === "high") {
    severity = "major";
  } else if (schemeFit.fitLevel === "poor") {
    severity = "moderate";
  } else {
    severity = "minor";
  }

  // Generate positions
  const gmPosition = generateGMPosition(
    gmEvaluation,
    schemeFit
  );
  const coachPosition = generateCoachPosition(
    coachUsage,
    schemeFit
  );

  // Calculate relationship impact
  const relationshipImpact = calculateRelationshipImpact(
    severity,
    gmEvaluation.investmentLevel,
    schemeFit.fitScore
  );

  return {
    id: `disagreement_${uuidv4()}`,
    type: roleMismatch ? "player_usage" : "scheme_philosophy",
    severity,
    playerId: gmEvaluation.playerId,
    playerName: gmEvaluation.playerName,
    playerArchetype: schemeFit.archetype,
    gmPosition,
    coachPosition,
    schemeFit,
    relationshipImpact,
    seasonWeek: context.week,
    season: context.season,
  };
}

function detectRoleMismatch(
  gmProjectedRole: string,
  coachActualRole: string,
  archetype: PlayerArchetype
): boolean {
  // Map archetypes to expected roles
  const archetypeRoles: Record<string, string[]> = {
    zone_runner: ["zone_back", "primary_rb", "feature_back", "every_down_back"],
    power_back: ["power_back", "short_yardage", "goal_line", "early_down"],
    scat_back: ["third_down", "receiving_back", "change_of_pace", "passing_down"],
    pocket_passer: ["dropback_qb", "starter", "franchise_qb"],
    dual_threat: ["mobile_qb", "rpo_qb", "starter"],
    shutdown: ["cb1", "shadow", "outside_cb"],
    zone_corner: ["zone_cb", "off_coverage", "outside_cb"],
    man_specialist: ["press_cb", "man_corner", "cb1"],
  };

  const expectedRoles = archetypeRoles[archetype] ?? [];
  const gmLower = gmProjectedRole.toLowerCase();
  const coachLower = coachActualRole.toLowerCase();

  // Check if GM's projection matches archetype expectations
  const gmMatchesArchetype = expectedRoles.some(
    (role) => gmLower.includes(role) || role.includes(gmLower)
  );

  // Check if coach's usage matches archetype expectations
  const coachMatchesArchetype = expectedRoles.some(
    (role) => coachLower.includes(role) || role.includes(coachLower)
  );

  // Mismatch if GM projected correctly but coach uses differently
  return gmMatchesArchetype && !coachMatchesArchetype;
}

function generateGMPosition(
  evaluation: GMEvaluation,
  schemeFit: SchemeFitResult
): string {
  const archetype = schemeFit.archetype.replace(/_/g, " ");
  const investmentText =
    evaluation.investmentLevel === "high"
      ? evaluation.draftRound
        ? `a ${getOrdinal(evaluation.draftRound)} round pick`
        : "significant draft capital"
      : "resources";

  if (schemeFit.fitLevel === "poor" || schemeFit.fitLevel === "terrible") {
    return `I invested ${investmentText} in ${evaluation.playerName} because he's a ${archetype}. His skill set was built for ${evaluation.projectedRole}. Using him in a scheme that doesn't fit his abilities is wasting his talent and our investment.`;
  }

  return `${evaluation.playerName} was brought in to be a ${evaluation.projectedRole}. I evaluated him as a ${archetype}, and he should be used in ways that maximize those traits.`;
}

function generateCoachPosition(
  usage: CoachUsage,
  schemeFit: SchemeFitResult
): string {
  const scheme = schemeFit.scheme.replace(/_/g, " ");

  if (schemeFit.fitLevel === "poor" || schemeFit.fitLevel === "terrible") {
    return `My ${scheme} scheme requires specific player types. ${usage.coachNotes || `I have to use ${schemeFit.playerName} where the team needs him`}, even if it's not his ideal role. I can't redesign my entire offense around one player.`;
  }

  return `I'm using ${schemeFit.playerName} in the role that best serves the team's scheme. My job is to put players in positions to help us win, and right now that means ${usage.primaryRole}.`;
}

function calculateRelationshipImpact(
  severity: SchemeDisagreement["severity"],
  investment: GMEvaluation["investmentLevel"],
  fitScore: number
): number {
  let baseImpact: number;

  switch (severity) {
    case "critical":
      baseImpact = -25;
      break;
    case "major":
      baseImpact = -18;
      break;
    case "moderate":
      baseImpact = -12;
      break;
    case "minor":
      baseImpact = -6;
      break;
    default:
      baseImpact = -5;
  }

  // Investment modifier
  if (investment === "high") {
    baseImpact *= 1.3;
  } else if (investment === "low") {
    baseImpact *= 0.7;
  }

  // Fit score modifier (worse fit = more tension)
  const fitModifier = (50 - fitScore) / 50;
  baseImpact *= 1 + fitModifier * 0.3;

  return Math.round(baseImpact);
}

function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ==========================================
// Disagreement Resolution
// ==========================================

export interface ResolutionOutcome {
  resolution: SchemeResolution;
  gmTrustChange: number;
  coachTrustChange: number;
  playerImpact: {
    tradedTo?: string;
    roleChange?: string;
    performanceChange: number;
  };
  narrativeText: string;
}

export function resolveDisagreement(
  disagreement: SchemeDisagreement,
  resolution: SchemeResolution,
  context: {
    ownerSide?: "gm" | "coach" | "neutral";
    playerPerformance: "good" | "average" | "poor";
    teamRecord: { wins: number; losses: number };
  }
): ResolutionOutcome {
  let gmTrustChange = 0;
  let coachTrustChange = 0;
  let performanceChange = 0;
  let narrativeText = "";

  switch (resolution) {
    case "gm_defers":
      gmTrustChange = -5; // GM looks weak
      coachTrustChange = 10; // Coach got his way
      performanceChange = disagreement.schemeFit.performanceModifier; // Player continues to struggle
      narrativeText = `${disagreement.playerName}'s GM has backed off, allowing the coach to continue using him in the ${disagreement.schemeFit.scheme.replace(/_/g, " ")} scheme. The player's struggles may continue.`;
      break;

    case "coach_adapts":
      gmTrustChange = 10; // GM's evaluation validated
      coachTrustChange = -8; // Coach had to compromise his scheme
      performanceChange = Math.abs(disagreement.schemeFit.performanceModifier) * 0.6; // Player improves
      narrativeText = `The coaching staff has adjusted their usage of ${disagreement.playerName}, incorporating more plays that fit his ${disagreement.playerArchetype.replace(/_/g, " ")} skill set.`;
      break;

    case "trade_player":
      gmTrustChange = context.playerPerformance === "poor" ? 5 : -10; // Depends on if it was the right call
      coachTrustChange = context.playerPerformance === "poor" ? 5 : -5;
      performanceChange = 0; // Player is gone
      narrativeText = `${disagreement.playerName} has been traded to a team with a better scheme fit, ending the disagreement but potentially leaving value on the table.`;
      break;

    case "fire_coach":
      gmTrustChange = 15;
      coachTrustChange = -100; // Coach is gone
      performanceChange = 0; // Will depend on new coach
      narrativeText = `The organization has sided with the GM, parting ways with the head coach over philosophical differences in player usage.`;
      break;

    case "fire_gm":
      gmTrustChange = -100; // GM is gone
      coachTrustChange = 15;
      performanceChange = disagreement.schemeFit.performanceModifier;
      narrativeText = `The organization has sided with the coach. The GM has been relieved of duties, and the team will continue with the current scheme.`;
      break;

    case "compromise":
      gmTrustChange = 0;
      coachTrustChange = 0;
      performanceChange = disagreement.schemeFit.performanceModifier * 0.5; // Split the difference
      narrativeText = `Both sides have reached a compromise. ${disagreement.playerName} will see a mix of roles, with the coaching staff incorporating some plays that better fit his skill set.`;
      break;

    case "unresolved":
    default:
      gmTrustChange = disagreement.relationshipImpact;
      coachTrustChange = disagreement.relationshipImpact;
      performanceChange = disagreement.schemeFit.performanceModifier;
      narrativeText = `The tension between GM and coach over ${disagreement.playerName}'s usage remains unresolved. The situation continues to simmer beneath the surface.`;
      break;
  }

  // Owner involvement modifier
  if (context.ownerSide === "gm" && resolution !== "fire_gm") {
    gmTrustChange += 5;
    coachTrustChange -= 5;
  } else if (context.ownerSide === "coach" && resolution !== "fire_coach") {
    gmTrustChange -= 5;
    coachTrustChange += 5;
  }

  // Team performance modifier
  if (context.teamRecord.losses > context.teamRecord.wins + 4) {
    // Bad team = more pressure on everyone
    gmTrustChange -= 3;
    coachTrustChange -= 3;
  }

  return {
    resolution,
    gmTrustChange: Math.round(gmTrustChange),
    coachTrustChange: Math.round(coachTrustChange),
    playerImpact: {
      tradedTo: resolution === "trade_player" ? "TBD" : undefined,
      roleChange: resolution === "coach_adapts" || resolution === "compromise"
        ? "Adjusted to fit archetype"
        : undefined,
      performanceChange: Math.round(performanceChange),
    },
    narrativeText,
  };
}

// ==========================================
// Multi-Season Tracking
// ==========================================

export interface SchemeDisagreementHistory {
  playerId: string;
  playerName: string;
  disagreements: SchemeDisagreement[];
  resolutions: ResolutionOutcome[];
  careerArc: "late_bloomer" | "scheme_dependent" | "consistent" | "bust" | "unknown";
  teamsPlayed: {
    teamId: string;
    scheme: string;
    seasons: number;
    effectiveRating: number;
    fitLevel: FitLevel;
  }[];
}

export function analyzePlayerSchemeHistory(
  history: SchemeDisagreementHistory
): {
  isSchemeDependent: boolean;
  bestScheme: string | null;
  worstScheme: string | null;
  ratingVariance: number;
  narrative: string;
} {
  if (history.teamsPlayed.length < 2) {
    return {
      isSchemeDependent: false,
      bestScheme: null,
      worstScheme: null,
      ratingVariance: 0,
      narrative: `${history.playerName} hasn't played in enough schemes to determine dependence.`,
    };
  }

  const ratings = history.teamsPlayed.map((t) => t.effectiveRating);
  const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const variance =
    ratings.reduce((sum, r) => sum + Math.pow(r - avgRating, 2), 0) / ratings.length;
  const ratingVariance = Math.sqrt(variance);

  // Find best and worst
  const sorted = [...history.teamsPlayed].sort(
    (a, b) => b.effectiveRating - a.effectiveRating
  );
  const bestScheme = sorted[0].scheme;
  const worstScheme = sorted[sorted.length - 1].scheme;

  // Determine if scheme dependent
  const isSchemeDependent = ratingVariance > 8;

  // Generate narrative
  let narrative: string;
  if (isSchemeDependent) {
    const bestRating = sorted[0].effectiveRating;
    const worstRating = sorted[sorted.length - 1].effectiveRating;
    narrative = `${history.playerName} is a scheme-dependent player. He's played like a ${bestRating} overall in ${bestScheme.replace(/_/g, " ")} schemes but struggled as a ${worstRating} in ${worstScheme.replace(/_/g, " ")} schemes. Finding the right fit is crucial for his success.`;
  } else {
    narrative = `${history.playerName} has shown consistent performance across different schemes, averaging ${Math.round(avgRating)} regardless of system.`;
  }

  return {
    isSchemeDependent,
    bestScheme,
    worstScheme,
    ratingVariance,
    narrative,
  };
}

// ==========================================
// The Baker Mayfield Effect
// ==========================================

export interface CareerResurrection {
  playerId: string;
  playerName: string;
  lowPoint: {
    season: number;
    teamId: string;
    scheme: string;
    effectiveRating: number;
    publicPerception: number; // What people thought
  };
  resurrection: {
    season: number;
    teamId: string;
    scheme: string;
    effectiveRating: number;
    publicPerception: number;
  };
  ratingSwing: number;
  perceptionSwing: number;
  narrative: string;
}

export function detectCareerResurrection(
  history: SchemeDisagreementHistory
): CareerResurrection | null {
  if (history.teamsPlayed.length < 3) {
    return null;
  }

  // Find if there's a significant low followed by a high
  for (let i = 0; i < history.teamsPlayed.length - 1; i++) {
    const current = history.teamsPlayed[i];
    const next = history.teamsPlayed[i + 1];

    // Look for 15+ point improvement
    if (
      next.effectiveRating - current.effectiveRating >= 15 &&
      current.fitLevel === "poor" &&
      (next.fitLevel === "perfect" || next.fitLevel === "good")
    ) {
      return {
        playerId: history.playerId,
        playerName: history.playerName,
        lowPoint: {
          season: i + 1, // Placeholder
          teamId: current.teamId,
          scheme: current.scheme,
          effectiveRating: current.effectiveRating,
          publicPerception: current.effectiveRating - 10, // Perception lagged
        },
        resurrection: {
          season: i + 2,
          teamId: next.teamId,
          scheme: next.scheme,
          effectiveRating: next.effectiveRating,
          publicPerception: next.effectiveRating - 5,
        },
        ratingSwing: next.effectiveRating - current.effectiveRating,
        perceptionSwing: (next.effectiveRating - 5) - (current.effectiveRating - 10),
        narrative: generateResurrectionNarrative(
          history.playerName,
          current,
          next
        ),
      };
    }
  }

  return null;
}

function generateResurrectionNarrative(
  playerName: string,
  lowPoint: SchemeDisagreementHistory["teamsPlayed"][0],
  highPoint: SchemeDisagreementHistory["teamsPlayed"][0]
): string {
  return `${playerName}'s career is a tale of two schemes. After struggling in ${lowPoint.scheme.replace(/_/g, " ")} with a ${lowPoint.effectiveRating} effective rating, many labeled him a bust. But a move to a ${highPoint.scheme.replace(/_/g, " ")} scheme unlocked his potential, and he's now playing at a ${highPoint.effectiveRating} level. It wasn't about talent—it was about fit.`;
}
