# Gridiron GM - Database & Storage Design

## Overview

This document outlines the database schema and storage strategy for persistent game data, focusing on the lifecycle management of personnel (GMs, Coaches, Scouts, Players) across multiple seasons.

---

## Part 1: Storage Strategy

### Technology Options

#### Option A: IndexedDB (Recommended for Web)
- **Pros**: Built into browsers, no server needed, large storage limits
- **Cons**: Browser-specific, no cross-device sync
- **Best for**: Single-player web experience

#### Option B: SQLite via WASM
- **Pros**: Full SQL support, portable database files, save/load games
- **Cons**: Larger bundle size, more complex setup
- **Best for**: Desktop-like experience with save files

#### Option C: Local Storage + JSON Files
- **Pros**: Simplest implementation, easy debugging
- **Cons**: 5MB limit, no querying, performance issues at scale
- **Best for**: Prototyping only

#### Option D: Cloud Backend (Supabase/Firebase)
- **Pros**: Cross-device sync, multiplayer potential, backups
- **Cons**: Requires internet, hosting costs
- **Best for**: Future expansion

### Recommended Approach
Start with **IndexedDB** using a library like `Dexie.js` for type-safe access, with an abstraction layer that allows migration to cloud storage later.

---

## Part 2: Core Schema Design

### 2.1 Save Game Structure

```typescript
interface SaveGame {
  id: string;
  name: string;
  createdAt: Date;
  lastPlayedAt: Date;
  currentSeason: number;
  currentWeek: number;
  currentPhase: SeasonPhase;
  playerTeamId: string;
  settings: GameSettings;
  version: string; // For migration compatibility
}

type SeasonPhase =
  | "offseason"      // After Super Bowl
  | "free_agency"    // March
  | "pre_draft"      // April
  | "draft"          // Late April
  | "post_draft"     // May
  | "training_camp"  // July-August
  | "preseason"      // August
  | "regular_season" // Sept-Dec
  | "playoffs"       // January
  | "super_bowl";    // February
```

### 2.2 Teams Table

```typescript
interface Team {
  id: string;
  name: string;
  city: string;
  abbreviation: string;
  conference: "AFC" | "NFC";
  division: "North" | "South" | "East" | "West";

  // Current staff (references to personnel IDs)
  ownerId: string;
  gmId: string | null;      // null = vacant
  coachId: string | null;   // null = vacant
  scoutIds: string[];

  // Financials
  salaryCap: number;
  currentCapUsed: number;
  deadCap: number;

  // History
  championships: number;
  playoffAppearances: number;

  // Preferences (affects AI decisions)
  marketSize: "large" | "medium" | "small";
  fanbasePatience: number; // 1-100
  historicalPrestige: number; // 1-100
}
```

### 2.3 Personnel Base Schema

```typescript
// Base interface for all personnel
interface Person {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  birthYear: number;

  // Career status
  status: PersonnelStatus;
  retirementYear?: number;

  // Physical (for display/portraits)
  portraitSeed: number; // For procedural generation

  // History
  careerHistory: CareerHistoryEntry[];
  createdInSeason: number;
}

type PersonnelStatus =
  | "active"           // Currently employed
  | "available"        // In hiring pool
  | "retired"          // Left the game
  | "deceased"         // Memorial only
  | "suspended"        // Temporarily unavailable
  | "blacklisted";     // Permanently unavailable (scandal, etc.)

interface CareerHistoryEntry {
  teamId: string;
  role: string;
  startSeason: number;
  endSeason: number;
  endReason: "fired" | "retired" | "resigned" | "promoted" | "hired_away" | "expired";
  achievements: string[];
  record?: { wins: number; losses: number; ties: number };
}
```

---

## Part 3: Personnel Types

### 3.1 Owners

```typescript
interface Owner extends Person {
  type: "owner";

  // Personality (immutable - owners don't change much)
  ownerType: OwnerType;
  wealth: "billionaire" | "multi_billionaire" | "mega_billionaire";
  ownershipStyle: "inherited" | "self_made" | "corporate" | "consortium";

  // Tendencies
  spendingWillingness: number;    // 1-100
  patienceLevel: number;          // 1-100
  meddlingTendency: number;       // 1-100
  mediaPresence: number;          // 1-100

  // Current state (mutable)
  currentTeamId: string;
  satisfactionHistory: SeasonSatisfaction[];

  // Quirks
  petPeeves: OwnerPetPeeve[];
  priorities: OwnerPriority[];
}

interface SeasonSatisfaction {
  season: number;
  satisfaction: number;
  wins: number;
  playoffResult: PlayoffResult | null;
  notes: string[];
}

type OwnerType =
  | "win_now"
  | "patient_builder"
  | "meddler"
  | "hands_off"
  | "penny_pincher"
  | "big_spender"
  | "legacy_obsessed"
  | "new_money"
  | "family_tradition";
```

### 3.2 General Managers

```typescript
interface GeneralManager extends Person {
  type: "gm";

  // Skills
  skills: GMSkills;

  // Personality
  personality: GMPersonality;

  // Draft History (for reputation)
  draftHistory: DraftPickResult[];

  // Trade History
  tradeHistory: TradeResult[];

  // Career stats
  careerWins: number;
  careerLosses: number;
  careerTies: number;
  playoffAppearances: number;
  championships: number;

  // Current employment
  currentTeamId: string | null;
  contractYearsRemaining: number;
  salary: number;

  // Reputation
  leagueReputation: number;      // Affects trade negotiations
  ownerTrust: number;            // With current owner
  mediaPerception: number;       // Public opinion
}

interface GMSkills {
  drafting: number;              // 1-100
  trading: number;               // 1-100
  freeAgency: number;           // 1-100
  capManagement: number;        // 1-100
  scoutingOversight: number;    // 1-100
  coachRelations: number;       // 1-100
  mediaHandling: number;        // 1-100
  playerRelations: number;      // 1-100
}

interface GMPersonality {
  riskTolerance: number;        // 1-100 (conservative to aggressive)
  buildingStyle: "win_now" | "balanced" | "rebuild";
  draftPhilosophy: "best_available" | "need_based" | "trade_back" | "trade_up";
  faApproach: "aggressive" | "selective" | "conservative";
  tradeActivity: "very_active" | "moderate" | "rarely_trades";
}

interface DraftPickResult {
  season: number;
  round: number;
  pick: number;
  playerId: string;
  playerName: string;
  position: string;
  teamId: string;
  // Graded after 3 seasons
  grade?: "A+" | "A" | "B" | "C" | "D" | "F";
  careerAV?: number; // Approximate Value
}

interface TradeResult {
  season: number;
  teamId: string;
  sentAssets: string[];
  receivedAssets: string[];
  // Graded after 2 seasons
  grade?: "won" | "fair" | "lost";
}
```

### 3.3 Head Coaches

```typescript
interface HeadCoach extends Person {
  type: "coach";

  // Background
  background: CoachBackground;

  // Scheme
  offensiveScheme: OffensiveScheme;
  defensiveScheme: DefensiveScheme;

  // Skills
  skills: CoachSkills;

  // Personality
  personality: CoachPersonality;

  // Career record
  careerWins: number;
  careerLosses: number;
  careerTies: number;
  playoffWins: number;
  playoffLosses: number;
  championships: number;
  coachOfYearAwards: number;

  // Current employment
  currentTeamId: string | null;
  contractYearsRemaining: number;
  salary: number;

  // Coordinator tree (coaches they've mentored)
  coachingTree: string[]; // IDs of coaches they trained
  mentorId?: string;      // Who trained them
}

type CoachBackground =
  | "offensive_coordinator"
  | "defensive_coordinator"
  | "position_coach"
  | "college_coach"
  | "qb_guru"
  | "defensive_mastermind";

interface CoachSkills {
  gameManagement: number;
  playerDevelopment: number;
  playDesign: number;
  adjustments: number;
  motivation: number;
  discipline: number;
  talentEvaluation: number;
  mediaRelations: number;
}

interface CoachPersonality {
  temperament: "fiery" | "calm" | "players_coach" | "disciplinarian";
  riskTaking: number;           // 1-100 (4th down decisions, etc.)
  adaptability: number;         // 1-100 (scheme flexibility)
  egoLevel: number;             // 1-100 (affects GM relationship)
  loyaltyToPlayers: number;     // 1-100
}

type OffensiveScheme =
  | "west_coast"
  | "spread"
  | "air_raid"
  | "pro_style"
  | "power_run"
  | "zone_run"
  | "rpo_heavy"
  | "balanced";

type DefensiveScheme =
  | "4-3_base"
  | "3-4_base"
  | "multiple"
  | "cover_2"
  | "cover_3"
  | "man_heavy"
  | "zone_heavy"
  | "aggressive_blitz";
```

### 3.4 Scouts

```typescript
interface Scout extends Person {
  type: "scout";

  // Role
  scoutType: ScoutType;
  archetype: ScoutArchetype;

  // Skills
  skills: ScoutSkills;

  // Accuracy tracking
  evaluationHistory: ScoutEvaluation[];
  overallAccuracy: number;       // Calculated from history

  // Specializations
  positionStrengths: string[];   // Positions they evaluate better
  positionWeaknesses: string[];  // Positions they evaluate worse
  regionalExpertise: string[];   // Regions they know well

  // Current employment
  currentTeamId: string | null;
  salary: number;

  // Relationships
  morale: number;
  loyalty: number;
  yearsWithCurrentTeam: number;
}

type ScoutType =
  | "national"        // Covers all college
  | "regional"        // Specific regions
  | "pro_personnel"   // NFL players
  | "international"   // International prospects
  | "analytics";      // Data-focused

type ScoutArchetype =
  | "evaluator"
  | "tape_grinder"
  | "character_coach"
  | "athletic_analyst"
  | "regional_specialist"
  | "medical_expert"
  | "cap_specialist";

interface ScoutSkills {
  athleticEvaluation: number;
  technicalEvaluation: number;
  characterAssessment: number;
  injuryAssessment: number;
  projectability: number;
  workEthic: number;
  networking: number;
}

interface ScoutEvaluation {
  season: number;
  playerId: string;
  playerName: string;
  position: string;
  predictedGrade: number;        // 1-100
  actualPerformance?: number;    // Filled in after 2-3 years
  accuracy?: number;             // How close prediction was
  wasHiddenGem: boolean;         // Found a late-round star
  wasBust: boolean;              // Badly missed on top prospect
}
```

---

## Part 4: Personnel Lifecycle

### 4.1 Creation Pipeline

```typescript
interface PersonnelGenerator {
  // Generate new personnel for a season
  generateNewGMs(count: number, season: number): GeneralManager[];
  generateNewCoaches(count: number, season: number): HeadCoach[];
  generateNewScouts(count: number, season: number): Scout[];

  // Name generation
  generateName(): { firstName: string; lastName: string };

  // Skill generation based on age/experience
  generateSkills(age: number, experience: number): Record<string, number>;
}

// Generation rules
const GENERATION_RULES = {
  gm: {
    minAge: 32,
    maxAge: 55,
    avgNewPerSeason: 3,
    retirementAge: { min: 58, avg: 65, max: 75 },
  },
  coach: {
    minAge: 35,
    maxAge: 60,
    avgNewPerSeason: 4,
    retirementAge: { min: 55, avg: 65, max: 80 },
  },
  scout: {
    minAge: 25,
    maxAge: 50,
    avgNewPerSeason: 15,
    retirementAge: { min: 55, avg: 62, max: 70 },
  },
};
```

### 4.2 Hiring Pool Management

```typescript
interface HiringPool {
  gms: GeneralManager[];           // Available GMs
  coaches: HeadCoach[];            // Available coaches
  scouts: Scout[];                 // Available scouts

  // Trending (recently fired but talented)
  hotCandidates: string[];

  // Interview tracking
  activeInterviews: Interview[];
}

interface Interview {
  candidateId: string;
  candidateType: "gm" | "coach" | "scout";
  teamId: string;
  stage: "initial" | "second" | "final" | "offer";
  interestLevel: number;          // Candidate's interest in the job
  teamInterest: number;           // Team's interest in candidate
  competingOffers: string[];      // Other teams interviewing
}

// Pool refreshes each offseason
interface OffseasonPoolRefresh {
  // Fired personnel enter pool
  addFiredPersonnel(person: Person): void;

  // Retired personnel leave pool
  processRetirements(season: number): Person[];

  // Generate fresh candidates
  generateNewCandidates(season: number): void;

  // Remove hired personnel
  removeHiredCandidate(personId: string): void;
}
```

### 4.3 Retirement System

```typescript
interface RetirementSystem {
  // Check if person should retire
  shouldRetire(person: Person, season: number): RetirementDecision;

  // Process retirement
  processRetirement(person: Person, reason: RetirementReason): void;

  // Hall of Fame consideration
  considerForHallOfFame(person: Person): boolean;
}

interface RetirementDecision {
  willRetire: boolean;
  probability: number;
  factors: RetirementFactor[];
}

interface RetirementFactor {
  factor: string;
  impact: number;  // Positive = more likely to retire
}

type RetirementReason =
  | "age"
  | "health"
  | "family"
  | "burnout"
  | "fired_multiple_times"
  | "achieved_goals"
  | "scandal"
  | "voluntary";

// Retirement probability factors
const RETIREMENT_FACTORS = {
  age: {
    // Probability increases exponentially past certain ages
    gm: { threshold: 60, multiplier: 1.15 },
    coach: { threshold: 62, multiplier: 1.12 },
    scout: { threshold: 58, multiplier: 1.18 },
  },

  recentlyFired: {
    // More likely to retire if fired multiple times
    multiplier: 1.3,
    threshold: 2, // fires in last 3 years
  },

  championships: {
    // More likely after winning it all
    multiplier: 1.2,
  },

  healthIssues: {
    // Random health events
    baseChance: 0.02,
    ageMultiplier: 1.05,
  },

  burnout: {
    // Long careers without success
    yearsThreshold: 15,
    noPlayoffsMultiplier: 1.25,
  },
};
```

### 4.4 Season Transitions

```typescript
interface SeasonTransition {
  // End of season processing
  processSeasonEnd(season: number): SeasonEndResult;

  // Firing decisions (CPU teams)
  processFiringDecisions(): FiringResult[];

  // Retirement processing
  processRetirements(): RetirementResult[];

  // Pool refresh
  refreshHiringPool(): void;

  // New personnel generation
  generateNewPersonnel(): NewPersonnelResult;

  // Age everyone
  ageAllPersonnel(): void;
}

interface SeasonEndResult {
  fired: { gms: string[]; coaches: string[] };
  retired: string[];
  newlyAvailable: string[];
  newlyGenerated: string[];
}

interface FiringResult {
  personId: string;
  teamId: string;
  reason: FiringReason;
  severanceCost: number;
}

type FiringReason =
  | "poor_record"
  | "missed_playoffs"
  | "lost_locker_room"
  | "owner_impatience"
  | "scandal"
  | "philosophical_differences"
  | "new_ownership";
```

---

## Part 5: Database Tables (IndexedDB/Dexie Schema)

```typescript
// Dexie.js database definition
import Dexie, { Table } from 'dexie';

interface GridironGMDatabase extends Dexie {
  // Core tables
  saveGames: Table<SaveGame, string>;
  teams: Table<Team, string>;

  // Personnel tables
  owners: Table<Owner, string>;
  generalManagers: Table<GeneralManager, string>;
  headCoaches: Table<HeadCoach, string>;
  scouts: Table<Scout, string>;

  // Players
  collegePlayers: Table<CollegePlayer, string>;
  nflPlayers: Table<NFLPlayer, string>;

  // Historical data
  draftHistory: Table<DraftRecord, string>;
  tradeHistory: Table<TradeRecord, string>;
  seasonHistory: Table<SeasonRecord, string>;

  // Hiring/Firing
  hiringPool: Table<HiringPoolEntry, string>;
  interviews: Table<Interview, string>;

  // Retired personnel (Hall of Fame, etc.)
  retiredPersonnel: Table<RetiredPerson, string>;

  // Game events
  newsHistory: Table<NewsItem, string>;
}

class GridironGMDB extends Dexie {
  saveGames!: Table<SaveGame, string>;
  teams!: Table<Team, string>;
  owners!: Table<Owner, string>;
  generalManagers!: Table<GeneralManager, string>;
  headCoaches!: Table<HeadCoach, string>;
  scouts!: Table<Scout, string>;
  collegePlayers!: Table<CollegePlayer, string>;
  nflPlayers!: Table<NFLPlayer, string>;
  draftHistory!: Table<DraftRecord, string>;
  tradeHistory!: Table<TradeRecord, string>;
  seasonHistory!: Table<SeasonRecord, string>;
  hiringPool!: Table<HiringPoolEntry, string>;
  interviews!: Table<Interview, string>;
  retiredPersonnel!: Table<RetiredPerson, string>;
  newsHistory!: Table<NewsItem, string>;

  constructor() {
    super('GridironGMDatabase');

    this.version(1).stores({
      saveGames: 'id, name, lastPlayedAt',
      teams: 'id, abbreviation, conference, division',
      owners: 'id, currentTeamId, status',
      generalManagers: 'id, currentTeamId, status, [status+currentTeamId]',
      headCoaches: 'id, currentTeamId, status, [status+currentTeamId]',
      scouts: 'id, currentTeamId, status, scoutType',
      collegePlayers: 'id, position, class, overallGrade',
      nflPlayers: 'id, teamId, position, overallRating',
      draftHistory: 'id, season, teamId, playerId',
      tradeHistory: 'id, season, [team1Id+team2Id]',
      seasonHistory: 'id, season, teamId',
      hiringPool: 'id, personType, addedSeason',
      interviews: 'id, candidateId, teamId, stage',
      retiredPersonnel: 'id, type, retirementYear',
      newsHistory: 'id, season, week, type',
    });
  }
}

export const db = new GridironGMDB();
```

---

## Part 6: Data Access Layer

```typescript
// Personnel Repository
class PersonnelRepository {
  // GMs
  async getAllAvailableGMs(): Promise<GeneralManager[]> {
    return db.generalManagers
      .where('status')
      .equals('available')
      .toArray();
  }

  async getGMById(id: string): Promise<GeneralManager | undefined> {
    return db.generalManagers.get(id);
  }

  async hireGM(gmId: string, teamId: string, contract: Contract): Promise<void> {
    await db.transaction('rw', [db.generalManagers, db.teams, db.hiringPool], async () => {
      // Update GM
      await db.generalManagers.update(gmId, {
        status: 'active',
        currentTeamId: teamId,
        contractYearsRemaining: contract.years,
        salary: contract.salary,
      });

      // Update team
      await db.teams.update(teamId, { gmId });

      // Remove from hiring pool
      await db.hiringPool.where('id').equals(gmId).delete();
    });
  }

  async fireGM(gmId: string, reason: FiringReason): Promise<void> {
    const gm = await db.generalManagers.get(gmId);
    if (!gm) return;

    await db.transaction('rw', [db.generalManagers, db.teams, db.hiringPool], async () => {
      // Update GM
      await db.generalManagers.update(gmId, {
        status: 'available',
        currentTeamId: null,
        careerHistory: [
          ...gm.careerHistory,
          {
            teamId: gm.currentTeamId!,
            role: 'General Manager',
            startSeason: /* calculate */,
            endSeason: /* current season */,
            endReason: 'fired',
          },
        ],
      });

      // Update team
      await db.teams.update(gm.currentTeamId!, { gmId: null });

      // Add to hiring pool
      await db.hiringPool.add({
        id: gmId,
        personType: 'gm',
        addedSeason: /* current season */,
      });
    });
  }

  // Similar methods for coaches and scouts...

  // Retirement
  async retirePerson(personId: string, type: 'gm' | 'coach' | 'scout', reason: RetirementReason): Promise<void> {
    const table = type === 'gm'
      ? db.generalManagers
      : type === 'coach'
        ? db.headCoaches
        : db.scouts;

    const person = await table.get(personId);
    if (!person) return;

    await db.transaction('rw', [table, db.retiredPersonnel, db.hiringPool], async () => {
      // Update status
      await table.update(personId, {
        status: 'retired',
        retirementYear: /* current season */,
      });

      // Add to retired personnel
      await db.retiredPersonnel.add({
        ...person,
        retirementReason: reason,
        retirementYear: /* current season */,
        hallOfFame: false,
      });

      // Remove from hiring pool if present
      await db.hiringPool.where('id').equals(personId).delete();
    });
  }
}

// Season Transition Repository
class SeasonTransitionRepository {
  async processEndOfSeason(season: number): Promise<SeasonEndResult> {
    const result: SeasonEndResult = {
      fired: { gms: [], coaches: [] },
      retired: [],
      newlyAvailable: [],
      newlyGenerated: [],
    };

    // 1. Process CPU team firing decisions
    const cpuTeams = await db.teams.filter(t => !t.isPlayerControlled).toArray();
    for (const team of cpuTeams) {
      const shouldFireGM = await this.evaluateFiringDecision(team, 'gm', season);
      if (shouldFireGM && team.gmId) {
        await personnelRepo.fireGM(team.gmId, shouldFireGM.reason);
        result.fired.gms.push(team.gmId);
      }

      const shouldFireCoach = await this.evaluateFiringDecision(team, 'coach', season);
      if (shouldFireCoach && team.coachId) {
        await personnelRepo.fireCoach(team.coachId, shouldFireCoach.reason);
        result.fired.coaches.push(team.coachId);
      }
    }

    // 2. Process retirements
    const allPersonnel = await this.getAllActivePersonnel();
    for (const person of allPersonnel) {
      const decision = retirementSystem.shouldRetire(person, season);
      if (decision.willRetire) {
        await personnelRepo.retirePerson(person.id, person.type, 'age');
        result.retired.push(person.id);
      }
    }

    // 3. Age everyone
    await this.ageAllPersonnel();

    // 4. Generate new personnel
    const newGMs = personnelGenerator.generateNewGMs(
      GENERATION_RULES.gm.avgNewPerSeason + Math.floor(Math.random() * 3) - 1,
      season
    );
    const newCoaches = personnelGenerator.generateNewCoaches(
      GENERATION_RULES.coach.avgNewPerSeason + Math.floor(Math.random() * 3) - 1,
      season
    );
    const newScouts = personnelGenerator.generateNewScouts(
      GENERATION_RULES.scout.avgNewPerSeason + Math.floor(Math.random() * 5) - 2,
      season
    );

    // Add to database and hiring pool
    await db.generalManagers.bulkAdd(newGMs);
    await db.headCoaches.bulkAdd(newCoaches);
    await db.scouts.bulkAdd(newScouts);

    result.newlyGenerated = [
      ...newGMs.map(g => g.id),
      ...newCoaches.map(c => c.id),
      ...newScouts.map(s => s.id),
    ];

    return result;
  }

  private async evaluateFiringDecision(
    team: Team,
    role: 'gm' | 'coach',
    season: number
  ): Promise<{ shouldFire: boolean; reason: FiringReason } | null> {
    const owner = await db.owners.get(team.ownerId);
    if (!owner) return null;

    const seasonRecord = await db.seasonHistory
      .where('[season+teamId]')
      .equals([season, team.id])
      .first();

    if (!seasonRecord) return null;

    // Firing logic based on owner type and results
    let firingProbability = 0;
    let reason: FiringReason = 'poor_record';

    // Losing record
    if (seasonRecord.losses > seasonRecord.wins) {
      firingProbability += 0.2;

      // Owner patience modifier
      if (owner.ownerType === 'win_now') {
        firingProbability += 0.3;
      } else if (owner.ownerType === 'patient_builder') {
        firingProbability -= 0.15;
      }
    }

    // Missed playoffs when expected
    if (!seasonRecord.madePlayoffs && seasonRecord.preseasonExpectation === 'playoffs') {
      firingProbability += 0.25;
      reason = 'missed_playoffs';
    }

    // Multiple bad seasons
    const recentSeasons = await db.seasonHistory
      .where('teamId')
      .equals(team.id)
      .filter(s => s.season >= season - 2)
      .toArray();

    const consecutiveLosing = recentSeasons.filter(s => s.losses > s.wins).length;
    if (consecutiveLosing >= 3) {
      firingProbability += 0.4;
    }

    // Owner trust
    if (owner.metrics.trust < 30) {
      firingProbability += 0.3;
      reason = 'owner_impatience';
    }

    // Roll the dice
    if (Math.random() < firingProbability) {
      return { shouldFire: true, reason };
    }

    return null;
  }
}
```

---

## Part 7: Personnel Generation

```typescript
// Name pools
const FIRST_NAMES = [
  "Mike", "John", "Bill", "Tom", "Steve", "Dave", "Jim", "Bob", "Dan", "Joe",
  "Chris", "Matt", "Brian", "Kevin", "Jeff", "Mark", "Scott", "Eric", "Ryan", "Jason",
  "Adam", "Aaron", "Brandon", "Derek", "Kyle", "Sean", "Tony", "Nick", "Josh", "Patrick",
  // Add more diverse names...
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Wilson", "Moore", "Taylor",
  "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson",
  "Clark", "Rodriguez", "Lewis", "Lee", "Walker", "Hall", "Allen", "Young", "King", "Wright",
  // Add more names...
];

class PersonnelGenerator {
  private usedNames: Set<string> = new Set();

  generateName(): { firstName: string; lastName: string } {
    let attempts = 0;
    while (attempts < 100) {
      const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
      const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
      const fullName = `${firstName} ${lastName}`;

      if (!this.usedNames.has(fullName)) {
        this.usedNames.add(fullName);
        return { firstName, lastName };
      }
      attempts++;
    }

    // Fallback: add a suffix
    const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    return { firstName, lastName: `${lastName} Jr.` };
  }

  generateNewGMs(count: number, season: number): GeneralManager[] {
    const gms: GeneralManager[] = [];

    for (let i = 0; i < count; i++) {
      const { firstName, lastName } = this.generateName();
      const age = this.randomInRange(
        GENERATION_RULES.gm.minAge,
        GENERATION_RULES.gm.maxAge
      );

      const gm: GeneralManager = {
        id: `gm_${season}_${i}_${Date.now()}`,
        type: 'gm',
        firstName,
        lastName,
        age,
        birthYear: season - age,
        status: 'available',
        portraitSeed: Math.random() * 1000000,
        careerHistory: this.generatePriorCareer('gm', age, season),
        createdInSeason: season,

        skills: this.generateGMSkills(age),
        personality: this.generateGMPersonality(),
        draftHistory: [],
        tradeHistory: [],

        careerWins: 0,
        careerLosses: 0,
        careerTies: 0,
        playoffAppearances: 0,
        championships: 0,

        currentTeamId: null,
        contractYearsRemaining: 0,
        salary: 0,

        leagueReputation: 50 + Math.floor(Math.random() * 20) - 10,
        ownerTrust: 50,
        mediaPerception: 50,
      };

      gms.push(gm);
    }

    return gms;
  }

  private generateGMSkills(age: number): GMSkills {
    // Older = more experienced, but with some randomness
    const experienceBonus = Math.min((age - 30) * 1.5, 25);
    const baseSkill = 40 + experienceBonus;

    return {
      drafting: this.randomSkill(baseSkill),
      trading: this.randomSkill(baseSkill),
      freeAgency: this.randomSkill(baseSkill),
      capManagement: this.randomSkill(baseSkill),
      scoutingOversight: this.randomSkill(baseSkill),
      coachRelations: this.randomSkill(baseSkill),
      mediaHandling: this.randomSkill(baseSkill),
      playerRelations: this.randomSkill(baseSkill),
    };
  }

  private generateGMPersonality(): GMPersonality {
    const styles: GMPersonality['buildingStyle'][] = ['win_now', 'balanced', 'rebuild'];
    const draftPhilosophies: GMPersonality['draftPhilosophy'][] = [
      'best_available', 'need_based', 'trade_back', 'trade_up'
    ];
    const faApproaches: GMPersonality['faApproach'][] = [
      'aggressive', 'selective', 'conservative'
    ];
    const tradeActivities: GMPersonality['tradeActivity'][] = [
      'very_active', 'moderate', 'rarely_trades'
    ];

    return {
      riskTolerance: Math.floor(Math.random() * 100) + 1,
      buildingStyle: styles[Math.floor(Math.random() * styles.length)],
      draftPhilosophy: draftPhilosophies[Math.floor(Math.random() * draftPhilosophies.length)],
      faApproach: faApproaches[Math.floor(Math.random() * faApproaches.length)],
      tradeActivity: tradeActivities[Math.floor(Math.random() * tradeActivities.length)],
    };
  }

  private generatePriorCareer(
    type: 'gm' | 'coach' | 'scout',
    age: number,
    currentSeason: number
  ): CareerHistoryEntry[] {
    // Generate a plausible career history
    const history: CareerHistoryEntry[] = [];

    if (type === 'gm' && age > 40) {
      // Might have been a scout or assistant GM before
      const scoutYears = Math.floor(Math.random() * 5) + 3;
      history.push({
        teamId: 'various', // Could be specific teams
        role: 'Scout',
        startSeason: currentSeason - age + 25,
        endSeason: currentSeason - age + 25 + scoutYears,
        endReason: 'promoted',
        achievements: [],
      });
    }

    // Add more history generation logic...

    return history;
  }

  private randomInRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private randomSkill(base: number): number {
    const variance = 15;
    return Math.max(1, Math.min(100,
      base + Math.floor(Math.random() * variance * 2) - variance
    ));
  }

  // Similar methods for coaches and scouts...
  generateNewCoaches(count: number, season: number): HeadCoach[] {
    // Implementation similar to generateNewGMs
    return [];
  }

  generateNewScouts(count: number, season: number): Scout[] {
    // Implementation similar to generateNewGMs
    return [];
  }
}

export const personnelGenerator = new PersonnelGenerator();
```

---

## Part 8: Hall of Fame & Legacy

```typescript
interface HallOfFamer {
  personId: string;
  type: "gm" | "coach" | "scout";
  name: string;
  inductionYear: number;

  // Career highlights
  championships: number;
  playoffAppearances: number;
  careerWins?: number;
  careerLosses?: number;

  // Notable achievements
  achievements: string[];

  // Legacy score (for rankings)
  legacyScore: number;
}

interface HallOfFameSystem {
  // Eligibility check (5 years after retirement)
  isEligible(person: RetiredPerson, currentSeason: number): boolean;

  // Calculate HOF probability
  calculateHOFProbability(person: RetiredPerson): number;

  // Process annual HOF class
  processHOFInductions(currentSeason: number): HallOfFamer[];
}

const HOF_THRESHOLDS = {
  gm: {
    minChampionships: 1,
    minPlayoffAppearances: 5,
    minYearsActive: 10,
    eliteWinPercentage: 0.55,
  },
  coach: {
    minChampionships: 1,
    minPlayoffAppearances: 8,
    minWins: 100,
    minWinPercentage: 0.52,
  },
  scout: {
    minYearsActive: 15,
    minAccuracy: 75,
    minHiddenGems: 3,
    minProBowlers: 10,
  },
};
```

---

## Part 9: Implementation Phases

### Phase 7A: Core Database Setup (1 week) ✅ COMPLETE
- [x] Set up Dexie.js with TypeScript (`lib/db/database.ts`)
- [x] Create all table schemas (teams, owners, GMs, coaches, scouts, etc.)
- [x] Implement basic CRUD operations
- [x] Create save/load game functionality (`lib/db/game-initializer.ts`)

### Phase 7B: Personnel Lifecycle (2 weeks) ✅ COMPLETE
- [x] Personnel generation system (`lib/db/personnel-generator.ts`)
- [x] Hiring pool management (`lib/db/lifecycle-manager.ts`)
- [x] Retirement system with age/health/burnout factors
- [x] Season transition processing (`processSeasonEnd()`)

### Phase 7C: Historical Tracking (1 week) ✅ COMPLETE
- [x] Career history tracking (CareerHistoryEntry)
- [x] Draft/trade grade calculations (built into schemas)
- [x] Season records storage (SeasonRecord)
- [x] News/events history (NewsItem)

### Phase 7D: Hall of Fame & Legacy (1 week) ✅ COMPLETE
- [x] HOF eligibility system (`calculateHOFProbability()`)
- [x] Legacy scoring (`calculateLegacyScore()`)
- [x] Historical rankings (RetiredPerson table)
- [x] Achievement tracking

### Phase 7E: Data Migration & Integrity (1 week) 🔄 PENDING
- [ ] Save game versioning
- [ ] Migration scripts
- [ ] Data validation
- [ ] Backup/restore functionality

### Implementation Files Created:
```
lib/db/
├── index.ts                  # Module exports
├── database.ts               # Core Dexie.js database & types
├── personnel-generator.ts    # Generate new GMs, coaches, scouts
├── lifecycle-manager.ts      # Retirement, firing, season transitions
├── personnel-repository.ts   # Hiring, searching, interviews
└── game-initializer.ts       # New game setup with all 32 NFL teams
```

---

## Part 10: Example Queries

```typescript
// Find all available GMs with high drafting skill
const goodDraftingGMs = await db.generalManagers
  .where('status')
  .equals('available')
  .filter(gm => gm.skills.drafting >= 70)
  .toArray();

// Get a team's coaching history
const coachHistory = await db.headCoaches
  .filter(c => c.careerHistory.some(h => h.teamId === teamId))
  .toArray();

// Find scouts about to retire
const nearRetirement = await db.scouts
  .where('status')
  .equals('active')
  .filter(s => s.age >= 60)
  .toArray();

// Get Hall of Famers by championships
const hofByRings = await db.retiredPersonnel
  .filter(p => p.hallOfFame)
  .sortBy('championships');

// Calculate league-wide GM firing rate
const firedGMs = await db.generalManagers
  .filter(gm =>
    gm.careerHistory.some(h =>
      h.endReason === 'fired' &&
      h.endSeason >= currentSeason - 5
    )
  )
  .count();
```

---

This database design provides a solid foundation for tracking the complete lifecycle of all personnel in Gridiron GM, from creation through retirement and potential Hall of Fame induction.
