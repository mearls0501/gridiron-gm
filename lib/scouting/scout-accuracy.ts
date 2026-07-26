// @ts-nocheck
/**
 * Scout Accuracy Tracking System
 * Tracks and calculates scout prediction accuracy after draft results are revealed
 */

import { ScoutArchetype } from "./types";

export interface ScoutPrediction {
  scoutId: string;
  prospectId: string;
  prospectName: string;
  position: string;
  draftYear: number;

  // Predictions made before draft
  predictedOverallLow: number;
  predictedOverallHigh: number;
  predictedPotentialLow: number;
  predictedPotentialHigh: number;
  predictedRound?: number;
  predictedBustRisk?: number; // 0-100
  predictedBreakoutChance?: number; // 0-100

  // Actual results (filled in after season(s))
  actualOverall?: number;
  actualPotential?: number;
  actualDraftRound?: number;
  actualDraftPick?: number;
  wasBust?: boolean; // Player significantly underperformed
  wasBreakout?: boolean; // Player significantly overperformed

  // Calculated accuracy (0-100, higher is better)
  overallAccuracy?: number;
  potentialAccuracy?: number;
  roundAccuracy?: number;
  bustPredictionAccuracy?: number;
  breakoutPredictionAccuracy?: number;
}

export interface ScoutAccuracyStats {
  scoutId: string;
  scoutName: string;
  archetype: ScoutArchetype;

  // Aggregate stats
  totalPredictions: number;
  evaluatedPredictions: number; // Predictions with actual results

  // Accuracy scores (0-100)
  overallAccuracyAvg: number;
  potentialAccuracyAvg: number;
  roundAccuracyAvg: number;
  bustPredictionAccuracyAvg: number;
  breakoutPredictionAccuracyAvg: number;

  // Combined score
  compositeAccuracy: number;

  // Track record highlights
  bestPrediction?: ScoutPrediction;
  worstPrediction?: ScoutPrediction;
  biggestHit?: ScoutPrediction; // Called a breakout correctly
  biggestMiss?: ScoutPrediction; // Called a bust that wasn't

  // Trends
  recentAccuracyTrend: "improving" | "declining" | "stable";
  accuracyByPosition: Record<string, number>;
  accuracyByRound: Record<number, number>;
}

/**
 * Calculate how accurate a prediction was
 * Returns 0-100 where 100 is perfect
 */
export function calculatePredictionAccuracy(
  predictedLow: number,
  predictedHigh: number,
  actual: number
): number {
  // Perfect accuracy if actual is within the predicted band
  if (actual >= predictedLow && actual <= predictedHigh) {
    return 100;
  }

  // Calculate how far off the prediction was
  const midpoint = (predictedLow + predictedHigh) / 2;
  const bandSize = (predictedHigh - predictedLow) / 2;
  const distance = Math.abs(actual - midpoint);

  // Penalize based on how far outside the band
  // Every 5 points outside the band reduces accuracy by 10
  const outsideDistance = Math.max(0, distance - bandSize);
  const accuracy = Math.max(0, 100 - (outsideDistance * 2));

  return Math.round(accuracy);
}

/**
 * Calculate round prediction accuracy
 * Perfect if exact, decreases by round difference
 */
export function calculateRoundAccuracy(predictedRound: number, actualRound: number): number {
  const diff = Math.abs(predictedRound - actualRound);

  // Perfect = 100, off by 1 = 80, off by 2 = 60, etc.
  return Math.max(0, 100 - (diff * 20));
}

/**
 * Calculate bust/breakout prediction accuracy
 */
export function calculateRiskAccuracy(
  predictedRisk: number, // 0-100
  actuallyHappened: boolean
): number {
  if (actuallyHappened) {
    // If bust/breakout happened, higher prediction = better
    return predictedRisk;
  } else {
    // If it didn't happen, lower prediction = better
    return 100 - predictedRisk;
  }
}

/**
 * Calculate full accuracy for a scout prediction
 */
export function evaluatePrediction(prediction: ScoutPrediction): ScoutPrediction {
  const evaluated = { ...prediction };

  // Overall accuracy
  if (prediction.actualOverall !== undefined) {
    evaluated.overallAccuracy = calculatePredictionAccuracy(
      prediction.predictedOverallLow,
      prediction.predictedOverallHigh,
      prediction.actualOverall
    );
  }

  // Potential accuracy
  if (prediction.actualPotential !== undefined) {
    evaluated.potentialAccuracy = calculatePredictionAccuracy(
      prediction.predictedPotentialLow,
      prediction.predictedPotentialHigh,
      prediction.actualPotential
    );
  }

  // Round accuracy
  if (prediction.predictedRound !== undefined && prediction.actualDraftRound !== undefined) {
    evaluated.roundAccuracy = calculateRoundAccuracy(
      prediction.predictedRound,
      prediction.actualDraftRound
    );
  }

  // Bust prediction accuracy
  if (prediction.predictedBustRisk !== undefined && prediction.wasBust !== undefined) {
    evaluated.bustPredictionAccuracy = calculateRiskAccuracy(
      prediction.predictedBustRisk,
      prediction.wasBust
    );
  }

  // Breakout prediction accuracy
  if (prediction.predictedBreakoutChance !== undefined && prediction.wasBreakout !== undefined) {
    evaluated.breakoutPredictionAccuracy = calculateRiskAccuracy(
      prediction.predictedBreakoutChance,
      prediction.wasBreakout
    );
  }

  return evaluated;
}

/**
 * Calculate aggregate accuracy stats for a scout
 */
export function calculateScoutAccuracyStats(
  scoutId: string,
  scoutName: string,
  archetype: ScoutArchetype,
  predictions: ScoutPrediction[]
): ScoutAccuracyStats {
  const evaluatedPredictions = predictions.filter(p => p.overallAccuracy !== undefined);

  // Calculate averages
  const overallAccuracies = evaluatedPredictions
    .filter(p => p.overallAccuracy !== undefined)
    .map(p => p.overallAccuracy!);

  const potentialAccuracies = evaluatedPredictions
    .filter(p => p.potentialAccuracy !== undefined)
    .map(p => p.potentialAccuracy!);

  const roundAccuracies = evaluatedPredictions
    .filter(p => p.roundAccuracy !== undefined)
    .map(p => p.roundAccuracy!);

  const bustAccuracies = evaluatedPredictions
    .filter(p => p.bustPredictionAccuracy !== undefined)
    .map(p => p.bustPredictionAccuracy!);

  const breakoutAccuracies = evaluatedPredictions
    .filter(p => p.breakoutPredictionAccuracy !== undefined)
    .map(p => p.breakoutPredictionAccuracy!);

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const overallAccuracyAvg = Math.round(avg(overallAccuracies));
  const potentialAccuracyAvg = Math.round(avg(potentialAccuracies));
  const roundAccuracyAvg = Math.round(avg(roundAccuracies));
  const bustPredictionAccuracyAvg = Math.round(avg(bustAccuracies));
  const breakoutPredictionAccuracyAvg = Math.round(avg(breakoutAccuracies));

  // Composite score (weighted average)
  const compositeAccuracy = Math.round(
    (overallAccuracyAvg * 0.35) +
    (potentialAccuracyAvg * 0.25) +
    (roundAccuracyAvg * 0.15) +
    (bustPredictionAccuracyAvg * 0.125) +
    (breakoutPredictionAccuracyAvg * 0.125)
  );

  // Find best/worst predictions
  const sortedByOverall = [...evaluatedPredictions]
    .filter(p => p.overallAccuracy !== undefined)
    .sort((a, b) => b.overallAccuracy! - a.overallAccuracy!);

  const bestPrediction = sortedByOverall[0];
  const worstPrediction = sortedByOverall[sortedByOverall.length - 1];

  // Find biggest hit (correctly called breakout)
  const biggestHit = evaluatedPredictions.find(
    p => p.wasBreakout && p.predictedBreakoutChance && p.predictedBreakoutChance >= 70
  );

  // Find biggest miss (called bust but wasn't)
  const biggestMiss = evaluatedPredictions.find(
    p => !p.wasBust && p.predictedBustRisk && p.predictedBustRisk >= 70
  );

  // Calculate accuracy by position
  const positionGroups = evaluatedPredictions.reduce((acc, p) => {
    if (!acc[p.position]) acc[p.position] = [];
    if (p.overallAccuracy !== undefined) acc[p.position].push(p.overallAccuracy);
    return acc;
  }, {} as Record<string, number[]>);

  const accuracyByPosition: Record<string, number> = {};
  for (const [pos, accuracies] of Object.entries(positionGroups)) {
    accuracyByPosition[pos] = Math.round(avg(accuracies));
  }

  // Calculate accuracy by round
  const roundGroups = evaluatedPredictions.reduce((acc, p) => {
    if (p.actualDraftRound !== undefined) {
      if (!acc[p.actualDraftRound]) acc[p.actualDraftRound] = [];
      if (p.overallAccuracy !== undefined) acc[p.actualDraftRound].push(p.overallAccuracy);
    }
    return acc;
  }, {} as Record<number, number[]>);

  const accuracyByRound: Record<number, number> = {};
  for (const [round, accuracies] of Object.entries(roundGroups)) {
    accuracyByRound[Number(round)] = Math.round(avg(accuracies));
  }

  // Calculate trend (comparing first half to second half of predictions)
  let recentAccuracyTrend: "improving" | "declining" | "stable" = "stable";
  if (evaluatedPredictions.length >= 6) {
    const midpoint = Math.floor(evaluatedPredictions.length / 2);
    const firstHalf = evaluatedPredictions.slice(0, midpoint);
    const secondHalf = evaluatedPredictions.slice(midpoint);

    const firstHalfAvg = avg(firstHalf.filter(p => p.overallAccuracy).map(p => p.overallAccuracy!));
    const secondHalfAvg = avg(secondHalf.filter(p => p.overallAccuracy).map(p => p.overallAccuracy!));

    if (secondHalfAvg - firstHalfAvg > 5) {
      recentAccuracyTrend = "improving";
    } else if (firstHalfAvg - secondHalfAvg > 5) {
      recentAccuracyTrend = "declining";
    }
  }

  return {
    scoutId,
    scoutName,
    archetype,
    totalPredictions: predictions.length,
    evaluatedPredictions: evaluatedPredictions.length,
    overallAccuracyAvg,
    potentialAccuracyAvg,
    roundAccuracyAvg,
    bustPredictionAccuracyAvg,
    breakoutPredictionAccuracyAvg,
    compositeAccuracy,
    bestPrediction,
    worstPrediction,
    biggestHit,
    biggestMiss,
    recentAccuracyTrend,
    accuracyByPosition,
    accuracyByRound,
  };
}

/**
 * Determine if a player was a "bust" based on performance
 * Bust = performed significantly worse than projected
 */
export function determineBust(
  predictedOverallMid: number,
  actualOverall: number,
  draftRound: number
): boolean {
  // Early picks have higher bust threshold
  const roundMultiplier = Math.max(1, 4 - draftRound) * 5;
  const bustThreshold = roundMultiplier + 10;

  return (predictedOverallMid - actualOverall) >= bustThreshold;
}

/**
 * Determine if a player was a "breakout" based on performance
 * Breakout = performed significantly better than projected
 */
export function determineBreakout(
  predictedOverallMid: number,
  actualOverall: number,
  draftRound: number
): boolean {
  // Late picks have higher breakout threshold
  const roundMultiplier = draftRound * 3;
  const breakoutThreshold = roundMultiplier + 8;

  return (actualOverall - predictedOverallMid) >= breakoutThreshold;
}

/**
 * Get accuracy rating description
 */
export function getAccuracyRating(accuracy: number): {
  label: string;
  color: string;
  description: string;
} {
  if (accuracy >= 90) {
    return {
      label: "Elite",
      color: "text-emerald-600 bg-emerald-100",
      description: "Exceptionally accurate evaluations",
    };
  }
  if (accuracy >= 80) {
    return {
      label: "Excellent",
      color: "text-blue-600 bg-blue-100",
      description: "Highly reliable scout",
    };
  }
  if (accuracy >= 70) {
    return {
      label: "Good",
      color: "text-cyan-600 bg-cyan-100",
      description: "Above average evaluator",
    };
  }
  if (accuracy >= 60) {
    return {
      label: "Average",
      color: "text-amber-600 bg-amber-100",
      description: "Standard performance",
    };
  }
  if (accuracy >= 50) {
    return {
      label: "Below Average",
      color: "text-orange-600 bg-orange-100",
      description: "Needs improvement",
    };
  }
  return {
    label: "Poor",
    color: "text-red-600 bg-red-100",
    description: "Consider replacement",
  };
}

/**
 * Calculate scout experience points earned from a prediction
 */
export function calculateXPFromPrediction(prediction: ScoutPrediction): number {
  let xp = 10; // Base XP for completing an evaluation

  // Bonus for accuracy
  if (prediction.overallAccuracy !== undefined) {
    if (prediction.overallAccuracy >= 95) xp += 25;
    else if (prediction.overallAccuracy >= 85) xp += 15;
    else if (prediction.overallAccuracy >= 75) xp += 10;
    else if (prediction.overallAccuracy >= 65) xp += 5;
  }

  // Big bonus for correctly calling bust/breakout
  if (prediction.wasBust && prediction.predictedBustRisk && prediction.predictedBustRisk >= 60) {
    xp += 30; // "Called it" bonus
  }
  if (prediction.wasBreakout && prediction.predictedBreakoutChance && prediction.predictedBreakoutChance >= 60) {
    xp += 30; // "Saw the potential" bonus
  }

  // Penalty for being wildly wrong
  if (prediction.overallAccuracy !== undefined && prediction.overallAccuracy < 40) {
    xp = Math.max(0, xp - 10);
  }

  return xp;
}

export type { ScoutPrediction, ScoutAccuracyStats };
