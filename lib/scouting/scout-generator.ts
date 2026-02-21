/**
 * Scout generation system
 * Generates free agent scouts with archetypes, attributes, and position specialties
 */

import { random } from "@/lib/utils";
import { Scout, ScoutArchetype } from "./types";
import { applyArchetypeMultipliers } from "./archetype-multipliers";

const firstNames = [
  "James", "Robert", "Michael", "William", "David", "Richard", "Joseph", "Thomas",
  "Charles", "Christopher", "Daniel", "Matthew", "Anthony", "Mark", "Donald",
  "Steven", "Paul", "Andrew", "Joshua", "Kenneth", "Kevin", "Brian", "George",
  "Timothy", "Ronald", "Jason", "Edward", "Jeffrey", "Ryan", "Jacob", "Gary",
  "Nicholas", "Eric", "Jonathan", "Stephen", "Larry", "Justin", "Scott",
  "Brandon", "Benjamin", "Samuel", "Frank", "Gregory", "Raymond", "Alexander",
  "Patrick", "Jack", "Dennis", "Jerry", "Tyler", "Aaron", "Jose", "Adam",
  "Nathan", "Henry", "Zachary", "Douglas", "Peter", "Kyle", "Noah", "Ethan",
];

const lastNames = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Wilson", "Anderson", "Thomas",
  "Taylor", "Moore", "Jackson", "Martin", "Lee", "Thompson", "White", "Harris",
  "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen",
  "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green",
  "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter",
  "Roberts", "Gomez", "Phillips", "Evans", "Turner", "Diaz", "Parker", "Cruz",
];

const positions = ["QB", "RB", "WR", "TE", "OL", "DL", "DB", "LB"];

/**
 * Generate a single scout with specified archetype
 */
export function generateScout(archetype: ScoutArchetype): Omit<Scout, "id" | "created_at"> {
  // Generate base attributes (before multipliers)
  // Base range varies by archetype to ensure they have appropriate strengths
  const baseAttributes = generateBaseAttributes(archetype);
  
  // Apply archetype multipliers to get effective attributes
  const effectiveAttributes = applyArchetypeMultipliers(baseAttributes, archetype);
  
  // Generate position specialties (1-3 positions)
  const specialties = assignPositionSpecialties();
  
  // Calculate salary based on effective attributes
  const salary = calculateScoutSalary(effectiveAttributes, archetype);
  
  // Generate reputation and loyalty
  const reputation = random(40, 90);
  const loyalty = random(30, 80);
  
  return {
    name: generateName(),
    archetype,
    evaluation: effectiveAttributes.evaluation,
    football_iq: effectiveAttributes.football_iq,
    athletic_analysis: effectiveAttributes.athletic_analysis,
    psych_insight: effectiveAttributes.psych_insight,
    medical_read: effectiveAttributes.medical_read,
    analytics: effectiveAttributes.analytics,
    confidence: effectiveAttributes.confidence,
    experience: baseAttributes.experience,
    communication: effectiveAttributes.communication,
    qb_specialist: specialties.QB || 0,
    wr_specialist: specialties.WR || 0,
    ol_specialist: specialties.OL || 0,
    dl_specialist: specialties.DL || 0,
    db_specialist: specialties.DB || 0,
    rb_specialist: specialties.RB || 0,
    salary,
    reputation,
    loyalty,
  };
}

/**
 * Generate base attributes before multipliers
 * Different archetypes have different base ranges to ensure appropriate strengths
 */
function generateBaseAttributes(archetype: ScoutArchetype): {
  evaluation: number;
  football_iq: number;
  athletic_analysis: number;
  psych_insight: number;
  medical_read: number;
  analytics: number;
  confidence: number;
  experience: number;
  communication: number;
} {
  switch (archetype) {
    case "evaluator":
      return {
        evaluation: random(60, 85), // High base for evaluation
        football_iq: random(50, 75),
        athletic_analysis: random(40, 70),
        psych_insight: random(40, 70),
        medical_read: random(50, 75),
        analytics: random(65, 85), // High base for analytics
        confidence: random(55, 80),
        experience: random(2, 15),
        communication: random(50, 80),
      };
    case "tape_grinder":
      return {
        evaluation: random(50, 75),
        football_iq: random(60, 85), // High base for football IQ
        athletic_analysis: random(40, 70),
        psych_insight: random(40, 70),
        medical_read: random(50, 75),
        analytics: random(45, 70),
        confidence: random(50, 75),
        experience: random(2, 15),
        communication: random(50, 80),
      };
    case "character_coach":
      return {
        evaluation: random(45, 70),
        football_iq: random(40, 65),
        athletic_analysis: random(40, 65),
        psych_insight: random(60, 85), // High base for psych insight
        medical_read: random(55, 80), // Higher base for medical
        analytics: random(45, 70),
        confidence: random(50, 75),
        experience: random(2, 15),
        communication: random(55, 85), // Higher base for communication
      };
    case "athletic_analyst":
      return {
        evaluation: random(45, 70),
        football_iq: random(40, 65),
        athletic_analysis: random(60, 85), // High base for athletic analysis
        psych_insight: random(40, 65),
        medical_read: random(50, 75),
        analytics: random(60, 80), // Higher base for analytics
        confidence: random(50, 75),
        experience: random(2, 15),
        communication: random(50, 80),
      };
  }
}

/**
 * Assign 1-3 position specialties randomly
 */
function assignPositionSpecialties(): Record<string, number> {
  const specialties: Record<string, number> = {};
  const numSpecialties = random(1, 3);
  const availablePositions = [...positions].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < numSpecialties && i < availablePositions.length; i++) {
    const position = availablePositions[i];
    // Specialty strength: 60-100
    specialties[position] = random(60, 100);
  }
  
  return specialties;
}

/**
 * Calculate scout salary based on attributes and archetype
 */
function calculateScoutSalary(
  attributes: {
    evaluation: number;
    football_iq: number;
    athletic_analysis: number;
    psych_insight: number;
    medical_read: number;
    analytics: number;
    confidence: number;
    experience: number;
    communication: number;
  },
  archetype: ScoutArchetype
): number {
  // Base salary calculation
  const avgAttribute = (
    attributes.evaluation +
    attributes.football_iq +
    attributes.athletic_analysis +
    attributes.psych_insight +
    attributes.medical_read +
    attributes.analytics +
    attributes.confidence +
    attributes.communication
  ) / 8;
  
  // Base salary: $200k - $1.5M based on average attribute
  const baseSalary = 200000 + (avgAttribute / 100) * 1300000;
  
  // Experience bonus: up to $300k
  const experienceBonus = (attributes.experience / 20) * 300000;
  
  // Archetype premium (some archetypes are more valuable)
  const archetypePremium = {
    evaluator: 1.2,
    tape_grinder: 1.1,
    character_coach: 1.0,
    athletic_analyst: 1.15,
  }[archetype];
  
  return Math.round(baseSalary * archetypePremium + experienceBonus);
}

/**
 * Generate a random name
 */
function generateName(): string {
  const first = firstNames[random(0, firstNames.length - 1)];
  const last = lastNames[random(0, lastNames.length - 1)];
  return `${first} ${last}`;
}

/**
 * Generate a pool of scouts for a specific save game
 * Ensures roughly equal distribution of archetypes
 */
export function generateScoutPool(count: number, saveGameId: string): (Omit<Scout, "id" | "created_at"> & { save_game_id: string })[] {
  const archetypes: ScoutArchetype[] = [
    "evaluator",
    "tape_grinder",
    "character_coach",
    "athletic_analyst",
  ];
  
  const scouts: (Omit<Scout, "id" | "created_at"> & { save_game_id: string })[] = [];
  const archetypeCount = Math.floor(count / 4);
  const remainder = count % 4;
  
  // Generate roughly equal numbers of each archetype
  for (let i = 0; i < 4; i++) {
    const archetype = archetypes[i];
    const numToGenerate = archetypeCount + (i < remainder ? 1 : 0);
    
    for (let j = 0; j < numToGenerate; j++) {
      scouts.push({
        ...generateScout(archetype),
        save_game_id: saveGameId,
      });
    }
  }
  
  // Shuffle to randomize order
  return scouts.sort(() => Math.random() - 0.5);
}

