/**
 * Trade Evaluation Engine
 * Evaluates trades based on:
 * - Salary cap constraints
 * - Team needs (positional)
 * - Player age
 * - Player potential
 * - Team focus (win now vs rebuilding)
 */

import { supabase } from "@/lib/supabase-client";

export interface TradeItem {
  type: "player" | "draft_pick";
  playerId?: string;
  draftPickId?: string;
  player?: {
    id: string;
    full_name: string;
    position: string;
    age: number;
    overall: number;
    potential: number;
    contract_year_1: number;
    contract_year_2?: number;
    contract_year_3?: number;
    contract_year_4?: number;
  };
  draftPick?: {
    id: string;
    season: number;
    round: number;
    pick_overall: number;
  };
}

export interface TeamContext {
  teamId: string;
  wins: number;
  losses: number;
  salaryCap: number;
  currentCapHit: number;
  teamFocus: "win_now" | "rebuilding" | "balanced"; // Determined by record
  positionalNeeds: Record<string, number>; // Position -> need score (0-100)
}

export interface TradeEvaluation {
  overallScore: number; // 0-100, higher = better trade
  salaryCapImpact: number; // Positive = cap space gained, negative = cap space lost
  canAfford: boolean; // Whether team can afford the trade
  positionalFit: number; // 0-100, how well the trade addresses team needs
  ageFit: number; // 0-100, how well player age fits team focus
  potentialFit: number; // 0-100, how well player potential fits team focus
  valueAssessment: number; // 0-100, overall value comparison
  reasoning: string[];
  warnings: string[];
}

/**
 * Determine team focus based on record
 */
export function determineTeamFocus(wins: number, losses: number): "win_now" | "rebuilding" | "balanced" {
  const winPercentage = wins / (wins + losses || 1);
  
  if (winPercentage >= 0.6) {
    return "win_now"; // Winning team, focus on immediate success
  } else if (winPercentage <= 0.3) {
    return "rebuilding"; // Losing team, focus on future
  }
  return "balanced"; // Middle of the pack
}

/**
 * Calculate positional needs for a team
 * Returns a map of position -> need score (0-100)
 * Higher score = greater need
 */
export async function calculatePositionalNeeds(teamId: string): Promise<Record<string, number>> {
  try {
    // Get current roster
    const { data: players } = await supabase
      .from("players")
      .select("position, overall")
      .eq("team_id", teamId);

    if (!players) return {};

    // Count players by position and calculate average overall
    const positionStats: Record<string, { count: number; avgOverall: number; maxOverall: number }> = {};

    players.forEach((player) => {
      if (!positionStats[player.position]) {
        positionStats[player.position] = { count: 0, avgOverall: 0, maxOverall: 0 };
      }
      positionStats[player.position].count += 1;
      positionStats[player.position].avgOverall += player.overall;
      positionStats[player.position].maxOverall = Math.max(
        positionStats[player.position].maxOverall,
        player.overall
      );
    });

    // Calculate need scores
    const needs: Record<string, number> = {};
    const idealCounts: Record<string, number> = {
      QB: 3,
      RB: 4,
      WR: 6,
      TE: 3,
      OT: 4,
      OG: 4,
      C: 2,
      DE: 4,
      DT: 4,
      LB: 6,
      CB: 6,
      S: 4,
      K: 1,
      P: 1,
    };

    Object.entries(positionStats).forEach(([position, stats]) => {
      const avgOverall = stats.avgOverall / stats.count;
      const idealCount = idealCounts[position] || 3;
      
      // Need based on count (too few players)
      const countNeed = Math.max(0, (idealCount - stats.count) / idealCount) * 50;
      
      // Need based on quality (low overall ratings)
      const qualityNeed = Math.max(0, (75 - avgOverall) / 75) * 50;
      
      // Need based on best player (no star player)
      const starNeed = stats.maxOverall < 80 ? 20 : 0;
      
      needs[position] = Math.min(100, countNeed + qualityNeed + starNeed);
    });

    return needs;
  } catch (err) {
    console.error("Error calculating positional needs:", err);
    return {};
  }
}

/**
 * Get team context for trade evaluation
 */
export async function getTeamContext(teamId: string, season: number): Promise<TeamContext | null> {
  try {
    // Get team info
    const { data: team } = await supabase
      .from("teams")
      .select("id, salary_cap_total")
      .eq("id", teamId)
      .single();

    if (!team) return null;

    // Get current players for cap calculation
    const { data: players } = await supabase
      .from("players")
      .select("contract_year_1")
      .eq("team_id", teamId);

    const currentCapHit = (players || []).reduce(
      (sum, p) => sum + (p.contract_year_1 || 0),
      0
    );

    const salaryCap = team.salary_cap_total || 255000000;

    // Get team record
    const { data: seasonData } = await supabase
      .from("seasons")
      .select("id")
      .eq("year", season)
      .single();

    let wins = 0;
    let losses = 0;

    if (seasonData) {
      const { data: stats } = await supabase
        .from("team_season_stats")
        .select("wins, losses")
        .eq("season_id", seasonData.id)
        .eq("team_id", teamId)
        .single();

      if (stats) {
        wins = stats.wins || 0;
        losses = stats.losses || 0;
      }
    }

    // If no stats, calculate from games
    if (wins === 0 && losses === 0) {
      const { data: games } = await supabase
        .from("games")
        .select("home_team_id, away_team_id, home_score, away_score")
        .eq("season", season)
        .eq("played", true)
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);

      games?.forEach((game) => {
        if (game.home_score === null || game.away_score === null) return;
        const isHome = game.home_team_id === teamId;
        const teamScore = isHome ? game.home_score : game.away_score;
        const oppScore = isHome ? game.away_score : game.home_score;

        if (teamScore > oppScore) wins += 1;
        else if (oppScore > teamScore) losses += 1;
      });
    }

    const teamFocus = determineTeamFocus(wins, losses);
    const positionalNeeds = await calculatePositionalNeeds(teamId);

    return {
      teamId,
      wins,
      losses,
      salaryCap,
      currentCapHit,
      teamFocus,
      positionalNeeds,
    };
  } catch (err) {
    console.error("Error getting team context:", err);
    return null;
  }
}

/**
 * Evaluate a trade from a team's perspective
 */
export async function evaluateTrade(
  teamContext: TeamContext,
  itemsReceiving: TradeItem[],
  itemsGiving: TradeItem[]
): Promise<TradeEvaluation> {
  const reasoning: string[] = [];
  const warnings: string[] = [];

  // Calculate salary cap impact
  let salaryCapImpact = 0;
  let canAfford = true;

  // Calculate cap hit of players being received
  let receivingCapHit = 0;
  for (const item of itemsReceiving) {
    if (item.type === "player" && item.player) {
      receivingCapHit += item.player.contract_year_1 || 0;
    }
  }

  // Calculate cap hit of players being given
  let givingCapHit = 0;
  for (const item of itemsGiving) {
    if (item.type === "player" && item.player) {
      givingCapHit += item.player.contract_year_1 || 0;
    }
  }

  salaryCapImpact = givingCapHit - receivingCapHit;
  const newCapHit = teamContext.currentCapHit - givingCapHit + receivingCapHit;
  canAfford = newCapHit <= teamContext.salaryCap;

  if (!canAfford) {
    warnings.push(
      `Trade would exceed salary cap by ${(newCapHit - teamContext.salaryCap).toLocaleString()}`
    );
  } else if (salaryCapImpact > 0) {
    reasoning.push(`Gains ${salaryCapImpact.toLocaleString()} in cap space`);
  } else if (salaryCapImpact < 0) {
    reasoning.push(`Loses ${Math.abs(salaryCapImpact).toLocaleString()} in cap space`);
  }

  // Evaluate positional fit
  let positionalFit = 50; // Neutral starting point
  const positionalScores: number[] = [];

  for (const item of itemsReceiving) {
    if (item.type === "player" && item.player) {
      const position = item.player.position;
      const need = teamContext.positionalNeeds[position] || 0;
      positionalScores.push(need);
      
      if (need > 50) {
        reasoning.push(`Addresses need at ${position} (need score: ${need.toFixed(0)})`);
      }
    }
  }

  if (positionalScores.length > 0) {
    positionalFit = positionalScores.reduce((sum, score) => sum + score, 0) / positionalScores.length;
  }

  // Evaluate age fit based on team focus
  let ageFit = 50; // Neutral
  const ageScores: number[] = [];

  for (const item of itemsReceiving) {
    if (item.type === "player" && item.player) {
      const age = item.player.age;
      let score = 50;

      if (teamContext.teamFocus === "win_now") {
        // Prefer younger veterans (25-30) for win-now teams
        if (age >= 25 && age <= 30) {
          score = 90;
        } else if (age < 25) {
          score = 70; // Young but may lack experience
        } else if (age > 30) {
          score = 40; // Older, may decline soon
        }
      } else if (teamContext.teamFocus === "rebuilding") {
        // Prefer younger players (22-27) for rebuilding teams
        if (age >= 22 && age <= 27) {
          score = 90;
        } else if (age < 22) {
          score = 75; // Very young, high potential
        } else if (age > 27) {
          score = 30; // Too old for rebuild
        }
      } else {
        // Balanced: prefer 24-28
        if (age >= 24 && age <= 28) {
          score = 85;
        } else {
          score = 60;
        }
      }

      ageScores.push(score);
      
      if (score > 70) {
        reasoning.push(`${item.player.full_name} (age ${age}) fits team focus`);
      } else if (score < 40) {
        warnings.push(`${item.player.full_name} (age ${age}) may not fit team timeline`);
      }
    }
  }

  if (ageScores.length > 0) {
    ageFit = ageScores.reduce((sum, score) => sum + score, 0) / ageScores.length;
  }

  // Evaluate potential fit
  let potentialFit = 50;
  const potentialScores: number[] = [];

  for (const item of itemsReceiving) {
    if (item.type === "player" && item.player) {
      const potential = item.player.potential;
      const overall = item.player.overall;
      const potentialGap = potential - overall;
      let score = 50;

      if (teamContext.teamFocus === "rebuilding") {
        // Rebuilding teams value high potential
        if (potentialGap > 10) {
          score = 90; // High potential
        } else if (potentialGap > 5) {
          score = 75;
        } else if (potential >= 85) {
          score = 80; // Already high overall
        } else {
          score = 50;
        }
      } else if (teamContext.teamFocus === "win_now") {
        // Win-now teams value current overall more
        if (overall >= 85) {
          score = 90; // Elite player
        } else if (overall >= 80) {
          score = 80;
        } else if (potentialGap > 10) {
          score = 60; // High potential but not ready
        } else {
          score = 50;
        }
      } else {
        // Balanced: value both
        score = (overall + potential) / 2;
      }

      potentialScores.push(score);
    } else if (item.type === "draft_pick" && item.draftPick) {
      // Draft picks are valuable for rebuilding, less so for win-now
      if (teamContext.teamFocus === "rebuilding") {
        potentialScores.push(85);
        reasoning.push(`Draft pick #${item.draftPick.pick_overall} valuable for rebuild`);
      } else if (teamContext.teamFocus === "win_now") {
        potentialScores.push(40);
        warnings.push(`Draft pick #${item.draftPick.pick_overall} won't help immediately`);
      } else {
        potentialScores.push(60);
      }
    }
  }

  if (potentialScores.length > 0) {
    potentialFit = potentialScores.reduce((sum, score) => sum + score, 0) / potentialScores.length;
  }

  // Value assessment (comparing what's received vs given)
  let valueAssessment = 50;
  
  // Simple value comparison based on overall ratings and draft pick values
  let receivingValue = 0;
  let givingValue = 0;

  for (const item of itemsReceiving) {
    if (item.type === "player" && item.player) {
      receivingValue += item.player.overall * 1000; // Overall as base value
      receivingValue += (item.player.potential - item.player.overall) * 500; // Potential bonus
    } else if (item.type === "draft_pick" && item.draftPick) {
      // Draft pick value: earlier picks are more valuable
      const pickValue = (225 - item.draftPick.pick_overall) * 50; // Max ~11,250 for #1 pick
      receivingValue += pickValue;
    }
  }

  for (const item of itemsGiving) {
    if (item.type === "player" && item.player) {
      givingValue += item.player.overall * 1000;
      givingValue += (item.player.potential - item.player.overall) * 500;
    } else if (item.type === "draft_pick" && item.draftPick) {
      const pickValue = (225 - item.draftPick.pick_overall) * 50;
      givingValue += pickValue;
    }
  }

  if (givingValue > 0) {
    const valueRatio = receivingValue / givingValue;
    if (valueRatio > 1.2) {
      valueAssessment = 90; // Great value
      reasoning.push("Receiving significantly more value than giving");
    } else if (valueRatio > 1.05) {
      valueAssessment = 75; // Good value
      reasoning.push("Receiving more value than giving");
    } else if (valueRatio > 0.95) {
      valueAssessment = 60; // Fair value
      reasoning.push("Fair value exchange");
    } else if (valueRatio > 0.8) {
      valueAssessment = 40; // Poor value
      warnings.push("Giving more value than receiving");
    } else {
      valueAssessment = 20; // Very poor value
      warnings.push("Significantly overpaying in this trade");
    }
  }

  // Calculate overall score (weighted average)
  const weights = {
    salaryCap: canAfford ? 0.15 : 0.3, // Higher weight if can't afford
    positionalFit: 0.25,
    ageFit: 0.15,
    potentialFit: 0.15,
    valueAssessment: 0.3,
  };

  let overallScore = 0;
  if (canAfford) {
    overallScore =
      positionalFit * weights.positionalFit +
      ageFit * weights.ageFit +
      potentialFit * weights.potentialFit +
      valueAssessment * weights.valueAssessment;
    
    // Bonus for cap space gained
    if (salaryCapImpact > 0) {
      overallScore += Math.min(10, salaryCapImpact / 1000000); // Up to 10 point bonus
    }
  } else {
    // Can't afford = very low score
    overallScore = 20;
  }

  overallScore = Math.max(0, Math.min(100, overallScore));

  return {
    overallScore,
    salaryCapImpact,
    canAfford,
    positionalFit,
    ageFit,
    potentialFit,
    valueAssessment,
    reasoning,
    warnings,
  };
}

