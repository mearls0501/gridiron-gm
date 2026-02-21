import { supabase } from "@/lib/supabase-client";
import {
  SimulationConfig,
  GameResult,
  TeamWithRoster,
  Player,
  Play,
} from "./types";
import { calculateTeamStrength } from "./team-strength";
import { simulatePlay } from "./outcome-generator";
import { simulatePlayEnhanced } from "./enhanced-outcome-generator";
import { PlayerStatsTracker } from "./player-performance";
import { calculatePerformanceRating } from "./rating-calculator";
import { calculateFinalScores } from "./scoring-adjuster";
import { CoachingStaff, Coach, validateCoachingStaff } from "./coaching-influence";

/**
 * Load a team's coaching staff from the database
 * Queries coach_team_assignments joined with coaches table
 */
export async function loadTeamCoachingStaff(
  teamId: string,
  saveGameId: string
): Promise<CoachingStaff> {
  // Query coach_team_assignments joined with coaches
  const { data: assignments, error } = await supabase
    .from("coach_team_assignments")
    .select(`
      coach_id,
      coaches (*)
    `)
    .eq("team_id", teamId)
    .eq("save_game_id", saveGameId);

  if (error) {
    throw new Error(
      `Failed to load coaching staff for team ${teamId}: ${error.message}`
    );
  }

  if (!assignments || assignments.length === 0) {
    throw new Error(
      `No coaches assigned to team ${teamId} in save game ${saveGameId}. Please assign coaches before simulating.`
    );
  }

  // Extract coaches by role
  const coachesData = assignments
    .map((assignment: any) => assignment.coaches)
    .filter(Boolean) as Coach[];

  const headCoach = coachesData.find((c) => 
    c.role === 'head_coach' || c.role === 'HC'
  );
  const offensiveCoordinator = coachesData.find((c) => 
    c.role === 'offensive_coordinator' || c.role === 'OC'
  );
  const defensiveCoordinator = coachesData.find((c) => 
    c.role === 'defensive_coordinator' || c.role === 'DC'
  );

  // Validate all required coaches exist
  if (!headCoach) {
    throw new Error(
      `Team ${teamId} is missing a head coach in save game ${saveGameId}`
    );
  }
  if (!offensiveCoordinator) {
    throw new Error(
      `Team ${teamId} is missing an offensive coordinator in save game ${saveGameId}`
    );
  }
  if (!defensiveCoordinator) {
    throw new Error(
      `Team ${teamId} is missing a defensive coordinator in save game ${saveGameId}`
    );
  }

  const staff: CoachingStaff = {
    headCoach,
    offensiveCoordinator,
    defensiveCoordinator,
  };

  // Validate coaching staff structure
  validateCoachingStaff(staff);

  return staff;
}

/**
 * Load a team with its roster from the database
 * Optimized: Uses single query with join instead of 2 separate queries
 */
export async function loadTeamWithRoster(
  teamId: string,
  saveGameId?: string | null,
  loadCoaches: boolean = false
): Promise<TeamWithRoster> {
  // Fetch team
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .single();

  if (teamError || !team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  // Fetch players using player_team_assignments for save game isolation
  // CRITICAL: saveGameId is required - no fallback to base players table
  if (!saveGameId) {
    throw new Error(
      `saveGameId is required to load team roster for team ${teamId}. Cannot fall back to base players table.`
    );
  }

  // Use player_team_assignments table (handles both players and prospects)
  // Note: Supabase joins require foreign key relationships
  const { data: assignments, error: assignmentsError } = await supabase
    .from("player_team_assignments")
    .select(
      `
      player_id,
      prospect_id,
      team_id,
      players (*),
      draft_prospects (*)
    `
    )
    .eq("team_id", teamId)
    .eq("save_game_id", saveGameId);

  if (assignmentsError) {
    console.error(
      `[loadTeamWithRoster] Error loading assignments for team ${teamId}, saveGameId ${saveGameId}:`,
      assignmentsError
    );
    throw new Error(
      `Failed to load player assignments for team ${teamId}, saveGameId ${saveGameId}: ${assignmentsError.message}`
    );
  }

  if (!assignments || assignments.length === 0) {
    console.error(
      `[loadTeamWithRoster] No assignments found for team ${teamId}, saveGameId ${saveGameId}`
    );
    // Check if assignments exist at all for this save game
    const { count } = await supabase
      .from("player_team_assignments")
      .select("*", { count: "exact", head: true })
      .eq("save_game_id", saveGameId);
    console.error(
      `[loadTeamWithRoster] Total assignments for saveGameId ${saveGameId}: ${count}`
    );
    throw new Error(
      `No player assignments found for team ${teamId}, saveGameId ${saveGameId}. Team roster may not be initialized for this save game.`
    );
  }

  console.log(
    `[loadTeamWithRoster] Loaded ${assignments.length} assignments for team ${teamId}, saveGameId ${saveGameId}`
  );

  // Map assignments to player/prospect data
  const players = assignments
    .map((assignment: Record<string, unknown>) => {
      // If it's a player (seed player), use players data
      if (assignment.player_id && assignment.players) {
        const playerData = assignment.players as Record<string, unknown>;
        // CRITICAL: Ensure we use the player's actual ID, not the assignment ID
        return {
          ...playerData,
          id: assignment.player_id, // Use the player_id from assignment (foreign key)
          team_id: assignment.team_id,
          is_prospect: false,
        };
      }
      // If it's a prospect (drafted), use draft_prospects data
      if (assignment.prospect_id && assignment.draft_prospects) {
        const prospectData = assignment.draft_prospects as Record<string, unknown>;
        // CRITICAL: Ensure we use the prospect's actual ID, not the assignment ID
        return {
          ...prospectData,
          id: assignment.prospect_id, // Use the prospect_id from assignment (foreign key)
          team_id: assignment.team_id,
          is_prospect: true,
          is_rookie: true,
        };
      }
      return null;
    })
    .filter(Boolean) as Array<Record<string, unknown>>;
  
  // DEBUG: Log first player to verify ID is correct
  if (players.length > 0) {
    console.log(`[loadTeamWithRoster] First player sample:`, {
      id: players[0].id,
      name: players[0].full_name,
      is_prospect: players[0].is_prospect,
    });
  }

  if (players.length === 0) {
    throw new Error(
      `No valid players found in assignments for team ${teamId}, saveGameId ${saveGameId}. All assignments may be missing player/prospect data.`
    );
  }

  // Parse traits if they're strings
  const parsedPlayers: Player[] = (players || []).map(
    (p: Record<string, unknown>) => ({
      ...p,
      traits:
        typeof p.traits === "string"
          ? JSON.parse(p.traits)
          : (p.traits as {
              speed: number;
              strength: number;
              awareness: number;
            }) || { speed: 0, strength: 0, awareness: 0 },
    })
  ) as Player[];

  // Load coaching staff if requested
  let coaches: CoachingStaff | undefined;
  if (loadCoaches && saveGameId) {
    try {
      coaches = await loadTeamCoachingStaff(teamId, saveGameId);
      console.log(
        `[loadTeamWithRoster] Loaded coaching staff for team ${teamId}: HC=${coaches.headCoach.full_name}, OC=${coaches.offensiveCoordinator.full_name}, DC=${coaches.defensiveCoordinator.full_name}`
      );
    } catch (error) {
      console.error(
        `[loadTeamWithRoster] Failed to load coaches for team ${teamId}:`,
        error
      );
      throw error; // Re-throw since coaches are required
    }
  }

  return {
    ...team,
    players: parsedPlayers,
    coaches,
  };
}

/**
 * Calculate down and distance based on previous plays
 */
function calculateDown(
  plays: Play[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _currentDown: number = 1,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _currentDistance: number = 10
): { down: number; distance: number } {
  if (plays.length === 0) {
    return { down: 1, distance: 10 };
  }

  const lastPlay = plays[plays.length - 1];

  // If last play resulted in first down or touchdown, reset
  if (
    lastPlay.yardLine >= 100 ||
    (lastPlay.down === 1 && lastPlay.distance <= lastPlay.yards)
  ) {
    return { down: 1, distance: 10 };
  }

  // Calculate new down and distance
  // If we gained enough yards for a first down, reset
  if (lastPlay.yards >= lastPlay.distance) {
    return { down: 1, distance: 10 };
  }

  const newDistance = Math.max(1, lastPlay.distance - lastPlay.yards);
  const newDown = lastPlay.down < 4 ? lastPlay.down + 1 : 1;

  return { down: newDown, distance: newDistance };
}

/**
 * Load multiple teams with rosters in batch
 * Optimized: Uses parallel loading for better performance
 */
export async function loadTeamsWithRosters(
  teamIds: string[],
  saveGameId?: string | null,
  loadCoaches: boolean = false
): Promise<Map<string, TeamWithRoster>> {
  const uniqueTeamIds = [...new Set(teamIds)];
  const teamMap = new Map<string, TeamWithRoster>();

  // Load all teams in parallel
  const loadPromises = uniqueTeamIds.map(async (teamId) => {
    try {
      const team = await loadTeamWithRoster(teamId, saveGameId, loadCoaches);
      teamMap.set(teamId, team);
    } catch (error) {
      console.error(`Failed to load team ${teamId}:`, error);
      throw error;
    }
  });

  await Promise.all(loadPromises);
  return teamMap;
}

/**
 * Simulate a complete game
 */
export async function simulateGame(
  config: SimulationConfig,
  preloadedTeams?: Map<string, TeamWithRoster>,
  saveGameId?: string | null
): Promise<GameResult> {
  // 1. Load teams with rosters (use preloaded if available)
  // Default to loading coaches unless explicitly disabled
  const shouldLoadCoaches = config.loadCoaches !== false;
  
  const homeTeam =
    preloadedTeams?.get(config.homeTeamId) ||
    (await loadTeamWithRoster(config.homeTeamId, saveGameId, shouldLoadCoaches));
  const awayTeam =
    preloadedTeams?.get(config.awayTeamId) ||
    (await loadTeamWithRoster(config.awayTeamId, saveGameId, shouldLoadCoaches));

  // Validate rosters are not empty
  if (!homeTeam.players || homeTeam.players.length === 0) {
    throw new Error(
      `Home team ${config.homeTeamId} has no players. Cannot simulate game. saveGameId: ${saveGameId}`
    );
  }
  if (!awayTeam.players || awayTeam.players.length === 0) {
    throw new Error(
      `Away team ${config.awayTeamId} has no players. Cannot simulate game. saveGameId: ${saveGameId}`
    );
  }

  // Validate roster sizes (must be exactly 53)
  const homeRosterSize = homeTeam.players.length;
  const awayRosterSize = awayTeam.players.length;

  if (homeRosterSize !== 53 || awayRosterSize !== 53) {
    // Log detailed error information
    console.error(`[simulateGame] Roster size validation failed:`, {
      homeTeam: {
        id: config.homeTeamId,
        name: homeTeam.name,
        actualPlayers: homeRosterSize,
        expected: 53,
        missing: 53 - homeRosterSize,
      },
      awayTeam: {
        id: config.awayTeamId,
        name: awayTeam.name,
        actualPlayers: awayRosterSize,
        expected: 53,
        missing: 53 - awayRosterSize,
      },
      saveGameId,
    });

    // Build a detailed error message
    const errors: string[] = [];
    if (homeRosterSize !== 53) {
      errors.push(
        `Home team (${homeTeam.name}) has ${homeRosterSize} players (needs ${53 - homeRosterSize > 0 ? `${53 - homeRosterSize} more` : `to cut ${Math.abs(53 - homeRosterSize)}`})`
      );
    }
    if (awayRosterSize !== 53) {
      errors.push(
        `Away team (${awayTeam.name}) has ${awayRosterSize} players (needs ${53 - awayRosterSize > 0 ? `${53 - awayRosterSize} more` : `to cut ${Math.abs(53 - awayRosterSize)}`})`
      );
    }

    throw new Error(
      `ROSTER_SIZE_ERROR: ${errors.join("; ")}. Cannot simulate game. saveGameId: ${saveGameId}`
    );
  }

  console.log(
    `[simulateGame] Loaded rosters: Home team ${config.homeTeamId} has ${homeTeam.players.length} players, Away team ${config.awayTeamId} has ${awayTeam.players.length} players`
  );

  // 2. Calculate team strengths (with coaching influence)
  const homeStrength = calculateTeamStrength(homeTeam, homeTeam.coaches);
  const awayStrength = calculateTeamStrength(awayTeam, awayTeam.coaches);

  // 3. Initialize player stats tracker
  const statsTracker = new PlayerStatsTracker(
    homeTeam,
    awayTeam,
    config.gameId,
    config.season,
    config.week
  );

  // 4. Simulate game - optimized for speed (fewer plays, still realistic)
  // Reduced to 60-80 plays for much faster simulation while maintaining realism
  let basePlays = 60 + Math.floor(Math.random() * 20); // 60-80 plays (faster, still realistic)
  
  // Apply tempo modifiers from both teams' offensive coordinators
  if (homeTeam.coaches && awayTeam.coaches) {
    const { getTempoPlayCountModifier } = require('./coaching-influence');
    const homeTempoMod = getTempoPlayCountModifier(homeTeam.coaches.offensiveCoordinator);
    const awayTempoMod = getTempoPlayCountModifier(awayTeam.coaches.offensiveCoordinator);
    const avgTempoMod = (homeTempoMod + awayTempoMod) / 2;
    basePlays = Math.floor(basePlays * avgTempoMod);
    console.log(`[simulateGame] Tempo adjustment: ${avgTempoMod.toFixed(2)}x (${basePlays} plays)`);
  }
  
  const totalPlays = basePlays;

  // Conditionally track play-by-play data (default to true for backward compatibility)
  const includePlayByPlay = config.includePlayByPlay !== false;
  const plays: Play[] = includePlayByPlay ? [] : [];

  // Track plays per team separately to avoid O(n²) filtering on each iteration
  // Always needed for down/distance calculation, even if not storing play-by-play
  const homePlays: Play[] = [];
  const awayPlays: Play[] = [];

  let homeScore = 0;
  let awayScore = 0;
  let homePossession = Math.random() < 0.5; // Coin toss
  let homeYardLine = 25; // Start at own 25
  let awayYardLine = 25;
  let homeDown = 1;
  let homeDistance = 10;
  let awayDown = 1;
  let awayDistance = 10;

  for (let playNumber = 1; playNumber <= totalPlays; playNumber++) {
    const isHomeOnOffense = homePossession;
    const currentYardLine = isHomeOnOffense ? homeYardLine : awayYardLine;
    const currentDown = isHomeOnOffense ? homeDown : awayDown;
    const currentDistance = isHomeOnOffense ? homeDistance : awayDistance;

    // Simulate play - use enhanced attribute system if enabled
    const play = config.useEnhancedAttributes
      ? simulatePlayEnhanced(
          {
            down: currentDown,
            distance: currentDistance,
            yardLine: currentYardLine,
            offenseTeam: isHomeOnOffense ? homeTeam : awayTeam,
            defenseTeam: isHomeOnOffense ? awayTeam : homeTeam,
            isHomeTeam: isHomeOnOffense,
            quarter: Math.ceil(playNumber / (totalPlays / 4)),
            timeRemaining: 900 - ((playNumber % (totalPlays / 4)) * 15),
            scoreDifferential: isHomeOnOffense ? homeScore - awayScore : awayScore - homeScore,
          },
          playNumber
        )
      : simulatePlay(
          {
            down: currentDown,
            distance: currentDistance,
            yardLine: currentYardLine,
            offenseStrength: isHomeOnOffense ? homeStrength : awayStrength,
            defenseStrength: isHomeOnOffense ? awayStrength : homeStrength,
            isHomeTeam: isHomeOnOffense,
            offenseCoaches: isHomeOnOffense ? homeTeam.coaches : awayTeam.coaches,
            defenseCoaches: isHomeOnOffense ? awayTeam.coaches : homeTeam.coaches,
            quarter: Math.ceil(playNumber / (totalPlays / 4)),
            timeRemaining: 900 - ((playNumber % (totalPlays / 4)) * 15),
            scoreDifferential: isHomeOnOffense ? homeScore - awayScore : awayScore - homeScore,
          },
          playNumber
        );

    // Track play in play-by-play array if enabled
    if (includePlayByPlay && plays) {
      plays.push(play);
    }

    // Track play in team-specific array for efficient down/distance calculation
    // Always needed for down/distance calculation, even if not storing play-by-play
    if (isHomeOnOffense) {
      homePlays.push(play);
    } else {
      awayPlays.push(play);
    }

    // Record play in stats tracker
    statsTracker.recordPlay(
      play,
      isHomeOnOffense ? homeTeam : awayTeam,
      isHomeOnOffense ? awayTeam : homeTeam,
      isHomeOnOffense
    );

    // Update score (track raw score for adjustment later)
    // Note: We'll adjust final scores at the end to match NFL averages
    if (isHomeOnOffense) {
      homeScore += play.points;
      // Add PAT after touchdown (almost always 1 point, rarely 2)
      if (play.points === 6) {
        // 98% chance of 1 point PAT, 2% chance of 2 point conversion
        if (Math.random() < 0.98) {
          homeScore += 1; // PAT successful
        } else if (Math.random() < 0.5) {
          homeScore += 2; // 2-point conversion successful
        }
        // If 2-point fails, no additional points
      }
    } else {
      awayScore += play.points;
      // Add PAT after touchdown
      if (play.points === 6) {
        if (Math.random() < 0.98) {
          awayScore += 1; // PAT successful
        } else if (Math.random() < 0.5) {
          awayScore += 2; // 2-point conversion successful
        }
      }
    }

    // Update field position and down/distance
    if (isHomeOnOffense) {
      if (play.points > 0) {
        // Touchdown scored - reset to own 25 for kickoff
        homeYardLine = 25;
        homeDown = 1;
        homeDistance = 10;
      } else if (play.possessionChange) {
        // Turnover or punt - reset to own 25
        homeYardLine = 25;
        homeDown = 1;
        homeDistance = 10;
      } else {
        // Normal play - update yard line
        homeYardLine = play.yardLine;
        const downDist = calculateDown(homePlays, homeDown, homeDistance);
        homeDown = downDist.down;
        homeDistance = downDist.distance;
      }
    } else {
      if (play.points > 0) {
        // Touchdown scored - reset to own 25 for kickoff
        awayYardLine = 25;
        awayDown = 1;
        awayDistance = 10;
      } else if (play.possessionChange) {
        // Turnover or punt - reset to own 25
        awayYardLine = 25;
        awayDown = 1;
        awayDistance = 10;
      } else {
        // Normal play - update yard line
        awayYardLine = play.yardLine;
        const downDist = calculateDown(awayPlays, awayDown, awayDistance);
        awayDown = downDist.down;
        awayDistance = downDist.distance;
      }
    }

    // Handle possession change
    if (play.possessionChange) {
      homePossession = !homePossession;
      // Reset down/distance for new possession
      if (homePossession) {
        homeYardLine = 25;
        homeDown = 1;
        homeDistance = 10;
      } else {
        awayYardLine = 25;
        awayDown = 1;
        awayDistance = 10;
      }
    }
  }

  // 5. Adjust final scores to be realistic
  // Apply scoring adjustments based on team strength to match NFL averages
  const finalScores = calculateFinalScores(
    homeScore,
    awayScore,
    homeStrength,
    awayStrength
  );

  homeScore = finalScores.homeScore;
  awayScore = finalScores.awayScore;

  // 6. Get player stats from tracker (Phase 2 - detailed stats)
  let playerStats = statsTracker.getActivePlayerStats();

  // 7. Validate and log record-breaking performances (async, non-blocking)
  // Do this asynchronously to not slow down simulation
  Promise.resolve()
    .then(() => statsTracker.validateAndLogRecords())
    .catch(() => {});

  // 8. Calculate performance ratings for each player (Phase 3)
  const allPlayers = [...homeTeam.players, ...awayTeam.players];
  const playerMap = new Map(allPlayers.map((p) => [p.id, p]));

  playerStats = playerStats.map((stat) => {
    const player = playerMap.get(stat.player_id);
    if (player) {
      const performanceRating = calculatePerformanceRating(stat, player);
      return {
        ...stat,
        performance_rating: performanceRating,
      };
    }
    return stat;
  });

  return {
    homeScore,
    awayScore,
    playerStats,
    playByPlay: includePlayByPlay ? plays : undefined,
  };
}
