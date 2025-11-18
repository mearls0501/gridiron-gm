/**
 * Scoring adjustment system to ensure realistic NFL scores
 * - League average: 22.9 PPG
 * - Elite offense: 30-33 PPG
 * - Bad offense: 14-17 PPG
 * - Elite defense: allows 14-17 PPG
 * - Bad defense: allows 30-33 PPG
 */

import { TeamStrength } from "./types";

const LEAGUE_AVG_PPG = 22.9;
const ELITE_OFFENSE_PPG = 31.5; // Average of 30-33
const BAD_OFFENSE_PPG = 15.5; // Average of 14-17
const ELITE_DEFENSE_PPG_ALLOWED = 15.5; // Average of 14-17
const BAD_DEFENSE_PPG_ALLOWED = 31.5; // Average of 30-33

// NFL Game Totals (Over/Under) Statistics
const MEDIAN_GAME_TOTAL = 43; // Median over/under
const AVG_GAME_TOTAL_MIN = 42; // Average range low
const AVG_GAME_TOTAL_MAX = 47; // Average range high
const MIN_GAME_TOTAL = 28; // All-time low
const MAX_GAME_TOTAL = 63.5; // All-time high
const COMMON_TOTALS = [41, 44]; // Key numbers that appear frequently

/**
 * Calculate expected points per game based on team strength
 */
export function calculateExpectedPPG(teamStrength: TeamStrength): number {
  // Team strength is 0-100 scale
  // Map to PPG range: 15.5 (bad) to 31.5 (elite)
  // Average team (50) should score ~22.9 PPG
  
  const strengthRatio = teamStrength.offense / 100;
  
  // Linear interpolation between bad and elite
  const expectedPPG = BAD_OFFENSE_PPG + (strengthRatio * (ELITE_OFFENSE_PPG - BAD_OFFENSE_PPG));
  
  // Add some variance (±2 PPG)
  const variance = (Math.random() - 0.5) * 4;
  
  return Math.max(10, Math.min(40, expectedPPG + variance));
}

/**
 * Calculate expected points allowed per game based on defensive strength
 */
export function calculateExpectedPPGAllowed(teamStrength: TeamStrength): number {
  // Defense strength is 0-100 scale
  // Lower defensive strength = more points allowed
  // Elite defense (high rating) = low points allowed
  
  const defenseRatio = teamStrength.defense / 100;
  
  // Invert: high defense rating = low points allowed
  const expectedPPGAllowed = BAD_DEFENSE_PPG_ALLOWED - (defenseRatio * (BAD_DEFENSE_PPG_ALLOWED - ELITE_DEFENSE_PPG_ALLOWED));
  
  // Add some variance (±2 PPG)
  const variance = (Math.random() - 0.5) * 4;
  
  return Math.max(10, Math.min(40, expectedPPGAllowed + variance));
}

/**
 * Adjust raw game score to match expected PPG
 */
export function adjustGameScore(
  rawScore: number,
  expectedPPG: number,
  opponentDefensePPGAllowed: number
): number {
  // Combine offensive expectation with opponent defensive expectation
  // Weight offense slightly more (60/40) since offense has more control
  const combinedExpected = (expectedPPG * 0.6) + (opponentDefensePPGAllowed * 0.4);
  
  // If raw score is very low (less than 10), we need to scale it significantly
  // If raw score is reasonable, apply lighter scaling
  let scaleFactor: number;
  
  if (rawScore < 10) {
    // Very low score - scale up more aggressively
    scaleFactor = combinedExpected / Math.max(3, rawScore);
  } else if (rawScore < 20) {
    // Low score - moderate scaling
    scaleFactor = combinedExpected / rawScore;
  } else {
    // Reasonable score - light scaling with variance
    scaleFactor = 1 + ((combinedExpected - rawScore) / rawScore) * 0.3;
  }
  
  // Apply scaling with some variance (±10%)
  const variance = 1 + (Math.random() - 0.5) * 0.2;
  const adjusted = rawScore * scaleFactor * variance;
  
  // Round to nearest valid score (no 1 point, rare 0)
  return normalizeScore(Math.round(adjusted));
}

/**
 * Normalize score to ensure it's realistic
 * - No 1 point (impossible in NFL)
 * - Rare 0 points (only ~1% of games)
 * - Scores should be multiples of 3, 6, 7, 8, 9, 10, etc.
 */
export function normalizeScore(score: number): number {
  // Handle impossible scores
  if (score === 1) {
    // Convert 1 to either 0 (rare) or 3 (field goal)
    return Math.random() < 0.1 ? 0 : 3;
  }
  
  // Handle 0 - make it rare (only ~1% of games)
  if (score === 0) {
    // 99% chance to convert to at least 3
    if (Math.random() < 0.99) {
      return 3;
    }
    return 0; // Rare shutout
  }
  
  // Ensure score is reasonable (at least 3, max 60)
  return Math.max(3, Math.min(60, score));
}

/**
 * Calculate expected game total (over/under) based on team strengths
 * Elite teams hit over 76%+ of the time, bad teams hit over 35-37% of the time
 */
function calculateExpectedGameTotal(
  homeStrength: TeamStrength,
  awayStrength: TeamStrength
): number {
  // Base total around median (43)
  let expectedTotal = MEDIAN_GAME_TOTAL;
  
  // Calculate team quality (0-100 scale, 50 = average)
  const homeQuality = (homeStrength.offense + homeStrength.defense) / 2;
  const awayQuality = (awayStrength.offense + awayStrength.defense) / 2;
  const avgQuality = (homeQuality + awayQuality) / 2;
  
  // Elite teams (quality > 70) increase total significantly
  // Bad teams (quality < 40) decrease total significantly
  if (avgQuality > 70) {
    // Elite matchup: higher totals, hit over 76%+ of the time
    // Target: 48-55 range, but with bias to go over
    const baseTotal = 48 + (avgQuality - 70) / 30 * 7; // 48-55
    // 76% hit over means we need to bias upward
    // If base is 50, we want 76% to be >50, so add positive bias
    const overBias = Math.random() < 0.76 ? Math.random() * 6 : -Math.random() * 2;
    expectedTotal = baseTotal + overBias;
  } else if (avgQuality < 40) {
    // Bad matchup: lower totals, hit over 35-37% of the time
    // Target: 35-42 range, but with bias to go under
    const baseTotal = 35 + (avgQuality / 40) * 7; // 35-42
    // 35% hit over means we need to bias downward
    // If base is 38, we want 35% to be >38, so add negative bias
    const underBias = Math.random() < 0.35 ? Math.random() * 4 : -Math.random() * 4;
    expectedTotal = baseTotal + underBias;
  } else {
    // Average matchup: around median
    // Target: 40-46 range, slight bias toward key numbers (41, 44)
    // Average teams hit over ~50% of the time
    const baseTotal = 40 + (avgQuality - 40) / 30 * 6;
    
    // 30% chance to land on key numbers (41, 44)
    if (Math.random() < 0.3) {
      expectedTotal = Math.random() < 0.5 ? 41 : 44;
    } else {
      // Slight bias toward over (50%+ teams hit over)
      const variance = (Math.random() - 0.45) * 6; // Slight positive bias
      expectedTotal = baseTotal + variance;
    }
  }
  
  // Clamp to realistic range
  return Math.max(MIN_GAME_TOTAL, Math.min(MAX_GAME_TOTAL, expectedTotal));
}

/**
 * Distribute game total between two teams based on their relative strengths
 */
function distributeGameTotal(
  gameTotal: number,
  homeStrength: TeamStrength,
  awayStrength: TeamStrength
): { homeScore: number; awayScore: number } {
  // Calculate relative offensive strengths
  const homeOffenseRating = homeStrength.offense;
  const awayOffenseRating = awayStrength.offense;
  const totalOffense = homeOffenseRating + awayOffenseRating;
  
  // Calculate relative defensive weaknesses (inverse of defense rating)
  // Better defense = fewer points allowed
  const homeDefenseWeakness = 100 - homeStrength.defense; // Higher = worse defense
  const awayDefenseWeakness = 100 - awayStrength.defense;
  const totalDefenseWeakness = homeDefenseWeakness + awayDefenseWeakness;
  
  // Combine offense and defense factors (60% offense, 40% defense)
  const homeFactor = (homeOffenseRating / totalOffense) * 0.6 + (awayDefenseWeakness / totalDefenseWeakness) * 0.4;
  const awayFactor = (awayOffenseRating / totalOffense) * 0.6 + (homeDefenseWeakness / totalDefenseWeakness) * 0.4;
  
  // Normalize factors
  const totalFactor = homeFactor + awayFactor;
  const normalizedHomeFactor = homeFactor / totalFactor;
  const normalizedAwayFactor = awayFactor / totalFactor;
  
  // Distribute total
  let homeScore = Math.round(gameTotal * normalizedHomeFactor);
  let awayScore = Math.round(gameTotal * normalizedAwayFactor);
  
  // Add small variance (±2 points per team)
  homeScore += Math.floor((Math.random() - 0.5) * 4);
  awayScore += Math.floor((Math.random() - 0.5) * 4);
  
  // Ensure total still matches (adjust if needed)
  const actualTotal = homeScore + awayScore;
  const difference = gameTotal - actualTotal;
  
  // Distribute difference randomly
  if (difference !== 0) {
    const homeAdjust = Math.floor(Math.random() * Math.abs(difference) + 0.5);
    if (difference > 0) {
      homeScore += homeAdjust;
      awayScore += (difference - homeAdjust);
    } else {
      homeScore -= homeAdjust;
      awayScore -= (difference + homeAdjust);
    }
  }
  
  // Add home field advantage (0-3 points)
  const homeAdvantage = Math.floor(Math.random() * 3);
  homeScore += homeAdvantage;
  awayScore -= Math.floor(homeAdvantage / 2); // Slight reduction for away team
  
  return {
    homeScore: Math.round(normalizeScore(homeScore)),
    awayScore: Math.round(normalizeScore(awayScore)),
  };
}

/**
 * Calculate final game scores with realistic adjustments
 * Now focuses on game totals (over/under) matching NFL patterns
 */
export function calculateFinalScores(
  rawHomeScore: number,
  rawAwayScore: number,
  homeStrength: TeamStrength,
  awayStrength: TeamStrength
): { homeScore: number; awayScore: number } {
  // Calculate expected game total based on team strengths
  const expectedGameTotal = calculateExpectedGameTotal(homeStrength, awayStrength);
  
  // Distribute the total between teams based on their relative strengths
  const finalScores = distributeGameTotal(expectedGameTotal, homeStrength, awayStrength);
  
  // Ensure scores are different (no ties)
  // Ties should be extremely rare (< 2% of games)
  // In NFL, ties can happen in regular season but are very rare
  // Only allow ties in ~1.5% of games (realistic NFL rate)
  const allowTie = Math.random() < 0.015;
  
  const scoreDiff = Math.abs(finalScores.homeScore - finalScores.awayScore);
  if (scoreDiff === 0) {
    if (allowTie) {
      // Very rare tie - keep it as is (will be 0-0, 3-3, 6-6, etc.)
      // But ensure it's a valid tie score (not 1-1 or other impossible scores)
      if (finalScores.homeScore === 0 || finalScores.homeScore === 1) {
        // Make it 3-3 or 6-6 instead
        finalScores.homeScore = Math.random() < 0.5 ? 3 : 6;
        finalScores.awayScore = finalScores.homeScore;
      }
      // Otherwise keep the tie
    } else {
      // Break the tie - add 1 point to home team
      finalScores.homeScore += 1;
    }
  } else if (scoreDiff === 1) {
    // If difference is 1, make it at least 2 (no 1-point games)
    if (finalScores.homeScore > finalScores.awayScore) {
      finalScores.homeScore += 1;
    } else {
      finalScores.awayScore += 1;
    }
  }
  
  // Handle extreme low scoring games (very rare, but possible)
  // 3-0, 6-0, 10-0 are the lowest in last 10 years (only 3 games in 10 years!)
  // This should be extremely rare: ~0.1% of games
  if (Math.random() < 0.001) {
    // Very rare extreme low scoring game
    const lowScoreType = Math.random();
    if (lowScoreType < 0.33) {
      // 3-0 (rarest)
      finalScores.homeScore = Math.random() < 0.5 ? 3 : 0;
      finalScores.awayScore = finalScores.homeScore === 3 ? 0 : 3;
    } else if (lowScoreType < 0.67) {
      // 6-0
      finalScores.homeScore = Math.random() < 0.5 ? 6 : 0;
      finalScores.awayScore = finalScores.homeScore === 6 ? 0 : 6;
    } else {
      // 10-0
      finalScores.homeScore = Math.random() < 0.5 ? 10 : 0;
      finalScores.awayScore = finalScores.homeScore === 10 ? 0 : 10;
    }
    return {
      homeScore: Math.round(normalizeScore(finalScores.homeScore)),
      awayScore: Math.round(normalizeScore(finalScores.awayScore)),
    };
  }
  
  // Handle extreme high scoring games (rare, but possible)
  // 70-20 (90), 35-33 (68), 41-33 (74) are highest in last 10 years
  const gameTotal = finalScores.homeScore + finalScores.awayScore;
  if (gameTotal > 60 && Math.random() < 0.03) {
    // 3% chance of very high scoring game when total is already high
    const highTotal = 68 + Math.floor(Math.random() * 22); // 68-90 range
    const homeShare = 0.55 + (Math.random() - 0.5) * 0.2; // 45-65% share
    finalScores.homeScore = Math.round(highTotal * homeShare);
    finalScores.awayScore = highTotal - finalScores.homeScore;
    
    // Ensure realistic distribution (not too lopsided unless it's a blowout)
    if (Math.abs(finalScores.homeScore - finalScores.awayScore) > 30) {
      // Very lopsided (like 70-20)
      if (finalScores.homeScore > finalScores.awayScore) {
        finalScores.homeScore = 60 + Math.floor(Math.random() * 15); // 60-75
        finalScores.awayScore = 10 + Math.floor(Math.random() * 15); // 10-25
      } else {
        finalScores.awayScore = 60 + Math.floor(Math.random() * 15);
        finalScores.homeScore = 10 + Math.floor(Math.random() * 15);
      }
    }
  }

  const finalHomeScore = Math.round(normalizeScore(finalScores.homeScore));
  const finalAwayScore = Math.round(normalizeScore(finalScores.awayScore));

  // Final check for ties - ensure they're extremely rare
  if (finalHomeScore === finalAwayScore) {
    const allowTie = Math.random() < 0.015; // 1.5% chance of tie
    if (!allowTie) {
      // Break the tie - add 1 to home team
      return {
        homeScore: finalHomeScore + 1,
        awayScore: finalAwayScore,
      };
    }
  }

  return {
    homeScore: finalHomeScore,
    awayScore: finalAwayScore,
  };
}

