// @ts-nocheck
import {
  OffensiveScheme,
  DefensiveScheme,
  OffensiveSchemeFitConfig,
  DefensiveSchemeFitConfig,
  QBArchetype,
  RBArchetype,
  WRArchetype,
  TEArchetype,
  OLArchetype,
  DLArchetype,
  LBArchetype,
  CBArchetype,
  SafetyArchetype,
} from "./types";

// ==========================================
// Offensive Scheme Fit Matrices
// ==========================================

export const OFFENSIVE_SCHEME_FITS: Record<OffensiveScheme, OffensiveSchemeFitConfig> = {
  west_coast: {
    scheme: "west_coast",
    description: "Short, quick passes that act as an extension of the run game. Timing and accuracy are paramount.",
    keyTraits: ["accuracy", "timing", "route_running", "yac", "pass_protection"],
    QB: {
      primary: ["pocket_passer", "game_manager", "field_general"],
      acceptable: ["system_qb", "scrambler"],
      poor: ["dual_threat", "gunslinger", "project"],
    },
    RB: {
      primary: ["scat_back", "all_purpose", "receiving_back"],
      acceptable: ["zone_runner", "speed_back"],
      poor: ["power_back", "short_yardage"],
    },
    WR: {
      primary: ["possession", "slot_receiver", "route_technician", "rac_specialist"],
      acceptable: ["gadget_receiver"],
      poor: ["deep_threat", "contested_catch"],
    },
    TE: {
      primary: ["receiving_te", "move_te", "seam_threat"],
      acceptable: ["utility_te"],
      poor: ["blocking_te", "h_back"],
    },
    OL: {
      primary: ["pass_protector", "technician", "zone_blocker"],
      acceptable: ["versatile", "anchor"],
      poor: ["road_grader", "mauler"],
    },
  },

  spread: {
    scheme: "spread",
    description: "Spread the defense horizontally, create mismatches, and attack space. Emphasizes athleticism.",
    keyTraits: ["speed", "athleticism", "space_creation", "versatility"],
    QB: {
      primary: ["dual_threat", "scrambler", "gunslinger"],
      acceptable: ["pocket_passer"],
      poor: ["game_manager", "system_qb"],
    },
    RB: {
      primary: ["scat_back", "speed_back", "all_purpose"],
      acceptable: ["zone_runner", "receiving_back"],
      poor: ["power_back", "short_yardage"],
    },
    WR: {
      primary: ["deep_threat", "slot_receiver", "rac_specialist", "gadget_receiver"],
      acceptable: ["route_technician"],
      poor: ["contested_catch", "red_zone_threat"],
    },
    TE: {
      primary: ["receiving_te", "move_te", "seam_threat"],
      acceptable: ["utility_te"],
      poor: ["blocking_te", "h_back"],
    },
    OL: {
      primary: ["pass_protector", "zone_blocker", "athletic_freak"],
      acceptable: ["technician", "versatile"],
      poor: ["road_grader", "mauler"],
    },
  },

  air_raid: {
    scheme: "air_raid",
    description: "Pass-first, high-volume attack that tests defenses deep. Arm talent and receiving weapons are key.",
    keyTraits: ["arm_strength", "deep_accuracy", "route_running", "separation", "pass_protection"],
    QB: {
      primary: ["gunslinger", "pocket_passer"],
      acceptable: ["scrambler", "dual_threat"],
      poor: ["game_manager", "system_qb", "project"],
    },
    RB: {
      primary: ["scat_back", "receiving_back", "all_purpose"],
      acceptable: ["speed_back"],
      poor: ["power_back", "short_yardage", "zone_runner"],
    },
    WR: {
      primary: ["deep_threat", "route_technician", "slot_receiver"],
      acceptable: ["possession", "rac_specialist"],
      poor: ["red_zone_threat", "contested_catch"],
    },
    TE: {
      primary: ["receiving_te", "seam_threat"],
      acceptable: ["move_te"],
      poor: ["blocking_te", "h_back", "utility_te"],
    },
    OL: {
      primary: ["pass_protector", "anchor", "technician"],
      acceptable: ["versatile"],
      poor: ["road_grader", "mauler", "zone_blocker"],
    },
  },

  pro_style: {
    scheme: "pro_style",
    description: "Traditional NFL offense with balanced run/pass and multiple formations. Requires smart, disciplined players.",
    keyTraits: ["football_iq", "technique", "versatility", "discipline"],
    QB: {
      primary: ["pocket_passer", "field_general"],
      acceptable: ["game_manager", "system_qb", "scrambler"],
      poor: ["dual_threat", "project"],
    },
    RB: {
      primary: ["all_purpose", "zone_runner"],
      acceptable: ["power_back", "scat_back", "speed_back"],
      poor: ["gadget_back"],
    },
    WR: {
      primary: ["route_technician", "possession"],
      acceptable: ["deep_threat", "slot_receiver", "contested_catch"],
      poor: ["gadget_receiver"],
    },
    TE: {
      primary: ["move_te", "utility_te"],
      acceptable: ["receiving_te", "blocking_te"],
      poor: [],
    },
    OL: {
      primary: ["technician", "versatile"],
      acceptable: ["pass_protector", "road_grader", "zone_blocker"],
      poor: ["athletic_freak"],
    },
  },

  power_run: {
    scheme: "power_run",
    description: "Physical, downhill running attack. Wins at the point of attack with power and physicality.",
    keyTraits: ["strength", "physicality", "run_blocking", "power", "north_south_running"],
    QB: {
      primary: ["game_manager", "pocket_passer"],
      acceptable: ["dual_threat", "field_general"],
      poor: ["gunslinger", "scrambler", "project"],
    },
    RB: {
      primary: ["power_back", "short_yardage"],
      acceptable: ["all_purpose"],
      poor: ["scat_back", "speed_back", "receiving_back", "zone_runner"], // KEY: Zone runners struggle here
    },
    WR: {
      primary: ["contested_catch", "possession", "red_zone_threat"],
      acceptable: ["route_technician"],
      poor: ["deep_threat", "slot_receiver", "gadget_receiver"],
    },
    TE: {
      primary: ["blocking_te", "move_te", "h_back"],
      acceptable: ["red_zone_te", "utility_te"],
      poor: ["receiving_te", "seam_threat"],
    },
    OL: {
      primary: ["road_grader", "mauler", "anchor"],
      acceptable: ["technician"],
      poor: ["zone_blocker", "athletic_freak", "pass_protector"], // KEY: Zone blockers don't fit
    },
  },

  zone_run: {
    scheme: "zone_run",
    description: "Outside zone and stretch plays that rely on vision, patience, and athletic linemen. One-cut runners thrive.",
    keyTraits: ["vision", "patience", "athleticism", "reach_blocking", "one_cut_ability"],
    QB: {
      primary: ["game_manager", "pocket_passer", "dual_threat"],
      acceptable: ["field_general", "system_qb"],
      poor: ["gunslinger"],
    },
    RB: {
      primary: ["zone_runner", "all_purpose", "speed_back"], // KEY: Zone runners are PERFECT
      acceptable: ["scat_back"],
      poor: ["power_back", "short_yardage"], // KEY: Power backs struggle
    },
    WR: {
      primary: ["rac_specialist", "possession", "route_technician"],
      acceptable: ["slot_receiver", "deep_threat"],
      poor: ["contested_catch"],
    },
    TE: {
      primary: ["move_te", "receiving_te", "utility_te"],
      acceptable: ["blocking_te"],
      poor: [],
    },
    OL: {
      primary: ["zone_blocker", "athletic_freak", "technician"], // KEY: Zone blockers are PERFECT
      acceptable: ["versatile"],
      poor: ["road_grader", "mauler", "anchor"], // KEY: Power blockers struggle
    },
  },

  rpo_heavy: {
    scheme: "rpo_heavy",
    description: "Run-pass options that put stress on defenders. Requires mobile QB who can read and react quickly.",
    keyTraits: ["mobility", "decision_making", "athleticism", "versatility", "quick_reads"],
    QB: {
      primary: ["dual_threat", "scrambler"], // KEY: Must be mobile
      acceptable: ["gunslinger"],
      poor: ["pocket_passer", "game_manager", "system_qb", "field_general"], // KEY: Immobile QBs fail
    },
    RB: {
      primary: ["zone_runner", "all_purpose", "speed_back"],
      acceptable: ["scat_back"],
      poor: ["power_back", "short_yardage"],
    },
    WR: {
      primary: ["rac_specialist", "slot_receiver", "route_technician"],
      acceptable: ["deep_threat", "possession"],
      poor: [],
    },
    TE: {
      primary: ["move_te", "receiving_te"],
      acceptable: ["utility_te", "seam_threat"],
      poor: ["blocking_te", "h_back"],
    },
    OL: {
      primary: ["zone_blocker", "athletic_freak", "versatile"],
      acceptable: ["technician"],
      poor: ["road_grader", "mauler"],
    },
  },

  balanced: {
    scheme: "balanced",
    description: "Adaptable offense that adjusts to personnel and opponent. Values versatility and football IQ.",
    keyTraits: ["versatility", "football_iq", "adaptability", "consistency"],
    QB: {
      primary: ["pocket_passer", "field_general", "game_manager"],
      acceptable: ["scrambler", "system_qb", "dual_threat"],
      poor: ["project"],
    },
    RB: {
      primary: ["all_purpose", "zone_runner"],
      acceptable: ["power_back", "scat_back", "speed_back"],
      poor: [],
    },
    WR: {
      primary: ["route_technician", "possession"],
      acceptable: ["deep_threat", "slot_receiver", "rac_specialist", "contested_catch"],
      poor: [],
    },
    TE: {
      primary: ["move_te", "utility_te"],
      acceptable: ["receiving_te", "blocking_te"],
      poor: [],
    },
    OL: {
      primary: ["versatile", "technician"],
      acceptable: ["zone_blocker", "pass_protector", "road_grader"],
      poor: [],
    },
  },
};

// ==========================================
// Defensive Scheme Fit Matrices
// ==========================================

export const DEFENSIVE_SCHEME_FITS: Record<DefensiveScheme, DefensiveSchemeFitConfig> = {
  "4-3_base": {
    scheme: "4-3_base",
    description: "Traditional 4-3 with four down linemen and three linebackers. Emphasizes speed and penetration.",
    keyTraits: ["speed", "penetration", "pursuit", "one_gap_discipline"],
    DL: {
      primary: ["one_gap", "edge_rusher", "interior_pressure"],
      acceptable: ["power_rusher", "finesse_rusher"],
      poor: ["two_gap"], // KEY: 2-gap players don't fit 4-3
    },
    EDGE: {
      primary: ["edge_rusher", "finesse_rusher", "power_rusher"],
      acceptable: ["hybrid_dl", "leo"],
      poor: ["run_stuffer", "two_gap"],
    },
    LB: {
      primary: ["mike_lb", "will_lb", "tackling_machine"],
      acceptable: ["coverage_lb", "blitzer"],
      poor: ["hybrid_lb"],
    },
    CB: {
      primary: ["man_specialist", "shutdown", "scheme_versatile"],
      acceptable: ["zone_corner", "physical_corner"],
      poor: [],
    },
    S: {
      primary: ["free_safety", "strong_safety"],
      acceptable: ["cover_safety", "enforcer"],
      poor: [],
    },
  },

  "3-4_base": {
    scheme: "3-4_base",
    description: "3-4 defense with two-gap linemen and four linebackers. Requires large, strong linemen.",
    keyTraits: ["size", "strength", "two_gap_discipline", "versatility"],
    DL: {
      primary: ["two_gap", "run_stuffer"], // KEY: 2-gap players are PERFECT
      acceptable: ["interior_pressure"],
      poor: ["one_gap", "finesse_rusher", "edge_rusher"], // KEY: One-gap players struggle
    },
    EDGE: {
      primary: ["hybrid_dl", "leo", "power_rusher"],
      acceptable: ["edge_rusher"],
      poor: ["run_stuffer"],
    },
    LB: {
      primary: ["mike_lb", "blitzer", "sam_lb", "will_lb"],
      acceptable: ["tackling_machine", "coverage_lb"],
      poor: [],
    },
    CB: {
      primary: ["man_specialist", "physical_corner", "shutdown"],
      acceptable: ["zone_corner"],
      poor: ["speed_corner"],
    },
    S: {
      primary: ["strong_safety", "enforcer", "hybrid_safety"],
      acceptable: ["free_safety"],
      poor: [],
    },
  },

  multiple: {
    scheme: "multiple",
    description: "Multiple fronts and coverages that adapt to the opponent. Values versatile, smart players.",
    keyTraits: ["versatility", "football_iq", "adaptability", "technique"],
    DL: {
      primary: ["hybrid_dl", "one_gap"],
      acceptable: ["two_gap", "interior_pressure", "power_rusher", "edge_rusher"],
      poor: [],
    },
    EDGE: {
      primary: ["hybrid_dl", "leo", "edge_rusher"],
      acceptable: ["power_rusher", "finesse_rusher"],
      poor: [],
    },
    LB: {
      primary: ["hybrid_lb", "coverage_lb", "mike_lb"],
      acceptable: ["blitzer", "will_lb", "tackling_machine"],
      poor: [],
    },
    CB: {
      primary: ["scheme_versatile", "man_specialist", "zone_corner"],
      acceptable: ["shutdown", "ball_hawk"],
      poor: [],
    },
    S: {
      primary: ["hybrid_safety", "free_safety", "robber"],
      acceptable: ["strong_safety", "cover_safety"],
      poor: [],
    },
  },

  cover_2: {
    scheme: "cover_2",
    description: "Two-deep safeties with corners playing underneath zones. Requires safeties with range.",
    keyTraits: ["range", "zone_awareness", "pattern_reading", "deep_coverage"],
    DL: {
      primary: ["edge_rusher", "interior_pressure", "power_rusher"],
      acceptable: ["one_gap", "finesse_rusher"],
      poor: ["two_gap"],
    },
    EDGE: {
      primary: ["edge_rusher", "power_rusher"],
      acceptable: ["finesse_rusher"],
      poor: ["run_stuffer"],
    },
    LB: {
      primary: ["mike_lb", "coverage_lb", "tackling_machine"],
      acceptable: ["will_lb"],
      poor: ["blitzer"], // Zone drops, not blitzing
    },
    CB: {
      primary: ["zone_corner", "ball_hawk", "scheme_versatile"], // KEY: Zone corners excel
      acceptable: ["physical_corner"],
      poor: ["man_specialist", "shutdown"], // KEY: Man corners struggle
    },
    S: {
      primary: ["free_safety", "ball_hawk_safety", "cover_safety"], // KEY: Range is critical
      acceptable: ["robber"],
      poor: ["strong_safety", "enforcer"], // KEY: Box safeties don't fit
    },
  },

  cover_3: {
    scheme: "cover_3",
    description: "Single-high safety with three-deep zones. Corners play deeper, safety reads the whole field.",
    keyTraits: ["range", "zone_coverage", "pattern_reading", "deep_coverage"],
    DL: {
      primary: ["edge_rusher", "one_gap", "interior_pressure"],
      acceptable: ["power_rusher"],
      poor: ["two_gap"],
    },
    EDGE: {
      primary: ["edge_rusher", "finesse_rusher"],
      acceptable: ["power_rusher"],
      poor: [],
    },
    LB: {
      primary: ["coverage_lb", "mike_lb", "will_lb"],
      acceptable: ["tackling_machine"],
      poor: ["blitzer"],
    },
    CB: {
      primary: ["zone_corner", "scheme_versatile", "ball_hawk"],
      acceptable: ["speed_corner"],
      poor: ["man_specialist"],
    },
    S: {
      primary: ["free_safety", "cover_safety"], // KEY: Single high safety
      acceptable: ["ball_hawk_safety"],
      poor: ["strong_safety", "enforcer"],
    },
  },

  man_heavy: {
    scheme: "man_heavy",
    description: "Man-to-man coverage that challenges receivers. Requires corners who can lock down in isolation.",
    keyTraits: ["man_coverage", "press", "hip_fluidity", "recovery_speed"],
    DL: {
      primary: ["edge_rusher", "interior_pressure", "finesse_rusher"],
      acceptable: ["power_rusher", "one_gap"],
      poor: ["two_gap", "run_stuffer"],
    },
    EDGE: {
      primary: ["edge_rusher", "finesse_rusher"],
      acceptable: ["power_rusher"],
      poor: [],
    },
    LB: {
      primary: ["coverage_lb", "hybrid_lb", "will_lb"], // KEY: Must cover
      acceptable: ["mike_lb"],
      poor: ["run_thumper", "blitzer"],
    },
    CB: {
      primary: ["man_specialist", "shutdown", "physical_corner"], // KEY: Man skills required
      acceptable: ["speed_corner"],
      poor: ["zone_corner", "ball_hawk"], // KEY: Zone corners fail
    },
    S: {
      primary: ["cover_safety", "slot_eraser", "hybrid_safety"],
      acceptable: ["free_safety"],
      poor: ["enforcer"], // Need coverage ability
    },
  },

  zone_heavy: {
    scheme: "zone_heavy",
    description: "Zone coverage that reads the quarterback and breaks on the ball. Pattern reading is critical.",
    keyTraits: ["zone_coverage", "pattern_reading", "ball_skills", "anticipation"],
    DL: {
      primary: ["edge_rusher", "one_gap", "interior_pressure"],
      acceptable: ["power_rusher"],
      poor: [],
    },
    EDGE: {
      primary: ["edge_rusher"],
      acceptable: ["power_rusher", "finesse_rusher"],
      poor: [],
    },
    LB: {
      primary: ["coverage_lb", "mike_lb", "will_lb"],
      acceptable: ["tackling_machine"],
      poor: ["blitzer"],
    },
    CB: {
      primary: ["zone_corner", "ball_hawk", "scheme_versatile"], // KEY: Zone skills
      acceptable: [],
      poor: ["man_specialist", "shutdown"],
    },
    S: {
      primary: ["free_safety", "robber", "ball_hawk_safety"],
      acceptable: ["cover_safety"],
      poor: ["enforcer", "strong_safety"],
    },
  },

  aggressive_blitz: {
    scheme: "aggressive_blitz",
    description: "Pressure-first defense that attacks the quarterback. Requires elite man coverage behind the blitz.",
    keyTraits: ["pass_rush", "aggression", "man_coverage", "risk_taking"],
    DL: {
      primary: ["edge_rusher", "power_rusher", "interior_pressure"],
      acceptable: ["finesse_rusher", "one_gap"],
      poor: ["two_gap", "run_stuffer"], // Need pass rush
    },
    EDGE: {
      primary: ["edge_rusher", "power_rusher", "finesse_rusher"],
      acceptable: ["leo"],
      poor: ["run_stuffer"],
    },
    LB: {
      primary: ["blitzer", "run_thumper"], // KEY: Need blitzers
      acceptable: ["mike_lb"],
      poor: ["coverage_lb", "will_lb"], // Coverage is secondary
    },
    CB: {
      primary: ["shutdown", "man_specialist", "physical_corner"], // KEY: Man coverage required
      acceptable: [],
      poor: ["zone_corner", "ball_hawk"], // Can't play zone behind blitz
    },
    S: {
      primary: ["strong_safety", "enforcer", "robber"],
      acceptable: ["hybrid_safety"],
      poor: ["free_safety", "ball_hawk_safety"], // Box safeties for blitz support
    },
  },
};

// ==========================================
// Scheme Description Helpers
// ==========================================

export function getSchemeDescription(scheme: OffensiveScheme | DefensiveScheme): string {
  const offensiveScheme = OFFENSIVE_SCHEME_FITS[scheme as OffensiveScheme];
  if (offensiveScheme) {
    return offensiveScheme.description;
  }

  const defensiveScheme = DEFENSIVE_SCHEME_FITS[scheme as DefensiveScheme];
  if (defensiveScheme) {
    return defensiveScheme.description;
  }

  return "Unknown scheme";
}

export function getSchemeKeyTraits(scheme: OffensiveScheme | DefensiveScheme): string[] {
  const offensiveScheme = OFFENSIVE_SCHEME_FITS[scheme as OffensiveScheme];
  if (offensiveScheme) {
    return offensiveScheme.keyTraits;
  }

  const defensiveScheme = DEFENSIVE_SCHEME_FITS[scheme as DefensiveScheme];
  if (defensiveScheme) {
    return defensiveScheme.keyTraits;
  }

  return [];
}

// ==========================================
// Position to Scheme Position Mapping
// ==========================================

export function getSchemePosition(position: string, isOffense: boolean): string {
  if (isOffense) {
    switch (position) {
      case "QB":
        return "QB";
      case "RB":
      case "FB":
        return "RB";
      case "WR":
        return "WR";
      case "TE":
        return "TE";
      case "OT":
      case "OG":
      case "C":
        return "OL";
      default:
        return position;
    }
  } else {
    switch (position) {
      case "DE":
        return "EDGE";
      case "DT":
      case "NT":
        return "DL";
      case "OLB":
        return "EDGE";
      case "ILB":
      case "MLB":
      case "LB":
        return "LB";
      case "CB":
        return "CB";
      case "FS":
      case "SS":
      case "S":
        return "S";
      default:
        return position;
    }
  }
}
