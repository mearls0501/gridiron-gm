import { supabase } from "@/lib/supabase-client";
import { ChecklistItem, StageProgress } from "./types";
import { GameSettings } from "@/lib/store/game-store";

export async function getStageProgress(
  teamId: string,
  saveGameId: string,
  season: number,
  week: number,
  phase: string,
  settings: GameSettings
): Promise<StageProgress> {
  if (phase === "preseason" || week === 0) {
    return getPreseasonProgress(teamId, saveGameId, season, settings);
  } else if (phase === "regular_season") {
    return getRegularSeasonProgress(teamId, saveGameId, week, settings);
  } else if (phase === "offseason" || week >= 23) {
    return getOffseasonProgress(teamId, saveGameId, season, week, settings);
  } else if (phase === "playoffs") {
    return {
      stage: "playoffs",
      week,
      completionPercentage: 100,
      items: [],
      canAdvance: true,
    };
  }

  // Fallback
  return {
    stage: phase as "preseason" | "regular_season" | "playoffs" | "offseason",
    week,
    completionPercentage: 0,
    items: [],
    canAdvance: true,
  };
}

async function getPreseasonProgress(
  teamId: string,
  saveGameId: string,
  season: number,
  settings: GameSettings
): Promise<StageProgress> {
  const items: ChecklistItem[] = [];

  // 1. Generate Draft Prospects
  const { count: prospectCount } = await supabase
    .from("draft_prospects")
    .select("*", { count: "exact", head: true })
    .eq("season", season)
    .eq("save_game_id", saveGameId);

  const prospectsGenerated = (prospectCount || 0) > 0;

  items.push({
    id: "generate_prospects",
    label: "Generate Draft Class",
    description: prospectsGenerated
      ? "Draft class has been automatically generated for this season."
      : "Create the incoming rookie class for the upcoming draft.",
    status: prospectsGenerated ? "completed" : "pending",
    isRequired: true,
    isBlocking: !prospectsGenerated, // Don't block if already generated
    actionLabel: prospectsGenerated ? "View Class" : "Generate Class",
    actionUrl: prospectsGenerated ? "/draft" : undefined, // Action handled by page for generation
  });

  // 2. Hire Staff
  const { data: contracts } = await supabase
    .from("scout_contracts")
    .select("role")
    .eq("team_id", teamId)
    .eq("save_game_id", saveGameId);

  const hiredRoles = new Set(contracts?.map((c) => c.role) || []);
  const requiredRoles = [
    "evaluator",
    "tape_grinder",
    "character_coach",
    "athletic_analyst",
  ];
  const hiringComplete = requiredRoles.every((r) => hiredRoles.has(r));

  items.push({
    id: "hire_staff",
    label: "Hire Scouting Department",
    description: "Hire 4 scouts, one of each archetype.",
    status: hiringComplete ? "completed" : "pending",
    isRequired: true,
    isBlocking: true,
    actionLabel: "Manage Staff",
    actionUrl: "/scouts",
  });

  // 3. Assign Priorities
  const { data: priorities } = await supabase
    .from("scout_priority")
    .select("id")
    .eq("team_id", teamId)
    .eq("save_game_id", saveGameId);

  const prioritiesSet = (priorities?.length || 0) >= 4;

  items.push({
    id: "assign_priorities",
    label: "Assign Scout Priorities",
    description: "Set scouting priorities for your staff.",
    status: prioritiesSet ? "completed" : hiringComplete ? "pending" : "locked",
    isRequired: true,
    isBlocking: true,
    actionLabel: "Assign Priorities",
    actionUrl: "/scouts", // Actually on preseason page usually
  });

  // 4. Cut Roster
  // Check current roster size
  // Note: We need to join with assignments if possible, but simple count is okay for now
  // Using a simplified check assuming 'players' table has team_id updated
  // Real implementation might need to check `player_team_assignments`

  // Check assignments first
  const { count: assignmentCount } = await supabase
    .from("player_team_assignments")
    .select("*", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("save_game_id", saveGameId);

  let rosterCount = assignmentCount || 0;

  if (rosterCount === 0) {
    // Fallback to base table if no assignments
    const { count: baseCount } = await supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId);
    rosterCount = baseCount || 0;
  }

  const rosterValid = rosterCount <= 53;

  items.push({
    id: "cut_roster",
    label: "Finalize 53-Man Roster",
    description: `Cut your roster down to 53 players. Current: ${rosterCount}`,
    status: rosterValid ? "completed" : "pending",
    isRequired: true,
    isBlocking: !settings.autoRosterMoves, // Block if manual
    actionLabel: "Manage Roster",
    actionUrl: "/teams/roster",
  });

  // 5. Salary Cap Compliance
  const { calculateTeamCapHit } = await import("@/lib/utils/player-contracts");
  const currentCapHit = await calculateTeamCapHit(teamId, saveGameId);
  const SALARY_CAP = 255000000;
  const capSpace = SALARY_CAP - currentCapHit;
  const isUnderCap = currentCapHit <= SALARY_CAP;
  const capOverage = Math.max(0, currentCapHit - SALARY_CAP);

  items.push({
    id: "salary_cap",
    label: "Salary Cap Compliance",
    description: isUnderCap
      ? `Under the cap with $${(capSpace / 1000000).toFixed(1)}M remaining.`
      : `Over the cap by $${(capOverage / 1000000).toFixed(1)}M. You must cut players or restructure contracts.`,
    status: isUnderCap ? "completed" : "pending",
    isRequired: true,
    isBlocking: true, // ALWAYS blocking - can't start season over the cap
    actionLabel: isUnderCap ? "View Contracts" : "Fix Cap",
    actionUrl: "/teams/contracts",
  });

  const completed = items.filter((i) => i.status === "completed").length;
  const blockingItems = items.filter(
    (i) => i.isBlocking && i.status !== "completed"
  );

  return {
    stage: "preseason",
    week: 0,
    completionPercentage: Math.round((completed / items.length) * 100),
    items,
    canAdvance: blockingItems.length === 0,
    blockingReason:
      blockingItems.length > 0
        ? `Complete: ${blockingItems[0].label}`
        : undefined,
  };
}

async function getRegularSeasonProgress(
  teamId: string,
  saveGameId: string,
  week: number,
  settings: GameSettings
): Promise<StageProgress> {
  const items: ChecklistItem[] = [];

  // Regular season is mostly about playing the game/simulating
  // But if Manual settings are on, we might want to enforce checking things

  // Example: Check if scouting points spent if Manual Scouting is on
  if (!settings.autoScouting) {
    // Simplified check: just reminding them
    items.push({
      id: "weekly_scouting",
      label: "Weekly Scouting",
      description: "Assign scouting points for the week.",
      status: "pending", // Logic to check if actually done is complex, maybe just a reminder
      isRequired: false,
      isBlocking: false, // Don't block for now to avoid annoyance, just remind
      actionLabel: "Scouting",
      actionUrl: "/scouting",
    });
  }

  return {
    stage: "regular_season",
    week,
    completionPercentage: 100, // Assume ready unless specific blocks
    items,
    canAdvance: true,
  };
}

async function getOffseasonProgress(
  teamId: string,
  saveGameId: string,
  season: number,
  week: number,
  _settings: GameSettings
): Promise<StageProgress> {
  const items: ChecklistItem[] = [];

  // Week 23: Resign Phase
  // Week 24: Free Agency
  // Week 25: Draft

  if (week === 23) {
    // Check if there are any expiring contracts remaining
    // A contract expires if contract_year_2 is 0 or null (meaning no contract for next year)
    // IMPORTANT: Must match the logic on /teams/contracts page to avoid count mismatches
    // First get players actually on this team, then count their expiring contracts

    let expiringCount = 0;

    try {
      // Get players actually assigned to this team
      const { data: teamPlayers } = await supabase
        .from("player_team_assignments")
        .select("player_id, prospect_id")
        .eq("team_id", teamId)
        .eq("save_game_id", saveGameId);

      if (teamPlayers && teamPlayers.length > 0) {
        const playerIds = teamPlayers.map((p) => p.player_id).filter(Boolean);
        const prospectIds = teamPlayers
          .map((p) => p.prospect_id)
          .filter(Boolean);

        // Get all contracts for this save game
        const { data: allContracts } = await supabase
          .from("player_contracts_per_save_game")
          .select("player_id, prospect_id, contract_year_2")
          .eq("save_game_id", saveGameId);

        // Filter to contracts for team players that are expiring
        if (allContracts) {
          expiringCount = allContracts.filter((c) => {
            const isTeamPlayer =
              (c.player_id && playerIds.includes(c.player_id)) ||
              (c.prospect_id && prospectIds.includes(c.prospect_id));
            const isExpiring =
              c.contract_year_2 === null ||
              c.contract_year_2 === undefined ||
              c.contract_year_2 === 0 ||
              (typeof c.contract_year_2 === "string" &&
                parseFloat(c.contract_year_2) === 0);
            return isTeamPlayer && isExpiring;
          }).length;
        }
      }
    } catch (error) {
      console.error("[Checklist] Error counting expiring contracts:", error);
      expiringCount = 0;
    }

    const hasExpiringContracts = expiringCount > 0;

    items.push({
      id: "resign_players",
      label: "Resign Players & Coaches",
      description: hasExpiringContracts
        ? `Review ${expiringCount} expiring contract(s) and offer extensions. (Optional)`
        : "No expiring contracts. You may proceed.",
      status: hasExpiringContracts ? "pending" : "completed",
      isRequired: false, // Make it optional - not required
      isBlocking: false, // Not blocking - can always advance
      actionLabel: "View Expiring",
      actionUrl: "/teams/contracts",
    });
  } else if (week === 24) {
    // Check free agency bidding stage
    const { data: freeAgencyStage } = await supabase
      .from("free_agency_stage")
      .select("current_stage, stage_status")
      .eq("save_game_id", saveGameId)
      .eq("season", season)
      .maybeSingle();

    const stageComplete = freeAgencyStage?.stage_status === "completed";
    const currentStage = freeAgencyStage?.current_stage || 0;

    let description =
      "Complete all 4 bidding stages to finalize free agency signings.";
    let status: "completed" | "pending" = "pending";

    if (!freeAgencyStage) {
      description = "Start the free agency bidding process.";
    } else if (stageComplete) {
      description =
        "Free agency bidding completed. All players have been signed.";
      status = "completed";
    } else {
      description = `Complete bidding stages (currently on stage ${currentStage} of 4).`;
    }

    items.push({
      id: "free_agency",
      label: "Free Agency Bidding",
      description,
      status,
      isRequired: false, // Make it optional
      isBlocking: false, // Not blocking - can advance even if not complete
      actionLabel: freeAgencyStage
        ? `Stage ${currentStage}/4`
        : "Start Bidding",
      actionUrl: "/free-agents",
    });
  } else if (week === 25) {
    // Check if draft is complete
    // Logic: Check both draft_state status and pick count
    const { count } = await supabase
      .from("draft_picks")
      .select("*", { count: "exact", head: true })
      .eq("season", season)
      .eq("save_game_id", saveGameId)
      .not("selected_player_id", "is", null);

    // Also check draft_state status
    const { data: draftState } = await supabase
      .from("draft_state")
      .select("status")
      .eq("season", season)
      .eq("save_game_id", saveGameId)
      .maybeSingle();

    const draftStarted = (count || 0) > 0;
    const picksComplete = (count || 0) >= 224; // 32 teams × 7 rounds
    const stateComplete = draftState?.status === "completed";
    const draftComplete = picksComplete || stateComplete; // Complete if either condition is true

    items.push({
      id: "nfl_draft",
      label: "NFL Draft",
      description: "Draft rookie players.",
      status: draftComplete ? "completed" : "pending",
      isRequired: true,
      isBlocking: true, // Must complete draft to proceed to next season
      actionLabel: draftStarted ? "Continue Draft" : "Start Draft",
      actionUrl: "/draft",
    });
  }

  const blockingItems = items.filter(
    (i) => i.isBlocking && i.status !== "completed"
  );

  // For optional tasks (isRequired: false), count them as completed for percentage calculation
  const requiredItems = items.filter((i) => i.isRequired);
  const completedRequired = requiredItems.filter(
    (i) => i.status === "completed"
  ).length;

  // Calculate completion percentage based on required items only
  // If all items are optional, show 100%
  const completionPercentage =
    requiredItems.length > 0
      ? Math.round((completedRequired / requiredItems.length) * 100)
      : 100;

  // For weeks 23 and 24, always allow advance (tasks are optional)
  // Only week 25 (draft) can block advancement
  const canAdvance =
    week === 25
      ? blockingItems.length === 0 // Week 25: only block if draft is incomplete
      : true; // Weeks 23-24: always allow advance

  return {
    stage: "offseason",
    week,
    completionPercentage,
    items,
    canAdvance,
    blockingReason:
      blockingItems.length > 0
        ? `Complete: ${blockingItems[0].label}`
        : undefined,
  };
}
