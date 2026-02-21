import {
  db,
  GeneralManager,
  HeadCoach,
  Scout,
  Owner,
  BasePerson,
  RetiredPerson,
  HiringPoolEntry,
  FiringReason,
  RetirementReason,
  CareerHistoryEntry,
  SeasonRecord,
  getFullName,
} from "./database";
import { PersonnelGenerator, GENERATION_RULES, personnelGenerator } from "./personnel-generator";

// ==========================================
// Retirement System
// ==========================================

export interface RetirementDecision {
  willRetire: boolean;
  probability: number;
  factors: RetirementFactor[];
}

export interface RetirementFactor {
  factor: string;
  impact: number; // Positive = more likely to retire
  description: string;
}

export const RETIREMENT_CONFIG = {
  gm: {
    baseChance: 0.02,
    ageThreshold: 60,
    ageMultiplier: 1.12,
    maxAge: 78,
    firingImpact: 0.15, // Per recent firing
    championshipImpact: 0.1, // After winning
    healthEventChance: 0.02,
  },
  coach: {
    baseChance: 0.015,
    ageThreshold: 62,
    ageMultiplier: 1.1,
    maxAge: 82,
    firingImpact: 0.12,
    championshipImpact: 0.08,
    healthEventChance: 0.025,
  },
  scout: {
    baseChance: 0.03,
    ageThreshold: 58,
    ageMultiplier: 1.15,
    maxAge: 72,
    firingImpact: 0.1,
    burnoutChance: 0.05, // After 20+ years
    healthEventChance: 0.015,
  },
  owner: {
    baseChance: 0.01,
    ageThreshold: 75,
    ageMultiplier: 1.08,
    maxAge: 100,
    healthEventChance: 0.03,
  },
};

export function calculateRetirementDecision(
  person: BasePerson & { type: "gm" | "coach" | "scout" | "owner" },
  currentSeason: number
): RetirementDecision {
  const config = RETIREMENT_CONFIG[person.type];
  const factors: RetirementFactor[] = [];
  let probability = config.baseChance;

  // Age factor
  if (person.age >= config.ageThreshold) {
    const yearsOver = person.age - config.ageThreshold;
    const ageImpact = Math.pow(config.ageMultiplier, yearsOver) - 1;
    probability += ageImpact;
    factors.push({
      factor: "age",
      impact: ageImpact,
      description: `Age ${person.age} (${yearsOver} years over threshold)`,
    });
  }

  // Mandatory retirement at max age
  if (person.age >= config.maxAge) {
    return {
      willRetire: true,
      probability: 1.0,
      factors: [{ factor: "max_age", impact: 1.0, description: `Reached maximum age (${config.maxAge})` }],
    };
  }

  // Recent firings (for GMs and coaches)
  if (person.type === "gm" || person.type === "coach") {
    const recentFirings = person.careerHistory.filter(
      (h) => h.endReason === "fired" && h.endSeason && h.endSeason >= currentSeason - 3
    ).length;
    if (recentFirings > 0) {
      const firingImpact = recentFirings * (config as typeof RETIREMENT_CONFIG.gm).firingImpact;
      probability += firingImpact;
      factors.push({
        factor: "recent_firings",
        impact: firingImpact,
        description: `Fired ${recentFirings} time(s) in last 3 years`,
      });
    }
  }

  // Championship bump
  if (person.type === "gm" || person.type === "coach") {
    const gm = person as GeneralManager | HeadCoach;
    if (gm.championships > 0 && person.age >= config.ageThreshold - 5) {
      const champImpact = (config as typeof RETIREMENT_CONFIG.gm).championshipImpact;
      probability += champImpact;
      factors.push({
        factor: "championship_achieved",
        impact: champImpact,
        description: "Won championship(s), may want to go out on top",
      });
    }
  }

  // Burnout for scouts
  if (person.type === "scout") {
    const totalYears = person.careerHistory.reduce((sum, h) => {
      const end = h.endSeason ?? currentSeason;
      return sum + (end - h.startSeason);
    }, 0);
    if (totalYears >= 20) {
      const burnoutImpact = (config as typeof RETIREMENT_CONFIG.scout).burnoutChance;
      probability += burnoutImpact;
      factors.push({
        factor: "burnout",
        impact: burnoutImpact,
        description: `${totalYears} years in scouting, potential burnout`,
      });
    }
  }

  // Random health event
  if (Math.random() < config.healthEventChance && person.age >= 55) {
    probability += 0.3;
    factors.push({
      factor: "health",
      impact: 0.3,
      description: "Health concerns",
    });
  }

  // Currently unemployed for extended period
  if (person.status === "available") {
    const poolEntry = person.careerHistory[person.careerHistory.length - 1];
    if (poolEntry && poolEntry.endSeason && currentSeason - poolEntry.endSeason >= 2) {
      probability += 0.2;
      factors.push({
        factor: "unemployed",
        impact: 0.2,
        description: "Unable to find position for 2+ years",
      });
    }
  }

  // Roll the dice
  const willRetire = Math.random() < probability;

  return {
    willRetire,
    probability: Math.min(probability, 1.0),
    factors,
  };
}

// ==========================================
// Hiring Pool Management
// ==========================================

export async function addToHiringPool(
  personId: string,
  personType: "gm" | "coach" | "scout",
  season: number,
  isHot: boolean = false
): Promise<void> {
  // Calculate market value
  let marketValue = 50;

  if (personType === "gm") {
    const gm = await db.generalManagers.get(personId);
    if (gm) {
      marketValue = Math.round(
        (gm.skills.drafting + gm.skills.trading + gm.skills.capManagement) / 3 +
          gm.championships * 10 +
          (gm.playoffAppearances > 3 ? 10 : 0)
      );
    }
  } else if (personType === "coach") {
    const coach = await db.headCoaches.get(personId);
    if (coach) {
      marketValue = Math.round(
        (coach.skills.gameManagement + coach.skills.playerDevelopment + coach.skills.playDesign) / 3 +
          coach.championships * 15 +
          Math.min(coach.careerWins / 10, 20)
      );
    }
  } else {
    const scout = await db.scouts.get(personId);
    if (scout) {
      marketValue = Math.round(scout.overallAccuracy);
    }
  }

  const entry: HiringPoolEntry = {
    id: `pool_${personId}`,
    personId,
    personType,
    addedSeason: season,
    isHot,
    marketValue: Math.min(99, marketValue),
  };

  await db.hiringPool.put(entry);
}

export async function removeFromHiringPool(personId: string): Promise<void> {
  await db.hiringPool.where("personId").equals(personId).delete();
}

export async function getAvailableGMs(): Promise<GeneralManager[]> {
  return db.generalManagers.where("status").equals("available").toArray();
}

export async function getAvailableCoaches(): Promise<HeadCoach[]> {
  return db.headCoaches.where("status").equals("available").toArray();
}

export async function getAvailableScouts(): Promise<Scout[]> {
  return db.scouts.where("status").equals("available").toArray();
}

export async function getHotCandidates(
  type?: "gm" | "coach" | "scout"
): Promise<HiringPoolEntry[]> {
  let query = db.hiringPool.where("isHot").equals(1); // Dexie stores booleans as 0/1
  if (type) {
    const entries = await query.toArray();
    return entries.filter((e) => e.personType === type);
  }
  return query.toArray();
}

// ==========================================
// Season Transition Manager
// ==========================================

export interface SeasonEndResult {
  fired: {
    gms: { id: string; name: string; teamId: string; reason: FiringReason }[];
    coaches: { id: string; name: string; teamId: string; reason: FiringReason }[];
  };
  retired: {
    id: string;
    name: string;
    type: "gm" | "coach" | "scout" | "owner";
    reason: RetirementReason;
  }[];
  newlyGenerated: {
    gms: GeneralManager[];
    coaches: HeadCoach[];
    scouts: Scout[];
  };
  hallOfFameInductees: RetiredPerson[];
}

export async function processSeasonEnd(currentSeason: number): Promise<SeasonEndResult> {
  const result: SeasonEndResult = {
    fired: { gms: [], coaches: [] },
    retired: [],
    newlyGenerated: { gms: [], coaches: [], scouts: [] },
    hallOfFameInductees: [],
  };

  // 1. Process CPU team firing decisions
  await processCPUFiringDecisions(currentSeason, result);

  // 2. Process retirements
  await processRetirements(currentSeason, result);

  // 3. Age everyone
  await ageAllPersonnel();

  // 4. Generate new personnel to fill the pool
  await generateNewPersonnel(currentSeason, result);

  // 5. Process Hall of Fame inductions
  await processHallOfFame(currentSeason, result);

  return result;
}

async function processCPUFiringDecisions(
  season: number,
  result: SeasonEndResult
): Promise<void> {
  const teams = await db.teams.filter((t) => !t.isPlayerControlled).toArray();

  for (const team of teams) {
    const owner = await db.owners.get(team.ownerId);
    if (!owner) continue;

    const seasonRecord = await db.seasonRecords
      .where("[season+teamId]")
      .equals([season, team.id])
      .first();

    // Check GM
    if (team.gmId) {
      const firingDecision = evaluateFiringDecision(owner, seasonRecord, season);
      if (firingDecision.shouldFire) {
        const gm = await db.generalManagers.get(team.gmId);
        if (gm) {
          await fireGM(team.gmId, team.id, firingDecision.reason, season);
          result.fired.gms.push({
            id: gm.id,
            name: getFullName(gm),
            teamId: team.id,
            reason: firingDecision.reason,
          });
        }
      }
    }

    // Check Coach (sometimes fired with GM, sometimes separately)
    if (team.coachId) {
      const coachFiringDecision = evaluateFiringDecision(owner, seasonRecord, season, true);
      if (coachFiringDecision.shouldFire) {
        const coach = await db.headCoaches.get(team.coachId);
        if (coach) {
          await fireCoach(team.coachId, team.id, coachFiringDecision.reason, season);
          result.fired.coaches.push({
            id: coach.id,
            name: getFullName(coach),
            teamId: team.id,
            reason: coachFiringDecision.reason,
          });
        }
      }
    }
  }
}

function evaluateFiringDecision(
  owner: Owner,
  seasonRecord: SeasonRecord | undefined,
  season: number,
  isCoach: boolean = false
): { shouldFire: boolean; reason: FiringReason } {
  let firingProbability = 0;
  let reason: FiringReason = "poor_record";

  if (!seasonRecord) {
    return { shouldFire: false, reason };
  }

  // Losing record
  if (seasonRecord.losses > seasonRecord.wins) {
    firingProbability += 0.15;

    // Bad losing record
    if (seasonRecord.losses >= seasonRecord.wins + 6) {
      firingProbability += 0.25;
    }
  }

  // Owner type modifiers
  switch (owner.ownerType) {
    case "win_now":
      firingProbability += 0.2;
      if (!seasonRecord.madePlayoffs) {
        firingProbability += 0.3;
        reason = "missed_playoffs";
      }
      break;
    case "meddler":
      firingProbability += 0.15;
      break;
    case "patient_builder":
      firingProbability -= 0.2;
      break;
    case "hands_off":
      firingProbability -= 0.15;
      break;
    case "new_money":
      if (!seasonRecord.madePlayoffs) {
        firingProbability += 0.2;
      }
      break;
  }

  // Owner satisfaction
  if (owner.metrics.satisfaction < 30) {
    firingProbability += 0.3;
    reason = "owner_impatience";
  } else if (owner.metrics.satisfaction < 50) {
    firingProbability += 0.15;
  }

  // Trust level
  if (owner.metrics.trust < 25) {
    firingProbability += 0.25;
  }

  // Seat temperature
  switch (owner.seatTemperature) {
    case "hot":
      firingProbability += 0.4;
      break;
    case "ejection_seat":
      firingProbability += 0.7;
      break;
    case "warm":
      firingProbability += 0.2;
      break;
  }

  // Missed expectations
  if (
    seasonRecord.preseasonExpectation === "playoffs" &&
    !seasonRecord.madePlayoffs
  ) {
    firingProbability += 0.25;
    reason = "missed_playoffs";
  }
  if (
    seasonRecord.preseasonExpectation === "championship" &&
    seasonRecord.playoffResult !== "Super Bowl Champion"
  ) {
    firingProbability += 0.3;
    reason = "missed_playoffs";
  }

  // Coaches get slightly more leeway
  if (isCoach) {
    firingProbability *= 0.85;
  }

  // Cap probability
  firingProbability = Math.min(firingProbability, 0.9);

  return {
    shouldFire: Math.random() < firingProbability,
    reason,
  };
}

async function fireGM(
  gmId: string,
  teamId: string,
  reason: FiringReason,
  season: number
): Promise<void> {
  const gm = await db.generalManagers.get(gmId);
  if (!gm) return;

  const team = await db.teams.get(teamId);

  await db.transaction("rw", [db.generalManagers, db.teams, db.hiringPool], async () => {
    // Update career history
    const updatedHistory: CareerHistoryEntry[] = gm.careerHistory.map((h) => {
      if (h.teamId === teamId && h.endSeason === null) {
        return { ...h, endSeason: season, endReason: "fired" as const };
      }
      return h;
    });

    // Update GM
    await db.generalManagers.update(gmId, {
      status: "available",
      currentTeamId: null,
      contractYearsRemaining: 0,
      careerHistory: updatedHistory,
    });

    // Update team
    await db.teams.update(teamId, { gmId: null });

    // Add to hiring pool
    await addToHiringPool(gmId, "gm", season, gm.championships > 0 || gm.playoffAppearances >= 3);
  });
}

async function fireCoach(
  coachId: string,
  teamId: string,
  reason: FiringReason,
  season: number
): Promise<void> {
  const coach = await db.headCoaches.get(coachId);
  if (!coach) return;

  await db.transaction("rw", [db.headCoaches, db.teams, db.hiringPool], async () => {
    // Update career history
    const updatedHistory: CareerHistoryEntry[] = coach.careerHistory.map((h) => {
      if (h.teamId === teamId && h.endSeason === null) {
        return { ...h, endSeason: season, endReason: "fired" as const };
      }
      return h;
    });

    // Update coach
    await db.headCoaches.update(coachId, {
      status: "available",
      currentTeamId: null,
      contractYearsRemaining: 0,
      careerHistory: updatedHistory,
    });

    // Update team
    await db.teams.update(teamId, { coachId: null });

    // Add to hiring pool
    await addToHiringPool(coachId, "coach", season, coach.championships > 0 || coach.careerWins >= 80);
  });
}

async function processRetirements(
  season: number,
  result: SeasonEndResult
): Promise<void> {
  // Process GMs
  const gms = await db.generalManagers.where("status").anyOf(["active", "available"]).toArray();
  for (const gm of gms) {
    const decision = calculateRetirementDecision({ ...gm, type: "gm" }, season);
    if (decision.willRetire) {
      await retirePerson(gm.id, "gm", decision.factors[0]?.factor as RetirementReason || "age", season);
      result.retired.push({
        id: gm.id,
        name: getFullName(gm),
        type: "gm",
        reason: decision.factors[0]?.factor as RetirementReason || "age",
      });
    }
  }

  // Process Coaches
  const coaches = await db.headCoaches.where("status").anyOf(["active", "available"]).toArray();
  for (const coach of coaches) {
    const decision = calculateRetirementDecision({ ...coach, type: "coach" }, season);
    if (decision.willRetire) {
      await retirePerson(coach.id, "coach", decision.factors[0]?.factor as RetirementReason || "age", season);
      result.retired.push({
        id: coach.id,
        name: getFullName(coach),
        type: "coach",
        reason: decision.factors[0]?.factor as RetirementReason || "age",
      });
    }
  }

  // Process Scouts
  const scouts = await db.scouts.where("status").anyOf(["active", "available"]).toArray();
  for (const scout of scouts) {
    const decision = calculateRetirementDecision({ ...scout, type: "scout" }, season);
    if (decision.willRetire) {
      await retirePerson(scout.id, "scout", decision.factors[0]?.factor as RetirementReason || "age", season);
      result.retired.push({
        id: scout.id,
        name: getFullName(scout),
        type: "scout",
        reason: decision.factors[0]?.factor as RetirementReason || "age",
      });
    }
  }
}

async function retirePerson(
  personId: string,
  type: "gm" | "coach" | "scout",
  reason: RetirementReason,
  season: number
): Promise<void> {
  const table = type === "gm" ? db.generalManagers : type === "coach" ? db.headCoaches : db.scouts;
  const person = await table.get(personId);
  if (!person) return;

  await db.transaction("rw", [table, db.retiredPersonnel, db.hiringPool, db.teams], async () => {
    // If currently employed, update team
    if (person.currentTeamId) {
      const updateField = type === "gm" ? "gmId" : type === "coach" ? "coachId" : "scoutIds";
      if (type === "scout") {
        const team = await db.teams.get(person.currentTeamId);
        if (team) {
          await db.teams.update(person.currentTeamId, {
            scoutIds: team.scoutIds.filter((id) => id !== personId),
          });
        }
      } else {
        await db.teams.update(person.currentTeamId, { [updateField]: null });
      }
    }

    // Update person status
    await table.update(personId, {
      status: "retired",
      currentTeamId: null,
      retirementYear: season,
      retirementReason: reason,
    });

    // Create retired personnel record
    const retiredPerson: RetiredPerson = {
      ...person,
      personType: type,
      status: "retired",
      retirementYear: season,
      retirementReason: reason,
      hallOfFame: false,
      legacyScore: calculateLegacyScore(person, type),
      totalChampionships: (person as GeneralManager | HeadCoach).championships || 0,
      totalPlayoffAppearances: (person as GeneralManager | HeadCoach).playoffAppearances || 0,
      totalWins: (person as GeneralManager | HeadCoach).careerWins,
      totalLosses: (person as GeneralManager | HeadCoach).careerLosses,
      achievements: generateAchievements(person, type),
    };

    await db.retiredPersonnel.put(retiredPerson);

    // Remove from hiring pool
    await removeFromHiringPool(personId);
  });
}

function calculateLegacyScore(person: BasePerson, type: "gm" | "coach" | "scout"): number {
  let score = 0;

  if (type === "gm") {
    const gm = person as GeneralManager;
    score += gm.championships * 25;
    score += gm.playoffAppearances * 5;
    score += Math.min(gm.careerWins / 5, 30);
    score += gm.leagueReputation / 5;
  } else if (type === "coach") {
    const coach = person as HeadCoach;
    score += coach.championships * 30;
    score += coach.playoffWins * 3;
    score += Math.min(coach.careerWins / 3, 40);
    score += coach.coachOfYearAwards * 10;
  } else {
    const scout = person as Scout;
    score += scout.overallAccuracy;
    const hiddenGems = scout.evaluationHistory.filter((e) => e.wasHiddenGem).length;
    score += hiddenGems * 5;
  }

  return Math.round(score);
}

function generateAchievements(person: BasePerson, type: "gm" | "coach" | "scout"): string[] {
  const achievements: string[] = [];

  if (type === "gm") {
    const gm = person as GeneralManager;
    if (gm.championships > 0) {
      achievements.push(`${gm.championships}x Super Bowl Champion`);
    }
    if (gm.playoffAppearances >= 5) {
      achievements.push(`${gm.playoffAppearances} Playoff Appearances`);
    }
  } else if (type === "coach") {
    const coach = person as HeadCoach;
    if (coach.championships > 0) {
      achievements.push(`${coach.championships}x Super Bowl Champion`);
    }
    if (coach.coachOfYearAwards > 0) {
      achievements.push(`${coach.coachOfYearAwards}x Coach of the Year`);
    }
    if (coach.careerWins >= 100) {
      achievements.push(`${coach.careerWins} Career Wins`);
    }
  } else {
    const scout = person as Scout;
    if (scout.overallAccuracy >= 80) {
      achievements.push("Elite Evaluator");
    }
    const hiddenGems = scout.evaluationHistory.filter((e) => e.wasHiddenGem).length;
    if (hiddenGems >= 3) {
      achievements.push(`Discovered ${hiddenGems} Hidden Gems`);
    }
  }

  return achievements;
}

async function ageAllPersonnel(): Promise<void> {
  // Increment age for all active/available personnel
  await db.transaction(
    "rw",
    [db.generalManagers, db.headCoaches, db.scouts, db.owners],
    async () => {
      const gms = await db.generalManagers.where("status").anyOf(["active", "available"]).toArray();
      for (const gm of gms) {
        await db.generalManagers.update(gm.id, { age: gm.age + 1 });
      }

      const coaches = await db.headCoaches.where("status").anyOf(["active", "available"]).toArray();
      for (const coach of coaches) {
        await db.headCoaches.update(coach.id, { age: coach.age + 1 });
      }

      const scouts = await db.scouts.where("status").anyOf(["active", "available"]).toArray();
      for (const scout of scouts) {
        await db.scouts.update(scout.id, { age: scout.age + 1 });
      }

      const owners = await db.owners.where("status").equals("active").toArray();
      for (const owner of owners) {
        await db.owners.update(owner.id, { age: owner.age + 1 });
      }
    }
  );
}

async function generateNewPersonnel(
  season: number,
  result: SeasonEndResult
): Promise<void> {
  const generator = new PersonnelGenerator();

  // Calculate how many new personnel to generate
  const currentAvailableGMs = await db.generalManagers.where("status").equals("available").count();
  const currentAvailableCoaches = await db.headCoaches.where("status").equals("available").count();
  const currentAvailableScouts = await db.scouts.where("status").equals("available").count();

  // Target pool sizes
  const targetGMs = 15;
  const targetCoaches = 20;
  const targetScouts = 50;

  // Generate new GMs
  const newGMCount = Math.max(
    0,
    GENERATION_RULES.gm.avgNewPerSeason +
      Math.floor(Math.random() * 3) -
      1 +
      Math.max(0, targetGMs - currentAvailableGMs - 5)
  );
  const newGMs = generator.generateGMs(newGMCount, season);
  await db.generalManagers.bulkAdd(newGMs);
  for (const gm of newGMs) {
    await addToHiringPool(gm.id, "gm", season, false);
  }
  result.newlyGenerated.gms = newGMs;

  // Generate new Coaches
  const newCoachCount = Math.max(
    0,
    GENERATION_RULES.coach.avgNewPerSeason +
      Math.floor(Math.random() * 3) -
      1 +
      Math.max(0, targetCoaches - currentAvailableCoaches - 5)
  );
  const newCoaches = generator.generateCoaches(newCoachCount, season);
  await db.headCoaches.bulkAdd(newCoaches);
  for (const coach of newCoaches) {
    await addToHiringPool(coach.id, "coach", season, false);
  }
  result.newlyGenerated.coaches = newCoaches;

  // Generate new Scouts
  const newScoutCount = Math.max(
    0,
    GENERATION_RULES.scout.avgNewPerSeason +
      Math.floor(Math.random() * 5) -
      2 +
      Math.max(0, targetScouts - currentAvailableScouts - 10)
  );
  const newScouts = generator.generateScouts(newScoutCount, season);
  await db.scouts.bulkAdd(newScouts);
  for (const scout of newScouts) {
    await addToHiringPool(scout.id, "scout", season, false);
  }
  result.newlyGenerated.scouts = newScouts;
}

async function processHallOfFame(
  season: number,
  result: SeasonEndResult
): Promise<void> {
  // HOF eligibility: 5 years after retirement
  const eligibleYear = season - 5;

  const eligibleCandidates = await db.retiredPersonnel
    .filter((p) => p.retirementYear === eligibleYear && !p.hallOfFame)
    .toArray();

  for (const candidate of eligibleCandidates) {
    const probability = calculateHOFProbability(candidate);
    if (Math.random() < probability) {
      await db.retiredPersonnel.update(candidate.id, {
        hallOfFame: true,
        hofInductionYear: season,
      });
      result.hallOfFameInductees.push({
        ...candidate,
        hallOfFame: true,
        hofInductionYear: season,
      });
    }
  }
}

function calculateHOFProbability(person: RetiredPerson): number {
  let probability = 0;

  if (person.personType === "gm" || person.personType === "coach") {
    // Championships are key
    probability += Math.min(person.totalChampionships * 0.25, 0.6);

    // Career wins
    if ((person.totalWins || 0) >= 150) {
      probability += 0.2;
    } else if ((person.totalWins || 0) >= 100) {
      probability += 0.1;
    }

    // Playoff appearances
    probability += Math.min(person.totalPlayoffAppearances * 0.03, 0.2);
  } else {
    // Scout HOF is rare
    if (person.legacyScore >= 90) {
      probability = 0.3;
    } else if (person.legacyScore >= 80) {
      probability = 0.1;
    }
  }

  return Math.min(probability, 0.8);
}

// Export main functions
export const lifecycleManager = {
  processSeasonEnd,
  calculateRetirementDecision,
  addToHiringPool,
  removeFromHiringPool,
  getAvailableGMs,
  getAvailableCoaches,
  getAvailableScouts,
  getHotCandidates,
};
