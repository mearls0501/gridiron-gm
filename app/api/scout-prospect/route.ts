import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import {
  performInitialScouting,
  performGameTapeReview,
  performCombine,
  performInterview,
  performMedical,
  mergeScoutingResults,
  ProspectTrueData,
} from "@/lib/scouting/engine";
import { ScoutingActionType } from "@/lib/scouting/types";
import { getAvailablePoints, spendScoutPoints } from "@/lib/scouting/weekly-points";
import { getTeamPriorities } from "@/lib/scouting/priorities";
import { getTeamScouts } from "@/lib/scouting/hiring";
import type { Scout } from "@/lib/scouting/types";
import type { ScoutContract } from "@/lib/scouting/types";

const ACTION_COSTS: Record<ScoutingActionType, number> = {
  initial: 1,
  game_tape: 3,
  combine: 5,
  interview: 3,
  medical: 4,
};

export async function POST(req: Request) {
  try {
    const { teamId, prospectId, actionType, scoutId, saveGameId, season, week } = await req.json();

    if (!teamId || !prospectId || !actionType || !saveGameId) {
      return NextResponse.json(
        { error: "teamId, prospectId, actionType, and saveGameId are required" },
        { status: 400 }
      );
    }

    // Validate action type
    const validActions: ScoutingActionType[] = ["initial", "game_tape", "combine", "interview", "medical"];
    if (!validActions.includes(actionType as ScoutingActionType)) {
      return NextResponse.json(
        { error: "Invalid action type" },
        { status: 400 }
      );
    }
    // Type assertion after validation
    const typedActionType = actionType as ScoutingActionType;

    // Get prospect with true attributes
    const { data: prospect, error: prospectError } = await supabase
      .from("draft_prospects")
      .select("*")
      .eq("id", prospectId)
      .eq("save_game_id", saveGameId)
      .single();

    if (prospectError || !prospect) {
      return NextResponse.json(
        { error: "Prospect not found" },
        { status: 404 }
      );
    }

    // Get team's scouts
    const teamScouts = await getTeamScouts(teamId, saveGameId);
    if (teamScouts.length === 0) {
      return NextResponse.json(
        { error: "No scouts hired. Hire scouts in preseason first." },
        { status: 400 }
      );
    }

    // Select scout (use provided scoutId or select best one)
    let selectedScout = teamScouts.find((s) => s.id === scoutId);
    if (!selectedScout) {
      // Select best scout for this action type
      selectedScout = selectBestScoutForAction(teamScouts, typedActionType);
    }

    if (!selectedScout) {
      return NextResponse.json(
        { error: "No suitable scout found" },
        { status: 400 }
      );
    }

    // Get scout's priority
    const currentSeason = season !== undefined && season !== null ? season : prospect.season;
    const currentWeek = week !== undefined && week !== null ? week : 0; // Default to 0 (preseason) not 1
    const priorities = await getTeamPriorities(teamId, saveGameId, currentSeason);
    const scoutPriority = priorities.find((p) => p.scout_id === selectedScout.id);

    if (!scoutPriority) {
      return NextResponse.json(
        { error: "Scout priority not assigned. Assign priorities in preseason first." },
        { status: 400 }
      );
    }

    // Check if scout has enough points
    const cost = ACTION_COSTS[typedActionType];
    const availablePoints = await getAvailablePoints(
      teamId,
      selectedScout.id,
      saveGameId,
      currentSeason,
      currentWeek
    );

    if (availablePoints < cost) {
      return NextResponse.json(
        {
          error: `Not enough points. Need ${cost}, have ${availablePoints}. Points regenerate weekly.`,
        },
        { status: 400 }
      );
    }

    // Build prospect true data
    const trueData: ProspectTrueData = {
      true_overall: prospect.true_overall || prospect.overall,
      true_potential: prospect.true_potential || prospect.potential,
      true_speed: prospect.true_speed,
      true_acceleration: prospect.true_acceleration,
      true_agility: prospect.true_agility,
      true_strength: prospect.true_strength,
      true_awareness: prospect.true_awareness,
      true_instincts: prospect.true_instincts,
      true_technique: prospect.true_technique,
      true_burst: prospect.true_burst,
      true_mental_iq: prospect.true_mental_iq,
      true_competitiveness: prospect.true_competitiveness,
      true_coachability: prospect.true_coachability,
      true_leadership: prospect.true_leadership,
      true_durability: prospect.true_durability,
      true_bust_risk: prospect.true_bust_risk as "low" | "medium" | "high" | undefined,
      true_scheme_fit: prospect.true_scheme_fit,
      true_playstyle: prospect.true_playstyle,
      position: prospect.position,
    };

    // Perform scouting action
    let scoutingResult;
    switch (typedActionType) {
      case "initial":
        scoutingResult = performInitialScouting(selectedScout, trueData, scoutPriority.priority as 1 | 2 | 3 | 4);
        break;
      case "game_tape":
        scoutingResult = performGameTapeReview(selectedScout, trueData, scoutPriority.priority as 1 | 2 | 3 | 4);
        break;
      case "combine":
        scoutingResult = performCombine(selectedScout, trueData, scoutPriority.priority as 1 | 2 | 3 | 4);
        break;
      case "interview":
        scoutingResult = performInterview(selectedScout, trueData, scoutPriority.priority as 1 | 2 | 3 | 4);
        break;
      case "medical":
        scoutingResult = performMedical(selectedScout, trueData, scoutPriority.priority as 1 | 2 | 3 | 4);
        break;
      default:
        return NextResponse.json(
          { error: "Invalid action type" },
          { status: 400 }
        );
    }

    // Get existing scouted prospect data
    const { data: existingScouted } = await supabase
      .from("scouted_prospects")
      .select("*")
      .eq("team_id", teamId)
      .eq("prospect_id", prospectId)
      .eq("save_game_id", saveGameId)
      .single();

    // Merge results
    const mergedData = mergeScoutingResults(
      existingScouted || {},
      scoutingResult
    );

    // Update or create scouted_prospects
    const scoutedData = {
      team_id: teamId,
      prospect_id: prospectId,
      save_game_id: saveGameId,
      est_overall_low: mergedData.est_overall_low,
      est_overall_high: mergedData.est_overall_high,
      est_potential_low: mergedData.est_potential_low,
      est_potential_high: mergedData.est_potential_high,
      trait_reveals: mergedData.trait_reveals || {},
      athletic_bands: mergedData.athletic_bands || {},
      psych_reveals: mergedData.psych_reveals || {},
      scheme_fit: mergedData.scheme_fit,
      confidence: mergedData.confidence,
      updated_at: new Date().toISOString(),
    };

    if (existingScouted) {
      const { error: updateError } = await supabase
        .from("scouted_prospects")
        .update(scoutedData)
        .eq("id", existingScouted.id);

      if (updateError) {
        throw updateError;
      }
    } else {
      const { error: insertError } = await supabase
        .from("scouted_prospects")
        .insert({
          ...scoutedData,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        throw insertError;
      }
    }

    // Log scouting action
    const { error: actionError } = await supabase
      .from("scouting_actions")
      .insert({
        team_id: teamId,
        prospect_id: prospectId,
        scout_id: selectedScout.id,
        save_game_id: saveGameId,
        action_type: typedActionType,
        points_used: cost,
        revealed: scoutingResult,
        created_at: new Date().toISOString(),
      });

    if (actionError) {
      console.error("Error logging scouting action:", actionError);
      // Don't fail the request if logging fails
    }

    // Spend points - this now tracks spent points in the database
    const spendResult = await spendScoutPoints(
      teamId,
      selectedScout.id,
      cost,
      saveGameId,
      currentSeason,
      currentWeek
    );

    if (!spendResult.success) {
      return NextResponse.json(
        {
          error: spendResult.error || "Failed to spend scouting points",
          remaining: spendResult.remaining,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      result: scoutingResult,
      merged: mergedData,
      scout: {
        id: selectedScout.id,
        name: selectedScout.name,
        archetype: selectedScout.archetype,
        priority: scoutPriority.priority,
      },
      pointsUsed: cost,
    });
  } catch (error) {
    console.error("Error scouting prospect:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to scout prospect" },
      { status: 500 }
    );
  }
}

/**
 * Select best scout for a given action type
 */
function selectBestScoutForAction(
  scouts: (Scout & { contract: ScoutContract })[],
  actionType: ScoutingActionType
): (Scout & { contract: ScoutContract }) | undefined {
  if (scouts.length === 0) {
    return undefined;
  }

  // Archetype preferences for each action
  const archetypePreferences: Record<ScoutingActionType, string[]> = {
    initial: ["evaluator", "tape_grinder", "athletic_analyst", "character_coach"],
    game_tape: ["tape_grinder", "evaluator", "athletic_analyst", "character_coach"],
    combine: ["athletic_analyst", "evaluator", "tape_grinder", "character_coach"],
    interview: ["character_coach", "evaluator", "tape_grinder", "athletic_analyst"],
    medical: ["character_coach", "evaluator", "tape_grinder", "athletic_analyst"],
  };

  const preferred = archetypePreferences[actionType] || [];
  
  // Find scout with matching archetype
  for (const archetype of preferred) {
    const scout = scouts.find((s) => s.archetype === archetype);
    if (scout) {
      return scout;
    }
  }

  // Fallback to first scout
  return scouts[0];
}
