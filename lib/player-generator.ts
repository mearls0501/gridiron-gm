import { random } from "@/lib/utils";
import { generateContract } from "@/lib/contract-generator";

const positions = [
  "QB",
  "RB",
  "WR",
  "TE",
  "OT",
  "OG",
  "C",
  "DE",
  "DT",
  "LB",
  "CB",
  "S",
  "K",
  "P",
];

const colleges = [
  "Alabama",
  "Georgia",
  "Ohio State",
  "Michigan",
  "Texas",
  "LSU",
  "Florida State",
  "Oregon",
  "USC",
  "Notre Dame",
  "Clemson",
  "Miami",
];

type TalentTier = "elite" | "mid" | "late" | "bust";

function generateTalentTier(): TalentTier {
  const roll = Math.random();
  // Elite: ~12% (top prospects)
  if (roll < 0.12) return "elite";
  // Mid level: ~35% (solid contributors)
  if (roll < 0.47) return "mid";
  // Late round: ~38% (depth players)
  if (roll < 0.85) return "late";
  // Busts: ~15% (low potential)
  return "bust";
}

function generateProspectRatings(tier: TalentTier): {
  overall: number;
  potential: number;
} {
  switch (tier) {
    case "elite":
      // Elite talent: High overall, very high potential
      return {
        overall: random(80, 90),
        potential: random(85, 99),
      };
    case "mid":
      // Mid level: Solid overall, good potential
      return {
        overall: random(70, 79),
        potential: random(75, 89),
      };
    case "late":
      // Late round: Lower overall, decent potential
      return {
        overall: random(60, 69),
        potential: random(70, 84),
      };
    case "bust":
      // Busts: Low overall, low potential (potential close to or below overall)
      const overall = random(55, 59);
      return {
        overall,
        potential: random(60, Math.max(overall + 5, 74)), // Potential can be close to overall
      };
  }
}

/**
 * Generate detailed attributes based on position and talent tier
 * These map to the 71 attributes used in the simulation engine
 */
function generateDetailedAttributes(
  position: string,
  tier: TalentTier,
  overall: number
): Record<string, number> {
  // Base variance from overall rating
  const variance = (offset: number = 0) => {
    const base = overall + offset;
    const range = tier === "elite" ? 8 : tier === "mid" ? 10 : 12;
    return Math.max(40, Math.min(99, random(base - range, base + range)));
  };

  // Common attributes for all positions
  const baseAttributes = {
    // Physical
    spd: variance(),
    acc: variance(),
    agi: variance(),
    str: variance(),
    
    // Mental/Character (these affect all positions)
    awr: variance(),
    football_iq: variance(),
    motor: variance(-5), // Slightly lower than overall
    work_ethic: variance(),
    coachability: variance(),
    leadership: variance(-10), // Rare trait
    durability: variance(),
    consistency: variance(),
    injury_risk: random(30, 70), // Independent of tier
    
    // Projection attributes for prospects
    athletic_ceiling: Math.min(99, overall + random(0, 15)),
    technique_ceiling: Math.min(99, overall + random(0, 15)),
    mental_ceiling: Math.min(99, overall + random(0, 15)),
    breakout_probability: tier === "elite" ? random(60, 90) : tier === "mid" ? random(30, 60) : random(10, 40),
    bust_probability: tier === "bust" ? random(60, 90) : tier === "late" ? random(30, 60) : random(10, 40),
  };

  // Position-specific attributes
  const positionAttributes = getPositionAttributes(position, variance, overall);

  return { ...baseAttributes, ...positionAttributes };
}

/**
 * Get position-specific attributes
 */
function getPositionAttributes(
  position: string,
  variance: (offset?: number) => number,
  overall: number
): Record<string, number> {
  switch (position) {
    case "QB":
      return {
        // Passing
        thp: variance(),
        sac: variance(2), // QB strength
        mac: variance(),
        dac: variance(-5),
        tup: variance(),
        pac: variance(),
        dec: variance(),
        
        // Ball carrier
        btk: variance(-20),
        car: variance(-15),
        
        // Technical
        mechanics: variance(),
        decision_time: variance(),
        footwork: variance(),
        
        // Unused but set to prevent errors
        vsn: 50,
        rtr: 50,
        pblk: 40,
        rblk: 40,
        iblk: 40,
        agg: 50,
        rls: 50,
        rte: 50,
        cth: 50,
        cit: 50,
        yac: 50,
        pmv: 40,
        fmv: 40,
        bsh: 40,
        pur: 40,
        tak: 40,
        cov: 40,
        mcv: 40,
        zcv: 40,
        prs: 40,
        kpw: 40,
        kac: 40,
        hand_placement: 50,
        release_tech: 50,
        hand_tech: 50,
        leverage: 50,
        move_set: 40,
        backpedal: 40,
        ball_skills: 50,
        play_recognition: variance(-5),
      };

    case "RB":
      return {
        // Ball carrier
        btk: variance(5),
        car: variance(),
        vsn: variance(),
        
        // Receiving
        rls: variance(-10),
        rte: variance(-10),
        cth: variance(-15),
        cit: variance(-10),
        yac: variance(5),
        
        // Blocking
        pblk: variance(-15),
        rblk: variance(-10),
        iblk: variance(-10),
        agg: variance(),
        
        // Technical
        footwork: variance(),
        ball_skills: variance(-10),
        play_recognition: variance(),
        
        // Unused
        thp: 50,
        sac: 50,
        mac: 50,
        dac: 50,
        tup: 50,
        pac: 50,
        dec: 50,
        rtr: 50,
        pmv: 40,
        fmv: 40,
        bsh: 40,
        pur: 40,
        tak: 40,
        cov: 40,
        mcv: 40,
        zcv: 40,
        prs: 40,
        kpw: 40,
        kac: 40,
        hand_placement: 50,
        release_tech: variance(-10),
        hand_tech: variance(-10),
        mechanics: 50,
        decision_time: variance(-5),
        leverage: 50,
        move_set: 40,
        backpedal: 40,
      };

    case "WR":
      return {
        // Receiving
        rls: variance(),
        rte: variance(),
        cth: variance(),
        cit: variance(),
        yac: variance(),
        
        // Blocking (minimal)
        pblk: variance(-20),
        rblk: variance(-20),
        iblk: variance(-20),
        agg: variance(-10),
        
        // Ball carrier
        btk: variance(-10),
        car: variance(-10),
        
        // Technical
        release_tech: variance(),
        hand_tech: variance(),
        footwork: variance(),
        ball_skills: variance(),
        play_recognition: variance(),
        
        // Unused
        thp: 40,
        sac: 40,
        mac: 40,
        dac: 40,
        tup: 40,
        pac: 40,
        dec: 40,
        vsn: 50,
        rtr: 50,
        pmv: 40,
        fmv: 40,
        bsh: 40,
        pur: variance(-20),
        tak: variance(-25),
        cov: 40,
        mcv: 40,
        zcv: 40,
        prs: 40,
        kpw: 40,
        kac: 40,
        hand_placement: 50,
        mechanics: 40,
        decision_time: variance(-10),
        leverage: 50,
        move_set: 40,
        backpedal: 40,
      };

    case "TE":
      return {
        // Receiving
        rls: variance(),
        rte: variance(),
        cth: variance(),
        cit: variance(5), // Better in traffic than WR
        yac: variance(),
        
        // Blocking (TEs block more)
        pblk: variance(-5),
        rblk: variance(),
        iblk: variance(),
        agg: variance(5),
        
        // Ball carrier
        btk: variance(-10),
        car: variance(-10),
        
        // Technical
        release_tech: variance(),
        hand_tech: variance(),
        footwork: variance(),
        ball_skills: variance(),
        play_recognition: variance(),
        hand_placement: variance(-5),
        
        // Unused
        thp: 40,
        sac: 40,
        mac: 40,
        dac: 40,
        tup: 40,
        pac: 40,
        dec: 40,
        vsn: 50,
        rtr: 50,
        pmv: 40,
        fmv: 40,
        bsh: variance(-10),
        pur: variance(-20),
        tak: variance(-20),
        cov: 40,
        mcv: 40,
        zcv: 40,
        prs: 40,
        kpw: 40,
        kac: 40,
        mechanics: 40,
        decision_time: variance(-10),
        leverage: variance(-5),
        move_set: 40,
        backpedal: 40,
      };

    case "OT":
    case "OG":
    case "C":
      return {
        // Blocking
        pblk: variance(),
        rblk: variance(),
        iblk: variance(),
        agg: variance(-5),
        
        // Technical
        footwork: variance(),
        hand_placement: variance(),
        leverage: variance(),
        play_recognition: variance(),
        hand_tech: variance(-10),
        
        // Unused
        thp: 40,
        sac: 40,
        mac: 40,
        dac: 40,
        tup: 40,
        pac: 40,
        dec: 40,
        btk: 50,
        car: 50,
        vsn: 50,
        rtr: 50,
        rls: 40,
        rte: 40,
        cth: 40,
        cit: 40,
        yac: 40,
        pmv: 40,
        fmv: 40,
        bsh: 50,
        pur: 50,
        tak: 40,
        cov: 40,
        mcv: 40,
        zcv: 40,
        prs: 40,
        kpw: 40,
        kac: 40,
        release_tech: 40,
        mechanics: 40,
        decision_time: variance(),
        move_set: 40,
        backpedal: 40,
        ball_skills: 40,
      };

    case "DE":
      return {
        // Pass rush
        pmv: variance(),
        fmv: variance(),
        bsh: variance(),
        pur: variance(),
        tak: variance(),
        
        // Technical
        move_set: variance(),
        hand_placement: variance(),
        leverage: variance(),
        play_recognition: variance(),
        hand_tech: variance(-5),
        
        // Unused
        thp: 40,
        sac: 40,
        mac: 40,
        dac: 40,
        tup: 40,
        pac: 40,
        dec: 40,
        btk: 50,
        car: 50,
        vsn: 50,
        rtr: 50,
        pblk: 40,
        rblk: 40,
        iblk: 40,
        agg: variance(),
        rls: 40,
        rte: 40,
        cth: 40,
        cit: 40,
        yac: 40,
        cov: variance(-20),
        mcv: 40,
        zcv: 40,
        prs: 40,
        kpw: 40,
        kac: 40,
        footwork: variance(-5),
        release_tech: 40,
        mechanics: 40,
        decision_time: 50,
        backpedal: 40,
        ball_skills: variance(-20),
      };

    case "DT":
      return {
        // Pass rush (less finesse than DE)
        pmv: variance(),
        fmv: variance(-5),
        bsh: variance(),
        pur: variance(),
        tak: variance(),
        
        // Technical
        move_set: variance(),
        hand_placement: variance(),
        leverage: variance(),
        play_recognition: variance(),
        hand_tech: variance(-5),
        
        // Unused
        thp: 40,
        sac: 40,
        mac: 40,
        dac: 40,
        tup: 40,
        pac: 40,
        dec: 40,
        btk: 50,
        car: 50,
        vsn: 50,
        rtr: 50,
        pblk: 40,
        rblk: 40,
        iblk: 40,
        agg: variance(),
        rls: 40,
        rte: 40,
        cth: 40,
        cit: 40,
        yac: 40,
        cov: variance(-20),
        mcv: 40,
        zcv: 40,
        prs: 40,
        kpw: 40,
        kac: 40,
        footwork: variance(-5),
        release_tech: 40,
        mechanics: 40,
        decision_time: 50,
        backpedal: 40,
        ball_skills: variance(-20),
      };

    case "LB":
      return {
        // Defense
        tak: variance(),
        pur: variance(),
        bsh: variance(),
        cov: variance(-5),
        
        // Coverage
        mcv: variance(-10),
        zcv: variance(-5),
        
        // Pass rush
        pmv: variance(-10),
        fmv: variance(-10),
        
        // Technical
        play_recognition: variance(),
        backpedal: variance(-5),
        ball_skills: variance(-10),
        hand_placement: variance(-10),
        
        // Unused
        thp: 40,
        sac: 40,
        mac: 40,
        dac: 40,
        tup: 40,
        pac: 40,
        dec: 40,
        btk: variance(-10),
        car: 50,
        vsn: 50,
        rtr: 50,
        pblk: 40,
        rblk: 40,
        iblk: 40,
        agg: variance(),
        rls: 40,
        rte: 40,
        cth: 40,
        cit: 40,
        yac: 40,
        prs: variance(-15),
        kpw: 40,
        kac: 40,
        footwork: variance(-10),
        release_tech: 40,
        hand_tech: 50,
        mechanics: 40,
        decision_time: 50,
        leverage: 50,
        move_set: variance(-15),
      };

    case "CB":
      return {
        // Coverage
        mcv: variance(),
        zcv: variance(),
        prs: variance(),
        
        // Defense
        tak: variance(-5),
        pur: variance(),
        cov: variance(),
        
        // Technical
        backpedal: variance(),
        ball_skills: variance(),
        play_recognition: variance(),
        footwork: variance(-5),
        
        // Unused
        thp: 40,
        sac: 40,
        mac: 40,
        dac: 40,
        tup: 40,
        pac: 40,
        dec: 40,
        btk: variance(-15),
        car: 50,
        vsn: 50,
        rtr: 50,
        pblk: 40,
        rblk: 40,
        iblk: 40,
        agg: variance(-10),
        rls: 40,
        rte: 40,
        cth: variance(-20),
        cit: variance(-20),
        yac: 40,
        pmv: 40,
        fmv: 40,
        bsh: variance(-20),
        kpw: 40,
        kac: 40,
        hand_placement: 40,
        release_tech: 40,
        hand_tech: variance(-10),
        mechanics: 40,
        decision_time: 50,
        leverage: 40,
        move_set: 40,
      };

    case "S":
      return {
        // Coverage (more zone than CB)
        mcv: variance(),
        zcv: variance(5),
        prs: variance(-5),
        
        // Defense (better tackler than CB)
        tak: variance(5),
        pur: variance(),
        cov: variance(),
        
        // Technical
        backpedal: variance(),
        ball_skills: variance(),
        play_recognition: variance(),
        footwork: variance(-5),
        
        // Unused
        thp: 40,
        sac: 40,
        mac: 40,
        dac: 40,
        tup: 40,
        pac: 40,
        dec: 40,
        btk: variance(-15),
        car: 50,
        vsn: 50,
        rtr: 50,
        pblk: 40,
        rblk: 40,
        iblk: 40,
        agg: variance(-10),
        rls: 40,
        rte: 40,
        cth: variance(-20),
        cit: variance(-20),
        yac: 40,
        pmv: 40,
        fmv: 40,
        bsh: variance(-20),
        kpw: 40,
        kac: 40,
        hand_placement: 40,
        release_tech: 40,
        hand_tech: variance(-10),
        mechanics: 40,
        decision_time: 50,
        leverage: 40,
        move_set: 40,
      };

    case "K":
    case "P":
      return {
        // Kicking
        kpw: variance(),
        kac: variance(),
        
        // All others low/default
        thp: 40,
        sac: 40,
        mac: 40,
        dac: 40,
        tup: 40,
        pac: 40,
        dec: 40,
        btk: 40,
        car: 40,
        vsn: 40,
        rtr: 40,
        pblk: 40,
        rblk: 40,
        iblk: 40,
        agg: 40,
        rls: 40,
        rte: 40,
        cth: 40,
        cit: 40,
        yac: 40,
        pmv: 40,
        fmv: 40,
        bsh: 40,
        pur: 40,
        tak: 40,
        cov: 40,
        mcv: 40,
        zcv: 40,
        prs: 40,
        footwork: 50,
        hand_placement: 40,
        release_tech: 40,
        hand_tech: 40,
        mechanics: variance(),
        decision_time: 50,
        leverage: 40,
        move_set: 40,
        backpedal: 40,
        ball_skills: 40,
        play_recognition: 50,
      };

    default:
      // Fallback - all attributes at average
      const defaultValue = Math.round(overall * 0.8);
      return {
        thp: defaultValue,
        sac: defaultValue,
        mac: defaultValue,
        dac: defaultValue,
        tup: defaultValue,
        pac: defaultValue,
        dec: defaultValue,
        btk: defaultValue,
        car: defaultValue,
        vsn: defaultValue,
        rtr: defaultValue,
        pblk: defaultValue,
        rblk: defaultValue,
        iblk: defaultValue,
        agg: defaultValue,
        rls: defaultValue,
        rte: defaultValue,
        cth: defaultValue,
        cit: defaultValue,
        yac: defaultValue,
        pmv: defaultValue,
        fmv: defaultValue,
        bsh: defaultValue,
        pur: defaultValue,
        tak: defaultValue,
        cov: defaultValue,
        mcv: defaultValue,
        zcv: defaultValue,
        prs: defaultValue,
        kpw: defaultValue,
        kac: defaultValue,
        footwork: defaultValue,
        hand_placement: defaultValue,
        release_tech: defaultValue,
        hand_tech: defaultValue,
        mechanics: defaultValue,
        decision_time: defaultValue,
        leverage: defaultValue,
        move_set: defaultValue,
        backpedal: defaultValue,
        ball_skills: defaultValue,
        play_recognition: defaultValue,
      };
  }
}

export function generatePlayer({
  isProspect = false,
  talentTier,
}: { isProspect?: boolean; talentTier?: TalentTier } = {}) {
  const position = positions[random(0, positions.length - 1)];
  const college = colleges[random(0, colleges.length - 1)];
  const fullName = generateName();

  let overall: number;
  let potential: number;
  let tier: TalentTier;

  if (isProspect) {
    tier = talentTier || generateTalentTier();
    const ratings = generateProspectRatings(tier);
    overall = ratings.overall;
    potential = ratings.potential;
  } else {
    overall = random(60, 99);
    potential = random(70, 99);
    tier = "mid"; // Default tier for non-prospects
  }

  const contract = isProspect
    ? {
        contract_year_1: 0,
        contract_year_2: 0,
        contract_year_3: 0,
        contract_year_4: 0,
        signing_bonus: 0,
      }
    : generateContract(position, overall);

  // Generate detailed attributes based on position and tier
  const detailedAttributes = generateDetailedAttributes(position, tier, overall);

  return {
    full_name: fullName,
    position,
    age: isProspect ? random(20, 23) : random(22, 35),
    college,
    archetype: generateArchetype(position),
    overall,
    potential,
    ...detailedAttributes, // Spread all 71 attributes
    is_free_agent: isProspect,
    ...contract,
  };
}

// Expanded name pools to reduce duplicates
const firstNames = [
  "John",
  "Mike",
  "Chris",
  "Ryan",
  "Alex",
  "Derrick",
  "Jordan",
  "Sam",
  "Tyler",
  "Jamal",
  "Marcus",
  "Ethan",
  "James",
  "Robert",
  "Michael",
  "William",
  "David",
  "Richard",
  "Joseph",
  "Thomas",
  "Charles",
  "Daniel",
  "Matthew",
  "Anthony",
  "Mark",
  "Donald",
  "Steven",
  "Paul",
  "Andrew",
  "Joshua",
  "Kenneth",
  "Kevin",
  "Brian",
  "George",
  "Timothy",
  "Ronald",
  "Jason",
  "Edward",
  "Jeffrey",
  "Ryan",
  "Jacob",
  "Gary",
  "Nicholas",
  "Eric",
  "Jonathan",
  "Stephen",
  "Larry",
  "Justin",
  "Scott",
  "Brandon",
  "Benjamin",
  "Samuel",
  "Frank",
  "Gregory",
  "Raymond",
  "Alexander",
  "Patrick",
  "Jack",
  "Dennis",
  "Jerry",
  "Tyler",
  "Aaron",
  "Jose",
  "Adam",
  "Nathan",
  "Henry",
  "Zachary",
  "Douglas",
  "Peter",
  "Kyle",
  "Noah",
  "Ethan",
  "Jeremy",
  "Walter",
  "Christian",
  "Keith",
  "Roger",
  "Terry",
  "Austin",
  "Sean",
  "Gerald",
  "Carl",
  "Dylan",
  "Jesse",
  "Bryan",
  "Jordan",
  "Randy",
  "Tyler",
  "Jose",
  "Louis",
  "Philip",
  "Johnny",
  "Bobby",
  "Wayne",
  "Russell",
  "Lawrence",
  "Roy",
  "Eugene",
  "Louis",
  "Ralph",
  "Eugene",
  "Vincent",
  "Louis",
  "Willie",
  "Lawrence",
  "Mason",
  "Will",
  "Owen",
  "Connor",
  "Lucas",
  "Aiden",
  "Carter",
  "Wyatt",
  "Jayden",
  "Grayson",
  "Leo",
  "Julian",
  "Landon",
  "Nolan",
  "Hunter",
  "Eli",
  "Lincoln",
  "Aaron",
  "Caleb",
  "Isaac",
  "Mason",
  "Luke",
  "Jack",
  "Owen",
  "Levi",
  "Wyatt",
  "Henry",
  "Landon",
];

const lastNames = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Hernandez",
  "Lopez",
  "Wilson",
  "Anderson",
  "Thomas",
  "Taylor",
  "Moore",
  "Jackson",
  "Martin",
  "Lee",
  "Thompson",
  "White",
  "Harris",
  "Sanchez",
  "Clark",
  "Ramirez",
  "Lewis",
  "Robinson",
  "Walker",
  "Young",
  "Allen",
  "King",
  "Wright",
  "Scott",
  "Torres",
  "Nguyen",
  "Hill",
  "Flores",
  "Green",
  "Adams",
  "Nelson",
  "Baker",
  "Hall",
  "Rivera",
  "Campbell",
  "Mitchell",
  "Carter",
  "Roberts",
  "Gomez",
  "Phillips",
  "Evans",
  "Turner",
  "Diaz",
  "Parker",
  "Cruz",
  "Edwards",
  "Collins",
  "Stewart",
  "Sanchez",
  "Morris",
  "Rogers",
  "Reed",
  "Cook",
  "Morgan",
  "Bell",
  "Murphy",
  "Bailey",
  "Rivera",
  "Cooper",
  "Richardson",
  "Cox",
  "Howard",
  "Ward",
  "Torres",
  "Peterson",
  "Gray",
  "Ramirez",
  "James",
  "Watson",
  "Brooks",
  "Kelly",
  "Sanders",
  "Price",
  "Bennett",
  "Wood",
  "Barnes",
  "Ross",
  "Henderson",
  "Coleman",
  "Jenkins",
  "Perry",
  "Powell",
  "Long",
  "Patterson",
  "Hughes",
  "Flores",
  "Washington",
  "Butler",
  "Simmons",
  "Foster",
  "Gonzales",
  "Bryant",
  "Alexander",
  "Russell",
  "Griffin",
  "Diaz",
  "Hayes",
  "Myers",
  "Ford",
  "Hamilton",
  "Graham",
  "Sullivan",
  "Wallace",
  "Woods",
  "Cole",
  "West",
  "Jordan",
  "Owens",
  "Reynolds",
  "Fisher",
  "Ellis",
  "Harrison",
  "Gibson",
  "Mcdonald",
  "Cruz",
  "Marshall",
  "Ortiz",
  "Gomez",
  "Murray",
  "Freeman",
  "Wells",
  "Webb",
  "Simpson",
  "Stevens",
  "Tucker",
  "Porter",
  "Hunter",
  "Hicks",
  "Crawford",
  "Henry",
  "Boyd",
  "Mason",
  "Morales",
  "Kennedy",
  "Warren",
  "Dixon",
  "Ramos",
];

// Track used names to ensure uniqueness
const usedNames = new Set<string>();

function generateName(): string {
  let attempts = 0;
  let name: string;

  do {
    const first = firstNames[random(0, firstNames.length - 1)];
    const last = lastNames[random(0, lastNames.length - 1)];
    name = `${first} ${last}`;
    attempts++;

    // If we've tried too many times, add a number to make it unique
    if (attempts > 50) {
      name = `${first} ${last} ${attempts}`;
      break;
    }
  } while (usedNames.has(name));

  usedNames.add(name);
  return name;
}

// Function to reset the used names set (call this when starting a new draft class)
export function resetNameGenerator() {
  usedNames.clear();
}

function generateArchetype(position: string) {
  const map: Record<string, string[]> = {
    QB: ["Field General", "Gunslinger", "Scrambler"],
    RB: ["Power Back", "Elusive Back", "Receiving Back"],
    WR: ["Deep Threat", "Possession", "Slot"],
    CB: ["Man Corner", "Zone Corner"],
    LB: ["Coverage", "Pass Rusher", "Run Stopper"],
  };

  return map[position]?.[0] ?? "Balanced";
}
