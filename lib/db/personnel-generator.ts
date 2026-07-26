// @ts-nocheck
import { v4 as uuidv4 } from "uuid";
import {
  GeneralManager,
  HeadCoach,
  Scout,
  Owner,
  GMSkills,
  GMPersonality,
  CoachSkills,
  CoachPersonality,
  CoachBackground,
  OffensiveScheme,
  DefensiveScheme,
  ScoutSkills,
  ScoutType,
  ScoutArchetype,
  OwnerType,
  OwnerPetPeeve,
  OwnerPriority,
  CareerHistoryEntry,
} from "./database";

// ==========================================
// Name Pools
// ==========================================

const FIRST_NAMES = [
  // Traditional
  "Mike", "John", "Bill", "Tom", "Steve", "Dave", "Jim", "Bob", "Dan", "Joe",
  "Chris", "Matt", "Brian", "Kevin", "Jeff", "Mark", "Scott", "Eric", "Ryan", "Jason",
  "Adam", "Aaron", "Brandon", "Derek", "Kyle", "Sean", "Tony", "Nick", "Josh", "Patrick",
  "Greg", "Doug", "Paul", "Pete", "Gary", "Larry", "Terry", "Jerry", "Barry", "Harry",
  // Modern
  "Zach", "Tyler", "Cody", "Austin", "Trevor", "Blake", "Chase", "Cole", "Trent", "Brock",
  "Marcus", "Darius", "Jamal", "DeShawn", "Terrell", "Andre", "Darnell", "Lamar", "Malik", "Tyrone",
  // International
  "Carlos", "Miguel", "Juan", "Jose", "Antonio", "Francisco", "Roberto", "Diego", "Luis", "Rafael",
  "Hiroshi", "Kenji", "Takeshi", "Yuki", "Ryu", "Kai", "Hideo", "Masa", "Shin", "Ken",
];

const LAST_NAMES = [
  // Common
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Wilson", "Moore", "Taylor",
  "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson",
  "Clark", "Rodriguez", "Lewis", "Lee", "Walker", "Hall", "Allen", "Young", "King", "Wright",
  // Football-related
  "Belichick", "Parcells", "Landry", "Shula", "Madden", "Lombardi", "Walsh", "Coughlin", "Holmgren", "Dungy",
  // Regional
  "O'Brien", "McCarthy", "Sullivan", "Murphy", "Kelly", "Ryan", "Fitzgerald", "Kennedy", "Quinn", "Brennan",
  "Gonzalez", "Hernandez", "Lopez", "Sanchez", "Ramirez", "Torres", "Flores", "Rivera", "Morales", "Ortiz",
  // Other common
  "Baker", "Nelson", "Carter", "Mitchell", "Perez", "Roberts", "Turner", "Phillips", "Campbell", "Parker",
  "Evans", "Edwards", "Collins", "Stewart", "Morris", "Murphy", "Cook", "Rogers", "Morgan", "Peterson",
];

// ==========================================
// Generation Rules
// ==========================================

export const GENERATION_RULES = {
  gm: {
    minAge: 35,
    maxAge: 58,
    avgNewPerSeason: 3,
    retirementAge: { min: 58, avg: 65, max: 78 },
    minSalary: 1_000_000,
    maxSalary: 8_000_000,
  },
  coach: {
    minAge: 38,
    maxAge: 62,
    avgNewPerSeason: 4,
    retirementAge: { min: 58, avg: 67, max: 82 },
    minSalary: 3_000_000,
    maxSalary: 15_000_000,
  },
  scout: {
    minAge: 28,
    maxAge: 52,
    avgNewPerSeason: 12,
    retirementAge: { min: 55, avg: 62, max: 70 },
    minSalary: 75_000,
    maxSalary: 350_000,
  },
  owner: {
    minAge: 45,
    maxAge: 75,
    retirementAge: { min: 70, avg: 82, max: 100 },
  },
};

// ==========================================
// Generator Class
// ==========================================

export class PersonnelGenerator {
  private usedNames: Set<string> = new Set();

  constructor(existingNames?: string[]) {
    if (existingNames) {
      existingNames.forEach((name) => this.usedNames.add(name));
    }
  }

  // ==========================================
  // Name Generation
  // ==========================================

  generateName(): { firstName: string; lastName: string } {
    let attempts = 0;
    while (attempts < 100) {
      const firstName = this.randomFrom(FIRST_NAMES);
      const lastName = this.randomFrom(LAST_NAMES);
      const fullName = `${firstName} ${lastName}`;

      if (!this.usedNames.has(fullName)) {
        this.usedNames.add(fullName);
        return { firstName, lastName };
      }
      attempts++;
    }

    // Fallback with suffix
    const firstName = this.randomFrom(FIRST_NAMES);
    const lastName = this.randomFrom(LAST_NAMES);
    const suffix = this.randomFrom(["Jr.", "III", "IV"]);
    return { firstName, lastName: `${lastName} ${suffix}` };
  }

  // ==========================================
  // GM Generation
  // ==========================================

  generateGM(season: number, options?: Partial<GeneralManager>): GeneralManager {
    const { firstName, lastName } = this.generateName();
    const age = options?.age ?? this.randomInRange(GENERATION_RULES.gm.minAge, GENERATION_RULES.gm.maxAge);

    const gm: GeneralManager = {
      id: options?.id ?? `gm_${uuidv4()}`,
      type: "gm",
      firstName: options?.firstName ?? firstName,
      lastName: options?.lastName ?? lastName,
      age,
      birthYear: season - age,
      status: options?.status ?? "available",
      portraitSeed: Math.floor(Math.random() * 1_000_000),
      careerHistory: options?.careerHistory ?? this.generateGMCareerHistory(age, season),
      createdInSeason: season,

      skills: options?.skills ?? this.generateGMSkills(age),
      personality: options?.personality ?? this.generateGMPersonality(),

      draftHistory: options?.draftHistory ?? [],
      tradeHistory: options?.tradeHistory ?? [],

      careerWins: options?.careerWins ?? 0,
      careerLosses: options?.careerLosses ?? 0,
      careerTies: options?.careerTies ?? 0,
      playoffAppearances: options?.playoffAppearances ?? 0,
      championships: options?.championships ?? 0,

      currentTeamId: options?.currentTeamId ?? null,
      contractYearsRemaining: options?.contractYearsRemaining ?? 0,
      salary: options?.salary ?? 0,

      leagueReputation: options?.leagueReputation ?? this.randomInRange(40, 60),
      mediaPerception: options?.mediaPerception ?? this.randomInRange(40, 60),
    };

    return gm;
  }

  generateGMs(count: number, season: number): GeneralManager[] {
    return Array.from({ length: count }, () => this.generateGM(season));
  }

  private generateGMSkills(age: number): GMSkills {
    const experienceBonus = Math.min((age - 30) * 1.2, 20);
    const baseSkill = 45 + experienceBonus;

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
    return {
      riskTolerance: this.randomInRange(20, 80),
      buildingStyle: this.randomFrom(["win_now", "balanced", "rebuild"]),
      draftPhilosophy: this.randomFrom(["best_available", "need_based", "trade_back", "trade_up"]),
      faApproach: this.randomFrom(["aggressive", "selective", "conservative"]),
      tradeActivity: this.randomFrom(["very_active", "moderate", "rarely_trades"]),
    };
  }

  private generateGMCareerHistory(age: number, currentSeason: number): CareerHistoryEntry[] {
    const history: CareerHistoryEntry[] = [];

    // Most GMs have prior scouting/front office experience
    if (age > 38) {
      const yearsAgo = age - 30;
      const scoutingYears = this.randomInRange(4, 8);

      history.push({
        teamId: "prior_team",
        teamName: "Previous Organization",
        role: "Scout / Personnel",
        startSeason: currentSeason - yearsAgo,
        endSeason: currentSeason - yearsAgo + scoutingYears,
        endReason: "promoted",
        achievements: [],
      });

      // Some have assistant GM experience
      if (age > 42 && Math.random() > 0.4) {
        const asstGMYears = this.randomInRange(2, 5);
        history.push({
          teamId: "prior_team_2",
          teamName: "Previous Organization",
          role: "Assistant GM",
          startSeason: currentSeason - yearsAgo + scoutingYears,
          endSeason: currentSeason - yearsAgo + scoutingYears + asstGMYears,
          endReason: "hired_away",
          achievements: [],
        });
      }
    }

    return history;
  }

  // ==========================================
  // Coach Generation
  // ==========================================

  generateCoach(season: number, options?: Partial<HeadCoach>): HeadCoach {
    const { firstName, lastName } = this.generateName();
    const age = options?.age ?? this.randomInRange(GENERATION_RULES.coach.minAge, GENERATION_RULES.coach.maxAge);
    const background = options?.background ?? this.randomFrom<CoachBackground>([
      "offensive_coordinator",
      "defensive_coordinator",
      "position_coach",
      "college_coach",
      "qb_guru",
      "defensive_mastermind",
    ]);

    // Scheme tends to match background
    const offensiveScheme = options?.offensiveScheme ?? this.getSchemeForBackground(background, "offense");
    const defensiveScheme = options?.defensiveScheme ?? this.getSchemeForBackground(background, "defense");

    const coach: HeadCoach = {
      id: options?.id ?? `coach_${uuidv4()}`,
      type: "coach",
      firstName: options?.firstName ?? firstName,
      lastName: options?.lastName ?? lastName,
      age,
      birthYear: season - age,
      status: options?.status ?? "available",
      portraitSeed: Math.floor(Math.random() * 1_000_000),
      careerHistory: options?.careerHistory ?? this.generateCoachCareerHistory(age, season, background),
      createdInSeason: season,

      background,
      offensiveScheme: offensiveScheme as OffensiveScheme,
      defensiveScheme: defensiveScheme as DefensiveScheme,

      skills: options?.skills ?? this.generateCoachSkills(age, background),
      personality: options?.personality ?? this.generateCoachPersonality(),

      careerWins: options?.careerWins ?? 0,
      careerLosses: options?.careerLosses ?? 0,
      careerTies: options?.careerTies ?? 0,
      playoffWins: options?.playoffWins ?? 0,
      playoffLosses: options?.playoffLosses ?? 0,
      championships: options?.championships ?? 0,
      coachOfYearAwards: options?.coachOfYearAwards ?? 0,

      currentTeamId: options?.currentTeamId ?? null,
      contractYearsRemaining: options?.contractYearsRemaining ?? 0,
      salary: options?.salary ?? 0,

      coachingTree: options?.coachingTree ?? [],
      mentorId: options?.mentorId,
    };

    return coach;
  }

  generateCoaches(count: number, season: number): HeadCoach[] {
    return Array.from({ length: count }, () => this.generateCoach(season));
  }

  private getSchemeForBackground(
    background: CoachBackground,
    side: "offense" | "defense"
  ): string {
    if (side === "offense") {
      switch (background) {
        case "offensive_coordinator":
        case "qb_guru":
          return this.randomFrom(["west_coast", "spread", "air_raid", "rpo_heavy"]);
        case "defensive_coordinator":
        case "defensive_mastermind":
          return this.randomFrom(["balanced", "pro_style", "power_run"]);
        default:
          return this.randomFrom(["west_coast", "spread", "air_raid", "pro_style", "power_run", "zone_run", "rpo_heavy", "balanced"]);
      }
    } else {
      switch (background) {
        case "defensive_coordinator":
        case "defensive_mastermind":
          return this.randomFrom(["aggressive_blitz", "multiple", "man_heavy"]);
        case "offensive_coordinator":
        case "qb_guru":
          return this.randomFrom(["cover_2", "cover_3", "zone_heavy"]);
        default:
          return this.randomFrom(["4-3_base", "3-4_base", "multiple", "cover_2", "cover_3", "man_heavy", "zone_heavy", "aggressive_blitz"]);
      }
    }
  }

  private generateCoachSkills(age: number, background: CoachBackground): CoachSkills {
    const experienceBonus = Math.min((age - 35) * 1.0, 15);
    const baseSkill = 45 + experienceBonus;

    const skills: CoachSkills = {
      gameManagement: this.randomSkill(baseSkill),
      playerDevelopment: this.randomSkill(baseSkill),
      playDesign: this.randomSkill(baseSkill),
      adjustments: this.randomSkill(baseSkill),
      motivation: this.randomSkill(baseSkill),
      discipline: this.randomSkill(baseSkill),
      talentEvaluation: this.randomSkill(baseSkill),
      mediaRelations: this.randomSkill(baseSkill),
    };

    // Background bonuses
    switch (background) {
      case "offensive_coordinator":
        skills.playDesign += 10;
        break;
      case "defensive_coordinator":
        skills.adjustments += 10;
        break;
      case "qb_guru":
        skills.playerDevelopment += 10;
        break;
      case "defensive_mastermind":
        skills.playDesign += 8;
        skills.adjustments += 8;
        break;
      case "college_coach":
        skills.motivation += 10;
        break;
    }

    // Cap skills at 99
    Object.keys(skills).forEach((key) => {
      skills[key as keyof CoachSkills] = Math.min(99, skills[key as keyof CoachSkills]);
    });

    return skills;
  }

  private generateCoachPersonality(): CoachPersonality {
    return {
      temperament: this.randomFrom(["fiery", "calm", "players_coach", "disciplinarian"]),
      riskTaking: this.randomInRange(20, 80),
      adaptability: this.randomInRange(30, 80),
      egoLevel: this.randomInRange(20, 80),
      loyaltyToPlayers: this.randomInRange(30, 80),
    };
  }

  private generateCoachCareerHistory(
    age: number,
    currentSeason: number,
    background: CoachBackground
  ): CareerHistoryEntry[] {
    const history: CareerHistoryEntry[] = [];

    // All coaches have position coach experience
    if (age > 40) {
      const yearsAgo = age - 28;
      const positionCoachYears = this.randomInRange(5, 10);

      history.push({
        teamId: "prior_team",
        teamName: "Previous Organization",
        role: background === "college_coach" ? "College Assistant" : "Position Coach",
        startSeason: currentSeason - yearsAgo,
        endSeason: currentSeason - yearsAgo + positionCoachYears,
        endReason: "promoted",
        achievements: [],
      });

      // Coordinator experience
      if (age > 45 && background !== "college_coach") {
        const coordYears = this.randomInRange(3, 6);
        const coordRole =
          background === "defensive_coordinator" || background === "defensive_mastermind"
            ? "Defensive Coordinator"
            : "Offensive Coordinator";

        history.push({
          teamId: "prior_team_2",
          teamName: "Previous Organization",
          role: coordRole,
          startSeason: currentSeason - yearsAgo + positionCoachYears,
          endSeason: currentSeason - yearsAgo + positionCoachYears + coordYears,
          endReason: "hired_away",
          achievements: [],
        });
      }
    }

    return history;
  }

  // ==========================================
  // Scout Generation
  // ==========================================

  generateScout(season: number, options?: Partial<Scout>): Scout {
    const { firstName, lastName } = this.generateName();
    const age = options?.age ?? this.randomInRange(GENERATION_RULES.scout.minAge, GENERATION_RULES.scout.maxAge);
    const scoutType = options?.scoutType ?? this.randomFrom<ScoutType>([
      "national",
      "regional",
      "pro_personnel",
      "analytics",
    ]);
    const archetype = options?.archetype ?? this.randomFrom<ScoutArchetype>([
      "evaluator",
      "tape_grinder",
      "character_coach",
      "athletic_analyst",
      "regional_specialist",
    ]);

    const scout: Scout = {
      id: options?.id ?? `scout_${uuidv4()}`,
      type: "scout",
      firstName: options?.firstName ?? firstName,
      lastName: options?.lastName ?? lastName,
      age,
      birthYear: season - age,
      status: options?.status ?? "available",
      portraitSeed: Math.floor(Math.random() * 1_000_000),
      careerHistory: options?.careerHistory ?? [],
      createdInSeason: season,

      scoutType,
      archetype,
      skills: options?.skills ?? this.generateScoutSkills(age, archetype),

      evaluationHistory: options?.evaluationHistory ?? [],
      overallAccuracy: options?.overallAccuracy ?? this.randomInRange(55, 75),

      positionStrengths: options?.positionStrengths ?? this.generatePositionStrengths(archetype),
      positionWeaknesses: options?.positionWeaknesses ?? this.generatePositionWeaknesses(archetype),
      regionalExpertise: options?.regionalExpertise ?? this.generateRegionalExpertise(scoutType),

      currentTeamId: options?.currentTeamId ?? null,
      salary: options?.salary ?? this.randomInRange(
        GENERATION_RULES.scout.minSalary,
        GENERATION_RULES.scout.maxSalary
      ),

      morale: options?.morale ?? this.randomInRange(60, 85),
      loyalty: options?.loyalty ?? this.randomInRange(50, 75),
      yearsWithCurrentTeam: options?.yearsWithCurrentTeam ?? 0,
    };

    return scout;
  }

  generateScouts(count: number, season: number): Scout[] {
    return Array.from({ length: count }, () => this.generateScout(season));
  }

  private generateScoutSkills(age: number, archetype: ScoutArchetype): ScoutSkills {
    const experienceBonus = Math.min((age - 25) * 0.8, 15);
    const baseSkill = 45 + experienceBonus;

    const skills: ScoutSkills = {
      athleticEvaluation: this.randomSkill(baseSkill),
      technicalEvaluation: this.randomSkill(baseSkill),
      characterAssessment: this.randomSkill(baseSkill),
      injuryAssessment: this.randomSkill(baseSkill),
      projectability: this.randomSkill(baseSkill),
      workEthic: this.randomSkill(baseSkill),
      networking: this.randomSkill(baseSkill),
    };

    // Archetype bonuses
    switch (archetype) {
      case "athletic_analyst":
        skills.athleticEvaluation += 15;
        break;
      case "tape_grinder":
        skills.technicalEvaluation += 15;
        break;
      case "character_coach":
        skills.characterAssessment += 15;
        break;
      case "medical_expert":
        skills.injuryAssessment += 20;
        break;
      case "regional_specialist":
        skills.networking += 15;
        break;
    }

    // Cap at 99
    Object.keys(skills).forEach((key) => {
      skills[key as keyof ScoutSkills] = Math.min(99, skills[key as keyof ScoutSkills]);
    });

    return skills;
  }

  private generatePositionStrengths(archetype: ScoutArchetype): string[] {
    const allPositions = ["QB", "RB", "WR", "TE", "OT", "OG", "C", "DE", "DT", "LB", "CB", "S"];

    switch (archetype) {
      case "athletic_analyst":
        return this.randomSubset(["RB", "WR", "CB", "S", "DE"], 2, 3);
      case "tape_grinder":
        return this.randomSubset(["QB", "OT", "OG", "C", "LB"], 2, 3);
      case "character_coach":
        return this.randomSubset(["QB", "LB", "TE"], 1, 2);
      default:
        return this.randomSubset(allPositions, 2, 4);
    }
  }

  private generatePositionWeaknesses(archetype: ScoutArchetype): string[] {
    const allPositions = ["QB", "RB", "WR", "TE", "OT", "OG", "C", "DE", "DT", "LB", "CB", "S"];
    return this.randomSubset(allPositions, 1, 2);
  }

  private generateRegionalExpertise(scoutType: ScoutType): string[] {
    const regions = ["Northeast", "Southeast", "Midwest", "Southwest", "West Coast", "Northwest"];

    switch (scoutType) {
      case "national":
        return this.randomSubset(regions, 3, 5);
      case "regional":
        return this.randomSubset(regions, 1, 2);
      case "international":
        return ["International", "Canada", ...this.randomSubset(regions, 0, 1)];
      default:
        return this.randomSubset(regions, 2, 3);
    }
  }

  // ==========================================
  // Owner Generation
  // ==========================================

  generateOwner(season: number, teamId: string, options?: Partial<Owner>): Owner {
    const { firstName, lastName } = this.generateName();
    const age = options?.age ?? this.randomInRange(GENERATION_RULES.owner.minAge, GENERATION_RULES.owner.maxAge);
    const ownerType = options?.ownerType ?? this.randomFrom<OwnerType>([
      "win_now",
      "patient_builder",
      "meddler",
      "hands_off",
      "penny_pincher",
      "big_spender",
      "legacy_obsessed",
      "new_money",
      "family_tradition",
    ]);

    const owner: Owner = {
      id: options?.id ?? `owner_${uuidv4()}`,
      type: "owner",
      firstName: options?.firstName ?? firstName,
      lastName: options?.lastName ?? lastName,
      age,
      birthYear: season - age,
      status: "active",
      portraitSeed: Math.floor(Math.random() * 1_000_000),
      careerHistory: [],
      createdInSeason: season,

      ownerType,
      wealth: options?.wealth ?? this.randomFrom(["billionaire", "multi_billionaire", "mega_billionaire"]),
      ownershipStyle: options?.ownershipStyle ?? this.randomFrom(["inherited", "self_made", "corporate", "consortium"]),

      spendingWillingness: options?.spendingWillingness ?? this.getSpendingForType(ownerType),
      patienceLevel: options?.patienceLevel ?? this.getPatienceForType(ownerType),
      meddlingTendency: options?.meddlingTendency ?? this.getMeddlingForType(ownerType),
      mediaPresence: options?.mediaPresence ?? this.randomInRange(20, 80),

      currentTeamId: teamId,
      satisfactionHistory: [],

      petPeeves: options?.petPeeves ?? this.getPetPeevesForType(ownerType),
      priorities: options?.priorities ?? this.getPrioritiesForType(ownerType),

      metrics: options?.metrics ?? {
        trust: 50,
        satisfaction: 50,
        patience: this.getPatienceForType(ownerType),
      },
      seatTemperature: "stable",
    };

    return owner;
  }

  private getSpendingForType(ownerType: OwnerType): number {
    switch (ownerType) {
      case "big_spender":
      case "win_now":
      case "new_money":
        return this.randomInRange(70, 95);
      case "penny_pincher":
        return this.randomInRange(15, 35);
      default:
        return this.randomInRange(40, 70);
    }
  }

  private getPatienceForType(ownerType: OwnerType): number {
    switch (ownerType) {
      case "patient_builder":
      case "hands_off":
      case "family_tradition":
        return this.randomInRange(70, 90);
      case "win_now":
      case "meddler":
      case "new_money":
        return this.randomInRange(20, 40);
      default:
        return this.randomInRange(40, 60);
    }
  }

  private getMeddlingForType(ownerType: OwnerType): number {
    switch (ownerType) {
      case "meddler":
        return this.randomInRange(75, 95);
      case "hands_off":
        return this.randomInRange(5, 20);
      case "legacy_obsessed":
      case "win_now":
        return this.randomInRange(50, 70);
      default:
        return this.randomInRange(25, 50);
    }
  }

  private getPetPeevesForType(ownerType: OwnerType): OwnerPetPeeve[] {
    const peeves: Record<OwnerType, OwnerPetPeeve[]> = {
      win_now: ["losing_seasons", "missed_playoffs", "boring_offense"],
      patient_builder: ["bad_press", "player_drama", "cap_hell"],
      meddler: ["no_splash_moves", "boring_offense", "empty_stadium"],
      hands_off: ["player_drama", "bad_press"],
      penny_pincher: ["cap_hell", "no_splash_moves"],
      big_spender: ["boring_offense", "empty_stadium", "losing_seasons"],
      legacy_obsessed: ["bad_press", "losing_seasons", "draft_busts"],
      new_money: ["empty_stadium", "boring_offense", "bad_press"],
      family_tradition: ["player_drama", "bad_press", "losing_seasons"],
    };
    return peeves[ownerType] ?? ["losing_seasons"];
  }

  private getPrioritiesForType(ownerType: OwnerType): OwnerPriority[] {
    const priorities: Record<OwnerType, OwnerPriority[]> = {
      win_now: ["championships", "star_players", "playoffs"],
      patient_builder: ["draft_picks", "fiscal_responsibility", "winning_record"],
      meddler: ["star_players", "fan_excitement", "championships"],
      hands_off: ["winning_record", "community_image"],
      penny_pincher: ["fiscal_responsibility", "draft_picks"],
      big_spender: ["star_players", "championships", "fan_excitement"],
      legacy_obsessed: ["championships", "community_image", "winning_record"],
      new_money: ["fan_excitement", "star_players", "playoffs"],
      family_tradition: ["community_image", "winning_record", "championships"],
    };
    return priorities[ownerType] ?? ["winning_record"];
  }

  // ==========================================
  // Utility Methods
  // ==========================================

  private randomFrom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private randomInRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private randomSkill(base: number): number {
    const variance = 15;
    const result = base + Math.floor(Math.random() * variance * 2) - variance;
    return Math.max(1, Math.min(99, result));
  }

  private randomSubset<T>(arr: T[], min: number, max: number): T[] {
    const count = this.randomInRange(min, max);
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }
}

// Export singleton
export const personnelGenerator = new PersonnelGenerator();
