/**
 * Scout Personality System
 * Generates unique voices and opinions for each scout based on their archetype and personality type
 */

import { ScoutArchetype } from "./types";

export type PersonalityType =
  | "optimistic"    // Sees upside in everyone
  | "pessimistic"   // Always finding flaws
  | "cautious"      // Conservative, risk-averse
  | "bold"          // Loves high-risk, high-reward
  | "analytical"    // Data-driven, numbers-focused
  | "old_school";   // Trusts the eye test, skeptical of analytics

export interface ScoutPersonality {
  type: PersonalityType;
  biasDirection: number; // -10 to +10, affects their evaluations
  riskTolerance: number; // 0-100, how much they like boom/bust players
  verbosity: "terse" | "normal" | "verbose";
}

/**
 * Generate a personality for a scout
 */
export function generateScoutPersonality(): ScoutPersonality {
  const types: PersonalityType[] = [
    "optimistic", "pessimistic", "cautious", "bold", "analytical", "old_school"
  ];

  const type = types[Math.floor(Math.random() * types.length)];

  // Bias direction based on personality
  let biasDirection: number;
  switch (type) {
    case "optimistic":
      biasDirection = Math.floor(Math.random() * 8) + 2; // +2 to +10
      break;
    case "pessimistic":
      biasDirection = -(Math.floor(Math.random() * 8) + 2); // -10 to -2
      break;
    case "cautious":
      biasDirection = -(Math.floor(Math.random() * 5) + 1); // -5 to -1
      break;
    case "bold":
      biasDirection = Math.floor(Math.random() * 6) - 3; // -3 to +3 (volatile)
      break;
    default:
      biasDirection = Math.floor(Math.random() * 6) - 3; // -3 to +3
  }

  // Risk tolerance
  let riskTolerance: number;
  switch (type) {
    case "bold":
      riskTolerance = Math.floor(Math.random() * 30) + 70; // 70-100
      break;
    case "cautious":
      riskTolerance = Math.floor(Math.random() * 30) + 10; // 10-40
      break;
    case "analytical":
      riskTolerance = Math.floor(Math.random() * 40) + 30; // 30-70
      break;
    default:
      riskTolerance = Math.floor(Math.random() * 60) + 20; // 20-80
  }

  const verbosityOptions: ("terse" | "normal" | "verbose")[] = ["terse", "normal", "verbose"];
  const verbosity = verbosityOptions[Math.floor(Math.random() * verbosityOptions.length)];

  return { type, biasDirection, riskTolerance, verbosity };
}

/**
 * Voice templates organized by archetype and personality
 */
const voiceTemplates = {
  // Evaluator voices
  evaluator: {
    optimistic: {
      high: [
        "This kid's got franchise cornerstone written all over him.",
        "Trust me, he's going to be special. You don't see this often.",
        "Day one starter who could develop into a perennial Pro Bowler.",
        "The complete package. I'd stake my reputation on this one.",
      ],
      medium: [
        "Solid player with real upside if developed correctly.",
        "There's something there. Needs refinement but the tools are present.",
        "Starter potential for sure, maybe more with the right coaching.",
        "I like what I see. Could outperform his draft position.",
      ],
      low: [
        "Developmental prospect, but don't write him off completely.",
        "Might surprise people. The effort is there.",
        "Backup-caliber but could push for playing time.",
        "There's a player in there somewhere. Needs time.",
      ],
      bust_warning: [
        "Some concerns, but I think they're overblown.",
        "Character questions seem exaggerated to me.",
      ],
    },
    pessimistic: {
      high: [
        "Good player, but everyone's overrating him.",
        "Talented, but I've seen this movie before. Buyer beware.",
        "The hype machine is working overtime. He's good, not great.",
        "Solid, but the ceiling people are projecting? I don't see it.",
      ],
      medium: [
        "Replacement-level player being hyped as a starter.",
        "Average at best. Don't reach for him.",
        "He'll be available in free agency in three years.",
        "Nothing special. Scheme fit will determine his fate.",
      ],
      low: [
        "Camp body. Won't last past cutdowns.",
        "Waste of a pick. Move on.",
        "Practice squad player at best.",
        "I don't see it. At all.",
      ],
      bust_warning: [
        "Major red flags that everyone is ignoring.",
        "This has disaster written all over it.",
      ],
    },
    cautious: {
      high: [
        "Very good prospect if—and only if—he stays healthy.",
        "Top talent, but I'd want a backup plan.",
        "Worth the investment, but manage expectations year one.",
        "Elite potential with some concerning question marks.",
      ],
      medium: [
        "Serviceable starter, but don't expect more than that.",
        "Safe pick. Won't hurt you, won't make you.",
        "Middle of the roster player. Fine for depth.",
        "Acceptable option if you miss on your top targets.",
      ],
      low: [
        "Not worth the risk, even in late rounds.",
        "Too many unknowns for my comfort.",
        "Pass. There are safer options.",
        "Red flags outweigh the potential.",
      ],
      bust_warning: [
        "The risk profile here is concerning.",
        "History suggests this won't end well.",
      ],
    },
    bold: {
      high: [
        "FRANCHISE PLAYER. Trade up if you have to!",
        "Generational talent. Do whatever it takes.",
        "This is THE guy. Don't overthink it.",
        "Future Hall of Famer. Book it.",
      ],
      medium: [
        "Swing for the fences here. Could be a steal.",
        "High variance, but I love the upside play.",
        "Either a star or a bust. I'm betting star.",
        "Take the shot. The ceiling is worth it.",
      ],
      low: [
        "Lottery ticket. Might hit big.",
        "Low-risk, potential high-reward dart throw.",
        "Worth a flier. Stranger things have happened.",
        "Roll the dice. What's the worst that happens?",
      ],
      bust_warning: [
        "So what? The upside is worth the gamble.",
        "Calculated risk. I'd still take the shot.",
      ],
    },
    analytical: {
      high: [
        "Metrics suggest top-10 percentile production probability.",
        "Advanced stats strongly correlate with NFL success.",
        "WAR projections put him among the elite prospects.",
        "The numbers don't lie—this is a high-value selection.",
      ],
      medium: [
        "Expected value suggests a solid return on investment.",
        "Comparable production metrics to league-average starters.",
        "Statistical profile indicates moderate starter potential.",
        "Risk-adjusted value is acceptable at projected draft slot.",
      ],
      low: [
        "Poor efficiency metrics across all categories.",
        "Production doesn't translate based on historical comps.",
        "Negative expected value at any draft capital cost.",
        "Statistical red flags suggest limited NFL viability.",
      ],
      bust_warning: [
        "Correlation models suggest elevated bust probability.",
        "Historical comps with this profile: 78% bust rate.",
      ],
    },
    old_school: {
      high: [
        "Old-fashioned football player. Lunch pail guy.",
        "Reminds me of the greats. Built the right way.",
        "This is what a football player looks like.",
        "Watch the tape. Don't need numbers to see this.",
      ],
      medium: [
        "Knows how to play the game. Fundamentally sound.",
        "Not flashy, but he can play.",
        "Good football instincts. Can't teach that.",
        "Plays the game the right way.",
      ],
      low: [
        "Just doesn't have 'it'. Whatever the analytics say.",
        "Doesn't pass the eye test.",
        "All athleticism, no football sense.",
        "Looks great in shorts. Disappears on game day.",
      ],
      bust_warning: [
        "Something's off. I've seen this type before.",
        "My gut says no. Trust me on this one.",
      ],
    },
  },

  // Tape Grinder voices
  tape_grinder: {
    optimistic: {
      high: [
        "Film doesn't lie—this kid dominates every snap.",
        "Technically flawless. Best I've seen in years.",
        "Every single rep is NFL-caliber. Elite processor.",
        "His tape is a masterclass. Coaches will love him.",
      ],
      medium: [
        "Good technique that should translate well.",
        "Film shows growth throughout the season. Learning curve promising.",
        "Scheme fit will be key, but the tape shows potential.",
        "Correctable issues on film. Good base to work with.",
      ],
      low: [
        "Flashes on tape. Needs development but teachable.",
        "Raw but not hopeless. Tape shows coachable player.",
        "Some plays where you see what he could become.",
        "Project player with occasional moments of clarity.",
      ],
      bust_warning: [
        "Some technique issues but nothing unfixable.",
        "Film study shows room for growth, not red flags.",
      ],
      scheme_fit: {
        good: "Perfect fit for our system. Like he was made for it.",
        average: "Should adapt to any system reasonably well.",
        poor: "Will need scheme modifications, but can work.",
      },
    },
    pessimistic: {
      high: [
        "Good tape, but elite competition exposed limitations.",
        "Technique is there, but against top talent he struggled.",
        "Dominated weaker opponents. Jury's out against NFL-level.",
        "Film is good, not great. People are getting carried away.",
      ],
      medium: [
        "Technique issues that will get him killed at the next level.",
        "Film reveals fundamental problems that won't be easy to fix.",
        "One-dimensional player who was schemed open.",
        "Watch the film against ranked opponents. Different player.",
      ],
      low: [
        "Tape is brutal. Don't understand the hype.",
        "Consistently makes the wrong read. Instincts aren't there.",
        "Film is an indictment, not a scouting report.",
        "Zero processing speed. NFL will eat him alive.",
      ],
      bust_warning: [
        "Tape tells the whole story. Major concerns.",
        "This film should scare you.",
      ],
      scheme_fit: {
        good: "System fit helps hide his deficiencies.",
        average: "Better hope your scheme masks his weaknesses.",
        poor: "Scheme mismatch. This won't work.",
      },
    },
    cautious: {
      high: [
        "Elite tape, but sample size against top competition is small.",
        "Technique is excellent. Question is if it holds up in the league.",
        "Film is impressive. Want to see more before committing.",
        "Strong technical foundation. Development will be interesting.",
      ],
      medium: [
        "Tape is solid but inconsistent game to game.",
        "Some concerns in film study that need monitoring.",
        "Technical floor is fine. Ceiling is uncertain.",
        "Film shows a player you can work with, carefully.",
      ],
      low: [
        "Tape doesn't inspire confidence.",
        "Too many bad reps on film to feel good about.",
        "Technique problems look ingrained. Hard to fix.",
        "Film suggests limited ceiling.",
      ],
      bust_warning: [
        "Film reveals patterns that are concerning.",
        "Technical issues in critical situations.",
      ],
      scheme_fit: {
        good: "System fit is a plus, but not a guarantee.",
        average: "Scheme can work. Execution is the question.",
        poor: "Scheme fit concerns need to be addressed.",
      },
    },
    bold: {
      high: [
        "This tape is SPECIAL. Best I've graded in five years!",
        "Turn on any game. Dominance. Pure dominance.",
        "His technique is three years ahead of his peers.",
        "This film should end all debate. Future superstar.",
      ],
      medium: [
        "Inconsistent but the ceiling plays on tape are ELECTRIC.",
        "When it clicks, watch out. Sky-high potential.",
        "Film shows a player about to break out. I'd bet on it.",
        "Technical tools are there. Just needs to put it together.",
      ],
      low: [
        "Rare flashes that you can't teach. Worth a shot.",
        "The talent is on tape. It's about unlocking it.",
        "One play on film tells me this could work.",
        "I've seen worse tape turn into good players.",
      ],
      bust_warning: [
        "Risks are overstated. The talent is there.",
        "I'll take the upside over the concerns.",
      ],
      scheme_fit: {
        good: "Scheme fit is perfect. This is destiny.",
        average: "We can make this work with the right plan.",
        poor: "Adapt the scheme. This talent is worth it.",
      },
    },
    analytical: {
      high: [
        "Snap-by-snap efficiency metrics are off the charts.",
        "Processing time ranks in the 95th percentile.",
        "Technical grades across all categories: elite.",
        "Film data suggests premium production probability.",
      ],
      medium: [
        "Technique metrics are average with upside potential.",
        "Processing grades are solid but not special.",
        "Film efficiency is acceptable for projected role.",
        "Technical foundation scores indicate development runway.",
      ],
      low: [
        "Below replacement level in key technique metrics.",
        "Processing speed data is concerning.",
        "Film efficiency grades suggest limited NFL outlook.",
        "Technical deficiencies across multiple categories.",
      ],
      bust_warning: [
        "Technical regression patterns in high-leverage situations.",
        "Film data correlates with historical bust profiles.",
      ],
      scheme_fit: {
        good: "Scheme alignment score: 92nd percentile.",
        average: "Scheme compatibility metrics are acceptable.",
        poor: "Significant scheme mismatch in data model.",
      },
    },
    old_school: {
      high: [
        "Put on the tape. That's all you need to see.",
        "Fundamentals are textbook. Coaches everywhere want this.",
        "Film shows a complete player. No gimmicks.",
        "This is how the game is supposed to be played.",
      ],
      medium: [
        "Good fundamentals you can build on.",
        "Plays hard every snap. Film shows that.",
        "Nothing fancy, but he can play.",
        "Tape shows a worker. That counts.",
      ],
      low: [
        "Film reveals bad habits. Tough to break.",
        "Doesn't look natural on tape.",
        "All speed, no technique.",
        "Film isn't lying. He struggles.",
      ],
      bust_warning: [
        "I've seen this player before. Doesn't end well.",
        "Something about him on film doesn't sit right.",
      ],
      scheme_fit: {
        good: "Built for our system. Plug and play.",
        average: "Can play in most systems. Versatile.",
        poor: "Wrong fit. Don't force it.",
      },
    },
  },

  // Character Coach voices
  character_coach: {
    optimistic: {
      high: [
        "Captain material. Lockerroom will love him.",
        "Best interview I've had in years. Genuine kid.",
        "Leadership is off the charts. Franchise face.",
        "This young man gets it. Character is elite.",
      ],
      medium: [
        "Good kid with his head on straight.",
        "Coachable, humble, works hard. What more do you want?",
        "Solid character. Won't cause any problems.",
        "Mature beyond his years. Good addition to the room.",
      ],
      low: [
        "Some rough edges but nothing that can't be polished.",
        "Needs guidance but I think he'll respond well.",
        "Give him the right environment and he'll flourish.",
        "Not perfect, but who is at that age?",
      ],
      bust_warning: [
        "I think people are being too hard on him.",
        "The narrative doesn't match the person I met.",
      ],
      medical: {
        good: "Clean bill of health. No concerns.",
        moderate: "Minor history but nothing alarming.",
        high: "Some flags but manageable with proper care.",
      },
    },
    pessimistic: {
      high: [
        "Good kid, but charisma doesn't equal production.",
        "Says all the right things. Action remains to be seen.",
        "Interview was fine. I'm not sold on the substance.",
        "Nice person. Not sure that makes a football player.",
      ],
      medium: [
        "Concerns about how he handles adversity.",
        "Some maturity issues that give me pause.",
        "Character is a work in progress.",
        "Needs more leadership before trusting him.",
      ],
      low: [
        "Red flags everywhere. Proceed with extreme caution.",
        "This one has bust written all over him. Character issues.",
        "The intel I have is troubling. Stay away.",
        "Lockerroom cancer in the making. My sources are clear.",
      ],
      bust_warning: [
        "Character concerns are legitimate. Don't ignore them.",
        "My gut says this ends badly.",
      ],
      medical: {
        good: "Clean now, but injury history is concerning.",
        moderate: "Medical flags that shouldn't be dismissed.",
        high: "Significant durability concerns. High risk.",
      },
    },
    cautious: {
      high: [
        "Strong character, but let's not put too much pressure too soon.",
        "Good young man. Culture fit needs verification.",
        "Character checks out, but pro adjustment is real.",
        "Positive reports, but NFL is a different animal.",
      ],
      medium: [
        "Decent character, nothing to get excited about.",
        "No red flags, but no green ones either.",
        "Average maturity for his age. Typical prospect.",
        "Can work with him, but monitor closely.",
      ],
      low: [
        "Enough concerns to give me pause.",
        "I'd want ironclad character verification before proceeding.",
        "Risk level is higher than I'm comfortable with.",
        "Too many unknowns on the character side.",
      ],
      bust_warning: [
        "Character questions warrant serious consideration.",
        "Can't ignore the warning signs.",
      ],
      medical: {
        good: "Medical is fine, but injuries can happen.",
        moderate: "Would want additional medical workups.",
        high: "Medical concerns need to be factored heavily.",
      },
    },
    bold: {
      high: [
        "This kid is SPECIAL. Future Walter Payton Man of the Year.",
        "Leader of men. Draft him and build around him.",
        "I'm in love with this prospect. All-time character.",
        "Captain day one. Future face of the franchise.",
      ],
      medium: [
        "I believe in this kid. Character will drive his development.",
        "There's something in him. Worth taking the chance.",
        "Buy stock now. Character will carry him further than expected.",
        "I'd bet on this young man any day.",
      ],
      low: [
        "Redemption story waiting to happen. I'm in.",
        "People change. I see the potential in him.",
        "Diamond in the rough. Needs the right culture.",
        "I'll take the character risk for this upside.",
      ],
      bust_warning: [
        "People grow up. I'd roll the dice.",
        "His past doesn't define his future.",
      ],
      medical: {
        good: "Healthy and ready. No concerns.",
        moderate: "Minor stuff. Part of football.",
        high: "Modern medicine handles this. I'm not worried.",
      },
    },
    analytical: {
      high: [
        "Psychological profile scores in elite category.",
        "Competitive character index: top 5% of prospects.",
        "Leadership assessment metrics are exceptional.",
        "Mental processing and coachability scores are premium.",
      ],
      medium: [
        "Character metrics fall within acceptable parameters.",
        "Psychological assessment indicates average adjustment profile.",
        "Leadership index is solid but not exceptional.",
        "Mental makeup scores suggest typical development curve.",
      ],
      low: [
        "Character assessment reveals concerning data points.",
        "Risk indices for character issues are elevated.",
        "Psychological profile correlates with historical busts.",
        "Leadership metrics below threshold for premium investment.",
      ],
      bust_warning: [
        "Character algorithms flag significant risk.",
        "Historical data on this profile is troubling.",
      ],
      medical: {
        good: "Medical metrics all within normal range.",
        moderate: "Some data points warrant monitoring.",
        high: "Medical risk score exceeds comfort threshold.",
      },
    },
    old_school: {
      high: [
        "Good family. Good values. That tells me everything.",
        "Shook his hand, looked him in the eye. That's my guy.",
        "Reminds me of the old-timers. Does it the right way.",
        "You can just tell. This one's got the right stuff.",
      ],
      medium: [
        "Seems like a decent kid. Nothing special either way.",
        "I've seen better, I've seen worse.",
        "Can work with him. Just needs direction.",
        "Typical young man. Will need guidance.",
      ],
      low: [
        "Something's off about this kid. Can't put my finger on it.",
        "Don't like what I see. Trust my instincts.",
        "Bad vibes. Call it old-fashioned, but I'm out.",
        "He's not one of us. Won't fit the room.",
      ],
      bust_warning: [
        "I've been around long enough to know trouble.",
        "My gut hasn't been wrong yet.",
      ],
      medical: {
        good: "Healthy as a horse. Good to go.",
        moderate: "A few bumps and bruises. Normal.",
        high: "Injury prone. Can't stay on the field.",
      },
    },
  },

  // Athletic Analyst voices
  athletic_analyst: {
    optimistic: {
      high: [
        "Elite athlete. Measurables are off the charts.",
        "Physical freak. This kind of athleticism is rare.",
        "Best athletic profile in the class. Unmatched tools.",
        "His testing numbers are generational. Build around that.",
      ],
      medium: [
        "Good athlete who moves well for his size.",
        "Athletic profile is solid. Should translate.",
        "Above-average tools that can be developed.",
        "Athletically, there's something to work with here.",
      ],
      low: [
        "Limited athlete, but technique can compensate.",
        "Not a physical marvel, but plays faster than tests.",
        "Testing doesn't always tell the whole story.",
        "Game speed is different than combine speed.",
      ],
      bust_warning: [
        "Athletic limitations are overstated. He plays faster.",
        "Measurables don't capture his competitive burst.",
      ],
    },
    pessimistic: {
      high: [
        "Great athlete, but athleticism doesn't equal football.",
        "Impressive numbers. Still has to prove he can play.",
        "Physical tools are there. Translation is uncertain.",
        "Elite measurables have fooled scouts before.",
      ],
      medium: [
        "Average athlete trying to survive in an elite league.",
        "Athletic limitations will show at the next level.",
        "Physical ceiling is concerning.",
        "Not twitchy enough for the NFL game.",
      ],
      low: [
        "Athletically limited. Will be exposed.",
        "Physical tools are insufficient for the position.",
        "Can't make up for this athletic deficit.",
        "Testing confirms what the tape shows: limited.",
      ],
      bust_warning: [
        "Athletic red flags are impossible to coach around.",
        "Physical limitations doom this projection.",
      ],
    },
    cautious: {
      high: [
        "Elite athlete if he can stay healthy.",
        "Impressive testing, but want to see it in pads.",
        "Physical gifts are obvious. Question is application.",
        "Athletic profile is premium. Development TBD.",
      ],
      medium: [
        "Solid athlete, nothing more. Depends on technique.",
        "Physical tools are acceptable for the position.",
        "Athletic profile is workable with proper development.",
        "Not a physical standout. Will need to earn it.",
      ],
      low: [
        "Athletic limitations are concerning.",
        "Physical profile doesn't inspire confidence.",
        "Will struggle against superior athletes.",
        "Athletic floor is low. Risky investment.",
      ],
      bust_warning: [
        "Athletic deficiencies hard to overlook.",
        "Physical testing raises legitimate questions.",
      ],
    },
    bold: {
      high: [
        "FREAK ATHLETE! Whatever it takes, get this guy!",
        "Once-in-a-generation physical tools. Can't teach this!",
        "The athleticism alone is worth a first-round pick!",
        "Holy smokes, look at these numbers! Superstar incoming!",
      ],
      medium: [
        "Explosive athlete who hasn't scratched the surface.",
        "The athletic upside here is tantalizing. I'm in.",
        "Give me this physical profile all day.",
        "Athletes figure it out. This guy's got it.",
      ],
      low: [
        "I've seen limited athletes dominate before.",
        "Heart and technique beat testing numbers.",
        "You can't measure everything. He plays fast.",
        "Doesn't test well but trust the play speed.",
      ],
      bust_warning: [
        "The athleticism will win out. Trust the physical tools.",
        "Too talented physically to fail.",
      ],
    },
    analytical: {
      high: [
        "Athletic metrics: 99th percentile composite score.",
        "Speed-strength-agility index is elite category.",
        "RAS (Relative Athletic Score): 9.7/10.",
        "Physical testing data predicts premium outcome.",
      ],
      medium: [
        "Athletic composite falls within starter range.",
        "Physical metrics are acceptable for position.",
        "Testing data suggests average athletic profile.",
        "Speed-strength ratio is near position average.",
      ],
      low: [
        "Athletic metrics fall below starter threshold.",
        "Physical testing data is concerning.",
        "Composite athletic score: below average.",
        "Historical data on this profile is unfavorable.",
      ],
      bust_warning: [
        "Athletic decline probability is elevated.",
        "Physical metrics correlate with limited ceiling.",
      ],
    },
    old_school: {
      high: [
        "Kid looks like he was built in a lab. Pure athlete.",
        "Most impressive physical specimen I've seen in years.",
        "The way he moves... you can't teach that.",
        "God-given athletic ability. Rare stuff.",
      ],
      medium: [
        "Moves well enough. Gets the job done.",
        "Decent athlete. Not going to wow you.",
        "Functional athleticism for the position.",
        "He'll be fine physically. Nothing special.",
      ],
      low: [
        "Just doesn't have the physical tools.",
        "Not built for this level. Sorry.",
        "Athletically limited. End of story.",
        "The body just isn't there.",
      ],
      bust_warning: [
        "Physical limitations catch up eventually.",
        "Can't fake athleticism at this level.",
      ],
    },
  },
};

/**
 * Generate a scouting note based on scout archetype, personality, and prospect evaluation
 */
export function generateScoutNote(
  archetype: ScoutArchetype,
  personality: ScoutPersonality,
  overallRating: number, // estimated rating 0-100
  context?: {
    hasBustRisk?: boolean;
    schemeFit?: "good" | "average" | "poor";
    medicalRisk?: "good" | "moderate" | "high";
    position?: string;
    prospectName?: string;
  }
): string {
  const templates = voiceTemplates[archetype]?.[personality.type];
  if (!templates) {
    return "Scout evaluation pending.";
  }

  // Determine grade tier
  let tier: "high" | "medium" | "low";
  if (overallRating >= 80) {
    tier = "high";
  } else if (overallRating >= 65) {
    tier = "medium";
  } else {
    tier = "low";
  }

  // Get base note
  const tierNotes = templates[tier];
  const baseNote = tierNotes[Math.floor(Math.random() * tierNotes.length)];

  const noteParts: string[] = [baseNote];

  // Add bust warning if applicable
  if (context?.hasBustRisk && templates.bust_warning) {
    const bustNotes = templates.bust_warning;
    noteParts.push(bustNotes[Math.floor(Math.random() * bustNotes.length)]);
  }

  // Add scheme fit note for tape grinders
  if (archetype === "tape_grinder" && context?.schemeFit && templates.scheme_fit) {
    const schemeNotes = templates.scheme_fit as Record<string, string>;
    if (schemeNotes[context.schemeFit]) {
      noteParts.push(schemeNotes[context.schemeFit]);
    }
  }

  // Add medical note for character coaches
  if (archetype === "character_coach" && context?.medicalRisk && templates.medical) {
    const medicalNotes = templates.medical as Record<string, string>;
    if (medicalNotes[context.medicalRisk]) {
      noteParts.push(medicalNotes[context.medicalRisk]);
    }
  }

  // Adjust verbosity
  if (personality.verbosity === "terse" && noteParts.length > 1) {
    return noteParts[0]; // Only base note
  } else if (personality.verbosity === "verbose") {
    return noteParts.join(" ");
  }

  return noteParts.slice(0, 2).join(" "); // Normal: base + one additional
}

/**
 * Generate a scout's "headline" opinion for a prospect
 */
export function generateHeadlineOpinion(
  archetype: ScoutArchetype,
  personality: ScoutPersonality,
  overallRating: number
): string {
  const headlines: Record<ScoutArchetype, Record<PersonalityType, Record<"high" | "medium" | "low", string[]>>> = {
    evaluator: {
      optimistic: {
        high: ["Future Star", "Franchise Cornerstone", "Blue Chip Prospect"],
        medium: ["Solid Starter", "Quality Player", "Good Value"],
        low: ["Development Project", "Worth a Look", "Upside Play"],
      },
      pessimistic: {
        high: ["Overhyped Talent", "Proceed with Caution", "Not Convinced"],
        medium: ["Replacement Level", "Nothing Special", "Buyer Beware"],
        low: ["Avoid", "Roster Filler", "Pass"],
      },
      cautious: {
        high: ["High Ceiling, Questions Remain", "Talented but Risky", "Premium with Caveats"],
        medium: ["Safe Selection", "Adequate Prospect", "Acceptable Risk"],
        low: ["Too Many Unknowns", "Risky Investment", "Limited Upside"],
      },
      bold: {
        high: ["MUST HAVE", "Future HOFer", "Trade Up Target"],
        medium: ["Hidden Gem", "Value Pick", "Breakout Candidate"],
        low: ["Sleeper Alert", "Worth the Gamble", "Boom or Bust"],
      },
      analytical: {
        high: ["Elite Projection", "Premium Value", "Tier 1 Asset"],
        medium: ["Expected Value: Positive", "Solid Metrics", "Acceptable Profile"],
        low: ["Negative Expected Value", "Below Threshold", "Poor ROI"],
      },
      old_school: {
        high: ["Real Football Player", "The Right Stuff", "Can't-Miss"],
        medium: ["Knows the Game", "Will Compete", "Serviceable"],
        low: ["Doesn't Pass the Test", "Missing Something", "Not for Us"],
      },
    },
    tape_grinder: {
      optimistic: {
        high: ["Tape Doesn't Lie - Elite", "Film Room Favorite", "Every-Down Player"],
        medium: ["Solid Film", "Shows Potential", "Correctable Issues"],
        low: ["Flashes on Tape", "Teachable", "Work in Progress"],
      },
      pessimistic: {
        high: ["Overrated on Film", "Competition Concerns", "Technique Gaps"],
        medium: ["Film Exposes Flaws", "Limited Processing", "System Player"],
        low: ["Brutal Tape", "Not NFL Ready", "Major Technical Issues"],
      },
      cautious: {
        high: ["Impressive Film, Small Sample", "Technical Excellence, Monitor", "Elite Technique"],
        medium: ["Inconsistent Tape", "Development Needed", "Average Film"],
        low: ["Concerning Patterns", "Technical Deficiencies", "Film Red Flags"],
      },
      bold: {
        high: ["BEST TAPE I'VE SEEN", "Technically Perfect", "Scheme Fit King"],
        medium: ["Upside Plays Pop", "Technique Will Emerge", "Bet on Development"],
        low: ["Raw But Talented", "Project With Ceiling", "Technique Sleeper"],
      },
      analytical: {
        high: ["Elite Efficiency Metrics", "Premium Processing", "Top Technique Scores"],
        medium: ["Average Technical Grade", "Acceptable Processing", "Standard Metrics"],
        low: ["Below Standard Metrics", "Processing Concerns", "Efficiency Issues"],
      },
      old_school: {
        high: ["Textbook Fundamentals", "Coaches Dream", "Football Player"],
        medium: ["Sound Technique", "Good Foundation", "Can Play"],
        low: ["Bad Habits", "Doesn't Look Right", "Coaching Challenge"],
      },
    },
    character_coach: {
      optimistic: {
        high: ["Locker Room Leader", "Captain Material", "Elite Character"],
        medium: ["Good Kid", "Coachable", "Culture Fit"],
        low: ["Diamond in the Rough", "Needs Guidance", "Redeemable"],
      },
      pessimistic: {
        high: ["Nice Guy, Unproven", "Character Overrated", "Skeptical"],
        medium: ["Maturity Questions", "Work Ethic Concerns", "Average Character"],
        low: ["Major Red Flags", "Locker Room Risk", "Stay Away"],
      },
      cautious: {
        high: ["Strong Character, Verify", "Leadership Potential", "Good Reports"],
        medium: ["Standard Character", "No Red Flags", "Typical Prospect"],
        low: ["Character Concerns", "Needs Monitoring", "Risk Assessment"],
      },
      bold: {
        high: ["FUTURE CAPTAIN", "Best Person in Draft", "Franchise Face"],
        medium: ["Believer", "Will Surprise People", "Bet on Character"],
        low: ["Redemption Story", "Changed Man", "Worth the Risk"],
      },
      analytical: {
        high: ["Elite Psych Profile", "Premium Character Metrics", "Top Leadership Index"],
        medium: ["Average Character Data", "Standard Profile", "Acceptable Metrics"],
        low: ["Elevated Risk Indices", "Concerning Correlations", "Below Threshold"],
      },
      old_school: {
        high: ["Good Family", "My Kind of Guy", "The Right Stuff"],
        medium: ["Decent Kid", "Will Work", "Nothing Fancy"],
        low: ["Bad Vibes", "Not Our Type", "Gut Says No"],
      },
    },
    athletic_analyst: {
      optimistic: {
        high: ["Physical Freak", "Elite Athlete", "Generational Tools"],
        medium: ["Good Athlete", "NFL Body", "Solid Tools"],
        low: ["Plays Faster", "Game Speed Matters", "Functional Athlete"],
      },
      pessimistic: {
        high: ["Athlete, Not Player", "Testing Doesn't Translate", "Overrated Tools"],
        medium: ["Limited Athleticism", "Ceiling Concerns", "Average Profile"],
        low: ["Physical Deficiencies", "Not NFL Athlete", "Will Be Exposed"],
      },
      cautious: {
        high: ["Elite Athlete, Stay Healthy", "Premium Tools, Development Key", "Physical Upside"],
        medium: ["Adequate Athlete", "Acceptable Profile", "Workable Tools"],
        low: ["Athletic Limitations", "Physical Concerns", "Development Uncertain"],
      },
      bold: {
        high: ["FREAK", "Once-in-Generation", "Athletic Unicorn"],
        medium: ["Hidden Athleticism", "Explosive Upside", "Untapped Potential"],
        low: ["Overcomes Testing", "Heart Over Measurables", "Plays Big"],
      },
      analytical: {
        high: ["99th Percentile RAS", "Elite Composite", "Premium Testing"],
        medium: ["Average Athletic Score", "Standard Metrics", "Acceptable Testing"],
        low: ["Below Threshold", "Concerning Metrics", "Poor Athletic Data"],
      },
      old_school: {
        high: ["Built Like a Truck", "Pure Athlete", "God-Given Ability"],
        medium: ["Gets It Done", "Functional", "Good Enough"],
        low: ["Doesn't Have It", "Limited Build", "Not Made for This"],
      },
    },
  };

  let tier: "high" | "medium" | "low";
  if (overallRating >= 80) {
    tier = "high";
  } else if (overallRating >= 65) {
    tier = "medium";
  } else {
    tier = "low";
  }

  const options = headlines[archetype]?.[personality.type]?.[tier];
  if (!options || options.length === 0) {
    return "Evaluation Pending";
  }

  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Check if two scouts would "disagree" on a prospect
 * Returns the conflict level: null (agree), "minor", or "major"
 */
export function checkScoutDisagreement(
  scout1Rating: number,
  scout1Personality: ScoutPersonality,
  scout2Rating: number,
  scout2Personality: ScoutPersonality
): "major" | "minor" | null {
  const difference = Math.abs(scout1Rating - scout2Rating);

  // Major disagreement: 15+ point difference
  if (difference >= 15) {
    return "major";
  }

  // Minor disagreement: 8-14 point difference
  if (difference >= 8) {
    return "minor";
  }

  // Also flag disagreement when personalities are opposite
  const opposites: [PersonalityType, PersonalityType][] = [
    ["optimistic", "pessimistic"],
    ["cautious", "bold"],
  ];

  for (const [p1, p2] of opposites) {
    if (
      (scout1Personality.type === p1 && scout2Personality.type === p2) ||
      (scout1Personality.type === p2 && scout2Personality.type === p1)
    ) {
      if (difference >= 5) return "minor";
    }
  }

  return null;
}
