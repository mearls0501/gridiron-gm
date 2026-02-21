import { random } from "@/lib/utils";
import { ScoutingStaff, ScoutingStaffRole } from "./types";

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

const positions = ["QB", "RB", "WR", "TE", "OT", "OG", "C", "DE", "DT", "LB", "CB", "S", "K", "P"];
const regions = ["northeast", "southeast", "midwest", "southwest", "west_coast"];

/**
 * Generate a scouting staff for a team
 */
export function generateScoutingStaff(teamId: string): Omit<ScoutingStaff, 'id'>[] {
  const staff: Omit<ScoutingStaff, 'id'>[] = [];

  // Director of Player Personnel (1 per team)
  staff.push({
    team_id: teamId,
    name: generateName(),
    role: 'director',
    scouting_accuracy: random(75, 90),
    experience: random(8, 20),
    trait_evaluation: random(70, 90),
    character_evaluation: random(70, 90),
  });

  // National Scout (1-2 per team)
  const nationalCount = random(1, 2);
  for (let i = 0; i < nationalCount; i++) {
    staff.push({
      team_id: teamId,
      name: generateName(),
      role: 'national',
      scouting_accuracy: random(70, 85),
      experience: random(5, 15),
      trait_evaluation: random(65, 85),
      character_evaluation: random(65, 85),
    });
  }

  // Regional Scouts (3-5 per team, one per region)
  const selectedRegions = [...regions].sort(() => Math.random() - 0.5).slice(0, random(3, 5));
  for (const region of selectedRegions) {
    staff.push({
      team_id: teamId,
      name: generateName(),
      role: 'regional',
      scouting_accuracy: random(65, 80),
      experience: random(3, 12),
      region: region as "northeast" | "southeast" | "midwest" | "southwest" | "west_coast",
      trait_evaluation: random(60, 80),
      character_evaluation: random(60, 80),
    });
  }

  // Position Scouts (1-3 per team, optional)
  const positionCount = random(0, 3);
  const selectedPositions = [...positions].sort(() => Math.random() - 0.5).slice(0, positionCount);
  for (const position of selectedPositions) {
    staff.push({
      team_id: teamId,
      name: generateName(),
      role: 'position',
      scouting_accuracy: random(60, 75),
      experience: random(2, 10),
      specialty: position,
      trait_evaluation: random(55, 75),
      character_evaluation: random(55, 75),
    });
  }

  return staff;
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
 * Get default scouting resources for a team
 */
export function getDefaultScoutingResources() {
  return {
    scouting_points: 15,
    scouting_budget: 5000000,
    points_regenerated_per_week: 15,
  };
}

