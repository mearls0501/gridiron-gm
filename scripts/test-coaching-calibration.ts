#!/usr/bin/env ts-node
/**
 * Coaching Calibration Test Script
 * Tests extreme coaching values to verify reasonable impact ranges
 * Usage: npx ts-node scripts/test-coaching-calibration.ts
 */

import { simulateGame } from "../lib/simulation/engine";
import { supabase } from "../lib/supabase-client";
import {
  Coach,
  CoachingStaff,
  getNeutralCoach,
} from "../lib/simulation/coaching-influence";

interface CalibrationResult {
  attribute: string;
  lowValue: {
    avgScore: number;
    avgPlays: number;
    passPercentage: number;
  };
  highValue: {
    avgScore: number;
    avgPlays: number;
    passPercentage: number;
  };
  variance: {
    scoreDiff: number;
    playsDiff: number;
    passPctDiff: number;
  };
}

/**
 * Run calibration test for a specific coaching attribute
 */
async function testCoachingAttribute(
  attributeName: keyof Coach,
  role: "HC" | "OC" | "DC",
  homeTeamId: string,
  awayTeamId: string,
  saveGameId: string,
  simulations: number = 5
): Promise<CalibrationResult> {
  console.log(`\nTesting ${attributeName} (${role})...`);

  const testGameId = `test-${Date.now()}`;

  // Create test game
  await supabase.from("games").insert({
    id: testGameId,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    season: 2025,
    week: 1,
    played: false,
    save_game_id: saveGameId,
  });

  // Test with low value (0)
  const lowResults = {
    scores: [] as number[],
    plays: [] as number[],
    passPlays: [] as number[],
    runPlays: [] as number[],
  };

  // Test with high value (100)
  const highResults = {
    scores: [] as number[],
    plays: [] as number[],
    passPlays: [] as number[],
    runPlays: [] as number[],
  };

  console.log(`  Running ${simulations} sims with ${attributeName}=0...`);
  for (let i = 0; i < simulations; i++) {
    try {
      const result = await simulateGame(
        {
          homeTeamId,
          awayTeamId,
          gameId: testGameId,
          season: 2025,
          week: 1,
          includePlayByPlay: true,
          useEnhancedAttributes: true,
          loadCoaches: true,
        },
        undefined,
        saveGameId
      );

      const playByPlay = result.playByPlay || [];
      const passPlays = playByPlay.filter((p) => p.playType === "pass").length;
      const runPlays = playByPlay.filter((p) => p.playType === "run").length;

      lowResults.scores.push(result.homeScore);
      lowResults.plays.push(playByPlay.length);
      lowResults.passPlays.push(passPlays);
      lowResults.runPlays.push(runPlays);
    } catch (error) {
      console.error(`  Simulation ${i + 1} failed:`, error);
    }
  }

  console.log(`  Running ${simulations} sims with ${attributeName}=100...`);
  for (let i = 0; i < simulations; i++) {
    try {
      const result = await simulateGame(
        {
          homeTeamId,
          awayTeamId,
          gameId: testGameId,
          season: 2025,
          week: 1,
          includePlayByPlay: true,
          useEnhancedAttributes: true,
          loadCoaches: true,
        },
        undefined,
        saveGameId
      );

      const playByPlay = result.playByPlay || [];
      const passPlays = playByPlay.filter((p) => p.playType === "pass").length;
      const runPlays = playByPlay.filter((p) => p.playType === "run").length;

      highResults.scores.push(result.homeScore);
      highResults.plays.push(playByPlay.length);
      highResults.passPlays.push(passPlays);
      highResults.runPlays.push(runPlays);
    } catch (error) {
      console.error(`  Simulation ${i + 1} failed:`, error);
    }
  }

  // Clean up test game
  await supabase.from("games").delete().eq("id", testGameId);
  await supabase.from("player_game_stats").delete().eq("game_id", testGameId);

  // Calculate averages
  const avg = (arr: number[]) =>
    arr.reduce((sum, val) => sum + val, 0) / arr.length;

  const lowAvgScore = avg(lowResults.scores);
  const highAvgScore = avg(highResults.scores);
  const lowAvgPlays = avg(lowResults.plays);
  const highAvgPlays = avg(highResults.plays);
  const lowPassPct =
    (avg(lowResults.passPlays) /
      (avg(lowResults.passPlays) + avg(lowResults.runPlays))) *
    100;
  const highPassPct =
    (avg(highResults.passPlays) /
      (avg(highResults.passPlays) + avg(highResults.runPlays))) *
    100;

  return {
    attribute: attributeName,
    lowValue: {
      avgScore: lowAvgScore,
      avgPlays: lowAvgPlays,
      passPercentage: lowPassPct,
    },
    highValue: {
      avgScore: highAvgScore,
      avgPlays: highAvgPlays,
      passPercentage: highPassPct,
    },
    variance: {
      scoreDiff: Math.abs(highAvgScore - lowAvgScore),
      playsDiff: Math.abs(highAvgPlays - lowAvgPlays),
      passPctDiff: Math.abs(highPassPct - lowPassPct),
    },
  };
}

/**
 * Run full calibration test suite
 */
async function runCalibration() {
  console.log("=".repeat(60));
  console.log("COACHING CALIBRATION TEST");
  console.log("=".repeat(60));

  // Get first available save game
  const { data: saveGames } = await supabase
    .from("save_games")
    .select("id")
    .limit(1)
    .single();

  if (!saveGames) {
    console.error("No save games found. Please create a save game first.");
    process.exit(1);
  }

  const saveGameId = saveGames.id;

  // Get two teams
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name")
    .limit(2);

  if (!teams || teams.length < 2) {
    console.error("Not enough teams found.");
    process.exit(1);
  }

  const homeTeamId = teams[0].id;
  const awayTeamId = teams[1].id;

  console.log(`\nUsing Save Game: ${saveGameId}`);
  console.log(`Home Team: ${teams[0].name}`);
  console.log(`Away Team: ${teams[1].name}`);
  console.log("\nRunning 5 simulations per test...\n");

  const results: CalibrationResult[] = [];

  // Test key attributes
  const attributesToTest: Array<{ attr: keyof Coach; role: "HC" | "OC" | "DC" }> =
    [
      { attr: "aggressiveness", role: "HC" },
      { attr: "run_bias", role: "OC" },
      { attr: "pass_bias", role: "OC" },
      { attr: "tempo", role: "OC" },
      { attr: "red_zone_iq", role: "OC" },
      { attr: "blitz_rate", role: "DC" },
      { attr: "turnover_focus", role: "DC" },
      { attr: "scheme_fit", role: "HC" },
      { attr: "leadership", role: "HC" },
      { attr: "talent_dev", role: "HC" },
    ];

  for (const { attr, role } of attributesToTest) {
    try {
      const result = await testCoachingAttribute(
        attr,
        role,
        homeTeamId,
        awayTeamId,
        saveGameId,
        5
      );
      results.push(result);
    } catch (error) {
      console.error(`Failed to test ${attr}:`, error);
    }
  }

  // Print results
  console.log("\n" + "=".repeat(60));
  console.log("CALIBRATION RESULTS");
  console.log("=".repeat(60));
  console.log(
    "\nAttribute".padEnd(20) +
      "Score Δ".padEnd(12) +
      "Plays Δ".padEnd(12) +
      "Pass% Δ".padEnd(12)
  );
  console.log("-".repeat(60));

  results.forEach((r) => {
    console.log(
      r.attribute.padEnd(20) +
        r.variance.scoreDiff.toFixed(1).padEnd(12) +
        r.variance.playsDiff.toFixed(1).padEnd(12) +
        r.variance.passPctDiff.toFixed(1).padEnd(12)
    );
  });

  console.log("\n" + "=".repeat(60));
  console.log("VALIDATION");
  console.log("=".repeat(60));

  // Validate that no single attribute is overpowered (>20 point swing)
  const overpowered = results.filter((r) => r.variance.scoreDiff > 20);
  if (overpowered.length > 0) {
    console.log("\n⚠️  WARNING: The following attributes may be overpowered:");
    overpowered.forEach((r) => {
      console.log(
        `  - ${r.attribute}: ${r.variance.scoreDiff.toFixed(1)} point swing`
      );
    });
  } else {
    console.log("\n✅ All attributes produce reasonable variance (<20 points)");
  }

  // Validate tempo affects play count
  const tempoTest = results.find((r) => r.attribute === "tempo");
  if (tempoTest && tempoTest.variance.playsDiff > 5) {
    console.log(
      `✅ Tempo affects play count: ${tempoTest.variance.playsDiff.toFixed(1)} plays difference`
    );
  } else {
    console.log("⚠️  Tempo may not be affecting play count enough");
  }

  // Validate run/pass bias affects play distribution
  const runBiasTest = results.find((r) => r.attribute === "run_bias");
  const passBiasTest = results.find((r) => r.attribute === "pass_bias");
  if (
    runBiasTest &&
    runBiasTest.variance.passPctDiff > 5 &&
    passBiasTest &&
    passBiasTest.variance.passPctDiff > 5
  ) {
    console.log("✅ Run/Pass bias affects play distribution significantly");
  } else {
    console.log("⚠️  Run/Pass bias may not be affecting play calls enough");
  }

  console.log("\n" + "=".repeat(60));
  console.log("Calibration test complete!");
  console.log("=".repeat(60) + "\n");

  process.exit(0);
}

// Run calibration
runCalibration().catch((error) => {
  console.error("Calibration failed:", error);
  process.exit(1);
});



