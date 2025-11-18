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

export function generatePlayer({
  isProspect = false,
  talentTier,
}: { isProspect?: boolean; talentTier?: TalentTier } = {}) {
  const position = positions[random(0, positions.length - 1)];
  const college = colleges[random(0, colleges.length - 1)];
  const fullName = generateName();

  let overall: number;
  let potential: number;

  if (isProspect) {
    const tier = talentTier || generateTalentTier();
    const ratings = generateProspectRatings(tier);
    overall = ratings.overall;
    potential = ratings.potential;
  } else {
    overall = random(60, 99);
    potential = random(70, 99);
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

  return {
    full_name: fullName,
    position,
    age: isProspect ? random(20, 23) : random(22, 35),
    college,
    archetype: generateArchetype(position),
    overall,
    potential,
    traits: JSON.stringify({
      speed: random(60, 99),
      strength: random(55, 95),
      awareness: random(50, 99),
    }),
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
