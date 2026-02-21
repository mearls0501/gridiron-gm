# Gridiron GM - Scheme Fit & Player Archetype System

## The Vision

When a GM drafts a player, evaluates them based on their methodology, but the coach uses them in a mismatched scheme:
1. **Player underperforms** their projected grade
2. **GM-Coach relationship deteriorates** (disagreement on usage)
3. **Player development suffers** (wrong skills being trained)
4. **Team performance drops** (scheme isn't optimized)
5. **Player may leave/get traded** and excel elsewhere (Sam Darnold, Geno Smith, Baker Mayfield effect)

This creates a rich, realistic simulation where draft picks aren't just "good" or "bad" - they're **contextual**.

---

## Part 1: Player Archetypes by Position

### 1.1 Quarterback Archetypes

```typescript
type QBArchetype =
  | "pocket_passer"       // Tom Brady, Peyton Manning - Stays in pocket, reads defense
  | "gunslinger"          // Brett Favre, Patrick Mahomes - High risk, high reward throws
  | "game_manager"        // Alex Smith, Jimmy G - Efficient, low turnover, safe
  | "dual_threat"         // Lamar Jackson, Jalen Hurts - Run/pass balance
  | "scrambler"           // Russell Wilson - Extends plays, improvises
  | "system_qb"           // Matt Ryan - Needs specific system to thrive
  | "project"             // Raw athletic tools, needs development
  | "field_general";      // Leadership-first, makes others better

interface QBArchetypeRequirements {
  pocket_passer: {
    required: { arm_strength: 70, accuracy_short: 80, accuracy_mid: 75, pocket_presence: 80 },
    helpful: { football_iq: 75, vision: 75 }
  },
  dual_threat: {
    required: { speed: 80, acceleration: 80, agility: 75, throw_on_run: 70 },
    helpful: { elusiveness: 70, ball_carrier_vision: 65 }
  },
  // etc...
}
```

### 1.2 Running Back Archetypes

```typescript
type RBArchetype =
  | "power_back"          // Derrick Henry - Between the tackles, wears defenses down
  | "zone_runner"         // Nick Chubb - Patient, one-cut, reads blocks
  | "scat_back"           // Austin Ekeler - Receiving, 3rd down, change of pace
  | "speed_back"          // Raheem Mostert - Home run hitter, breakaway speed
  | "all_purpose"         // Christian McCaffrey - Does everything well
  | "short_yardage"       // Goal line specialist, truck stick
  | "committee_back"      // Solid but not featured, role player
  | "gadget_back";        // Unique skills, jet sweeps, wildcats

interface RBArchetypeRequirements {
  power_back: {
    required: { strength: 80, break_tackle: 80, trucking: 75 },
    helpful: { balance: 70, stiff_arm: 70 },
    anti: { speed: "not_primary" } // Speed is less important
  },
  zone_runner: {
    required: { vision: 85, patience: 80, acceleration: 75, agility: 75 },
    helpful: { one_cut_ability: 80, block_reading: 75 }
  },
  scat_back: {
    required: { route_running: 70, catching: 75, agility: 80, speed: 75 },
    helpful: { elusiveness: 75, pass_block: 60 }
  },
  // etc...
}
```

### 1.3 Wide Receiver Archetypes

```typescript
type WRArchetype =
  | "deep_threat"         // Tyreek Hill - Stretches field, speed kills
  | "possession"          // Michael Thomas - Reliable, chain mover, high catch rate
  | "slot_receiver"       // Cooper Kupp - Works middle, YAC, quick routes
  | "contested_catch"     // Mike Evans - 50/50 balls, red zone target
  | "route_technician"    // Davante Adams - Precise routes, creates separation
  | "rac_specialist"      // Deebo Samuel - YAC monster, after catch ability
  | "red_zone_threat"     // Big body, fade routes, touchdowns
  | "gadget_receiver";    // Jet sweeps, trick plays, versatile

interface WRArchetypeRequirements {
  deep_threat: {
    required: { speed: 90, acceleration: 85, release: 75 },
    helpful: { tracking: 70, catch_in_traffic: 65 }
  },
  possession: {
    required: { catching: 85, catch_in_traffic: 80, route_running: 80 },
    helpful: { hand_strength: 75, body_control: 70 }
  },
  slot_receiver: {
    required: { agility: 85, route_running: 80, separation: 80 },
    helpful: { yac: 75, toughness: 70 }
  },
  // etc...
}
```

### 1.4 Tight End Archetypes

```typescript
type TEArchetype =
  | "receiving_te"        // Travis Kelce - Matchup nightmare, route runner
  | "blocking_te"         // Traditional, run game focused, in-line
  | "move_te"             // George Kittle - Hybrid, creates mismatches
  | "h_back"              // Fullback hybrid, short area
  | "seam_threat"         // Attacks middle of field, deep threat
  | "red_zone_te"         // Big body, endzone target
  | "utility_te";         // Does everything acceptably, nothing great
```

### 1.5 Offensive Line Archetypes

```typescript
type OLArchetype =
  | "road_grader"         // Quenton Nelson - Nasty, powerful, mauler
  | "zone_blocker"        // Athletic, reach blocks, second level
  | "pass_protector"      // Anchor, technique, pass-first
  | "mauler"              // Physical, run game oriented
  | "technician"          // Fundamentally sound, consistent
  | "athletic_freak"      // Project with physical tools
  | "versatile"           // Can play multiple positions
  | "anchor";             // Immovable in pass protection
```

### 1.6 Defensive Line Archetypes (DE/DT)

```typescript
type DLArchetype =
  | "edge_rusher"         // Speed to power, sack artist
  | "power_rusher"        // Bull rush, collapse pocket
  | "finesse_rusher"      // Moves, bend, technique
  | "run_stuffer"         // Gap control, eat blocks
  | "interior_pressure"   // Aaron Donald - Inside disruption
  | "two_gap"             // 3-4 nose, occupies blockers
  | "one_gap"             // Penetrating, shooting gaps
  | "hybrid"              // 3-4 OLB / 4-3 DE versatility
  | "leo";                // Stand up rusher, multiple positions
```

### 1.7 Linebacker Archetypes

```typescript
type LBArchetype =
  | "mike_lb"             // Middle linebacker, run stopper, signal caller
  | "will_lb"             // Weak side, coverage, pursuit
  | "sam_lb"              // Strong side, run support, TE coverage
  | "coverage_lb"         // Pass coverage specialist
  | "blitzer"             // Aggressive, attacking, sack threat
  | "tackling_machine"    // High volume tackler, range
  | "hybrid_lb"           // Safety/LB hybrid, versatile
  | "run_thumper";        // Downhill, physical, run game
```

### 1.8 Cornerback Archetypes

```typescript
type CBArchetype =
  | "shutdown"            // Jalen Ramsey - Island, follows #1 receiver
  | "zone_corner"         // Pattern reading, ball hawk
  | "man_specialist"      // Press, physical, sticky
  | "slot_corner"         // Inside specialist, quickness
  | "ball_hawk"           // Interception specialist
  | "physical_corner"     // Press, bump and run, physical
  | "speed_corner"        // Recovery speed, deep coverage
  | "scheme_versatile";   // Can play any scheme
```

### 1.9 Safety Archetypes

```typescript
type SafetyArchetype =
  | "free_safety"         // Centerfield, range, ball skills
  | "strong_safety"       // Box safety, run support, physical
  | "hybrid_safety"       // LB/S hybrid, versatile
  | "slot_eraser"         // Covers slot receivers
  | "ball_hawk"           // Interception focused
  | "enforcer"            // Big hitter, intimidator
  | "cover_safety"        // Man coverage specialist
  | "robber";             // Pattern reading, zone instincts
```

---

## Part 2: Scheme Fit Matrix

### 2.1 Offensive Scheme → Player Archetype Fit

```typescript
interface OffensiveSchemeFit {
  scheme: OffensiveScheme;
  idealArchetypes: {
    QB: { primary: QBArchetype[]; acceptable: QBArchetype[]; poor: QBArchetype[] };
    RB: { primary: RBArchetype[]; acceptable: RBArchetype[]; poor: RBArchetype[] };
    WR: { primary: WRArchetype[]; acceptable: WRArchetype[]; poor: WRArchetype[] };
    TE: { primary: TEArchetype[]; acceptable: TEArchetype[]; poor: TEArchetype[] };
    OL: { primary: OLArchetype[]; acceptable: OLArchetype[]; poor: OLArchetype[] };
  };
}

const OFFENSIVE_SCHEME_FITS: Record<OffensiveScheme, OffensiveSchemeFit> = {
  west_coast: {
    scheme: "west_coast",
    idealArchetypes: {
      QB: {
        primary: ["pocket_passer", "game_manager", "field_general"],
        acceptable: ["system_qb", "scrambler"],
        poor: ["dual_threat", "gunslinger"]  // Need accuracy, not improvisation
      },
      RB: {
        primary: ["scat_back", "all_purpose", "zone_runner"],
        acceptable: ["speed_back", "committee_back"],
        poor: ["power_back", "short_yardage"]  // Need receiving ability
      },
      WR: {
        primary: ["possession", "slot_receiver", "route_technician"],
        acceptable: ["rac_specialist"],
        poor: ["deep_threat", "contested_catch"]  // Short/intermediate focus
      },
      TE: {
        primary: ["receiving_te", "move_te", "seam_threat"],
        acceptable: ["utility_te"],
        poor: ["blocking_te"]  // Need route running
      },
      OL: {
        primary: ["pass_protector", "technician", "zone_blocker"],
        acceptable: ["versatile", "anchor"],
        poor: ["road_grader", "mauler"]  // Pass protection focus
      }
    }
  },

  power_run: {
    scheme: "power_run",
    idealArchetypes: {
      QB: {
        primary: ["game_manager", "pocket_passer"],
        acceptable: ["dual_threat", "system_qb"],
        poor: ["gunslinger", "scrambler"]  // Need ball control
      },
      RB: {
        primary: ["power_back", "short_yardage", "all_purpose"],
        acceptable: ["zone_runner"],
        poor: ["scat_back", "speed_back"]  // Need physicality
      },
      WR: {
        primary: ["contested_catch", "possession", "red_zone_threat"],
        acceptable: ["route_technician"],
        poor: ["deep_threat", "slot_receiver"]  // Need blocking, physicality
      },
      TE: {
        primary: ["blocking_te", "move_te"],
        acceptable: ["h_back", "utility_te"],
        poor: ["receiving_te"]  // Need blocking first
      },
      OL: {
        primary: ["road_grader", "mauler", "anchor"],
        acceptable: ["technician", "versatile"],
        poor: ["zone_blocker", "athletic_freak"]  // Need power
      }
    }
  },

  zone_run: {
    scheme: "zone_run",
    idealArchetypes: {
      QB: {
        primary: ["game_manager", "pocket_passer", "dual_threat"],
        acceptable: ["system_qb"],
        poor: ["gunslinger"]
      },
      RB: {
        primary: ["zone_runner", "all_purpose", "speed_back"],  // KEY: Zone runner is ideal
        acceptable: ["scat_back"],
        poor: ["power_back", "short_yardage"]  // Vision/patience > power
      },
      WR: {
        primary: ["rac_specialist", "possession", "route_technician"],
        acceptable: ["slot_receiver", "deep_threat"],
        poor: ["contested_catch"]
      },
      TE: {
        primary: ["move_te", "receiving_te", "utility_te"],
        acceptable: ["blocking_te"],
        poor: []
      },
      OL: {
        primary: ["zone_blocker", "athletic_freak", "technician"],  // KEY: Zone blockers
        acceptable: ["versatile"],
        poor: ["road_grader", "mauler", "anchor"]  // Need athleticism
      }
    }
  },

  spread: {
    scheme: "spread",
    idealArchetypes: {
      QB: {
        primary: ["dual_threat", "scrambler", "gunslinger"],
        acceptable: ["pocket_passer"],
        poor: ["game_manager", "system_qb"]  // Need athleticism/arm
      },
      RB: {
        primary: ["scat_back", "speed_back", "all_purpose"],
        acceptable: ["zone_runner"],
        poor: ["power_back", "short_yardage"]
      },
      WR: {
        primary: ["deep_threat", "slot_receiver", "rac_specialist"],
        acceptable: ["route_technician", "gadget_receiver"],
        poor: ["contested_catch", "red_zone_threat"]
      },
      TE: {
        primary: ["receiving_te", "move_te", "seam_threat"],
        acceptable: ["utility_te"],
        poor: ["blocking_te", "h_back"]
      },
      OL: {
        primary: ["pass_protector", "zone_blocker", "athletic_freak"],
        acceptable: ["technician", "versatile"],
        poor: ["road_grader", "mauler"]
      }
    }
  },

  air_raid: {
    scheme: "air_raid",
    idealArchetypes: {
      QB: {
        primary: ["gunslinger", "pocket_passer", "scrambler"],
        acceptable: ["dual_threat"],
        poor: ["game_manager", "system_qb"]  // Need arm talent
      },
      RB: {
        primary: ["scat_back", "all_purpose"],  // Receiving is key
        acceptable: ["speed_back"],
        poor: ["power_back", "short_yardage", "zone_runner"]
      },
      WR: {
        primary: ["deep_threat", "route_technician", "slot_receiver"],
        acceptable: ["possession", "rac_specialist"],
        poor: ["red_zone_threat"]  // Volume passing
      },
      TE: {
        primary: ["receiving_te", "seam_threat"],
        acceptable: ["move_te"],
        poor: ["blocking_te", "h_back"]
      },
      OL: {
        primary: ["pass_protector", "anchor", "technician"],
        acceptable: ["versatile"],
        poor: ["road_grader", "mauler", "zone_blocker"]
      }
    }
  },

  rpo_heavy: {
    scheme: "rpo_heavy",
    idealArchetypes: {
      QB: {
        primary: ["dual_threat", "scrambler"],  // MUST be mobile
        acceptable: ["gunslinger"],
        poor: ["pocket_passer", "game_manager", "system_qb"]
      },
      RB: {
        primary: ["zone_runner", "all_purpose", "speed_back"],
        acceptable: ["scat_back"],
        poor: ["power_back", "short_yardage"]
      },
      WR: {
        primary: ["rac_specialist", "slot_receiver", "route_technician"],
        acceptable: ["deep_threat", "possession"],
        poor: []
      },
      TE: {
        primary: ["move_te", "receiving_te"],
        acceptable: ["utility_te", "seam_threat"],
        poor: ["blocking_te"]
      },
      OL: {
        primary: ["zone_blocker", "athletic_freak", "versatile"],
        acceptable: ["technician"],
        poor: ["road_grader", "mauler"]
      }
    }
  },

  pro_style: {
    scheme: "pro_style",
    idealArchetypes: {
      QB: {
        primary: ["pocket_passer", "field_general"],
        acceptable: ["game_manager", "system_qb", "scrambler"],
        poor: ["dual_threat"]  // Traditional dropback
      },
      RB: {
        primary: ["all_purpose", "zone_runner", "power_back"],
        acceptable: ["scat_back", "speed_back"],
        poor: []  // Balanced, most can fit
      },
      WR: {
        primary: ["route_technician", "possession", "deep_threat"],
        acceptable: ["slot_receiver", "contested_catch"],
        poor: ["gadget_receiver"]
      },
      TE: {
        primary: ["move_te", "utility_te"],
        acceptable: ["receiving_te", "blocking_te"],
        poor: []
      },
      OL: {
        primary: ["technician", "versatile", "pass_protector"],
        acceptable: ["road_grader", "zone_blocker"],
        poor: []
      }
    }
  },

  balanced: {
    scheme: "balanced",
    idealArchetypes: {
      QB: {
        primary: ["pocket_passer", "field_general", "game_manager"],
        acceptable: ["scrambler", "system_qb", "dual_threat"],
        poor: []  // Most can fit balanced
      },
      RB: {
        primary: ["all_purpose", "zone_runner"],
        acceptable: ["power_back", "scat_back", "speed_back"],
        poor: []
      },
      WR: {
        primary: ["route_technician", "possession"],
        acceptable: ["deep_threat", "slot_receiver", "rac_specialist"],
        poor: []
      },
      TE: {
        primary: ["move_te", "utility_te"],
        acceptable: ["receiving_te", "blocking_te"],
        poor: []
      },
      OL: {
        primary: ["versatile", "technician"],
        acceptable: ["zone_blocker", "pass_protector", "road_grader"],
        poor: []
      }
    }
  }
};
```

### 2.2 Defensive Scheme → Player Archetype Fit

```typescript
interface DefensiveSchemeFit {
  scheme: DefensiveScheme;
  idealArchetypes: {
    DL: { primary: DLArchetype[]; acceptable: DLArchetype[]; poor: DLArchetype[] };
    LB: { primary: LBArchetype[]; acceptable: LBArchetype[]; poor: LBArchetype[] };
    CB: { primary: CBArchetype[]; acceptable: CBArchetype[]; poor: CBArchetype[] };
    S: { primary: SafetyArchetype[]; acceptable: SafetyArchetype[]; poor: SafetyArchetype[] };
  };
}

const DEFENSIVE_SCHEME_FITS: Record<DefensiveScheme, DefensiveSchemeFit> = {
  "4-3_base": {
    scheme: "4-3_base",
    idealArchetypes: {
      DL: {
        primary: ["one_gap", "edge_rusher", "interior_pressure"],
        acceptable: ["power_rusher", "finesse_rusher"],
        poor: ["two_gap"]  // 4-3 is penetrating
      },
      LB: {
        primary: ["mike_lb", "will_lb", "tackling_machine"],
        acceptable: ["coverage_lb", "blitzer"],
        poor: ["hybrid_lb"]  // Traditional LB roles
      },
      CB: {
        primary: ["man_specialist", "shutdown", "scheme_versatile"],
        acceptable: ["physical_corner", "zone_corner"],
        poor: []
      },
      S: {
        primary: ["free_safety", "strong_safety"],
        acceptable: ["cover_safety", "enforcer"],
        poor: []
      }
    }
  },

  "3-4_base": {
    scheme: "3-4_base",
    idealArchetypes: {
      DL: {
        primary: ["two_gap", "run_stuffer", "hybrid"],  // KEY: 2-gap players
        acceptable: ["interior_pressure"],
        poor: ["one_gap", "finesse_rusher"]  // Need size
      },
      LB: {
        primary: ["mike_lb", "blitzer", "sam_lb", "will_lb"],
        acceptable: ["tackling_machine", "coverage_lb"],
        poor: []  // 3-4 uses 4 LBs
      },
      CB: {
        primary: ["man_specialist", "physical_corner", "shutdown"],
        acceptable: ["zone_corner"],
        poor: ["speed_corner"]  // Need physicality
      },
      S: {
        primary: ["strong_safety", "enforcer", "hybrid_safety"],
        acceptable: ["free_safety"],
        poor: []
      }
    }
  },

  aggressive_blitz: {
    scheme: "aggressive_blitz",
    idealArchetypes: {
      DL: {
        primary: ["edge_rusher", "power_rusher", "interior_pressure"],
        acceptable: ["finesse_rusher", "one_gap"],
        poor: ["two_gap", "run_stuffer"]  // Need pass rush
      },
      LB: {
        primary: ["blitzer", "run_thumper"],  // KEY: Need blitzers
        acceptable: ["mike_lb"],
        poor: ["coverage_lb", "will_lb"]  // Coverage is secondary
      },
      CB: {
        primary: ["shutdown", "man_specialist", "physical_corner"],  // KEY: Man coverage
        acceptable: [],
        poor: ["zone_corner", "ball_hawk"]  // Man-heavy scheme
      },
      S: {
        primary: ["strong_safety", "enforcer", "robber"],
        acceptable: ["hybrid_safety"],
        poor: ["free_safety", "ball_hawk"]  // Box safeties
      }
    }
  },

  cover_2: {
    scheme: "cover_2",
    idealArchetypes: {
      DL: {
        primary: ["edge_rusher", "interior_pressure", "power_rusher"],
        acceptable: ["one_gap", "finesse_rusher"],
        poor: ["two_gap"]
      },
      LB: {
        primary: ["mike_lb", "coverage_lb", "tackling_machine"],
        acceptable: ["will_lb"],
        poor: ["blitzer"]  // Zone drops, not blitzing
      },
      CB: {
        primary: ["zone_corner", "ball_hawk", "scheme_versatile"],  // KEY: Zone skills
        acceptable: ["physical_corner"],
        poor: ["man_specialist", "shutdown"]
      },
      S: {
        primary: ["free_safety", "ball_hawk", "cover_safety"],  // KEY: Deep halves
        acceptable: ["robber"],
        poor: ["strong_safety", "enforcer"]  // Need range
      }
    }
  },

  cover_3: {
    scheme: "cover_3",
    idealArchetypes: {
      DL: {
        primary: ["edge_rusher", "one_gap", "interior_pressure"],
        acceptable: ["power_rusher"],
        poor: ["two_gap"]
      },
      LB: {
        primary: ["coverage_lb", "mike_lb", "will_lb"],
        acceptable: ["tackling_machine"],
        poor: ["blitzer"]  // Zone responsibility
      },
      CB: {
        primary: ["zone_corner", "scheme_versatile", "ball_hawk"],
        acceptable: ["speed_corner"],
        poor: ["man_specialist"]
      },
      S: {
        primary: ["free_safety", "cover_safety"],  // KEY: Single high
        acceptable: ["ball_hawk"],
        poor: ["strong_safety", "enforcer"]
      }
    }
  },

  man_heavy: {
    scheme: "man_heavy",
    idealArchetypes: {
      DL: {
        primary: ["edge_rusher", "interior_pressure", "finesse_rusher"],
        acceptable: ["power_rusher", "one_gap"],
        poor: ["two_gap", "run_stuffer"]
      },
      LB: {
        primary: ["coverage_lb", "hybrid_lb", "will_lb"],  // KEY: Can cover
        acceptable: ["mike_lb"],
        poor: ["run_thumper", "blitzer"]
      },
      CB: {
        primary: ["man_specialist", "shutdown", "physical_corner"],  // KEY: Man skills
        acceptable: ["speed_corner"],
        poor: ["zone_corner", "ball_hawk"]
      },
      S: {
        primary: ["cover_safety", "slot_eraser", "hybrid_safety"],
        acceptable: ["free_safety"],
        poor: ["enforcer"]  // Need coverage ability
      }
    }
  },

  zone_heavy: {
    scheme: "zone_heavy",
    idealArchetypes: {
      DL: {
        primary: ["edge_rusher", "one_gap", "interior_pressure"],
        acceptable: ["power_rusher"],
        poor: []
      },
      LB: {
        primary: ["coverage_lb", "mike_lb", "will_lb"],
        acceptable: ["tackling_machine"],
        poor: ["blitzer"]
      },
      CB: {
        primary: ["zone_corner", "ball_hawk", "scheme_versatile"],
        acceptable: [],
        poor: ["man_specialist", "shutdown"]
      },
      S: {
        primary: ["free_safety", "robber", "ball_hawk"],
        acceptable: ["cover_safety"],
        poor: ["enforcer", "strong_safety"]
      }
    }
  },

  multiple: {
    scheme: "multiple",
    idealArchetypes: {
      DL: {
        primary: ["hybrid", "one_gap", "edge_rusher"],
        acceptable: ["two_gap", "interior_pressure", "power_rusher"],
        poor: []  // Versatility valued
      },
      LB: {
        primary: ["hybrid_lb", "coverage_lb", "mike_lb"],
        acceptable: ["blitzer", "will_lb"],
        poor: []
      },
      CB: {
        primary: ["scheme_versatile", "man_specialist", "zone_corner"],
        acceptable: ["shutdown", "ball_hawk"],
        poor: []
      },
      S: {
        primary: ["hybrid_safety", "free_safety", "robber"],
        acceptable: ["strong_safety", "cover_safety"],
        poor: []
      }
    }
  }
};
```

---

## Part 3: Scheme Fit Calculation

### 3.1 Fit Score Calculation

```typescript
type FitLevel = "perfect" | "good" | "acceptable" | "poor" | "terrible";

interface SchemeFitResult {
  fitLevel: FitLevel;
  fitScore: number;           // 0-100
  performanceModifier: number; // -30 to +15
  developmentModifier: number; // -50% to +25%
  explanation: string;
  coachFrustration: number;   // How much this affects coach relationship
  recommendations: string[];
}

function calculateSchemeFit(
  player: Player,
  scheme: OffensiveScheme | DefensiveScheme,
  isOffense: boolean
): SchemeFitResult {
  const schemeFits = isOffense ? OFFENSIVE_SCHEME_FITS : DEFENSIVE_SCHEME_FITS;
  const schemeFit = schemeFits[scheme];
  const positionFits = schemeFit.idealArchetypes[player.position];

  let fitLevel: FitLevel;
  let fitScore: number;
  let performanceModifier: number;
  let developmentModifier: number;
  let coachFrustration: number;

  if (positionFits.primary.includes(player.archetype)) {
    fitLevel = "perfect";
    fitScore = 90 + Math.floor(Math.random() * 10);
    performanceModifier = 10 + Math.floor(Math.random() * 5);  // +10 to +15
    developmentModifier = 0.20 + Math.random() * 0.05;          // +20% to +25%
    coachFrustration = 0;
  } else if (positionFits.acceptable.includes(player.archetype)) {
    fitLevel = "good";
    fitScore = 70 + Math.floor(Math.random() * 15);
    performanceModifier = 0 + Math.floor(Math.random() * 5);   // 0 to +5
    developmentModifier = 0;                                    // No modifier
    coachFrustration = 0;
  } else if (positionFits.poor.includes(player.archetype)) {
    fitLevel = "poor";
    fitScore = 30 + Math.floor(Math.random() * 20);
    performanceModifier = -15 - Math.floor(Math.random() * 10); // -15 to -25
    developmentModifier = -0.30 - Math.random() * 0.15;         // -30% to -45%
    coachFrustration = 30 + Math.floor(Math.random() * 20);
  } else {
    // Not in any list - acceptable by default
    fitLevel = "acceptable";
    fitScore = 50 + Math.floor(Math.random() * 15);
    performanceModifier = -5;
    developmentModifier = -0.10;
    coachFrustration = 10;
  }

  // Generate explanation
  const explanation = generateFitExplanation(player, scheme, fitLevel);
  const recommendations = generateUsageRecommendations(player, scheme, fitLevel);

  return {
    fitLevel,
    fitScore,
    performanceModifier,
    developmentModifier,
    explanation,
    coachFrustration,
    recommendations
  };
}

function generateFitExplanation(
  player: Player,
  scheme: string,
  fitLevel: FitLevel
): string {
  // Position-specific explanations
  if (player.position === "RB" && player.archetype === "zone_runner") {
    if (scheme === "power_run") {
      return `${player.name} is a patient, one-cut zone runner who thrives reading blocks laterally. The power scheme requires north-south runners who can hit predetermined holes. His vision is wasted when the play design doesn't allow him to find cutback lanes.`;
    }
    if (scheme === "zone_run") {
      return `${player.name}'s patience and vision are perfectly suited for the zone scheme. He reads blocks well, makes decisive cuts, and maximizes yardage on designed zone runs.`;
    }
  }

  if (player.position === "QB" && player.archetype === "pocket_passer") {
    if (scheme === "rpo_heavy") {
      return `${player.name} is a traditional pocket passer who excels when given time and clean reads. The RPO-heavy scheme requires a mobile QB who can threaten the run. His lack of mobility limits the offense's effectiveness.`;
    }
  }

  // Generic explanations based on fit level
  switch (fitLevel) {
    case "perfect":
      return `${player.name}'s skill set is exactly what this scheme demands. He can maximize his abilities within this system.`;
    case "good":
      return `${player.name} fits this scheme well, though it may not showcase all of his strengths.`;
    case "acceptable":
      return `${player.name} can function in this scheme but won't reach his ceiling.`;
    case "poor":
      return `${player.name}'s strengths don't align with what this scheme asks of his position. His development and performance will suffer.`;
    case "terrible":
      return `${player.name} is severely miscast in this scheme. His skill set is actively hindered by the system's requirements.`;
  }
}
```

---

## Part 4: Performance & Development Impact

### 4.1 Game Performance Modifier

```typescript
interface GamePerformance {
  baseRating: number;        // Player's actual skill (e.g., 78)
  schemeFitModifier: number; // From scheme fit calculation
  usageModifier: number;     // How they're being used
  effectiveRating: number;   // What they play like

  // This is the "Baker Mayfield effect"
  // A 78 OVR QB playing in wrong scheme might play like a 65
  // Same player in right scheme plays like an 85
}

function calculateEffectiveRating(
  player: Player,
  schemeFit: SchemeFitResult,
  usageRole: string
): number {
  let effective = player.overall;

  // Scheme fit impact
  effective += schemeFit.performanceModifier;

  // Usage role impact (e.g., using a zone runner as a power back)
  const roleMatch = calculateRoleMatch(player.archetype, usageRole);
  effective += roleMatch.modifier;

  // Experience/development impact
  if (player.yearsInScheme < 1) {
    effective -= 5;  // Learning curve
  } else if (player.yearsInScheme >= 3) {
    effective += 3;  // System mastery
  }

  // Cap at realistic bounds
  return Math.max(40, Math.min(99, effective));
}
```

### 4.2 Development Impact

```typescript
interface DevelopmentResult {
  attributeGains: Record<string, number>;
  potentialChange: number;
  archetypeReinforcement: boolean;  // Are they developing in their archetype?
  schemeAdaptation: number;         // Are they learning the scheme?
}

function calculateSeasonDevelopment(
  player: Player,
  coach: HeadCoach,
  schemeFit: SchemeFitResult,
  playingTime: number  // 0-100%
): DevelopmentResult {
  const baseDevelopment = calculateBaseDevelopment(player.age, player.potential);

  // Scheme fit modifier - THIS IS CRUCIAL
  // Poor fit = wrong skills being trained = wasted development
  const fitMultiplier = 1 + schemeFit.developmentModifier;

  // Coach development skill modifier
  const coachMultiplier = 1 + (coach.skills.playerDevelopment - 50) / 100;

  // Playing time modifier
  const playingTimeMultiplier = 0.5 + (playingTime / 100) * 0.5;

  const totalMultiplier = fitMultiplier * coachMultiplier * playingTimeMultiplier;

  // Calculate attribute gains
  const attributeGains: Record<string, number> = {};

  // If fit is poor, player develops WRONG attributes
  if (schemeFit.fitLevel === "poor" || schemeFit.fitLevel === "terrible") {
    // Scheme-demanded attributes improve slightly
    const schemeAttributes = getSchemeAttributes(coach.offensiveScheme || coach.defensiveScheme);
    schemeAttributes.forEach(attr => {
      attributeGains[attr] = Math.floor(baseDevelopment * 0.3 * totalMultiplier);
    });

    // Player's natural strengths STAGNATE or regress
    const naturalAttributes = getArchetypeAttributes(player.archetype);
    naturalAttributes.forEach(attr => {
      attributeGains[attr] = Math.floor(baseDevelopment * -0.1);  // Slight regression
    });
  } else {
    // Good fit = natural development
    const naturalAttributes = getArchetypeAttributes(player.archetype);
    naturalAttributes.forEach(attr => {
      attributeGains[attr] = Math.floor(baseDevelopment * totalMultiplier);
    });
  }

  return {
    attributeGains,
    potentialChange: schemeFit.fitLevel === "poor" ? -2 : 0,
    archetypeReinforcement: schemeFit.fitLevel !== "poor",
    schemeAdaptation: Math.floor(10 * totalMultiplier)
  };
}
```

---

## Part 5: Relationship Impact

### 5.1 GM-Coach Scheme Disagreement

```typescript
interface SchemeDisagreement {
  type: "player_usage" | "scheme_philosophy" | "personnel_fit";
  severity: "minor" | "moderate" | "major" | "critical";
  playerId?: string;
  playerName?: string;

  gmPosition: string;   // "I drafted him to be a zone runner"
  coachPosition: string; // "I need him to run power"

  relationshipImpact: number;  // -5 to -30
  resolution?: SchemeResolution;
}

type SchemeResolution =
  | "gm_defers"      // GM lets coach use player his way (damages GM's draft grade)
  | "coach_adapts"   // Coach adjusts scheme (damages coach ego/trust)
  | "trade_player"   // Get rid of the problem
  | "fire_coach"     // Owner sides with GM
  | "fire_gm"        // Owner sides with coach
  | "compromise"     // Split usage
  | "unresolved";    // Tension continues

function detectSchemeDisagreement(
  player: Player,
  gmEvaluation: ScoutingReport,
  coachUsage: PlayerUsage,
  schemeFit: SchemeFitResult
): SchemeDisagreement | null {
  // GM evaluated player for their archetype
  const gmIntendedRole = gmEvaluation.projectedRole;
  const coachActualRole = coachUsage.primaryRole;

  if (gmIntendedRole !== coachActualRole && schemeFit.fitLevel === "poor") {
    return {
      type: "player_usage",
      severity: schemeFit.fitScore < 40 ? "major" : "moderate",
      playerId: player.id,
      playerName: player.name,
      gmPosition: `I drafted ${player.name} to be a ${gmIntendedRole}. His skill set is built for that role.`,
      coachPosition: `My scheme needs a ${coachActualRole}. I have to use him where the team needs him.`,
      relationshipImpact: -15 - (100 - schemeFit.fitScore) / 5
    };
  }

  return null;
}
```

### 5.2 The Baker Mayfield Journey

```typescript
// Example of how the system creates realistic career arcs

interface PlayerCareerArc {
  playerId: string;
  seasons: PlayerSeasonResult[];
  arcType: "late_bloomer" | "early_peak" | "scheme_dependent" | "consistent" | "bust";
}

interface PlayerSeasonResult {
  season: number;
  teamId: string;
  coachId: string;
  scheme: string;
  schemeFit: FitLevel;
  effectiveRating: number;  // What they played like
  actualRating: number;     // What they actually were
  publicPerception: number; // What people thought they were
  development: number;      // How much they improved
}

// Example: Baker Mayfield-type journey
const bakerJourney: PlayerCareerArc = {
  playerId: "qb_baker_example",
  arcType: "scheme_dependent",
  seasons: [
    {
      season: 2024,
      teamId: "CLE",
      coachId: "coach_hue",
      scheme: "pro_style",
      schemeFit: "poor",        // Baker is a gunslinger, not pro-style
      effectiveRating: 62,      // Played poorly
      actualRating: 78,         // Actually talented
      publicPerception: 55,     // "He's a bust"
      development: -3           // Regressed
    },
    {
      season: 2025,
      teamId: "CLE",
      coachId: "coach_stefanski",
      scheme: "rpo_heavy",
      schemeFit: "good",        // Better fit!
      effectiveRating: 80,      // Played well
      actualRating: 79,         // Slight improvement
      publicPerception: 75,     // "Maybe he's okay"
      development: 2
    },
    {
      season: 2026,
      teamId: "CAR",
      coachId: "coach_rhule",
      scheme: "pro_style",
      schemeFit: "poor",        // Wrong scheme again
      effectiveRating: 58,      // Disaster
      actualRating: 77,         // Skills are there
      publicPerception: 40,     // "Confirmed bust"
      development: -5
    },
    {
      season: 2027,
      teamId: "TB",
      coachId: "coach_bowles",
      scheme: "spread",
      schemeFit: "perfect",     // FINALLY right scheme
      effectiveRating: 88,      // Career year!
      actualRating: 82,         // Developed in right system
      publicPerception: 85,     // "Resurrection story"
      development: 5
    }
  ]
};
```

---

## Part 6: Scout Evaluation & Scheme Awareness

### 6.1 Scout Archetype Methodology

Different scout archetypes evaluate scheme fit differently:

```typescript
interface ScoutSchemeEvaluation {
  archetype: ScoutArchetype;
  schemeAwareness: number;       // How much they consider scheme fit
  evaluationFocus: string[];     // What they prioritize
  blindSpots: string[];          // What they might miss
}

const SCOUT_SCHEME_AWARENESS: Record<ScoutArchetype, ScoutSchemeEvaluation> = {
  evaluator: {
    archetype: "evaluator",
    schemeAwareness: 70,
    evaluationFocus: ["overall_talent", "versatility", "floor"],
    blindSpots: ["scheme_specific_traits"]
  },
  tape_grinder: {
    archetype: "tape_grinder",
    schemeAwareness: 85,  // High - they see technique details
    evaluationFocus: ["technique", "football_iq", "scheme_fit"],
    blindSpots: ["athletic_upside"]
  },
  character_coach: {
    archetype: "character_coach",
    schemeAwareness: 50,  // Lower - focuses on person
    evaluationFocus: ["character", "coachability", "leadership"],
    blindSpots: ["scheme_fit", "athletic_traits"]
  },
  athletic_analyst: {
    archetype: "athletic_analyst",
    schemeAwareness: 40,  // Low - focuses on measurables
    evaluationFocus: ["athleticism", "ceiling", "physical_tools"],
    blindSpots: ["scheme_fit", "technique", "football_iq"]
  }
};

function generateScoutReport(
  scout: Scout,
  player: Player,
  targetScheme: OffensiveScheme | DefensiveScheme
): ScoutingReport {
  const schemeAwareness = SCOUT_SCHEME_AWARENESS[scout.archetype];

  // Calculate base player grade
  let grade = calculateBaseGrade(player, scout);

  // Scheme fit adjustment (if scout considers it)
  const schemeFit = calculateSchemeFit(player, targetScheme, isOffense(targetScheme));

  if (Math.random() * 100 < schemeAwareness.schemeAwareness) {
    // Scout considers scheme fit
    if (schemeFit.fitLevel === "perfect") {
      grade += 5;
      // Include scheme fit in report
    } else if (schemeFit.fitLevel === "poor") {
      grade -= 5;
      // Warning in report
    }
  }
  // else: Scout doesn't consider scheme fit - potential mistake!

  return {
    playerId: player.id,
    scoutId: scout.id,
    grade,
    schemeFitAssessment: schemeAwareness.schemeAwareness > 60 ? schemeFit : null,
    warnings: generateWarnings(scout, player, schemeFit),
    // ...
  };
}
```

---

## Part 7: Implementation Integration

### 7.1 New Player Attributes

Add to `lib/player-generator.ts`:

```typescript
interface Player {
  // ... existing attributes ...

  // NEW: Archetype system
  archetype: PlayerArchetype;
  archetypeConfidence: number;  // How strongly they fit the archetype (0-100)
  secondaryArchetype?: PlayerArchetype;  // Some players are hybrids

  // NEW: Scheme history
  schemeHistory: {
    scheme: string;
    seasons: number;
    adaptation: number;  // 0-100, how well they learned it
  }[];

  // NEW: True talent vs perceived
  trueTalent: number;      // What they actually are
  perceivedTalent: number; // What teams think they are (affected by scheme fit)
}
```

### 7.2 Files to Create/Modify

```
lib/
├── scheme-fit/
│   ├── types.ts                    # All archetype type definitions
│   ├── player-archetypes.ts        # Archetype determination logic
│   ├── scheme-fit-calculator.ts    # Fit calculation engine
│   ├── performance-modifier.ts     # Game performance adjustments
│   ├── development-impact.ts       # How fit affects development
│   └── index.ts
├── relationships/
│   ├── scheme-disagreement.ts      # GM-Coach scheme conflicts (NEW)
│   └── relationship-types.ts       # Add scheme-related events
├── scouting/
│   └── scout-scheme-awareness.ts   # Scout archetype scheme evaluation (NEW)
└── player-generator.ts             # Add archetype generation
```

---

## Part 8: Example Scenarios

### Scenario 1: The Zone Runner in a Power Scheme

**Setup:**
- GM drafts Nick Chubb-type RB (zone_runner archetype, 82 OVR)
- Coach runs power_run scheme
- Scout (tape_grinder) flagged scheme concerns, GM ignored

**Season Result:**
- Player effective rating: 68 (-14 from scheme mismatch)
- Development: -25% (wrong skills being trained)
- Coach-GM relationship: -20 (coach frustrated)
- Coach public comment: "We need him to hit the hole harder"
- GM thinks: "He's not getting the blocking he needs"

**Year 2:**
- Player traded to Ravens (zone_run scheme)
- Effective rating jumps to 87 (+5 scheme bonus)
- Pro Bowl selection
- Original GM's draft grade drops from B to D

### Scenario 2: The Pocket Passer in an RPO System

**Setup:**
- Team has pocket_passer QB (85 OVR)
- New coach hired with rpo_heavy scheme
- Owner mandated "scheme change to modernize"

**Conflict:**
- GM: "We built this roster for a pocket passer"
- Coach: "I need mobility to run my system"
- Owner: "Make it work"

**Season Result:**
- QB effective rating: 72 (-13)
- 12 sacks from RPO breakdowns
- Team misses playoffs
- Coach blames personnel, GM blames scheme
- Owner must choose sides

---

## Part 9: Implementation Priority

### Phase 8A: Core Archetype System (1-2 weeks) ✅ COMPLETE
- [x] Define all player archetypes by position (`lib/scheme-fit/types.ts`)
- [x] Archetype detection from attributes (`lib/scheme-fit/archetype-detection.ts`)
- [x] Archetype requirements mapping with required/preferred/anti-patterns

### Phase 8B: Scheme Fit Calculator (1-2 weeks) ✅ COMPLETE
- [x] Offensive scheme fit matrix (`lib/scheme-fit/scheme-fit-matrices.ts`)
- [x] Defensive scheme fit matrix (8 schemes each)
- [x] Fit score calculation (`lib/scheme-fit/scheme-fit-calculator.ts`)
- [x] Performance modifier calculation (+15 to -25 OVR)
- [x] Roster-wide fit evaluation

### Phase 8C: Development Impact (1 week) ✅ COMPLETE
- [x] Development modifier by fit (+25% to -45%)
- [x] Wrong-skill training system (tracks correct vs wrong skill gains)
- [x] Long-term potential impact (potential can decrease in wrong scheme)
- [x] Archetype stability tracking

### Phase 8D: Relationship Integration (1 week) ✅ COMPLETE
- [x] Scheme disagreement detection (`lib/scheme-fit/scheme-disagreement.ts`)
- [x] GM-Coach conflict events with severity levels
- [x] Resolution options (6 types including trade, fire, compromise)
- [x] Career resurrection detection (Baker Mayfield effect)

### Phase 8E: Scout Integration (1 week) 🔄 PENDING
- [ ] Scout scheme awareness by archetype
- [ ] Scheme fit in scouting reports
- [ ] Warning system for poor fits

### Phase 8F: UI Components (2 weeks) 🔄 PENDING
- [ ] Scheme fit indicator on player cards
- [ ] Disagreement alerts
- [ ] Player usage recommendations
- [ ] Career arc visualization

### Implementation Files Created:
```
lib/scheme-fit/
├── index.ts                    # Module exports
├── types.ts                    # All archetype & fit type definitions
├── archetype-detection.ts      # Detect archetype from player attributes
├── scheme-fit-matrices.ts      # Offensive & defensive scheme fit configs
├── scheme-fit-calculator.ts    # Calculate fit, development, performance
└── scheme-disagreement.ts      # GM-Coach conflicts, career resurrection
```

---

This system creates the realistic, contextual player evaluation you described - where a player's success depends not just on their talent, but on how well they fit the system they're placed in.
