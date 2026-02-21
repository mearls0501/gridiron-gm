import {
  SeasonTransitionInput,
  SeasonTransitionOutput,
  SeasonDevelopmentResult,
  GMSeasonResult,
  CoachSeasonResult,
  ScoutSeasonResult,
  SeasonHeadline,
  RetirementReason,
  PlayerProgressionState,
  GMProgressionState,
  CoachProgressionState,
  ScoutProgressionState,
} from "./development-types";
import {
  processPlayerSeason,
  evaluateRetirement,
  PlayerForDevelopment,
} from "./player-development";
import {
  processGMSeason,
  processCoachSeason,
  processScoutSeason,
  GMSeasonContext,
  CoachSeasonContext,
  ScoutSeasonContext,
} from "./staff-development";
import { positionToGroup, POSITION_AGE_CURVES } from "./age-curves";

// ==========================================
// Season Transition Engine
// ==========================================

export interface SeasonTransitionConfig {
  enableRetirements: boolean;
  enableFirings: boolean;
  generateHeadlines: boolean;
  strictMode: boolean; // More realistic thresholds
}

const DEFAULT_CONFIG: SeasonTransitionConfig = {
  enableRetirements: true,
  enableFirings: true,
  generateHeadlines: true,
  strictMode: false,
};

/**
 * Main season transition processor
 * Call this at the end of each season to update all entities
 */
export function processSeasonTransition(
  input: SeasonTransitionInput,
  contexts: {
    gmContexts: Map<string, GMSeasonContext>;
    coachContexts: Map<string, CoachSeasonContext>;
    scoutContexts: Map<string, ScoutSeasonContext>;
    playerContexts: Map<string, {
      player: PlayerForDevelopment;
      teamId: string;
      factors: import("./development-types").DevelopmentFactors;
    }>;
  },
  config: Partial<SeasonTransitionConfig> = {}
): SeasonTransitionOutput {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  const output: SeasonTransitionOutput = {
    season: input.season,
    playerResults: [],
    gmResults: [],
    coachResults: [],
    scoutResults: [],
    retirements: [],
    firings: [],
    hiringNeeds: [],
    headlines: [],
  };

  // ==========================================
  // Process Players
  // ==========================================
  for (const [playerId, ctx] of contexts.playerContexts) {
    const state = input.players.find((p) => p.playerId === playerId);
    if (!state) continue;

    // Process development
    const result = processPlayerSeason(
      state,
      ctx.player.position,
      ctx.player.attributes,
      ctx.factors
    );
    output.playerResults.push(result);

    // Check for retirement
    if (finalConfig.enableRetirements) {
      const retirementCheck = evaluateRetirement(
        {
          name: ctx.player.name,
          age: ctx.player.age,
          position: ctx.player.position,
          currentOVR: result.newOVR,
          careerEarnings: 0, // Would come from contract system
          championships: 0, // Would come from career stats
          allProSelections: 0,
          yearsInLeague: ctx.player.yearsInLeague,
        },
        {
          hasContract: true, // Would check contract status
          marketInterest: result.newOVR >= 60,
          injuredLastSeason: ctx.factors.currentInjury,
          majorInjuryHistory: ctx.factors.injuryHistorySeverity > 50,
          familyConsiderations: Math.random() < 0.1,
        }
      );

      if (retirementCheck.willRetire) {
        output.retirements.push({
          entityType: "player",
          entityId: playerId,
          name: ctx.player.name,
          age: ctx.player.age,
          reason: mapRetirementReason(retirementCheck.reason || ""),
          hallOfFameEligible: checkHOFEligibility(ctx.player),
        });
      }
    }

    // Generate headlines
    if (finalConfig.generateHeadlines) {
      const headlines = generatePlayerHeadlines(ctx.player, result);
      output.headlines.push(...headlines);
    }
  }

  // ==========================================
  // Process GMs
  // ==========================================
  for (const gm of input.gms) {
    const context = contexts.gmContexts.get(gm.gmId);
    if (!context) continue;

    const result = processGMSeason(gm, context);
    output.gmResults.push(result);

    // Check for firing
    if (finalConfig.enableFirings && result.fireRisk > 50) {
      const fired = Math.random() < result.fireRisk / 100;
      if (fired) {
        output.firings.push({
          entityType: "gm",
          entityId: gm.gmId,
          name: `GM ${gm.gmId}`, // Would have name from DB
          teamId: context.ownerExpectations === "championship" ? "championship_team" : "team",
          reason: result.hotSeat ? "Failed to meet expectations" : "Philosophical differences",
        });

        output.hiringNeeds.push({
          teamId: "team", // Would be actual team ID
          position: "gm",
          urgency: "immediate",
        });
      }
    }

    // GM retirement (rare but happens)
    if (finalConfig.enableRetirements && gm.yearsExperience > 20) {
      const retireChance = (gm.yearsExperience - 20) * 0.05;
      if (Math.random() < retireChance) {
        output.retirements.push({
          entityType: "gm",
          entityId: gm.gmId,
          name: `GM ${gm.gmId}`,
          age: 50 + gm.yearsExperience,
          reason: "age",
          hallOfFameEligible: gm.trackRecord.championships > 0,
        });
      }
    }
  }

  // ==========================================
  // Process Coaches
  // ==========================================
  for (const coach of input.coaches) {
    const context = contexts.coachContexts.get(coach.coachId);
    if (!context) continue;

    const result = processCoachSeason(coach, context);
    output.coachResults.push(result);

    // Check for firing
    if (finalConfig.enableFirings && result.fireRisk > 50) {
      const fired = Math.random() < result.fireRisk / 100;
      if (fired) {
        output.firings.push({
          entityType: "coach",
          entityId: coach.coachId,
          name: `Coach ${coach.coachId}`,
          teamId: "team",
          reason: generateFiringReason(result),
        });

        output.hiringNeeds.push({
          teamId: "team",
          position: "coach",
          urgency: "offseason",
        });

        // Generate headline
        if (finalConfig.generateHeadlines) {
          output.headlines.push({
            type: "firing",
            entityId: coach.coachId,
            entityName: `Coach ${coach.coachId}`,
            headline: `Coach fired after ${context.wins}-${context.losses} season`,
            subheadline: generateFiringReason(result),
            importance: "major",
          });
        }
      }
    }
  }

  // ==========================================
  // Process Scouts
  // ==========================================
  for (const scout of input.scouts) {
    const context = contexts.scoutContexts.get(scout.scoutId);
    if (!context) continue;

    const result = processScoutSeason(scout, context);
    output.scoutResults.push(result);

    // Scout firing (rare)
    if (finalConfig.enableFirings && result.fireRisk > 0) {
      const fired = Math.random() < result.fireRisk / 100;
      if (fired) {
        output.firings.push({
          entityType: "scout",
          entityId: scout.scoutId,
          name: `Scout ${scout.scoutId}`,
          teamId: "team",
          reason: "Poor evaluation accuracy",
        });

        output.hiringNeeds.push({
          teamId: "team",
          position: "scout",
          urgency: "offseason",
        });
      }
    }

    // Scout retirement
    if (finalConfig.enableRetirements && scout.yearsExperience > 25) {
      const retireChance = (scout.yearsExperience - 25) * 0.08;
      if (Math.random() < retireChance) {
        output.retirements.push({
          entityType: "scout",
          entityId: scout.scoutId,
          name: `Scout ${scout.scoutId}`,
          age: 50 + scout.yearsExperience,
          reason: "age",
          hallOfFameEligible: false,
        });
      }
    }
  }

  // Sort headlines by importance
  output.headlines.sort((a, b) => {
    if (a.importance === "major" && b.importance !== "major") return -1;
    if (a.importance !== "major" && b.importance === "major") return 1;
    return 0;
  });

  return output;
}

// ==========================================
// Helper Functions
// ==========================================

function mapRetirementReason(reason: string): RetirementReason {
  if (reason.includes("health")) return "injury";
  if (reason.includes("family")) return "family";
  if (reason.includes("champion")) return "on_top";
  if (reason.includes("sign")) return "pursue_other_opportunities";
  if (reason.includes("age")) return "age";
  return "age";
}

function checkHOFEligibility(player: PlayerForDevelopment): boolean {
  // Simple check - would be more sophisticated
  return player.currentOVR >= 90 && player.yearsInLeague >= 10;
}

function generatePlayerHeadlines(
  player: PlayerForDevelopment,
  result: SeasonDevelopmentResult
): SeasonHeadline[] {
  const headlines: SeasonHeadline[] = [];

  // Breakout season
  if (result.breakoutCandidate && result.ovrChange >= 5) {
    headlines.push({
      type: "breakout",
      entityId: player.playerId,
      entityName: player.name,
      headline: `${player.name} emerges as breakout star`,
      subheadline: `Improved ${result.ovrChange} points to ${result.newOVR} OVR`,
      importance: result.ovrChange >= 8 ? "major" : "minor",
    });
  }

  // Bust confirmation
  if (
    result.trajectoryChange?.new === "bust" &&
    result.trajectoryChange.previous !== "bust"
  ) {
    headlines.push({
      type: "bust",
      entityId: player.playerId,
      entityName: player.name,
      headline: `${player.name}'s struggles continue`,
      subheadline: result.trajectoryChange.reason,
      importance: "minor",
    });
  }

  // Veteran decline
  if (result.declineWarning) {
    headlines.push({
      type: "decline",
      entityId: player.playerId,
      entityName: player.name,
      headline: `Father Time catching up to ${player.name}`,
      subheadline: `Declined ${Math.abs(result.ovrChange)} points to ${result.newOVR} OVR`,
      importance: Math.abs(result.ovrChange) >= 5 ? "major" : "minor",
    });
  }

  // Career resurrection (for player who was a bust)
  if (
    result.trajectoryChange?.previous === "bust" &&
    result.trajectoryChange.new !== "bust"
  ) {
    headlines.push({
      type: "resurrection",
      entityId: player.playerId,
      entityName: player.name,
      headline: `${player.name}'s career resurrection`,
      subheadline: result.trajectoryChange.reason,
      importance: "major",
    });
  }

  return headlines;
}

function generateFiringReason(result: CoachSeasonResult): string {
  if (result.ownerTrust < 25) {
    return "Lost the confidence of ownership";
  }
  if (result.gmTrust < 30) {
    return "Philosophical differences with front office";
  }
  if (result.wins < 5) {
    return `${result.wins}-${result.losses} record unacceptable`;
  }
  return "Time for a new direction";
}

// ==========================================
// Batch Processing Utilities
// ==========================================

/**
 * Process all teams in the league
 */
export function processLeagueSeasonEnd(
  teams: {
    teamId: string;
    players: PlayerForDevelopment[];
    gm: GMProgressionState;
    coach: CoachProgressionState;
    scouts: ScoutProgressionState[];
    seasonResults: {
      wins: number;
      losses: number;
      pointsFor: number;
      pointsAgainst: number;
      playoffResult?: string;
      draftGrade: string;
    };
  }[],
  season: number
): Map<string, SeasonTransitionOutput> {
  const results = new Map<string, SeasonTransitionOutput>();

  for (const team of teams) {
    // Build contexts (simplified - would be more detailed in real use)
    const gmContext: GMSeasonContext = {
      season,
      teamWins: team.seasonResults.wins,
      teamLosses: team.seasonResults.losses,
      playoffResult: team.seasonResults.playoffResult as any,
      draftGrade: team.seasonResults.draftGrade,
      draftPicks: [], // Would come from draft results
      trades: [],
      freeAgencyMoves: [],
      capSituation: {
        currentCap: 250_000_000,
        usedCap: 220_000_000,
        deadCap: 10_000_000,
        futureFlexibility: 60,
      },
      ownerExpectations: "compete",
      ownerPatience: 60,
    };

    const coachContext: CoachSeasonContext = {
      season,
      wins: team.seasonResults.wins,
      losses: team.seasonResults.losses,
      ties: 0,
      pointsFor: team.seasonResults.pointsFor,
      pointsAgainst: team.seasonResults.pointsAgainst,
      playoffResult: team.seasonResults.playoffResult,
      playerDevelopment: [],
      schemeEffectiveness: {
        offensiveRank: 16,
        defensiveRank: 16,
        specialTeamsRank: 16,
      },
      inGameDecisions: {
        challengeWinRate: 0.5,
        fourthDownSuccessRate: 0.5,
        timeoutEfficiency: 60,
      },
      halftimeAdjustments: 0,
      closeGameRecord: { wins: 3, losses: 3 },
      blowoutWins: 2,
      blowoutLosses: 1,
      gmRelationship: 60,
      ownerExpectations: "compete",
    };

    const input: SeasonTransitionInput = {
      season,
      players: team.players.map((p) => ({
        playerId: p.playerId,
        currentAge: p.age,
        yearsInLeague: p.yearsInLeague,
        careerPhase: "prime" as const,
        trajectory: p.trajectory,
        potentialOVR: p.potentialOVR,
        currentOVR: p.currentOVR,
        ceilingRemaining: p.potentialOVR - p.currentOVR,
        developmentRate: 1.0,
        injuryHistory: p.injuryHistory,
        durabilityRating: 75,
        schemeFitLevel: 60,
        playingTimePercent: 50,
        coachDevelopmentBonus: 0.1,
      })),
      gms: [team.gm],
      coaches: [team.coach],
      scouts: team.scouts,
      teamResults: new Map([[team.teamId, {
        teamId: team.teamId,
        wins: team.seasonResults.wins,
        losses: team.seasonResults.losses,
        ties: 0,
        pointsFor: team.seasonResults.pointsFor,
        pointsAgainst: team.seasonResults.pointsAgainst,
        playoffResult: team.seasonResults.playoffResult as any,
        draftGrade: team.seasonResults.draftGrade,
      }]]),
      draftResults: new Map(),
    };

    // Build player contexts
    const playerContexts = new Map();
    for (const player of team.players) {
      playerContexts.set(player.playerId, {
        player,
        teamId: team.teamId,
        factors: {
          age: player.age,
          yearsInLeague: player.yearsInLeague,
          positionGroup: positionToGroup(player.position),
          playingTimePercent: 50,
          starterStatus: player.currentOVR >= 75,
          performanceRating: 50,
          schemeFit: 60,
          coachDevelopmentSkill: 65,
          schemeStability: true,
          currentInjury: false,
          injuryHistorySeverity: 0,
          durabilityRating: 75,
          workEthic: 70,
          footballIQ: 65,
          coachability: 70,
          teamQuality: 60,
          veteranMentors: true,
          competitionLevel: 60,
        },
      });
    }

    // Build scout contexts
    const scoutContexts = new Map();
    for (const scout of team.scouts) {
      scoutContexts.set(scout.scoutId, {
        season,
        reportsSubmitted: [],
        travelMiles: 25000,
        proScoutingEvents: 5,
        collegeSessions: 20,
        networkingEvents: 8,
      });
    }

    const output = processSeasonTransition(input, {
      gmContexts: new Map([[team.gm.gmId, gmContext]]),
      coachContexts: new Map([[team.coach.coachId, coachContext]]),
      scoutContexts,
      playerContexts,
    });

    results.set(team.teamId, output);
  }

  return results;
}

// ==========================================
// Age All Entities
// ==========================================

/**
 * Increment age for all entities at season end
 */
export function ageEntities(
  players: { playerId: string; age: number; yearsInLeague: number }[],
  staff: { id: string; age: number; yearsExperience: number }[]
): {
  agedPlayers: { playerId: string; newAge: number; newYearsInLeague: number }[];
  agedStaff: { id: string; newAge: number; newYearsExperience: number }[];
} {
  return {
    agedPlayers: players.map((p) => ({
      playerId: p.playerId,
      newAge: p.age + 1,
      newYearsInLeague: p.yearsInLeague + 1,
    })),
    agedStaff: staff.map((s) => ({
      id: s.id,
      newAge: s.age + 1,
      newYearsExperience: s.yearsExperience + 1,
    })),
  };
}
