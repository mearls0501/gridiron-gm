// @ts-nocheck
import {
  PlayerArchetype,
  OffensiveScheme,
  DefensiveScheme,
  FitLevel,
  SchemeFitResult,
  PlayerArchetypeData,
  SchemeHistory,
  DevelopmentImpact,
  SeasonPerformance,
} from "./types";
import {
  OFFENSIVE_SCHEME_FITS,
  DEFENSIVE_SCHEME_FITS,
  getSchemePosition,
} from "./scheme-fit-matrices";

// ==========================================
// Core Scheme Fit Calculator
// ==========================================

export interface PlayerForFitCalculation {
  id: string;
  name: string;
  position: string;
  overall: number;
  archetype: PlayerArchetypeData;
  schemeHistory?: SchemeHistory[];
  yearsInLeague?: number;
}

export function calculateSchemeFit(
  player: PlayerForFitCalculation,
  scheme: OffensiveScheme | DefensiveScheme,
  isOffense: boolean
): SchemeFitResult {
  const schemePosition = getSchemePosition(player.position, isOffense);
  const schemeFits = isOffense
    ? OFFENSIVE_SCHEME_FITS[scheme as OffensiveScheme]
    : DEFENSIVE_SCHEME_FITS[scheme as DefensiveScheme];

  if (!schemeFits) {
    return createNeutralFit(player, scheme);
  }

  const positionFits = (schemeFits as any)[schemePosition];
  if (!positionFits) {
    return createNeutralFit(player, scheme);
  }

  const archetype = player.archetype.primary;

  // Determine fit level
  let fitLevel: FitLevel;
  let baseFitScore: number;
  let performanceModifier: number;
  let developmentModifier: number;
  let coachFrustration: number;

  if (positionFits.primary.includes(archetype)) {
    fitLevel = "perfect";
    baseFitScore = 90 + Math.floor(Math.random() * 10);
    performanceModifier = 10 + Math.floor(Math.random() * 6); // +10 to +15
    developmentModifier = 0.20 + Math.random() * 0.05; // +20% to +25%
    coachFrustration = 0;
  } else if (positionFits.acceptable.includes(archetype)) {
    fitLevel = "good";
    baseFitScore = 70 + Math.floor(Math.random() * 15);
    performanceModifier = Math.floor(Math.random() * 6); // 0 to +5
    developmentModifier = 0;
    coachFrustration = 0;
  } else if (positionFits.poor.includes(archetype)) {
    fitLevel = "poor";
    baseFitScore = 25 + Math.floor(Math.random() * 20);
    performanceModifier = -15 - Math.floor(Math.random() * 10); // -15 to -25
    developmentModifier = -0.30 - Math.random() * 0.15; // -30% to -45%
    coachFrustration = 25 + Math.floor(Math.random() * 20);
  } else {
    // Not explicitly listed - acceptable but not ideal
    fitLevel = "acceptable";
    baseFitScore = 50 + Math.floor(Math.random() * 15);
    performanceModifier = -5 + Math.floor(Math.random() * 5); // -5 to 0
    developmentModifier = -0.10;
    coachFrustration = 5 + Math.floor(Math.random() * 10);
  }

  // Adjust for secondary archetype if present
  if (player.archetype.secondary && player.archetype.secondaryConfidence) {
    const secondaryBonus = checkSecondaryArchetype(
      player.archetype.secondary,
      positionFits,
      player.archetype.secondaryConfidence
    );
    performanceModifier += secondaryBonus.performanceBonus;
    baseFitScore = Math.min(95, baseFitScore + secondaryBonus.fitBonus);
  }

  // Adjust for scheme experience
  const schemeExperience = player.schemeHistory?.find(
    (h) => h.scheme === scheme
  );
  if (schemeExperience) {
    const experienceBonus = Math.min(5, schemeExperience.seasons * 1.5);
    performanceModifier += experienceBonus;
    baseFitScore = Math.min(98, baseFitScore + experienceBonus);
  }

  // Calculate effective rating
  const effectiveRating = Math.max(
    40,
    Math.min(99, player.overall + performanceModifier)
  );

  // Generate explanation and analysis
  const explanation = generateFitExplanation(player, scheme, fitLevel, isOffense);
  const detailedAnalysis = generateDetailedAnalysis(
    player,
    scheme,
    fitLevel,
    positionFits,
    isOffense
  );
  const recommendations = generateRecommendations(player, scheme, fitLevel, isOffense);

  return {
    playerId: player.id,
    playerName: player.name,
    archetype: archetype,
    scheme: scheme,
    fitLevel,
    fitScore: baseFitScore,
    performanceModifier,
    effectiveRating,
    developmentModifier,
    wrongSkillsWarning: fitLevel === "poor" || fitLevel === "terrible",
    coachFrustration,
    explanation,
    detailedAnalysis,
    recommendations,
  };
}

function createNeutralFit(
  player: PlayerForFitCalculation,
  scheme: string
): SchemeFitResult {
  return {
    playerId: player.id,
    playerName: player.name,
    archetype: player.archetype.primary,
    scheme,
    fitLevel: "acceptable",
    fitScore: 50,
    performanceModifier: 0,
    effectiveRating: player.overall,
    developmentModifier: 0,
    wrongSkillsWarning: false,
    coachFrustration: 0,
    explanation: "Unable to determine specific fit for this scheme and position.",
    detailedAnalysis: [],
    recommendations: [],
  };
}

function checkSecondaryArchetype(
  secondary: PlayerArchetype,
  positionFits: { primary: PlayerArchetype[]; acceptable: PlayerArchetype[]; poor: PlayerArchetype[] },
  confidence: number
): { performanceBonus: number; fitBonus: number } {
  const multiplier = confidence / 100;

  if (positionFits.primary.includes(secondary)) {
    return {
      performanceBonus: Math.floor(5 * multiplier),
      fitBonus: Math.floor(8 * multiplier),
    };
  } else if (positionFits.acceptable.includes(secondary)) {
    return {
      performanceBonus: Math.floor(2 * multiplier),
      fitBonus: Math.floor(4 * multiplier),
    };
  }

  return { performanceBonus: 0, fitBonus: 0 };
}

// ==========================================
// Explanation Generators
// ==========================================

function generateFitExplanation(
  player: PlayerForFitCalculation,
  scheme: string,
  fitLevel: FitLevel,
  isOffense: boolean
): string {
  const archetype = player.archetype.primary;

  // Position-specific explanations for key mismatches
  if (player.position === "RB") {
    if (archetype === "zone_runner" && scheme === "power_run") {
      return `${player.name} is a patient, one-cut zone runner who thrives reading blocks laterally. The power run scheme requires north-south runners who hit predetermined holes. His vision and patience are wasted when plays are designed for power, not zone reads.`;
    }
    if (archetype === "power_back" && scheme === "zone_run") {
      return `${player.name} is a downhill power runner built to run through tackles. The zone scheme requires patience and lateral movement to find cutback lanes. His physical style doesn't maximize the scheme's stretch concepts.`;
    }
    if (archetype === "scat_back" && scheme === "power_run") {
      return `${player.name} is a receiving specialist who excels in space. The power run scheme doesn't utilize his route-running ability or create the matchups where he thrives.`;
    }
  }

  if (player.position === "QB") {
    if (archetype === "pocket_passer" && scheme === "rpo_heavy") {
      return `${player.name} is a traditional pocket passer who excels when given time and clean reads. The RPO-heavy scheme requires a mobile quarterback who can threaten the run. His lack of mobility limits the offense's effectiveness and puts stress on the offensive line.`;
    }
    if (archetype === "dual_threat" && scheme === "west_coast") {
      return `${player.name}'s athleticism is his greatest weapon, but the West Coast offense prioritizes timing and accuracy over mobility. While he can execute the scheme, it doesn't maximize his unique skill set.`;
    }
    if (archetype === "gunslinger" && scheme === "game_manager") {
      return `${player.name} is a risk-taking playmaker with elite arm talent. A conservative game-manager approach limits his ability to make the aggressive throws that are his strength.`;
    }
  }

  if (player.position === "CB") {
    if (archetype === "man_specialist" && (scheme === "cover_2" || scheme === "zone_heavy")) {
      return `${player.name} is a press-man corner who thrives in isolated coverage. Zone schemes require pattern reading and awareness that isn't his strength. His elite man skills are underutilized.`;
    }
    if (archetype === "zone_corner" && (scheme === "man_heavy" || scheme === "aggressive_blitz")) {
      return `${player.name} is a zone corner who reads the quarterback and breaks on throws. Man-heavy schemes require hip fluidity and recovery speed in isolation that don't match his skill set.`;
    }
  }

  if (player.position === "DT" || player.position === "DE") {
    if (archetype === "two_gap" && scheme === "4-3_base") {
      return `${player.name} is a two-gap defender who occupies blockers and controls his gap. The 4-3 scheme requires penetrating one-gap players. His size and style are better suited for a 3-4.`;
    }
    if (archetype === "one_gap" && scheme === "3-4_base") {
      return `${player.name} is a penetrating one-gap player who shoots gaps and creates havoc. The 3-4 requires two-gap discipline and the ability to hold the point of attack.`;
    }
  }

  // Generic explanations based on fit level
  switch (fitLevel) {
    case "perfect":
      return `${player.name}'s ${archetype.replace(/_/g, " ")} skill set is exactly what this ${scheme.replace(/_/g, " ")} scheme demands. He can maximize his abilities and should thrive in this system.`;
    case "good":
      return `${player.name} fits this scheme well as a ${archetype.replace(/_/g, " ")}. While it may not showcase all of his strengths, he should be productive.`;
    case "acceptable":
      return `${player.name} can function in this scheme, but his ${archetype.replace(/_/g, " ")} skill set isn't ideally suited for it. He may not reach his ceiling.`;
    case "poor":
      return `${player.name}'s ${archetype.replace(/_/g, " ")} strengths don't align with what this ${scheme.replace(/_/g, " ")} scheme asks of his position. His development and performance will likely suffer.`;
    case "terrible":
      return `${player.name} is severely miscast in this scheme. His ${archetype.replace(/_/g, " ")} skill set is actively hindered by the system's requirements.`;
    default:
      return `${player.name}'s fit in this scheme is uncertain.`;
  }
}

function generateDetailedAnalysis(
  player: PlayerForFitCalculation,
  scheme: string,
  fitLevel: FitLevel,
  positionFits: { primary: PlayerArchetype[]; acceptable: PlayerArchetype[]; poor: PlayerArchetype[] },
  isOffense: boolean
): string[] {
  const analysis: string[] = [];
  const archetype = player.archetype.primary;

  // What the scheme wants
  analysis.push(
    `Scheme Preference: The ${scheme.replace(/_/g, " ")} scheme ideally wants ${positionFits.primary.slice(0, 3).map((a) => a.replace(/_/g, " ")).join(", ")} players at this position.`
  );

  // What the player is
  analysis.push(
    `Player Profile: ${player.name} is primarily a ${archetype.replace(/_/g, " ")}${
      player.archetype.secondary
        ? ` with secondary ${player.archetype.secondary.replace(/_/g, " ")} traits`
        : ""
    }.`
  );

  // Fit assessment
  if (fitLevel === "perfect") {
    analysis.push(
      `Fit Assessment: Excellent match. The player's archetype is among the most desired for this scheme.`
    );
  } else if (fitLevel === "good") {
    analysis.push(
      `Fit Assessment: Good match. The player can contribute effectively in this scheme.`
    );
  } else if (fitLevel === "poor") {
    analysis.push(
      `Fit Assessment: Poor match. The player's strengths are underutilized or misaligned with scheme requirements.`
    );
    if (positionFits.primary.length > 0) {
      analysis.push(
        `Better Fits: This scheme works best with ${positionFits.primary.slice(0, 2).map((a) => a.replace(/_/g, " ")).join(" or ")} type players.`
      );
    }
  }

  // Development implications
  if (fitLevel === "poor" || fitLevel === "terrible") {
    analysis.push(
      `Development Warning: Playing in this scheme will train skills that don't align with the player's natural strengths. Long-term development may suffer.`
    );
  } else if (fitLevel === "perfect") {
    analysis.push(
      `Development Opportunity: This scheme will reinforce and enhance the player's natural abilities.`
    );
  }

  return analysis;
}

function generateRecommendations(
  player: PlayerForFitCalculation,
  scheme: string,
  fitLevel: FitLevel,
  isOffense: boolean
): string[] {
  const recommendations: string[] = [];
  const archetype = player.archetype.primary;

  if (fitLevel === "perfect" || fitLevel === "good") {
    recommendations.push(`Feature ${player.name} in roles that highlight their ${archetype.replace(/_/g, " ")} abilities.`);
    if (fitLevel === "perfect") {
      recommendations.push(`Consider increasing snap count and responsibility within the scheme.`);
    }
  } else if (fitLevel === "acceptable") {
    recommendations.push(`Use ${player.name} in situational roles where their skills are most applicable.`);
    recommendations.push(`Consider scheme adjustments when they're on the field.`);
  } else if (fitLevel === "poor" || fitLevel === "terrible") {
    recommendations.push(`Limit ${player.name}'s usage or adjust their role within the scheme.`);
    recommendations.push(`Consider trading to a team with a better scheme fit.`);
    recommendations.push(`If keeping, work with position coaches on scheme-specific skill development.`);

    // Suggest better schemes
    const betterSchemes = findBetterSchemes(player.position, archetype, isOffense);
    if (betterSchemes.length > 0) {
      recommendations.push(
        `Better scheme fits: ${betterSchemes.slice(0, 3).map((s) => s.replace(/_/g, " ")).join(", ")}.`
      );
    }
  }

  return recommendations;
}

function findBetterSchemes(
  position: string,
  archetype: PlayerArchetype,
  isOffense: boolean
): string[] {
  const betterSchemes: string[] = [];
  const schemePosition = getSchemePosition(position, isOffense);

  if (isOffense) {
    for (const [scheme, config] of Object.entries(OFFENSIVE_SCHEME_FITS)) {
      const positionFits = (config as any)[schemePosition];
      if (positionFits?.primary.includes(archetype)) {
        betterSchemes.push(scheme);
      }
    }
  } else {
    for (const [scheme, config] of Object.entries(DEFENSIVE_SCHEME_FITS)) {
      const positionFits = (config as any)[schemePosition];
      if (positionFits?.primary.includes(archetype)) {
        betterSchemes.push(scheme);
      }
    }
  }

  return betterSchemes;
}

// ==========================================
// Development Impact Calculator
// ==========================================

export function calculateDevelopmentImpact(
  player: PlayerForFitCalculation,
  schemeFit: SchemeFitResult,
  playingTime: number, // 0-100
  coachDevelopmentSkill: number, // 0-100
  season: number
): DevelopmentImpact {
  const warnings: string[] = [];

  // Base development (younger players develop faster)
  const ageModifier = player.yearsInLeague !== undefined
    ? Math.max(0.5, 1.5 - player.yearsInLeague * 0.1)
    : 1.0;

  const baseDevelopment = 3 * ageModifier; // Base attribute points to gain

  // Modifiers
  const fitMultiplier = 1 + schemeFit.developmentModifier;
  const coachMultiplier = 1 + (coachDevelopmentSkill - 50) / 200; // +/- 25%
  const playingTimeMultiplier = 0.3 + (playingTime / 100) * 0.7; // 30% to 100%

  const totalMultiplier = fitMultiplier * coachMultiplier * playingTimeMultiplier;

  // Attribute gains
  const correctSkillGains: Record<string, number> = {};
  const wrongSkillGains: Record<string, number> = {};

  // If fit is good, player develops correct skills
  if (schemeFit.fitLevel === "perfect" || schemeFit.fitLevel === "good") {
    // Gain in archetype-relevant skills
    const archetypeSkills = getArchetypeSkills(player.archetype.primary);
    archetypeSkills.forEach((skill) => {
      correctSkillGains[skill] = Math.floor(baseDevelopment * totalMultiplier);
    });
  } else if (schemeFit.fitLevel === "poor" || schemeFit.fitLevel === "terrible") {
    // Wrong skills being trained
    warnings.push(
      `${player.name} is being trained in skills that don't match their natural archetype.`
    );
    warnings.push(`Long-term potential may decrease if this continues.`);

    // Scheme-demanded skills improve slightly
    const schemeSkills = getSchemeSkills(schemeFit.scheme);
    schemeSkills.forEach((skill) => {
      wrongSkillGains[skill] = Math.floor(baseDevelopment * 0.3 * Math.abs(totalMultiplier));
    });

    // Natural skills stagnate or regress
    const archetypeSkills = getArchetypeSkills(player.archetype.primary);
    archetypeSkills.forEach((skill) => {
      correctSkillGains[skill] = Math.floor(baseDevelopment * -0.1);
    });
  } else {
    // Acceptable fit - normal development but not optimized
    const archetypeSkills = getArchetypeSkills(player.archetype.primary);
    archetypeSkills.forEach((skill) => {
      correctSkillGains[skill] = Math.floor(baseDevelopment * totalMultiplier * 0.7);
    });
  }

  // Potential change
  let potentialChange = 0;
  if (schemeFit.fitLevel === "poor") {
    potentialChange = -1;
    warnings.push(`Potential ceiling may decrease due to scheme mismatch.`);
  } else if (schemeFit.fitLevel === "terrible") {
    potentialChange = -2;
    warnings.push(`Significant potential loss expected from continued scheme mismatch.`);
  } else if (schemeFit.fitLevel === "perfect" && totalMultiplier > 1.2) {
    potentialChange = 1; // Can actually increase potential in ideal fit
  }

  // Archetype stability
  let archetypeStability = 100;
  if (Object.keys(wrongSkillGains).length > 0) {
    archetypeStability = 60 - Object.keys(wrongSkillGains).length * 5;
    warnings.push(
      `Player's archetype identity is being diluted by scheme requirements.`
    );
  }

  return {
    playerId: player.id,
    season,
    schemeFit: schemeFit.fitLevel,
    fitModifier: schemeFit.developmentModifier,
    correctSkillGains,
    wrongSkillGains,
    potentialChange,
    archetypeStability,
    warnings,
  };
}

function getArchetypeSkills(archetype: PlayerArchetype): string[] {
  // Return skills that should be developed for this archetype
  const skillsByArchetype: Record<string, string[]> = {
    zone_runner: ["vision", "patience", "acceleration", "agility", "one_cut_ability"],
    power_back: ["strength", "break_tackle", "trucking", "balance", "yards_after_contact"],
    pocket_passer: ["accuracy_short", "accuracy_mid", "pocket_presence", "vision", "decision_making"],
    dual_threat: ["speed", "agility", "throw_on_run", "elusiveness", "ball_carrier_vision"],
    shutdown: ["man_coverage", "press", "recovery_speed", "ball_skills"],
    zone_corner: ["zone_coverage", "play_recognition", "break_on_ball", "anticipation"],
    two_gap: ["strength", "anchor", "block_shedding", "gap_control"],
    one_gap: ["first_step", "penetration", "quickness", "pass_rush_moves"],
    // Add more...
  };

  return skillsByArchetype[archetype] ?? ["overall"];
}

function getSchemeSkills(scheme: string): string[] {
  // Return skills demanded by this scheme
  const skillsByScheme: Record<string, string[]> = {
    power_run: ["strength", "power", "north_south", "physicality"],
    zone_run: ["vision", "patience", "lateral_movement", "one_cut"],
    west_coast: ["accuracy_short", "timing", "route_running", "yac"],
    rpo_heavy: ["mobility", "decision_making", "throw_on_run", "read_option"],
    man_heavy: ["man_coverage", "press", "hip_fluidity"],
    zone_heavy: ["zone_coverage", "pattern_reading", "ball_skills"],
    // Add more...
  };

  return skillsByScheme[scheme] ?? [];
}

// ==========================================
// Season Performance Calculator
// ==========================================

export function calculateSeasonPerformance(
  player: PlayerForFitCalculation,
  schemeFit: SchemeFitResult,
  role: string,
  snapPercentage: number
): SeasonPerformance {
  // Usage modifier based on role match
  const usageModifier = calculateUsageModifier(player.archetype.primary, role);

  // Final effective rating
  const effectiveRating = Math.max(
    40,
    Math.min(
      99,
      player.overall + schemeFit.performanceModifier + usageModifier
    )
  );

  // Stat multipliers
  const statMultiplier = effectiveRating / player.overall;
  const efficiencyMultiplier =
    schemeFit.fitLevel === "perfect"
      ? 1.1
      : schemeFit.fitLevel === "poor"
      ? 0.85
      : 1.0;

  return {
    playerId: player.id,
    season: 0, // Set by caller
    teamId: "", // Set by caller
    baseRating: player.overall,
    schemeFitModifier: schemeFit.performanceModifier,
    usageModifier,
    effectiveRating,
    statMultiplier,
    efficiencyMultiplier,
    scheme: schemeFit.scheme,
    role,
    snapPercentage,
  };
}

function calculateUsageModifier(archetype: PlayerArchetype, role: string): number {
  // Check if the role matches the archetype
  const roleMatches: Record<string, string[]> = {
    zone_runner: ["zone_back", "primary_runner", "feature_back"],
    power_back: ["power_back", "short_yardage", "goal_line"],
    scat_back: ["third_down_back", "receiving_back", "change_of_pace"],
    pocket_passer: ["dropback_qb", "pro_style_qb"],
    dual_threat: ["mobile_qb", "rpo_qb", "option_qb"],
    shutdown: ["cb1", "shadow_corner", "island"],
    zone_corner: ["zone_cb", "off_corner"],
    // Add more...
  };

  const matchingRoles = roleMatches[archetype] ?? [];
  if (matchingRoles.includes(role.toLowerCase())) {
    return 3; // Bonus for correct usage
  } else if (role.toLowerCase().includes("backup") || role.toLowerCase().includes("depth")) {
    return 0; // Neutral for depth roles
  }

  return -3; // Penalty for mismatched usage
}

// ==========================================
// Batch Evaluation
// ==========================================

export function evaluateRosterFit(
  players: PlayerForFitCalculation[],
  offensiveScheme: OffensiveScheme,
  defensiveScheme: DefensiveScheme
): {
  fits: SchemeFitResult[];
  overallOffenseFit: number;
  overallDefenseFit: number;
  problemPlayers: SchemeFitResult[];
  recommendations: string[];
} {
  const fits: SchemeFitResult[] = [];
  const offenseFits: SchemeFitResult[] = [];
  const defenseFits: SchemeFitResult[] = [];

  for (const player of players) {
    const isOffense = ["QB", "RB", "WR", "TE", "OT", "OG", "C", "FB"].includes(
      player.position
    );
    const scheme = isOffense ? offensiveScheme : defensiveScheme;
    const fit = calculateSchemeFit(player, scheme, isOffense);

    fits.push(fit);

    if (isOffense) {
      offenseFits.push(fit);
    } else {
      defenseFits.push(fit);
    }
  }

  // Calculate overall fit scores
  const overallOffenseFit =
    offenseFits.length > 0
      ? Math.round(
          offenseFits.reduce((sum, f) => sum + f.fitScore, 0) / offenseFits.length
        )
      : 0;

  const overallDefenseFit =
    defenseFits.length > 0
      ? Math.round(
          defenseFits.reduce((sum, f) => sum + f.fitScore, 0) / defenseFits.length
        )
      : 0;

  // Find problem players
  const problemPlayers = fits.filter(
    (f) => f.fitLevel === "poor" || f.fitLevel === "terrible"
  );

  // Generate roster-level recommendations
  const recommendations: string[] = [];

  if (problemPlayers.length > 3) {
    recommendations.push(
      `Warning: ${problemPlayers.length} players have poor scheme fit. Consider scheme adjustment or roster turnover.`
    );
  }

  if (overallOffenseFit < 60) {
    recommendations.push(
      `Offensive roster fit is below average (${overallOffenseFit}%). Prioritize acquiring players who fit the ${offensiveScheme.replace(/_/g, " ")} scheme.`
    );
  }

  if (overallDefenseFit < 60) {
    recommendations.push(
      `Defensive roster fit is below average (${overallDefenseFit}%). Prioritize acquiring players who fit the ${defensiveScheme.replace(/_/g, " ")} scheme.`
    );
  }

  return {
    fits,
    overallOffenseFit,
    overallDefenseFit,
    problemPlayers,
    recommendations,
  };
}
