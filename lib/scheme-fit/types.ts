// ==========================================
// Player Archetype Definitions by Position
// ==========================================

// Quarterback Archetypes
export type QBArchetype =
  | "pocket_passer"       // Tom Brady - Stays in pocket, reads defense, accurate
  | "gunslinger"          // Brett Favre, Mahomes - High risk/reward, arm talent
  | "game_manager"        // Alex Smith - Efficient, low turnover, safe
  | "dual_threat"         // Lamar Jackson - Run/pass balance, athletic
  | "scrambler"           // Russell Wilson - Extends plays, improvises
  | "system_qb"           // Needs specific system to thrive
  | "project"             // Raw tools, needs development
  | "field_general";      // Leadership-first, makes others better

// Running Back Archetypes
export type RBArchetype =
  | "power_back"          // Derrick Henry - Between tackles, wears down defenses
  | "zone_runner"         // Nick Chubb - Patient, one-cut, reads blocks
  | "scat_back"           // Austin Ekeler - Receiving, 3rd down, change of pace
  | "speed_back"          // Raheem Mostert - Home run hitter, breakaway
  | "all_purpose"         // Christian McCaffrey - Does everything well
  | "short_yardage"       // Goal line specialist, truck stick
  | "committee_back"      // Role player, solid but not featured
  | "receiving_back";     // Pass catching specialist out of backfield

// Wide Receiver Archetypes
export type WRArchetype =
  | "deep_threat"         // Tyreek Hill - Stretches field, speed kills
  | "possession"          // Michael Thomas - Reliable, chain mover
  | "slot_receiver"       // Cooper Kupp - Middle of field, quick routes
  | "contested_catch"     // Mike Evans - 50/50 balls, red zone
  | "route_technician"    // Davante Adams - Creates separation
  | "rac_specialist"      // Deebo Samuel - YAC monster
  | "red_zone_threat"     // Big body, fade routes, touchdowns
  | "gadget_receiver";    // Jet sweeps, versatile, trick plays

// Tight End Archetypes
export type TEArchetype =
  | "receiving_te"        // Travis Kelce - Matchup nightmare
  | "blocking_te"         // Traditional, run game focused
  | "move_te"             // George Kittle - Hybrid, does both
  | "h_back"              // Fullback hybrid, short area
  | "seam_threat"         // Attacks middle deep
  | "red_zone_te"         // Big body, endzone target
  | "utility_te";         // Does everything acceptably

// Offensive Line Archetypes
export type OLArchetype =
  | "road_grader"         // Quenton Nelson - Nasty, powerful mauler
  | "zone_blocker"        // Athletic, reach blocks, second level
  | "pass_protector"      // Anchor, technique, pass-first
  | "mauler"              // Physical, run game oriented
  | "technician"          // Fundamentally sound, consistent
  | "athletic_freak"      // Project with physical tools
  | "versatile"           // Can play multiple positions
  | "anchor";             // Immovable in pass pro

// Defensive Line Archetypes (DE/DT)
export type DLArchetype =
  | "edge_rusher"         // Speed to power, sack artist
  | "power_rusher"        // Bull rush, collapse pocket
  | "finesse_rusher"      // Moves, bend, technique
  | "run_stuffer"         // Gap control, eat blocks
  | "interior_pressure"   // Aaron Donald - Inside disruption
  | "two_gap"             // 3-4 nose, occupies blockers
  | "one_gap"             // Penetrating, shooting gaps
  | "hybrid_dl"           // 3-4 OLB / 4-3 DE versatility
  | "leo";                // Stand up rusher, multiple positions

// Linebacker Archetypes
export type LBArchetype =
  | "mike_lb"             // Middle, run stopper, signal caller
  | "will_lb"             // Weak side, coverage, pursuit
  | "sam_lb"              // Strong side, run support, TE coverage
  | "coverage_lb"         // Pass coverage specialist
  | "blitzer"             // Aggressive, attacking, sack threat
  | "tackling_machine"    // High volume tackler, range
  | "hybrid_lb"           // Safety/LB hybrid, versatile
  | "run_thumper";        // Downhill, physical, run game

// Cornerback Archetypes
export type CBArchetype =
  | "shutdown"            // Jalen Ramsey - Island, follows #1
  | "zone_corner"         // Pattern reading, ball hawk
  | "man_specialist"      // Press, physical, sticky
  | "slot_corner"         // Inside specialist, quickness
  | "ball_hawk"           // Interception specialist
  | "physical_corner"     // Press, bump and run
  | "speed_corner"        // Recovery speed, deep coverage
  | "scheme_versatile";   // Can play any scheme

// Safety Archetypes
export type SafetyArchetype =
  | "free_safety"         // Centerfield, range, ball skills
  | "strong_safety"       // Box safety, run support
  | "hybrid_safety"       // LB/S hybrid, versatile
  | "slot_eraser"         // Covers slot receivers
  | "ball_hawk_safety"    // Interception focused
  | "enforcer"            // Big hitter, intimidator
  | "cover_safety"        // Man coverage specialist
  | "robber";             // Pattern reading, zone instincts

// Special Teams (simplified)
export type STArchetype =
  | "power_kicker"        // Strong leg, distance
  | "accurate_kicker"     // High percentage, clutch
  | "booming_punter"      // Hang time, distance
  | "directional_punter"; // Placement, coffin corner

// Union type for all player archetypes
export type PlayerArchetype =
  | QBArchetype
  | RBArchetype
  | WRArchetype
  | TEArchetype
  | OLArchetype
  | DLArchetype
  | LBArchetype
  | CBArchetype
  | SafetyArchetype
  | STArchetype;

// ==========================================
// Scheme Fit Types
// ==========================================

export type FitLevel = "perfect" | "good" | "acceptable" | "poor" | "terrible";

export interface SchemeFitResult {
  playerId: string;
  playerName: string;
  archetype: PlayerArchetype;
  scheme: string;

  fitLevel: FitLevel;
  fitScore: number;              // 0-100

  // Performance impact
  performanceModifier: number;   // -30 to +15 OVR points
  effectiveRating: number;       // What they play like

  // Development impact
  developmentModifier: number;   // -0.5 to +0.25 (percentage)
  wrongSkillsWarning: boolean;   // Training wrong attributes

  // Relationship impact
  coachFrustration: number;      // 0-50, affects GM-Coach relationship

  // Explanations
  explanation: string;
  detailedAnalysis: string[];
  recommendations: string[];
}

// ==========================================
// Scheme Fit Configuration
// ==========================================

export interface PositionSchemeFit {
  primary: PlayerArchetype[];     // Perfect fits (+10 to +15)
  acceptable: PlayerArchetype[];  // Good fits (0 to +5)
  poor: PlayerArchetype[];        // Bad fits (-15 to -25)
  // Anything not listed = neutral (-5)
}

export interface OffensiveSchemeFitConfig {
  scheme: OffensiveScheme;
  description: string;
  keyTraits: string[];           // What this scheme values
  QB: PositionSchemeFit;
  RB: PositionSchemeFit;
  WR: PositionSchemeFit;
  TE: PositionSchemeFit;
  OL: PositionSchemeFit;
}

export interface DefensiveSchemeFitConfig {
  scheme: DefensiveScheme;
  description: string;
  keyTraits: string[];
  DL: PositionSchemeFit;
  EDGE: PositionSchemeFit;
  LB: PositionSchemeFit;
  CB: PositionSchemeFit;
  S: PositionSchemeFit;
}

// Import scheme types from existing files
export type OffensiveScheme =
  | "west_coast"
  | "spread"
  | "air_raid"
  | "pro_style"
  | "power_run"
  | "zone_run"
  | "rpo_heavy"
  | "balanced";

export type DefensiveScheme =
  | "4-3_base"
  | "3-4_base"
  | "multiple"
  | "cover_2"
  | "cover_3"
  | "man_heavy"
  | "zone_heavy"
  | "aggressive_blitz";

// ==========================================
// Player with Archetype
// ==========================================

export interface PlayerArchetypeData {
  primary: PlayerArchetype;
  confidence: number;            // 0-100, how strongly they fit
  secondary?: PlayerArchetype;   // Some players are hybrids
  secondaryConfidence?: number;
}

export interface SchemeHistory {
  scheme: string;
  teamId: string;
  seasons: number;
  adaptation: number;            // 0-100, how well they learned it
  performanceInScheme: number;   // Average effective rating
}

export interface PlayerSchemeProfile {
  playerId: string;
  archetype: PlayerArchetypeData;
  schemeHistory: SchemeHistory[];

  // The "Baker Mayfield effect" tracking
  trueTalent: number;            // Actual ability
  perceivedTalent: number;       // What teams/media think
  talentGap: number;             // Difference (can be + or -)

  // Career trajectory
  bestSchemeFit: string | null;
  worstSchemeFit: string | null;
  isSchemeDependent: boolean;    // High variance between schemes
}

// ==========================================
// Archetype Detection from Attributes
// ==========================================

export interface ArchetypeRequirement {
  required: Record<string, number>;   // Must meet these minimums
  preferred: Record<string, number>;  // Bonus if met
  antiPatterns?: Record<string, number>; // If above these, NOT this archetype
}

export type ArchetypeRequirements = {
  [K in PlayerArchetype]?: ArchetypeRequirement;
};

// ==========================================
// Disagreement Types (for relationships)
// ==========================================

export interface SchemeDisagreement {
  id: string;
  type: "player_usage" | "scheme_philosophy" | "personnel_fit" | "development_priority";
  severity: "minor" | "moderate" | "major" | "critical";

  playerId: string;
  playerName: string;
  playerArchetype: PlayerArchetype;

  gmPosition: string;            // What the GM thinks
  coachPosition: string;         // What the coach thinks

  schemeFit: SchemeFitResult;

  relationshipImpact: number;    // -5 to -30
  seasonWeek: number;
  season: number;

  resolution?: SchemeResolution;
  resolvedAt?: number;
}

export type SchemeResolution =
  | "gm_defers"       // GM lets coach use player his way
  | "coach_adapts"    // Coach adjusts scheme/usage
  | "trade_player"    // Get rid of the problem
  | "fire_coach"      // Owner sides with GM
  | "fire_gm"         // Owner sides with coach
  | "compromise"      // Split usage, find middle ground
  | "unresolved";     // Tension continues

// ==========================================
// Development Impact Types
// ==========================================

export interface DevelopmentImpact {
  playerId: string;
  season: number;

  schemeFit: FitLevel;
  fitModifier: number;           // -0.5 to +0.25

  // Attribute changes
  correctSkillGains: Record<string, number>;  // Skills that match archetype
  wrongSkillGains: Record<string, number>;    // Skills forced by scheme

  // Long-term effects
  potentialChange: number;       // Can lose potential in wrong scheme
  archetypeStability: number;    // Is archetype being reinforced or diluted?

  // Warnings
  warnings: string[];
}

// ==========================================
// Performance Tracking
// ==========================================

export interface SeasonPerformance {
  playerId: string;
  season: number;
  teamId: string;

  // Ratings
  baseRating: number;            // Actual skill level
  schemeFitModifier: number;     // From scheme calculation
  usageModifier: number;         // How they're being used
  effectiveRating: number;       // What they played like

  // Stats impact
  statMultiplier: number;        // Affects counting stats
  efficiencyMultiplier: number;  // Affects rate stats

  // Context
  scheme: string;
  role: string;
  snapPercentage: number;
}

// ==========================================
// Career Arc Types (for storytelling)
// ==========================================

export type CareerArcType =
  | "late_bloomer"       // Struggled early, found right fit (Tannehill)
  | "early_peak"         // Great start, declined
  | "scheme_dependent"   // Huge variance by team (Baker, Geno)
  | "consistent"         // Same level everywhere
  | "bust"               // Never worked out
  | "journeyman"         // Bounced around, found a home
  | "system_product"     // Only good in one place
  | "transcendent";      // Great everywhere

export interface CareerArc {
  playerId: string;
  arcType: CareerArcType;
  keyMoments: {
    season: number;
    event: string;
    impact: string;
  }[];
  schemeJourney: {
    teamId: string;
    scheme: string;
    seasons: number;
    fitLevel: FitLevel;
    avgEffectiveRating: number;
    narrative: string;
  }[];
}
