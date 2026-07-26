// @ts-nocheck
import {
  db,
  GeneralManager,
  HeadCoach,
  Scout,
  Owner,
  Team,
  Interview,
  CareerHistoryEntry,
  getFullName,
} from "./database";
import { addToHiringPool, removeFromHiringPool } from "./lifecycle-manager";

// ==========================================
// Contract Types
// ==========================================

export interface PersonnelContract {
  years: number;
  salary: number;
  totalValue: number;
}

// ==========================================
// GM Operations
// ==========================================

export async function hireGM(
  gmId: string,
  teamId: string,
  contract: PersonnelContract,
  season: number
): Promise<void> {
  const gm = await db.generalManagers.get(gmId);
  const team = await db.teams.get(teamId);

  if (!gm || !team) {
    throw new Error("GM or team not found");
  }

  if (team.gmId) {
    throw new Error("Team already has a GM");
  }

  await db.transaction("rw", [db.generalManagers, db.teams, db.hiringPool, db.interviews], async () => {
    // Add to career history
    const newHistoryEntry: CareerHistoryEntry = {
      teamId,
      teamName: `${team.city} ${team.name}`,
      role: "General Manager",
      startSeason: season,
      endSeason: null,
      achievements: [],
    };

    // Update GM
    await db.generalManagers.update(gmId, {
      status: "active",
      currentTeamId: teamId,
      contractYearsRemaining: contract.years,
      salary: contract.salary,
      careerHistory: [...gm.careerHistory, newHistoryEntry],
    });

    // Update team
    await db.teams.update(teamId, { gmId });

    // Remove from hiring pool
    await removeFromHiringPool(gmId);

    // Remove any pending interviews
    await db.interviews.where("candidateId").equals(gmId).delete();
  });
}

export async function fireGMFromTeam(
  teamId: string,
  reason: string,
  season: number
): Promise<GeneralManager | null> {
  const team = await db.teams.get(teamId);
  if (!team || !team.gmId) return null;

  const gm = await db.generalManagers.get(team.gmId);
  if (!gm) return null;

  await db.transaction("rw", [db.generalManagers, db.teams, db.hiringPool], async () => {
    // Update career history
    const updatedHistory: CareerHistoryEntry[] = gm.careerHistory.map((h) => {
      if (h.teamId === teamId && h.endSeason === null) {
        return { ...h, endSeason: season, endReason: "fired" as const };
      }
      return h;
    });

    // Update GM
    await db.generalManagers.update(gm.id, {
      status: "available",
      currentTeamId: null,
      contractYearsRemaining: 0,
      careerHistory: updatedHistory,
    });

    // Update team
    await db.teams.update(teamId, { gmId: null });

    // Add to hiring pool (hot if accomplished)
    const isHot = gm.championships > 0 || gm.playoffAppearances >= 3;
    await addToHiringPool(gm.id, "gm", season, isHot);
  });

  return gm;
}

export async function getGMsBySkill(
  skill: keyof GeneralManager["skills"],
  minValue: number = 60
): Promise<GeneralManager[]> {
  const availableGMs = await db.generalManagers.where("status").equals("available").toArray();
  return availableGMs
    .filter((gm) => gm.skills[skill] >= minValue)
    .sort((a, b) => b.skills[skill] - a.skills[skill]);
}

export async function getGMCareerStats(gmId: string): Promise<{
  totalYears: number;
  teamsWorkedFor: number;
  winPercentage: number;
  avgTenure: number;
}> {
  const gm = await db.generalManagers.get(gmId);
  if (!gm) throw new Error("GM not found");

  const totalYears = gm.careerHistory.reduce((sum, h) => {
    const end = h.endSeason ?? new Date().getFullYear();
    return sum + (end - h.startSeason);
  }, 0);

  const teamsWorkedFor = new Set(gm.careerHistory.map((h) => h.teamId)).size;
  const totalGames = gm.careerWins + gm.careerLosses + gm.careerTies;
  const winPercentage = totalGames > 0 ? (gm.careerWins + gm.careerTies * 0.5) / totalGames : 0;
  const avgTenure = teamsWorkedFor > 0 ? totalYears / teamsWorkedFor : 0;

  return { totalYears, teamsWorkedFor, winPercentage, avgTenure };
}

// ==========================================
// Coach Operations
// ==========================================

export async function hireCoach(
  coachId: string,
  teamId: string,
  contract: PersonnelContract,
  season: number
): Promise<void> {
  const coach = await db.headCoaches.get(coachId);
  const team = await db.teams.get(teamId);

  if (!coach || !team) {
    throw new Error("Coach or team not found");
  }

  if (team.coachId) {
    throw new Error("Team already has a head coach");
  }

  await db.transaction("rw", [db.headCoaches, db.teams, db.hiringPool, db.interviews], async () => {
    // Add to career history
    const newHistoryEntry: CareerHistoryEntry = {
      teamId,
      teamName: `${team.city} ${team.name}`,
      role: "Head Coach",
      startSeason: season,
      endSeason: null,
      achievements: [],
    };

    // Update coach
    await db.headCoaches.update(coachId, {
      status: "active",
      currentTeamId: teamId,
      contractYearsRemaining: contract.years,
      salary: contract.salary,
      careerHistory: [...coach.careerHistory, newHistoryEntry],
    });

    // Update team
    await db.teams.update(teamId, { coachId });

    // Remove from hiring pool
    await removeFromHiringPool(coachId);

    // Remove any pending interviews
    await db.interviews.where("candidateId").equals(coachId).delete();
  });
}

export async function fireCoachFromTeam(
  teamId: string,
  reason: string,
  season: number
): Promise<HeadCoach | null> {
  const team = await db.teams.get(teamId);
  if (!team || !team.coachId) return null;

  const coach = await db.headCoaches.get(team.coachId);
  if (!coach) return null;

  await db.transaction("rw", [db.headCoaches, db.teams, db.hiringPool], async () => {
    // Update career history
    const updatedHistory: CareerHistoryEntry[] = coach.careerHistory.map((h) => {
      if (h.teamId === teamId && h.endSeason === null) {
        return { ...h, endSeason: season, endReason: "fired" as const };
      }
      return h;
    });

    // Update coach
    await db.headCoaches.update(coach.id, {
      status: "available",
      currentTeamId: null,
      contractYearsRemaining: 0,
      careerHistory: updatedHistory,
    });

    // Update team
    await db.teams.update(teamId, { coachId: null });

    // Add to hiring pool
    const isHot = coach.championships > 0 || coach.careerWins >= 80;
    await addToHiringPool(coach.id, "coach", season, isHot);
  });

  return coach;
}

export async function getCoachesByScheme(
  offensiveScheme?: string,
  defensiveScheme?: string
): Promise<HeadCoach[]> {
  let coaches = await db.headCoaches.where("status").equals("available").toArray();

  if (offensiveScheme) {
    coaches = coaches.filter((c) => c.offensiveScheme === offensiveScheme);
  }
  if (defensiveScheme) {
    coaches = coaches.filter((c) => c.defensiveScheme === defensiveScheme);
  }

  return coaches;
}

// ==========================================
// Scout Operations
// ==========================================

export async function hireScout(
  scoutId: string,
  teamId: string,
  salary: number,
  season: number
): Promise<void> {
  const scout = await db.scouts.get(scoutId);
  const team = await db.teams.get(teamId);

  if (!scout || !team) {
    throw new Error("Scout or team not found");
  }

  await db.transaction("rw", [db.scouts, db.teams, db.hiringPool], async () => {
    // Add to career history
    const newHistoryEntry: CareerHistoryEntry = {
      teamId,
      teamName: `${team.city} ${team.name}`,
      role: "Scout",
      startSeason: season,
      endSeason: null,
      achievements: [],
    };

    // Update scout
    await db.scouts.update(scoutId, {
      status: "active",
      currentTeamId: teamId,
      salary,
      careerHistory: [...scout.careerHistory, newHistoryEntry],
      yearsWithCurrentTeam: 0,
    });

    // Update team
    await db.teams.update(teamId, {
      scoutIds: [...team.scoutIds, scoutId],
    });

    // Remove from hiring pool
    await removeFromHiringPool(scoutId);
  });
}

export async function fireScout(
  scoutId: string,
  teamId: string,
  season: number
): Promise<Scout | null> {
  const scout = await db.scouts.get(scoutId);
  const team = await db.teams.get(teamId);

  if (!scout || !team) return null;

  await db.transaction("rw", [db.scouts, db.teams, db.hiringPool], async () => {
    // Update career history
    const updatedHistory: CareerHistoryEntry[] = scout.careerHistory.map((h) => {
      if (h.teamId === teamId && h.endSeason === null) {
        return { ...h, endSeason: season, endReason: "fired" as const };
      }
      return h;
    });

    // Update scout
    await db.scouts.update(scoutId, {
      status: "available",
      currentTeamId: null,
      careerHistory: updatedHistory,
      yearsWithCurrentTeam: 0,
    });

    // Update team
    await db.teams.update(teamId, {
      scoutIds: team.scoutIds.filter((id) => id !== scoutId),
    });

    // Add to hiring pool
    await addToHiringPool(scoutId, "scout", season, scout.overallAccuracy >= 75);
  });

  return scout;
}

export async function getScoutsBySpecialty(
  scoutType?: string,
  archetype?: string
): Promise<Scout[]> {
  let scouts = await db.scouts.where("status").equals("available").toArray();

  if (scoutType) {
    scouts = scouts.filter((s) => s.scoutType === scoutType);
  }
  if (archetype) {
    scouts = scouts.filter((s) => s.archetype === archetype);
  }

  return scouts.sort((a, b) => b.overallAccuracy - a.overallAccuracy);
}

export async function getTeamScouts(teamId: string): Promise<Scout[]> {
  const team = await db.teams.get(teamId);
  if (!team) return [];

  const scouts = await Promise.all(
    team.scoutIds.map((id) => db.scouts.get(id))
  );

  return scouts.filter((s): s is Scout => s !== undefined);
}

// ==========================================
// Interview System
// ==========================================

export async function startInterview(
  candidateId: string,
  candidateType: "gm" | "coach" | "scout",
  teamId: string,
  season: number,
  week: number
): Promise<Interview> {
  // Check if interview already exists
  const existing = await db.interviews
    .where(["candidateId", "teamId"])
    .equals([candidateId, teamId])
    .first();

  if (existing) {
    return existing;
  }

  // Get candidate info for interest calculation
  let interestLevel = 50;
  const team = await db.teams.get(teamId);

  if (team) {
    // Adjust interest based on team quality
    interestLevel += team.historicalPrestige / 5;
    if (team.marketSize === "large") interestLevel += 10;
    if (team.marketSize === "small") interestLevel -= 10;
  }

  const interview: Interview = {
    id: `interview_${candidateId}_${teamId}`,
    candidateId,
    candidateType,
    teamId,
    stage: "initial",
    interestLevel: Math.min(100, Math.max(0, interestLevel + Math.floor(Math.random() * 20) - 10)),
    teamInterest: 50,
    competingOffers: [],
    startedWeek: week,
    startedSeason: season,
  };

  await db.interviews.add(interview);
  return interview;
}

export async function advanceInterview(
  interviewId: string,
  newTeamInterest?: number
): Promise<Interview | null> {
  const interview = await db.interviews.get(interviewId);
  if (!interview) return null;

  const stageProgression: Record<string, Interview["stage"]> = {
    initial: "second",
    second: "final",
    final: "offer",
  };

  const nextStage = stageProgression[interview.stage];
  if (!nextStage) return interview; // Already at offer stage

  await db.interviews.update(interviewId, {
    stage: nextStage,
    teamInterest: newTeamInterest ?? interview.teamInterest,
  });

  return db.interviews.get(interviewId) as Promise<Interview>;
}

export async function cancelInterview(interviewId: string): Promise<void> {
  await db.interviews.delete(interviewId);
}

export async function getTeamInterviews(teamId: string): Promise<Interview[]> {
  return db.interviews.where("teamId").equals(teamId).toArray();
}

export async function getCandidateInterviews(candidateId: string): Promise<Interview[]> {
  return db.interviews.where("candidateId").equals(candidateId).toArray();
}

// ==========================================
// Search & Filter Functions
// ==========================================

export async function searchPersonnel(
  type: "gm" | "coach" | "scout",
  filters: {
    minAge?: number;
    maxAge?: number;
    status?: string;
    minSkill?: number;
    skillName?: string;
  }
): Promise<(GeneralManager | HeadCoach | Scout)[]> {
  const table =
    type === "gm"
      ? db.generalManagers
      : type === "coach"
      ? db.headCoaches
      : db.scouts;

  let results = await table.toArray();

  if (filters.status) {
    results = results.filter((p) => p.status === filters.status);
  }
  if (filters.minAge) {
    results = results.filter((p) => p.age >= filters.minAge!);
  }
  if (filters.maxAge) {
    results = results.filter((p) => p.age <= filters.maxAge!);
  }
  if (filters.minSkill && filters.skillName) {
    results = results.filter((p) => {
      const skills = (p as GeneralManager | HeadCoach | Scout).skills as Record<string, number>;
      return skills[filters.skillName!] >= filters.minSkill!;
    });
  }

  return results;
}

export async function getPersonnelLeaderboard(
  type: "gm" | "coach",
  category: "wins" | "championships" | "playoffs"
): Promise<(GeneralManager | HeadCoach)[]> {
  const table = type === "gm" ? db.generalManagers : db.headCoaches;
  const all = await table.toArray();

  switch (category) {
    case "wins":
      return all.sort((a, b) => b.careerWins - a.careerWins).slice(0, 20);
    case "championships":
      return all.sort((a, b) => b.championships - a.championships).slice(0, 20);
    case "playoffs":
      return all.sort((a, b) => b.playoffAppearances - a.playoffAppearances).slice(0, 20);
    default:
      return all.slice(0, 20);
  }
}

// ==========================================
// Export Repository
// ==========================================

export const personnelRepository = {
  // GM operations
  hireGM,
  fireGMFromTeam,
  getGMsBySkill,
  getGMCareerStats,

  // Coach operations
  hireCoach,
  fireCoachFromTeam,
  getCoachesByScheme,

  // Scout operations
  hireScout,
  fireScout,
  getScoutsBySpecialty,
  getTeamScouts,

  // Interview system
  startInterview,
  advanceInterview,
  cancelInterview,
  getTeamInterviews,
  getCandidateInterviews,

  // Search & filter
  searchPersonnel,
  getPersonnelLeaderboard,
};
