import { TeamStrength, Play } from "./types";
import { NFL_RECORDS } from "./nfl-records";

// NFL statistical averages (used as baselines)
const NFL_AVERAGES = {
  totalPlays: 130,
  passPercentage: 0.58,
  runPercentage: 0.42,
  yardsPerPass: 6.5,
  yardsPerRush: 4.3,
  pointsPerGame: 21.5,
  turnoversPerGame: 1.5,
  homeFieldAdvantage: 3, // points
};

interface PlayConfig {
  down: number;
  distance: number;
  yardLine: number;
  offenseStrength: TeamStrength;
  defenseStrength: TeamStrength;
  isHomeTeam: boolean;
}

/**
 * Determine play type based on down and distance
 */
function determinePlayType(down: number, distance: number): "pass" | "run" {
  // 1st down: 60% run, 40% pass
  if (down === 1) {
    return Math.random() < 0.6 ? "run" : "pass";
  }

  // 2nd down: depends on distance
  if (down === 2) {
    if (distance <= 3) {
      return Math.random() < 0.7 ? "run" : "pass";
    } else if (distance <= 7) {
      return Math.random() < 0.5 ? "run" : "pass";
    } else {
      return Math.random() < 0.3 ? "run" : "pass";
    }
  }

  // 3rd down: depends on distance
  if (down === 3) {
    if (distance <= 3) {
      return Math.random() < 0.6 ? "run" : "pass";
    } else if (distance <= 7) {
      return Math.random() < 0.3 ? "run" : "pass";
    } else {
      return "pass"; // Almost always pass on 3rd and long
    }
  }

  // 4th down: usually pass unless very short
  if (down === 4) {
    return distance <= 1 ? "run" : "pass";
  }

  return Math.random() < NFL_AVERAGES.runPercentage ? "run" : "pass";
}

/**
 * Calculate success probability based on team strengths
 */
function calculateSuccessProbability(
  playType: "pass" | "run",
  offenseStrength: TeamStrength,
  defenseStrength: TeamStrength
): number {
  let baseProbability = 0.5; // 50% base success rate

  if (playType === "pass") {
    // Passing success depends on QB, O-line, skill players vs defense
    const offenseRating =
      offenseStrength.qbRating * 0.4 +
      offenseStrength.olineRating * 0.2 +
      offenseStrength.skillRating * 0.4;
    const defenseRating =
      defenseStrength.secondaryRating * 0.5 +
      defenseStrength.dlineRating * 0.3 +
      defenseStrength.overall * 0.2;

    baseProbability = 0.5 + (offenseRating - defenseRating) / 200;
  } else {
    // Running success depends on O-line, RB vs D-line, LBs
    const offenseRating =
      offenseStrength.olineRating * 0.5 + offenseStrength.skillRating * 0.5;
    const defenseRating =
      defenseStrength.dlineRating * 0.5 + defenseStrength.overall * 0.5;

    baseProbability = 0.5 + (offenseRating - defenseRating) / 200;
  }

  // Clamp between 0.15 and 0.85
  return Math.max(0.15, Math.min(0.85, baseProbability));
}

/**
 * Generate yards gained based on play type and success
 */
function generateYards(
  playType: "pass" | "run",
  success: boolean,
  offenseStrength: TeamStrength,
  defenseStrength: TeamStrength
): number {
  if (!success) {
    // Failed play: negative or minimal yards
    if (playType === "pass") {
      // Incomplete pass or sack
      return Math.random() < 0.3 ? -random(1, 8) : 0; // 30% chance of sack
    } else {
      // Run for loss or minimal gain
      return random(-3, 2);
    }
  }

  // Successful play - use probability distribution with rare big plays
  // Individual plays can be up to ~80 yards (allows for rare record-breaking games)
  if (playType === "pass") {
    const baseYards = NFL_AVERAGES.yardsPerPass;
    const ratingDiff = (offenseStrength.offense - defenseStrength.defense) / 10;
    
    // Most plays: 0-20 yards (normal distribution)
    // Rare big plays: 20-80 yards (exponential tail)
    const normalYards = baseYards + ratingDiff + random(-3, 8);
    
    // 2% chance of a big play (20+ yards)
    if (Math.random() < 0.02) {
      // Big play: 20-80 yards, with rare chance of 60+ yard plays
      const bigPlayRoll = Math.random();
      if (bigPlayRoll < 0.1) {
        // Rare 60-80 yard play (0.2% of all plays)
        return Math.max(20, Math.round(60 + random(0, 20)));
      } else {
        // Normal big play: 20-40 yards
        return Math.max(20, Math.round(20 + random(0, 20)));
      }
    }
    
    // Normal play: cap at 20 yards for most plays
    return Math.max(0, Math.min(20, Math.round(normalYards)));
  } else {
    const baseYards = NFL_AVERAGES.yardsPerRush;
    const ratingDiff = (offenseStrength.offense - defenseStrength.defense) / 10;
    
    // Most runs: 0-15 yards
    // Rare big runs: 15-50 yards
    const normalYards = baseYards + ratingDiff + random(-2, 5);
    
    // 1% chance of a big run (15+ yards)
    if (Math.random() < 0.01) {
      // Big run: 15-50 yards, with rare chance of 40+ yard runs
      const bigRunRoll = Math.random();
      if (bigRunRoll < 0.1) {
        // Rare 40-50 yard run (0.1% of all runs)
        return Math.max(15, Math.round(40 + random(0, 10)));
      } else {
        // Normal big run: 15-25 yards
        return Math.max(15, Math.round(15 + random(0, 10)));
      }
    }
    
    // Normal run: cap at 15 yards for most runs
    return Math.max(0, Math.min(15, Math.round(normalYards)));
  }
}

/**
 * Determine if a turnover should occur
 */
function shouldTurnover(
  offenseStrength: TeamStrength,
  defenseStrength: TeamStrength
): boolean {
  // Base turnover rate: ~2% per play
  const baseRate = 0.02;
  const defenseBonus = (defenseStrength.defense - 50) / 1000; // Better defense = more turnovers
  const offensePenalty = (50 - offenseStrength.offense) / 1000; // Worse offense = more turnovers

  return Math.random() < baseRate + defenseBonus + offensePenalty;
}

/**
 * Check if team should punt (4th down and not in field goal range)
 */
function shouldPunt(down: number, yardLine: number): boolean {
  return down === 4 && yardLine > 35; // Punt if beyond opponent's 35
}

/**
 * Check if team should attempt field goal
 */
function shouldAttemptFieldGoal(down: number, yardLine: number): boolean {
  return down === 4 && yardLine <= 35 && yardLine >= 10; // FG range
}

/**
 * Calculate points scored from a play
 */
function calculatePoints(
  yards: number,
  down: number,
  distance: number,
  yardLine: number
): number {
  // Touchdown - yardLine is yards from own goal (0-100)
  // 0 = own goal line, 100 = opponent goal line
  // If we're at yardLine 95+ and gain yards, we score
  if (yards > 0 && yardLine >= 95) {
    // Close to goal line - check if we cross it
    const newYardLine = Math.min(100, yardLine + yards);
    if (newYardLine >= 100) {
      return 6; // Touchdown
    }
  }
  return 0;
}

/**
 * Simulate a single play
 */
export function simulatePlay(config: PlayConfig, playNumber: number): Play {
  const {
    down,
    distance,
    yardLine,
    offenseStrength,
    defenseStrength,
    isHomeTeam,
  } = config;

  // Determine play type
  const playType = determinePlayType(down, distance);

  // Calculate success probability
  const successProb = calculateSuccessProbability(
    playType,
    offenseStrength,
    defenseStrength
  );
  const success = Math.random() < successProb;

  // Generate yards
  const yards = generateYards(
    playType,
    success,
    offenseStrength,
    defenseStrength
  );

  // Check for turnover
  const turnover = shouldTurnover(offenseStrength, defenseStrength);

  // Calculate points (touchdown)
  const points = calculatePoints(yards, down, distance, yardLine);

  // Determine possession change
  let possessionChange = false;
  if (turnover) {
    possessionChange = true;
  } else if (points > 0) {
    possessionChange = true; // Touchdown = kickoff
  } else if (shouldPunt(down, yardLine)) {
    possessionChange = true;
  } else if (shouldAttemptFieldGoal(down, yardLine)) {
    // Field goal attempt - success rate based on distance and kicker skill
    // Shorter kicks (inside 30) = ~95%, longer kicks (40+) = ~70%
    const distance = 100 - yardLine; // Distance from goal
    const baseSuccessRate = distance <= 30 ? 0.95 : distance <= 40 ? 0.85 : 0.70;
    
    if (Math.random() < baseSuccessRate) {
      return {
        playNumber,
        down,
        distance,
        yardLine,
        playType: "field_goal",
        yards: 0,
        success: true,
        turnover: false,
        points: 3,
        possessionChange: true,
        description: `Field goal is good! +3 points`,
      };
    } else {
      possessionChange = true; // Missed FG
    }
  }

  // Generate play description
  const description = generatePlayDescription(
    playType,
    yards,
    success,
    turnover,
    points
  );

  // Calculate new yard line (yardLine is yards from own goal, 0-100)
  // If we gain yards, we move toward opponent's goal (yardLine increases)
  // If we lose yards, we move toward own goal (yardLine decreases)
  let newYardLine = yardLine;
  if (yards > 0) {
    newYardLine = Math.min(100, yardLine + yards); // Move toward opponent goal
  } else if (yards < 0) {
    newYardLine = Math.max(0, yardLine + yards); // Move toward own goal (yards is negative)
  }

  return {
    playNumber,
    down,
    distance,
    yardLine: newYardLine,
    playType,
    yards,
    success,
    turnover,
    points,
    possessionChange,
    description,
  };
}

/**
 * Generate a human-readable play description
 */
function generatePlayDescription(
  playType: "pass" | "run" | "punt" | "field_goal" | "kickoff",
  yards: number,
  success: boolean,
  turnover: boolean,
  points: number
): string {
  if (points > 0) {
    return `TOUCHDOWN! ${points} points`;
  }

  if (turnover) {
    if (playType === "pass") {
      return `INTERCEPTION! ${Math.abs(yards)} yard return`;
    } else {
      return `FUMBLE! Recovered by defense`;
    }
  }

  if (playType === "pass") {
    if (yards > 0) {
      return `Pass complete for ${yards} yards`;
    } else if (yards < 0) {
      return `Sacked for ${Math.abs(yards)} yard loss`;
    } else {
      return `Pass incomplete`;
    }
  } else if (playType === "run") {
    if (yards > 0) {
      return `Run for ${yards} yards`;
    } else {
      return `Run for ${yards} yards`;
    }
  }

  return `${playType} for ${yards} yards`;
}

/**
 * Helper function for random numbers
 */
function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
