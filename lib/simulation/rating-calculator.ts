import { PlayerGameStat, Player } from './types';

/**
 * Calculate performance rating for a player based on their game stats
 * Returns a rating from 0-100 based on position-specific metrics
 */
export function calculatePerformanceRating(
  stats: PlayerGameStat,
  player: Player
): number {
  const position = player.position;

  switch (position) {
    case 'QB':
      return calculateQBRating(stats);
    case 'RB':
      return calculateRBRating(stats);
    case 'WR':
    case 'TE':
      return calculateWRRating(stats);
    case 'DE':
    case 'DT':
      return calculateDLRating(stats);
    case 'LB':
      return calculateLBRating(stats);
    case 'CB':
    case 'S':
      return calculateDBRating(stats);
    case 'K':
      return calculateKRating(stats);
    case 'P':
      return calculatePRating(stats);
    default:
      // For OL and other positions, use a basic rating
      return calculateBasicRating(stats);
  }
}

/**
 * Calculate QB rating (simplified passer rating + performance)
 */
function calculateQBRating(stats: PlayerGameStat): number {
  const attempts = stats.attempts || 0;
  const completions = stats.completions || 0;
  const yards = stats.passing_yards || 0;
  const tds = stats.passing_tds || 0;
  const ints = stats.interceptions || 0; // QB throwing interceptions (offensive stat)

  if (attempts === 0) return 50; // No attempts = average rating

  // Calculate completion percentage component (0-40 points)
  const compPct = (completions / attempts) * 100;
  const compScore = Math.min(40, (compPct / 80) * 40); // 80% = perfect

  // Calculate yards per attempt component (0-30 points)
  const ypa = yards / attempts;
  const ypaScore = Math.min(30, (ypa / 10) * 30); // 10 YPA = perfect

  // Calculate TD component (0-20 points)
  const tdRate = (tds / attempts) * 100;
  const tdScore = Math.min(20, (tdRate / 10) * 30); // 10% TD rate = perfect

  // Calculate INT penalty (0-10 points deduction)
  const intRate = (ints / attempts) * 100;
  const intPenalty = Math.min(10, intRate * 2); // 5% INT rate = -10 points

  // Base rating
  let rating = 50 + compScore + ypaScore + tdScore - intPenalty;

  // Bonus for high yardage games
  if (yards > 300) rating += 5;
  if (yards > 400) rating += 5;

  // Penalty for multiple interceptions
  if (ints >= 3) rating -= 10;

  return Math.max(0, Math.min(100, Math.round(rating)));
}

/**
 * Calculate RB rating
 */
function calculateRBRating(stats: PlayerGameStat): number {
  const attempts = stats.rushing_attempts || 0;
  const yards = stats.rushing_yards || 0;
  const tds = stats.rushing_tds || 0;
  const fumbles = stats.fumbles || 0;

  if (attempts === 0) return 50;

  // Yards per carry (0-50 points)
  const ypc = yards / attempts;
  const ypcScore = Math.min(50, (ypc / 6) * 50); // 6 YPC = perfect

  // TD rate (0-30 points)
  const tdRate = (tds / attempts) * 100;
  const tdScore = Math.min(30, (tdRate / 5) * 30); // 5% TD rate = perfect

  // Fumble penalty (0-20 points deduction)
  const fumbleRate = (fumbles / attempts) * 100;
  const fumblePenalty = Math.min(20, fumbleRate * 10);

  // Base rating
  let rating = 50 + ypcScore + tdScore - fumblePenalty;

  // Bonus for high yardage games
  if (yards > 100) rating += 5;
  if (yards > 150) rating += 5;

  return Math.max(0, Math.min(100, Math.round(rating)));
}

/**
 * Calculate WR/TE rating
 */
function calculateWRRating(stats: PlayerGameStat): number {
  const targets = stats.targets || 0;
  const receptions = stats.receptions || 0;
  const yards = stats.receiving_yards || 0;
  const tds = stats.receiving_tds || 0;

  if (targets === 0) return 50;

  // Catch rate (0-30 points)
  const catchRate = (receptions / targets) * 100;
  const catchScore = Math.min(30, (catchRate / 80) * 30); // 80% catch rate = perfect

  // Yards per reception (0-40 points)
  const ypr = receptions > 0 ? yards / receptions : 0;
  const yprScore = Math.min(40, (ypr / 20) * 40); // 20 YPR = perfect

  // TD rate (0-30 points)
  const tdRate = (tds / targets) * 100;
  const tdScore = Math.min(30, (tdRate / 10) * 30);

  // Base rating
  let rating = 50 + catchScore + yprScore + tdScore;

  // Bonus for high yardage games
  if (yards > 100) rating += 5;
  if (yards > 150) rating += 5;

  return Math.max(0, Math.min(100, Math.round(rating)));
}

/**
 * Calculate defensive line rating (DE/DT)
 */
function calculateDLRating(stats: PlayerGameStat): number {
  const tackles = stats.tackles || 0;
  const sacks = stats.sacks || 0;
  const tfl = stats.tfl || 0;
  const forcedFumbles = stats.forced_fumbles || 0;

  // Tackles component (0-30 points)
  const tackleScore = Math.min(30, tackles * 2); // 15 tackles = perfect

  // Sacks component (0-40 points)
  const sackScore = Math.min(40, sacks * 10); // 4 sacks = perfect

  // TFL component (0-20 points)
  const tflScore = Math.min(20, tfl * 2);

  // Forced fumbles (0-10 points)
  const ffScore = Math.min(10, forcedFumbles * 5);

  let rating = 50 + tackleScore + sackScore + tflScore + ffScore;

  return Math.max(0, Math.min(100, Math.round(rating)));
}

/**
 * Calculate linebacker rating
 */
function calculateLBRating(stats: PlayerGameStat): number {
  const tackles = stats.tackles || 0;
  const solo = stats.solo_tackles || 0;
  const sacks = stats.sacks || 0;
  const ints = stats.defensive_interceptions || 0;
  const passesDefended = stats.passes_defended || 0;

  // Tackles component (0-35 points)
  const tackleScore = Math.min(35, tackles * 1.5);

  // Sacks component (0-25 points)
  const sackScore = Math.min(25, sacks * 8);

  // Coverage component (0-20 points)
  const coverageScore = Math.min(20, (ints * 8) + (passesDefended * 2));

  // Solo tackles bonus (0-20 points)
  const soloScore = Math.min(20, solo * 1);

  let rating = 50 + tackleScore + sackScore + coverageScore + soloScore;

  return Math.max(0, Math.min(100, Math.round(rating)));
}

/**
 * Calculate defensive back rating (CB/S)
 */
function calculateDBRating(stats: PlayerGameStat): number {
  const tackles = stats.tackles || 0;
  const ints = stats.defensive_interceptions || 0;
  const passesDefended = stats.passes_defended || 0;
  const fumbleRecoveries = stats.fumble_recoveries || 0;

  // Interceptions component (0-40 points)
  const intScore = Math.min(40, ints * 15); // 2+ INTs = excellent

  // Passes defended component (0-30 points)
  const pdScore = Math.min(30, passesDefended * 3);

  // Tackles component (0-20 points)
  const tackleScore = Math.min(20, tackles * 1);

  // Fumble recoveries (0-10 points)
  const frScore = Math.min(10, fumbleRecoveries * 5);

  let rating = 50 + intScore + pdScore + tackleScore + frScore;

  return Math.max(0, Math.min(100, Math.round(rating)));
}

/**
 * Calculate kicker rating
 */
function calculateKRating(stats: PlayerGameStat): number {
  const attempts = stats.field_goals_attempted || 0;
  const made = stats.field_goals_made || 0;
  const xpMade = stats.extra_points_made || 0;

  if (attempts === 0) return 50;

  // Field goal percentage (0-70 points)
  const fgPct = (made / attempts) * 100;
  const fgScore = Math.min(70, (fgPct / 100) * 70);

  // Extra points (0-30 points)
  const xpScore = Math.min(30, xpMade * 3);

  let rating = 50 + fgScore + xpScore;

  // Bonus for perfect game
  if (attempts > 0 && made === attempts) rating += 10;

  return Math.max(0, Math.min(100, Math.round(rating)));
}

/**
 * Calculate punter rating
 */
function calculatePRating(stats: PlayerGameStat): number {
  const punts = stats.punts || 0;
  const yards = stats.punt_yards || 0;

  if (punts === 0) return 50;

  // Average yards per punt (0-50 points)
  const avgYards = yards / punts;
  const avgScore = Math.min(50, (avgYards / 50) * 50); // 50 yards = perfect

  // Volume component (0-50 points)
  const volumeScore = Math.min(50, punts * 5);

  let rating = 50 + avgScore + volumeScore;

  return Math.max(0, Math.min(100, Math.round(rating)));
}

/**
 * Calculate basic rating for positions without specific formulas
 */
function calculateBasicRating(stats: PlayerGameStat): number {
  // For OL and other positions, use snaps played as a proxy
  const snaps = stats.snaps_played || 0;
  
  if (snaps === 0) return 50;

  // More snaps = better performance (simplified)
  const snapScore = Math.min(50, (snaps / 70) * 50); // 70 snaps = perfect

  return Math.max(0, Math.min(100, Math.round(50 + snapScore)));
}

