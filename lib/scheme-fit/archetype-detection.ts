import {
  PlayerArchetype,
  PlayerArchetypeData,
  QBArchetype,
  RBArchetype,
  WRArchetype,
  TEArchetype,
  OLArchetype,
  DLArchetype,
  LBArchetype,
  CBArchetype,
  SafetyArchetype,
  ArchetypeRequirement,
} from "./types";

// ==========================================
// Archetype Requirements by Position
// ==========================================

// QB Archetype Detection
const QB_ARCHETYPE_REQUIREMENTS: Record<QBArchetype, ArchetypeRequirement> = {
  pocket_passer: {
    required: { arm_strength: 70, accuracy_short: 78, accuracy_mid: 75, pocket_presence: 78 },
    preferred: { football_iq: 75, vision: 75, release_speed: 70 },
    antiPatterns: { speed: 82 }, // If too fast, probably not a pure pocket passer
  },
  gunslinger: {
    required: { arm_strength: 85, throw_power: 85, confidence: 80 },
    preferred: { throw_on_run: 70, deep_accuracy: 75 },
    antiPatterns: { decision_making: 85 }, // Gunslingers take risks
  },
  game_manager: {
    required: { accuracy_short: 80, decision_making: 80, composure: 78 },
    preferred: { football_iq: 75, leadership: 70 },
    antiPatterns: { arm_strength: 88, risk_taking: 70 },
  },
  dual_threat: {
    required: { speed: 82, acceleration: 82, agility: 78, throw_on_run: 72 },
    preferred: { elusiveness: 75, ball_carrier_vision: 70 },
  },
  scrambler: {
    required: { speed: 78, agility: 80, improvisation: 80, throw_on_run: 75 },
    preferred: { elusiveness: 78, pocket_presence: 65 },
  },
  system_qb: {
    required: { accuracy_short: 75, timing: 78, coachability: 80 },
    preferred: { football_iq: 70 },
  },
  project: {
    required: { arm_strength: 75, athletic_ceiling: 80 },
    preferred: { coachability: 75 },
    antiPatterns: { technique: 75, accuracy_mid: 75 }, // Raw, not refined
  },
  field_general: {
    required: { leadership: 85, football_iq: 82, composure: 80, communication: 80 },
    preferred: { pocket_presence: 75, decision_making: 78 },
  },
};

// RB Archetype Detection
const RB_ARCHETYPE_REQUIREMENTS: Record<RBArchetype, ArchetypeRequirement> = {
  power_back: {
    required: { strength: 80, break_tackle: 80, trucking: 78 },
    preferred: { balance: 72, stiff_arm: 72, yards_after_contact: 75 },
    antiPatterns: { agility: 88 }, // Power backs aren't usually super agile
  },
  zone_runner: {
    required: { vision: 85, patience: 82, acceleration: 78, agility: 78 },
    preferred: { one_cut_ability: 80, balance: 72 },
  },
  scat_back: {
    required: { route_running: 72, catching: 78, agility: 82, speed: 78 },
    preferred: { elusiveness: 78, pass_block: 60 },
  },
  speed_back: {
    required: { speed: 90, acceleration: 88, breakaway_speed: 88 },
    preferred: { agility: 75, elusiveness: 72 },
  },
  all_purpose: {
    required: { speed: 78, catching: 75, vision: 75, agility: 78 },
    preferred: { route_running: 70, break_tackle: 68, pass_block: 65 },
  },
  short_yardage: {
    required: { strength: 82, break_tackle: 82, balance: 78, low_pad_level: 80 },
    preferred: { trucking: 80 },
  },
  committee_back: {
    required: { vision: 70, durability: 75 },
    preferred: { versatility: 70 },
  },
  receiving_back: {
    required: { catching: 82, route_running: 78, hands: 80 },
    preferred: { agility: 75, separation: 70 },
  },
};

// WR Archetype Detection
const WR_ARCHETYPE_REQUIREMENTS: Record<WRArchetype, ArchetypeRequirement> = {
  deep_threat: {
    required: { speed: 92, acceleration: 88, release: 78 },
    preferred: { tracking: 72, vertical: 75 },
  },
  possession: {
    required: { catching: 88, catch_in_traffic: 82, route_running: 82 },
    preferred: { hand_strength: 78, body_control: 75 },
  },
  slot_receiver: {
    required: { agility: 85, route_running: 82, separation: 82, quickness: 85 },
    preferred: { yac: 78, toughness: 72 },
  },
  contested_catch: {
    required: { catch_in_traffic: 85, jumping: 82, height: 74 }, // height in inches
    preferred: { body_control: 80, hand_strength: 78 },
  },
  route_technician: {
    required: { route_running: 90, separation: 85, release: 82 },
    preferred: { football_iq: 78, deception: 75 },
  },
  rac_specialist: {
    required: { yac: 88, elusiveness: 82, break_tackle: 72, acceleration: 82 },
    preferred: { vision: 75, agility: 80 },
  },
  red_zone_threat: {
    required: { catching: 80, jumping: 80, body_control: 80, height: 74 },
    preferred: { catch_in_traffic: 78, fade_route: 78 },
  },
  gadget_receiver: {
    required: { versatility: 80, agility: 80, speed: 82 },
    preferred: { ball_carrier_vision: 72, elusiveness: 75 },
  },
};

// TE Archetype Detection
const TE_ARCHETYPE_REQUIREMENTS: Record<TEArchetype, ArchetypeRequirement> = {
  receiving_te: {
    required: { catching: 82, route_running: 78, separation: 75 },
    preferred: { yac: 72, speed: 75 },
    antiPatterns: { run_block: 82 }, // Not primarily a blocker
  },
  blocking_te: {
    required: { run_block: 82, pass_block: 78, strength: 80 },
    preferred: { anchor: 75, toughness: 78 },
  },
  move_te: {
    required: { catching: 75, run_block: 75, route_running: 72, speed: 78 },
    preferred: { yac: 72, versatility: 78 },
  },
  h_back: {
    required: { run_block: 78, pass_block: 72, lead_block: 80 },
    preferred: { catching: 65, short_area: 72 },
  },
  seam_threat: {
    required: { speed: 82, catching: 78, deep_route: 78 },
    preferred: { vertical: 75, body_control: 72 },
  },
  red_zone_te: {
    required: { catching: 78, height: 76, jumping: 75, body_control: 78 },
    preferred: { catch_in_traffic: 75 },
  },
  utility_te: {
    required: { catching: 70, run_block: 70, route_running: 68 },
    preferred: { versatility: 75, football_iq: 72 },
  },
};

// OL Archetype Detection
const OL_ARCHETYPE_REQUIREMENTS: Record<OLArchetype, ArchetypeRequirement> = {
  road_grader: {
    required: { run_block: 85, strength: 85, nastiness: 82 },
    preferred: { power: 82, finish: 80 },
  },
  zone_blocker: {
    required: { agility: 78, speed: 72, reach_block: 80, combo_block: 78 },
    preferred: { football_iq: 75, second_level: 75 },
  },
  pass_protector: {
    required: { pass_block: 85, anchor: 82, technique: 80 },
    preferred: { footwork: 78, hand_placement: 78 },
  },
  mauler: {
    required: { strength: 88, run_block: 82, physicality: 85 },
    preferred: { nastiness: 80, toughness: 78 },
  },
  technician: {
    required: { technique: 85, hand_placement: 82, footwork: 82 },
    preferred: { football_iq: 78, consistency: 80 },
  },
  athletic_freak: {
    required: { agility: 82, speed: 75, athletic_ceiling: 85 },
    preferred: { bend: 78 },
    antiPatterns: { technique: 78 }, // Raw, not refined
  },
  versatile: {
    required: { versatility: 82, football_iq: 78 },
    preferred: { pass_block: 72, run_block: 72 },
  },
  anchor: {
    required: { anchor: 88, strength: 82, pass_block: 80 },
    preferred: { balance: 78, technique: 75 },
  },
};

// DL Archetype Detection
const DL_ARCHETYPE_REQUIREMENTS: Record<DLArchetype, ArchetypeRequirement> = {
  edge_rusher: {
    required: { speed: 82, acceleration: 82, bend: 80, first_step: 85 },
    preferred: { pass_rush_moves: 78, motor: 78 },
  },
  power_rusher: {
    required: { strength: 85, bull_rush: 85, power: 82 },
    preferred: { anchor: 78, hand_strength: 78 },
  },
  finesse_rusher: {
    required: { agility: 82, pass_rush_moves: 85, bend: 82 },
    preferred: { hand_technique: 80, deception: 75 },
  },
  run_stuffer: {
    required: { strength: 82, tackle: 80, block_shedding: 78, gap_control: 80 },
    preferred: { anchor: 78, play_recognition: 75 },
  },
  interior_pressure: {
    required: { first_step: 82, pass_rush_moves: 82, quickness: 85 },
    preferred: { strength: 78, motor: 80 },
  },
  two_gap: {
    required: { strength: 85, anchor: 85, block_shedding: 78, size: 82 },
    preferred: { football_iq: 75, gap_control: 80 },
    antiPatterns: { speed: 82 }, // 2-gap players hold ground, not rush
  },
  one_gap: {
    required: { first_step: 82, penetration: 82, quickness: 80 },
    preferred: { speed: 75, acceleration: 78 },
  },
  hybrid_dl: {
    required: { versatility: 82, speed: 78, strength: 75 },
    preferred: { pass_rush_moves: 72, coverage: 60 },
  },
  leo: {
    required: { speed: 80, versatility: 80, pass_rush_moves: 78 },
    preferred: { coverage: 65, agility: 78 },
  },
};

// LB Archetype Detection
const LB_ARCHETYPE_REQUIREMENTS: Record<LBArchetype, ArchetypeRequirement> = {
  mike_lb: {
    required: { tackle: 82, play_recognition: 82, leadership: 78, football_iq: 80 },
    preferred: { communication: 78, block_shedding: 75 },
  },
  will_lb: {
    required: { speed: 82, pursuit: 82, coverage: 72 },
    preferred: { tackle: 78, agility: 78 },
  },
  sam_lb: {
    required: { strength: 78, run_defense: 80, te_coverage: 72 },
    preferred: { block_shedding: 75, tackle: 78 },
  },
  coverage_lb: {
    required: { coverage: 82, zone_coverage: 80, man_coverage: 75, speed: 80 },
    preferred: { ball_skills: 70, football_iq: 78 },
  },
  blitzer: {
    required: { pass_rush: 80, speed: 80, first_step: 78, motor: 82 },
    preferred: { tackling: 75, aggression: 80 },
  },
  tackling_machine: {
    required: { tackle: 88, pursuit: 82, range: 80 },
    preferred: { motor: 80, instincts: 78 },
  },
  hybrid_lb: {
    required: { coverage: 78, speed: 82, versatility: 80 },
    preferred: { man_coverage: 72, zone_coverage: 72 },
  },
  run_thumper: {
    required: { tackle: 82, strength: 80, block_shedding: 80, aggression: 82 },
    preferred: { run_defense: 82, physicality: 80 },
  },
};

// CB Archetype Detection
const CB_ARCHETYPE_REQUIREMENTS: Record<CBArchetype, ArchetypeRequirement> = {
  shutdown: {
    required: { man_coverage: 88, press: 82, speed: 85 },
    preferred: { ball_skills: 78, recovery_speed: 80 },
  },
  zone_corner: {
    required: { zone_coverage: 85, football_iq: 80, play_recognition: 82 },
    preferred: { ball_skills: 78, break_on_ball: 78 },
  },
  man_specialist: {
    required: { man_coverage: 85, press: 80, agility: 82 },
    preferred: { hip_fluidity: 80, mirror: 78 },
  },
  slot_corner: {
    required: { agility: 85, quickness: 85, zone_coverage: 78, man_coverage: 78 },
    preferred: { tackle: 72, toughness: 72 },
  },
  ball_hawk: {
    required: { ball_skills: 88, interceptions: 85, break_on_ball: 82 },
    preferred: { catching: 78, anticipation: 80 },
  },
  physical_corner: {
    required: { press: 85, strength: 75, tackle: 78, aggression: 80 },
    preferred: { man_coverage: 75, run_support: 72 },
  },
  speed_corner: {
    required: { speed: 92, recovery_speed: 88, acceleration: 88 },
    preferred: { deep_coverage: 78 },
  },
  scheme_versatile: {
    required: { man_coverage: 75, zone_coverage: 75, football_iq: 80 },
    preferred: { versatility: 80, coachability: 78 },
  },
};

// Safety Archetype Detection
const SAFETY_ARCHETYPE_REQUIREMENTS: Record<SafetyArchetype, ArchetypeRequirement> = {
  free_safety: {
    required: { range: 85, ball_skills: 80, zone_coverage: 82, speed: 82 },
    preferred: { anticipation: 78, deep_coverage: 80 },
  },
  strong_safety: {
    required: { tackle: 82, run_support: 82, strength: 78, box_play: 80 },
    preferred: { block_shedding: 72, physicality: 78 },
  },
  hybrid_safety: {
    required: { versatility: 82, coverage: 78, tackle: 75, speed: 80 },
    preferred: { football_iq: 78, man_coverage: 72, zone_coverage: 72 },
  },
  slot_eraser: {
    required: { man_coverage: 82, agility: 82, quickness: 80 },
    preferred: { zone_coverage: 75, tackle: 72 },
  },
  ball_hawk_safety: {
    required: { ball_skills: 88, interceptions: 85, anticipation: 82 },
    preferred: { range: 78, break_on_ball: 80 },
  },
  enforcer: {
    required: { hit_power: 88, tackle: 82, aggression: 85, physicality: 85 },
    preferred: { run_support: 80, intimidation: 80 },
  },
  cover_safety: {
    required: { man_coverage: 82, zone_coverage: 80, speed: 80 },
    preferred: { hip_fluidity: 75, ball_skills: 72 },
  },
  robber: {
    required: { football_iq: 85, anticipation: 85, play_recognition: 82, zone_coverage: 80 },
    preferred: { break_on_ball: 80, range: 75 },
  },
};

// ==========================================
// Archetype Detection Function
// ==========================================

export function detectArchetype(
  position: string,
  attributes: Record<string, number>
): PlayerArchetypeData {
  let requirements: Record<string, ArchetypeRequirement>;

  // Select requirements based on position
  switch (position) {
    case "QB":
      requirements = QB_ARCHETYPE_REQUIREMENTS;
      break;
    case "RB":
      requirements = RB_ARCHETYPE_REQUIREMENTS;
      break;
    case "WR":
      requirements = WR_ARCHETYPE_REQUIREMENTS;
      break;
    case "TE":
      requirements = TE_ARCHETYPE_REQUIREMENTS;
      break;
    case "OT":
    case "OG":
    case "C":
      requirements = OL_ARCHETYPE_REQUIREMENTS;
      break;
    case "DE":
    case "DT":
      requirements = DL_ARCHETYPE_REQUIREMENTS;
      break;
    case "LB":
      requirements = LB_ARCHETYPE_REQUIREMENTS;
      break;
    case "CB":
      requirements = CB_ARCHETYPE_REQUIREMENTS;
      break;
    case "S":
    case "FS":
    case "SS":
      requirements = SAFETY_ARCHETYPE_REQUIREMENTS;
      break;
    default:
      // Default to a generic archetype
      return {
        primary: "utility_te" as PlayerArchetype,
        confidence: 50,
      };
  }

  // Score each archetype
  const scores: { archetype: string; score: number }[] = [];

  for (const [archetype, req] of Object.entries(requirements)) {
    let score = 0;
    let meetsRequired = true;
    let hitAntiPattern = false;

    // Check required attributes
    for (const [attr, minValue] of Object.entries(req.required)) {
      const playerValue = attributes[attr] ?? 50;
      if (playerValue >= minValue) {
        score += 10 + (playerValue - minValue) / 2; // Base + bonus for exceeding
      } else {
        const deficit = minValue - playerValue;
        if (deficit > 10) {
          meetsRequired = false; // Too far below requirement
        }
        score -= deficit;
      }
    }

    // Check preferred attributes
    if (req.preferred) {
      for (const [attr, targetValue] of Object.entries(req.preferred)) {
        const playerValue = attributes[attr] ?? 50;
        if (playerValue >= targetValue) {
          score += 5 + (playerValue - targetValue) / 3;
        }
      }
    }

    // Check anti-patterns
    if (req.antiPatterns) {
      for (const [attr, maxValue] of Object.entries(req.antiPatterns)) {
        const playerValue = attributes[attr] ?? 50;
        if (playerValue > maxValue) {
          hitAntiPattern = true;
          score -= 15;
        }
      }
    }

    if (meetsRequired && !hitAntiPattern) {
      scores.push({ archetype, score });
    } else if (meetsRequired) {
      scores.push({ archetype, score: score * 0.7 }); // Penalize anti-pattern hits
    }
  }

  // Sort by score
  scores.sort((a, b) => b.score - a.score);

  if (scores.length === 0) {
    // No good fit - return generic
    return {
      primary: getDefaultArchetype(position),
      confidence: 40,
    };
  }

  const best = scores[0];
  const second = scores[1];

  // Calculate confidence based on gap to second place
  let confidence: number;
  if (second) {
    const gap = best.score - second.score;
    confidence = Math.min(95, Math.max(50, 60 + gap));
  } else {
    confidence = 85;
  }

  // Check for hybrid (close second archetype)
  let result: PlayerArchetypeData = {
    primary: best.archetype as PlayerArchetype,
    confidence: Math.round(confidence),
  };

  if (second && best.score - second.score < 15 && second.score > 30) {
    result.secondary = second.archetype as PlayerArchetype;
    result.secondaryConfidence = Math.round(Math.max(40, confidence - 20));
  }

  return result;
}

function getDefaultArchetype(position: string): PlayerArchetype {
  const defaults: Record<string, PlayerArchetype> = {
    QB: "system_qb",
    RB: "committee_back",
    WR: "possession",
    TE: "utility_te",
    OT: "technician",
    OG: "technician",
    C: "technician",
    DE: "one_gap",
    DT: "run_stuffer",
    LB: "mike_lb",
    CB: "scheme_versatile",
    S: "cover_safety",
    FS: "free_safety",
    SS: "strong_safety",
  };
  return defaults[position] ?? ("utility_te" as PlayerArchetype);
}

// ==========================================
// Get Archetype Description
// ==========================================

export function getArchetypeDescription(archetype: PlayerArchetype): string {
  const descriptions: Record<string, string> = {
    // QB
    pocket_passer: "A classic dropback passer who excels from the pocket with accuracy and poise.",
    gunslinger: "A risk-taking quarterback with a cannon arm who isn't afraid to throw into tight windows.",
    game_manager: "An efficient, low-turnover quarterback who makes smart decisions and moves the chains.",
    dual_threat: "An athletic quarterback who can beat defenses with both his arm and his legs.",
    scrambler: "A creative quarterback who extends plays and makes magic happen outside the pocket.",
    system_qb: "A quarterback who thrives in a specific system but may struggle in others.",
    project: "A raw but athletic quarterback with high upside who needs development time.",
    field_general: "A cerebral leader who makes everyone around him better through preparation and communication.",

    // RB
    power_back: "A physical runner who wears down defenses between the tackles.",
    zone_runner: "A patient, vision-first runner who excels in zone blocking schemes.",
    scat_back: "A versatile pass-catching back who excels on third downs.",
    speed_back: "A home run hitter with breakaway speed who can take it to the house.",
    all_purpose: "A complete back who can run, catch, and block at a high level.",
    short_yardage: "A goal-line specialist who converts in short-yardage situations.",
    committee_back: "A reliable role player who can contribute in multiple situations.",
    receiving_back: "A pass-catching specialist who creates mismatches out of the backfield.",

    // WR
    deep_threat: "A speedster who stretches the field and keeps defenses honest.",
    possession: "A reliable target who moves the chains with sure hands.",
    slot_receiver: "A quick, agile receiver who works the middle of the field.",
    contested_catch: "A physical receiver who wins 50/50 balls and dominates in the red zone.",
    route_technician: "A precise route runner who creates separation with technique.",
    rac_specialist: "A yards-after-catch monster who turns short passes into big gains.",
    red_zone_threat: "A big-bodied receiver who excels in scoring territory.",
    gadget_receiver: "A versatile weapon who can be used in creative ways.",

    // Add more as needed...
  };

  return descriptions[archetype] ?? "A player with a unique skill set.";
}

// ==========================================
// Get Archetype Key Traits
// ==========================================

export function getArchetypeKeyTraits(archetype: PlayerArchetype): string[] {
  const traits: Record<string, string[]> = {
    // QB
    pocket_passer: ["Accuracy", "Pocket Presence", "Vision", "Decision Making"],
    gunslinger: ["Arm Strength", "Confidence", "Deep Ball", "Risk Taking"],
    dual_threat: ["Speed", "Agility", "Throw on Run", "Athleticism"],
    zone_runner: ["Vision", "Patience", "One-Cut Ability", "Acceleration"],
    power_back: ["Strength", "Break Tackle", "Trucking", "Balance"],
    // Add more...
  };

  return traits[archetype] ?? ["Versatility"];
}

// ==========================================
// Export Requirements for External Use
// ==========================================

export const ARCHETYPE_REQUIREMENTS = {
  QB: QB_ARCHETYPE_REQUIREMENTS,
  RB: RB_ARCHETYPE_REQUIREMENTS,
  WR: WR_ARCHETYPE_REQUIREMENTS,
  TE: TE_ARCHETYPE_REQUIREMENTS,
  OL: OL_ARCHETYPE_REQUIREMENTS,
  DL: DL_ARCHETYPE_REQUIREMENTS,
  LB: LB_ARCHETYPE_REQUIREMENTS,
  CB: CB_ARCHETYPE_REQUIREMENTS,
  S: SAFETY_ARCHETYPE_REQUIREMENTS,
};
