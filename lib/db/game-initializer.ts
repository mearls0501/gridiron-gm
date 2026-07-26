// @ts-nocheck
import { v4 as uuidv4 } from "uuid";
import {
  db,
  SaveGame,
  Team,
  Owner,
  GeneralManager,
  HeadCoach,
  Scout,
  GameSettings,
  SeasonPhase,
} from "./database";
import { PersonnelGenerator, GENERATION_RULES } from "./personnel-generator";
import { addToHiringPool } from "./lifecycle-manager";

// ==========================================
// NFL Teams Data
// ==========================================

interface NFLTeamData {
  name: string;
  city: string;
  abbreviation: string;
  conference: "AFC" | "NFC";
  division: "North" | "South" | "East" | "West";
  marketSize: "large" | "medium" | "small";
  historicalPrestige: number;
  fanbasePatience: number;
  championships: number;
}

const NFL_TEAMS: NFLTeamData[] = [
  // AFC East
  { name: "Bills", city: "Buffalo", abbreviation: "BUF", conference: "AFC", division: "East", marketSize: "small", historicalPrestige: 55, fanbasePatience: 70, championships: 0 },
  { name: "Dolphins", city: "Miami", abbreviation: "MIA", conference: "AFC", division: "East", marketSize: "large", historicalPrestige: 60, fanbasePatience: 50, championships: 2 },
  { name: "Patriots", city: "New England", abbreviation: "NE", conference: "AFC", division: "East", marketSize: "large", historicalPrestige: 85, fanbasePatience: 40, championships: 6 },
  { name: "Jets", city: "New York", abbreviation: "NYJ", conference: "AFC", division: "East", marketSize: "large", historicalPrestige: 45, fanbasePatience: 60, championships: 1 },

  // AFC North
  { name: "Ravens", city: "Baltimore", abbreviation: "BAL", conference: "AFC", division: "North", marketSize: "medium", historicalPrestige: 70, fanbasePatience: 55, championships: 2 },
  { name: "Bengals", city: "Cincinnati", abbreviation: "CIN", conference: "AFC", division: "North", marketSize: "small", historicalPrestige: 45, fanbasePatience: 65, championships: 0 },
  { name: "Browns", city: "Cleveland", abbreviation: "CLE", conference: "AFC", division: "North", marketSize: "medium", historicalPrestige: 50, fanbasePatience: 80, championships: 0 },
  { name: "Steelers", city: "Pittsburgh", abbreviation: "PIT", conference: "AFC", division: "North", marketSize: "medium", historicalPrestige: 90, fanbasePatience: 50, championships: 6 },

  // AFC South
  { name: "Texans", city: "Houston", abbreviation: "HOU", conference: "AFC", division: "South", marketSize: "large", historicalPrestige: 40, fanbasePatience: 55, championships: 0 },
  { name: "Colts", city: "Indianapolis", abbreviation: "IND", conference: "AFC", division: "South", marketSize: "medium", historicalPrestige: 70, fanbasePatience: 55, championships: 2 },
  { name: "Jaguars", city: "Jacksonville", abbreviation: "JAX", conference: "AFC", division: "South", marketSize: "small", historicalPrestige: 35, fanbasePatience: 60, championships: 0 },
  { name: "Titans", city: "Tennessee", abbreviation: "TEN", conference: "AFC", division: "South", marketSize: "medium", historicalPrestige: 50, fanbasePatience: 60, championships: 0 },

  // AFC West
  { name: "Broncos", city: "Denver", abbreviation: "DEN", conference: "AFC", division: "West", marketSize: "medium", historicalPrestige: 75, fanbasePatience: 50, championships: 3 },
  { name: "Chiefs", city: "Kansas City", abbreviation: "KC", conference: "AFC", division: "West", marketSize: "medium", historicalPrestige: 80, fanbasePatience: 45, championships: 4 },
  { name: "Raiders", city: "Las Vegas", abbreviation: "LV", conference: "AFC", division: "West", marketSize: "large", historicalPrestige: 65, fanbasePatience: 55, championships: 3 },
  { name: "Chargers", city: "Los Angeles", abbreviation: "LAC", conference: "AFC", division: "West", marketSize: "large", historicalPrestige: 55, fanbasePatience: 60, championships: 0 },

  // NFC East
  { name: "Cowboys", city: "Dallas", abbreviation: "DAL", conference: "NFC", division: "East", marketSize: "large", historicalPrestige: 85, fanbasePatience: 40, championships: 5 },
  { name: "Giants", city: "New York", abbreviation: "NYG", conference: "NFC", division: "East", marketSize: "large", historicalPrestige: 75, fanbasePatience: 50, championships: 4 },
  { name: "Eagles", city: "Philadelphia", abbreviation: "PHI", conference: "NFC", division: "East", marketSize: "large", historicalPrestige: 70, fanbasePatience: 45, championships: 1 },
  { name: "Commanders", city: "Washington", abbreviation: "WAS", conference: "NFC", division: "East", marketSize: "large", historicalPrestige: 60, fanbasePatience: 55, championships: 3 },

  // NFC North
  { name: "Bears", city: "Chicago", abbreviation: "CHI", conference: "NFC", division: "North", marketSize: "large", historicalPrestige: 70, fanbasePatience: 60, championships: 1 },
  { name: "Lions", city: "Detroit", abbreviation: "DET", conference: "NFC", division: "North", marketSize: "medium", historicalPrestige: 40, fanbasePatience: 75, championships: 0 },
  { name: "Packers", city: "Green Bay", abbreviation: "GB", conference: "NFC", division: "North", marketSize: "small", historicalPrestige: 90, fanbasePatience: 50, championships: 4 },
  { name: "Vikings", city: "Minnesota", abbreviation: "MIN", conference: "NFC", division: "North", marketSize: "medium", historicalPrestige: 55, fanbasePatience: 55, championships: 0 },

  // NFC South
  { name: "Falcons", city: "Atlanta", abbreviation: "ATL", conference: "NFC", division: "South", marketSize: "large", historicalPrestige: 50, fanbasePatience: 55, championships: 0 },
  { name: "Panthers", city: "Carolina", abbreviation: "CAR", conference: "NFC", division: "South", marketSize: "medium", historicalPrestige: 45, fanbasePatience: 60, championships: 0 },
  { name: "Saints", city: "New Orleans", abbreviation: "NO", conference: "NFC", division: "South", marketSize: "medium", historicalPrestige: 65, fanbasePatience: 50, championships: 1 },
  { name: "Buccaneers", city: "Tampa Bay", abbreviation: "TB", conference: "NFC", division: "South", marketSize: "medium", historicalPrestige: 55, fanbasePatience: 55, championships: 2 },

  // NFC West
  { name: "Cardinals", city: "Arizona", abbreviation: "ARI", conference: "NFC", division: "West", marketSize: "large", historicalPrestige: 45, fanbasePatience: 60, championships: 0 },
  { name: "Rams", city: "Los Angeles", abbreviation: "LAR", conference: "NFC", division: "West", marketSize: "large", historicalPrestige: 65, fanbasePatience: 50, championships: 2 },
  { name: "49ers", city: "San Francisco", abbreviation: "SF", conference: "NFC", division: "West", marketSize: "large", historicalPrestige: 85, fanbasePatience: 45, championships: 5 },
  { name: "Seahawks", city: "Seattle", abbreviation: "SEA", conference: "NFC", division: "West", marketSize: "medium", historicalPrestige: 65, fanbasePatience: 55, championships: 1 },
];

// ==========================================
// Game Initializer
// ==========================================

export interface NewGameOptions {
  saveName: string;
  playerTeamAbbreviation: string;
  startingSeason: number;
  settings?: Partial<GameSettings>;
}

export interface InitializationResult {
  saveGame: SaveGame;
  playerTeam: Team;
  playerGM: GeneralManager;
}

export async function initializeNewGame(
  options: NewGameOptions
): Promise<InitializationResult> {
  const generator = new PersonnelGenerator();
  const { saveName, playerTeamAbbreviation, startingSeason } = options;

  // Default settings
  const settings: GameSettings = {
    difficulty: options.settings?.difficulty ?? "pro",
    simSpeed: options.settings?.simSpeed ?? "normal",
    injuryFrequency: options.settings?.injuryFrequency ?? "normal",
    tradeFrequency: options.settings?.tradeFrequency ?? "normal",
    autoSave: options.settings?.autoSave ?? true,
    showTutorials: options.settings?.showTutorials ?? true,
  };

  // Clear existing data (if any)
  await clearDatabase();

  // Create teams, owners, GMs, coaches, and scouts
  const teams: Team[] = [];
  const owners: Owner[] = [];
  const gms: GeneralManager[] = [];
  const coaches: HeadCoach[] = [];
  const allScouts: Scout[] = [];

  let playerTeam: Team | null = null;
  let playerGM: GeneralManager | null = null;

  for (const teamData of NFL_TEAMS) {
    const teamId = `team_${teamData.abbreviation.toLowerCase()}`;
    const isPlayerTeam = teamData.abbreviation === playerTeamAbbreviation;

    // Generate owner
    const owner = generator.generateOwner(startingSeason, teamId);
    owners.push(owner);

    // Generate GM
    const gm = generator.generateGM(startingSeason, {
      currentTeamId: teamId,
      status: "active",
      contractYearsRemaining: Math.floor(Math.random() * 4) + 2,
      salary: Math.floor(Math.random() * 4_000_000) + 2_000_000,
    });

    // Add history for being hired
    gm.careerHistory.push({
      teamId,
      teamName: `${teamData.city} ${teamData.name}`,
      role: "General Manager",
      startSeason: startingSeason - Math.floor(Math.random() * 5),
      endSeason: null,
      achievements: [],
    });

    gms.push(gm);

    // Generate coach
    const coach = generator.generateCoach(startingSeason, {
      currentTeamId: teamId,
      status: "active",
      contractYearsRemaining: Math.floor(Math.random() * 4) + 2,
      salary: Math.floor(Math.random() * 8_000_000) + 4_000_000,
    });

    coach.careerHistory.push({
      teamId,
      teamName: `${teamData.city} ${teamData.name}`,
      role: "Head Coach",
      startSeason: startingSeason - Math.floor(Math.random() * 5),
      endSeason: null,
      achievements: [],
    });

    coaches.push(coach);

    // Generate scouts (5-8 per team)
    const scoutCount = Math.floor(Math.random() * 4) + 5;
    const teamScoutIds: string[] = [];

    for (let i = 0; i < scoutCount; i++) {
      const scout = generator.generateScout(startingSeason, {
        currentTeamId: teamId,
        status: "active",
        yearsWithCurrentTeam: Math.floor(Math.random() * 6),
      });

      scout.careerHistory.push({
        teamId,
        teamName: `${teamData.city} ${teamData.name}`,
        role: "Scout",
        startSeason: startingSeason - scout.yearsWithCurrentTeam,
        endSeason: null,
        achievements: [],
      });

      allScouts.push(scout);
      teamScoutIds.push(scout.id);
    }

    // Create team
    const team: Team = {
      id: teamId,
      name: teamData.name,
      city: teamData.city,
      abbreviation: teamData.abbreviation,
      conference: teamData.conference,
      division: teamData.division,
      ownerId: owner.id,
      gmId: gm.id,
      coachId: coach.id,
      scoutIds: teamScoutIds,
      salaryCap: 255_000_000, // 2024 cap
      currentCapUsed: Math.floor(Math.random() * 50_000_000) + 180_000_000,
      deadCap: Math.floor(Math.random() * 20_000_000),
      championships: teamData.championships,
      playoffAppearances: Math.floor(teamData.historicalPrestige / 5),
      marketSize: teamData.marketSize,
      fanbasePatience: teamData.fanbasePatience,
      historicalPrestige: teamData.historicalPrestige,
      isPlayerControlled: isPlayerTeam,
    };

    teams.push(team);

    if (isPlayerTeam) {
      playerTeam = team;
      playerGM = gm;
    }
  }

  if (!playerTeam || !playerGM) {
    throw new Error(`Team with abbreviation ${playerTeamAbbreviation} not found`);
  }

  // Generate hiring pool
  const poolGMs = generator.generateGMs(12, startingSeason);
  const poolCoaches = generator.generateCoaches(15, startingSeason);
  const poolScouts = generator.generateScouts(40, startingSeason);

  // Save everything to database
  await db.transaction(
    "rw",
    [db.teams, db.owners, db.generalManagers, db.headCoaches, db.scouts, db.hiringPool, db.saveGames],
    async () => {
      // Add teams
      await db.teams.bulkAdd(teams);

      // Add owners
      await db.owners.bulkAdd(owners);

      // Add GMs (active and pool)
      await db.generalManagers.bulkAdd(gms);
      await db.generalManagers.bulkAdd(poolGMs);

      // Add coaches (active and pool)
      await db.headCoaches.bulkAdd(coaches);
      await db.headCoaches.bulkAdd(poolCoaches);

      // Add scouts (active and pool)
      await db.scouts.bulkAdd(allScouts);
      await db.scouts.bulkAdd(poolScouts);

      // Add pool personnel to hiring pool
      for (const gm of poolGMs) {
        await addToHiringPool(gm.id, "gm", startingSeason, false);
      }
      for (const coach of poolCoaches) {
        await addToHiringPool(coach.id, "coach", startingSeason, false);
      }
      for (const scout of poolScouts) {
        await addToHiringPool(scout.id, "scout", startingSeason, false);
      }
    }
  );

  // Create save game
  const saveGame: SaveGame = {
    id: `save_${uuidv4()}`,
    name: saveName,
    createdAt: new Date(),
    lastPlayedAt: new Date(),
    currentSeason: startingSeason,
    currentWeek: 1,
    currentPhase: "offseason",
    playerTeamId: playerTeam.id,
    playerGMId: playerGM.id,
    settings,
    version: "1.0.0",
  };

  await db.saveGames.add(saveGame);

  return {
    saveGame,
    playerTeam,
    playerGM,
  };
}

// ==========================================
// Clear Database
// ==========================================

async function clearDatabase(): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.saveGames,
      db.teams,
      db.owners,
      db.generalManagers,
      db.headCoaches,
      db.scouts,
      db.hiringPool,
      db.interviews,
      db.retiredPersonnel,
      db.seasonRecords,
      db.draftRecords,
      db.tradeRecords,
      db.newsItems,
    ],
    async () => {
      await db.saveGames.clear();
      await db.teams.clear();
      await db.owners.clear();
      await db.generalManagers.clear();
      await db.headCoaches.clear();
      await db.scouts.clear();
      await db.hiringPool.clear();
      await db.interviews.clear();
      await db.retiredPersonnel.clear();
      await db.seasonRecords.clear();
      await db.draftRecords.clear();
      await db.tradeRecords.clear();
      await db.newsItems.clear();
    }
  );
}

// ==========================================
// Save/Load Functions
// ==========================================

export async function getSaveGames(): Promise<SaveGame[]> {
  return db.saveGames.orderBy("lastPlayedAt").reverse().toArray();
}

export async function loadSaveGame(saveId: string): Promise<SaveGame | undefined> {
  const save = await db.saveGames.get(saveId);
  if (save) {
    await db.saveGames.update(saveId, { lastPlayedAt: new Date() });
  }
  return save;
}

export async function deleteSaveGame(saveId: string): Promise<void> {
  await db.saveGames.delete(saveId);
  // Note: In a full implementation, you might want to clear related data
  // For now, we assume each save is a complete game state
}

export async function updateSaveGame(
  saveId: string,
  updates: Partial<Pick<SaveGame, "currentSeason" | "currentWeek" | "currentPhase">>
): Promise<void> {
  await db.saveGames.update(saveId, {
    ...updates,
    lastPlayedAt: new Date(),
  });
}

// ==========================================
// Export
// ==========================================

export const gameInitializer = {
  initializeNewGame,
  getSaveGames,
  loadSaveGame,
  deleteSaveGame,
  updateSaveGame,
  clearDatabase,
  NFL_TEAMS,
};
