/**
 * Generate coaching staff with realistic ratings and salaries
 */

interface Coach {
  name: string;
  role: string;
  rating: number;
  specialty: string;
  experience: number;
  contract_year_1: number;
  contract_year_2: number;
  contract_year_3: number;
  contract_year_4: number;
}

const firstNames = [
  'Mike', 'John', 'David', 'Robert', 'James', 'Michael', 'William', 'Richard',
  'Thomas', 'Charles', 'Chris', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald',
  'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth', 'Kevin', 'Brian', 'George',
  'Timothy', 'Ronald', 'Jason', 'Edward', 'Jeffrey', 'Ryan', 'Jacob', 'Gary',
  'Nicholas', 'Eric', 'Jonathan', 'Stephen', 'Larry', 'Justin', 'Scott', 'Brandon'
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris',
  'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen',
  'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams'
];

const specialties = {
  head_coach: ['Offensive Strategy', 'Defensive Strategy', 'Team Building', 'Game Management'],
  offensive_coordinator: ['Passing Game', 'Running Game', 'Red Zone', 'Play Design'],
  defensive_coordinator: ['Pass Defense', 'Run Defense', 'Blitz Packages', 'Coverage Schemes'],
  special_teams_coordinator: ['Kicking Game', 'Return Game', 'Coverage', 'Field Position'],
  qb_coach: ['Quarterback Development', 'Pocket Presence', 'Accuracy', 'Decision Making'],
  rb_coach: ['Running Game', 'Blocking', 'Receiving', 'Ball Security'],
  wr_coach: ['Route Running', 'Catching', 'Separation', 'YAC'],
  te_coach: ['Blocking', 'Receiving', 'Route Running', 'Versatility'],
  ol_coach: ['Pass Protection', 'Run Blocking', 'Technique', 'Communication'],
  dl_coach: ['Pass Rush', 'Run Stopping', 'Gap Control', 'Technique'],
  lb_coach: ['Coverage', 'Tackling', 'Blitzing', 'Recognition'],
  db_coach: ['Man Coverage', 'Zone Coverage', 'Ball Skills', 'Tackling'],
};

function generateName(): string {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${firstName} ${lastName}`;
}

function generateRating(role: string, baseRating: number): number {
  // Add some variance to ratings
  const variance = Math.floor(Math.random() * 20) - 10; // -10 to +10
  const rating = baseRating + variance;
  return Math.max(50, Math.min(100, rating)); // Clamp between 50 and 100
}

function generateSalary(role: string, rating: number): { year1: number; year2: number; year3: number; year4: number } {
  // Base salaries by role (in millions)
  const roleMultipliers: Record<string, number> = {
    head_coach: 8.0,
    offensive_coordinator: 3.5,
    defensive_coordinator: 3.5,
    special_teams_coordinator: 1.5,
    qb_coach: 1.2,
    rb_coach: 1.0,
    wr_coach: 1.0,
    te_coach: 1.0,
    ol_coach: 1.1,
    dl_coach: 1.1,
    lb_coach: 1.0,
    db_coach: 1.2,
  };

  const baseSalary = (roleMultipliers[role] || 1.0) * 1_000_000;
  // Adjust based on rating (higher rating = higher salary)
  const ratingMultiplier = 0.5 + (rating / 100) * 0.5; // 0.5x to 1.0x
  const year1 = Math.round(baseSalary * ratingMultiplier);
  
  // Contracts typically increase slightly each year
  return {
    year1,
    year2: Math.round(year1 * 1.05),
    year3: Math.round(year1 * 1.1),
    year4: Math.round(year1 * 1.15),
  };
}

export function generateCoachingStaff(teamId: string): Omit<Coach, 'id' | 'team_id' | 'created_at' | 'updated_at'>[] {
  const staff: Omit<Coach, 'id' | 'team_id' | 'created_at' | 'updated_at'>[] = [];

  // Head Coach
  const headCoachRating = generateRating('head_coach', 80);
  const headCoachSalary = generateSalary('head_coach', headCoachRating);
  staff.push({
    name: generateName(),
    role: 'head_coach',
    rating: headCoachRating,
    specialty: specialties.head_coach[Math.floor(Math.random() * specialties.head_coach.length)],
    experience: Math.floor(Math.random() * 15) + 5, // 5-20 years
    contract_year_1: headCoachSalary.year1,
    contract_year_2: headCoachSalary.year2,
    contract_year_3: headCoachSalary.year3,
    contract_year_4: headCoachSalary.year4,
  });

  // Coordinators
  const ocRating = generateRating('offensive_coordinator', 78);
  const ocSalary = generateSalary('offensive_coordinator', ocRating);
  staff.push({
    name: generateName(),
    role: 'offensive_coordinator',
    rating: ocRating,
    specialty: specialties.offensive_coordinator[Math.floor(Math.random() * specialties.offensive_coordinator.length)],
    experience: Math.floor(Math.random() * 12) + 3,
    contract_year_1: ocSalary.year1,
    contract_year_2: ocSalary.year2,
    contract_year_3: ocSalary.year3,
    contract_year_4: ocSalary.year4,
  });

  const dcRating = generateRating('defensive_coordinator', 78);
  const dcSalary = generateSalary('defensive_coordinator', dcRating);
  staff.push({
    name: generateName(),
    role: 'defensive_coordinator',
    rating: dcRating,
    specialty: specialties.defensive_coordinator[Math.floor(Math.random() * specialties.defensive_coordinator.length)],
    experience: Math.floor(Math.random() * 12) + 3,
    contract_year_1: dcSalary.year1,
    contract_year_2: dcSalary.year2,
    contract_year_3: dcSalary.year3,
    contract_year_4: dcSalary.year4,
  });

  const stcRating = generateRating('special_teams_coordinator', 75);
  const stcSalary = generateSalary('special_teams_coordinator', stcRating);
  staff.push({
    name: generateName(),
    role: 'special_teams_coordinator',
    rating: stcRating,
    specialty: specialties.special_teams_coordinator[Math.floor(Math.random() * specialties.special_teams_coordinator.length)],
    experience: Math.floor(Math.random() * 10) + 2,
    contract_year_1: stcSalary.year1,
    contract_year_2: stcSalary.year2,
    contract_year_3: stcSalary.year3,
    contract_year_4: stcSalary.year4,
  });

  // Position Coaches
  const positionCoaches = [
    'qb_coach', 'rb_coach', 'wr_coach', 'te_coach', 'ol_coach',
    'dl_coach', 'lb_coach', 'db_coach'
  ];

  positionCoaches.forEach((role) => {
    const rating = generateRating(role, 76);
    const salary = generateSalary(role, rating);
    const roleSpecialties = specialties[role as keyof typeof specialties] || ['General'];
    staff.push({
      name: generateName(),
      role,
      rating,
      specialty: roleSpecialties[Math.floor(Math.random() * roleSpecialties.length)],
      experience: Math.floor(Math.random() * 8) + 2,
      contract_year_1: salary.year1,
      contract_year_2: salary.year2,
      contract_year_3: salary.year3,
      contract_year_4: salary.year4,
    });
  });

  return staff;
}

