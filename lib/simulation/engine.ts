import { supabase } from "@/lib/supabase-client";
import {
  SimulationConfig,
  GameResult,
  TeamWithRoster,
  Player,
  PlayerGameStat,
  Play,
} from "./types";
import {
  calculateTeamStrength,
  getBestPlayerAtPosition,
  getPositionGroupRating,
} from "./team-strength";
import { simulatePlay } from "./outcome-generator";
import { PlayerStatsTracker } from "./player-performance";
import { calculatePerformanceRating } from "./rating-calculator";
import { calculateFinalScores, normalizeScore } from "./scoring-adjuster";

/**
 * Load a team with its roster from the database
 */
async function loadTeamWithRoster(teamId: string): Promise<TeamWithRoster> {
  // Fetch team
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .single();

  if (teamError || !team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  // Fetch players
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("*")
    .eq("team_id", teamId);

  if (playersError) {
    throw new Error(`Failed to load players: ${playersError.message}`);
  }

  // Parse traits if they're strings
  const parsedPlayers: Player[] = (players || []).map((p) => ({
    ...p,
    traits:
      typeof p.traits === "string"
        ? JSON.parse(p.traits)
        : p.traits || { speed: 0, strength: 0, awareness: 0 },
  }));

  return {
    ...team,
    players: parsedPlayers,
  };
}

/**
 * Calculate down and distance based on previous plays
 */
function calculateDown(
  plays: Play[],
  currentDown: number = 1,
  currentDistance: number = 10
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
 * Simulate a complete game
 */
export async function simulateGame(
  config: SimulationConfig
): Promise<GameResult> {
  // 1. Load teams with rosters
  const homeTeam = await loadTeamWithRoster(config.homeTeamId);
  const awayTeam = await loadTeamWithRoster(config.awayTeamId);

  // 2. Calculate team strengths
  const homeStrength = calculateTeamStrength(homeTeam);
  const awayStrength = calculateTeamStrength(awayTeam);

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
  const totalPlays = 60 + Math.floor(Math.random() * 20); // 60-80 plays (faster, still realistic)
  const plays: Play[] = [];

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

    // Simulate play
    const play = simulatePlay(
      {
        down: currentDown,
        distance: currentDistance,
        yardLine: currentYardLine,
        offenseStrength: isHomeOnOffense ? homeStrength : awayStrength,
        defenseStrength: isHomeOnOffense ? awayStrength : homeStrength,
        isHomeTeam: isHomeOnOffense,
      },
      playNumber
    );

    plays.push(play);

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
        const downDist = calculateDown(
          plays.filter((p) => p.playNumber <= playNumber && homePossession),
          homeDown,
          homeDistance
        );
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
        const downDist = calculateDown(
          plays.filter((p) => p.playNumber <= playNumber && !homePossession),
          awayDown,
          awayDistance
        );
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
  Promise.resolve().then(() => statsTracker.validateAndLogRecords()).catch(() => {});

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
    playByPlay: plays,
  };
}
