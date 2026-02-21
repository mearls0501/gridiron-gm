import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { upsertPlayerContract, calculateTeamCapHit } from "@/lib/utils/player-contracts";

export async function POST(req: Request) {
  try {
    const { playerId, prospectId, teamId, saveGameId } = await req.json();

    if ((!playerId && !prospectId) || !teamId) {
      return NextResponse.json(
        { error: "Player ID and Team ID are required" },
        { status: 400 }
      );
    }

    // Use whichever ID was provided
    const targetId = playerId || prospectId;
    const isProspectRequest = !!prospectId;

    // 1. Check if player is available as a free agent for this save game
    // First check free_agent_availability to see if player/prospect is available
    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required for signing players" },
        { status: 400 }
      );
    }

    console.log("[SignPlayer] Checking availability for targetId:", targetId, "isProspect:", isProspectRequest, "saveGameId:", saveGameId);

    // Try to find availability record - check both player_id and prospect_id
    // Check if it's a player first
    const { data: playerAvailability } = !isProspectRequest ? await supabase
      .from("free_agent_availability")
      .select("player_id, prospect_id, archived")
      .eq("save_game_id", saveGameId)
      .eq("archived", false)
      .eq("player_id", targetId)
      .maybeSingle() : { data: null };

    // If not found as player, check as prospect
    const { data: prospectAvailability } = playerAvailability
      ? { data: null }
      : await supabase
          .from("free_agent_availability")
          .select("player_id, prospect_id, archived")
          .eq("save_game_id", saveGameId)
          .eq("archived", false)
          .eq("prospect_id", targetId)
          .maybeSingle();

    let availability = playerAvailability || prospectAvailability;

    console.log("[SignPlayer] Availability check result:", {
      playerAvailability: !!playerAvailability,
      prospectAvailability: !!prospectAvailability,
      availability: !!availability,
    });

    // If not found in availability table, check if player exists in players table as a free agent (seed data)
    if (!availability) {
      console.log("[SignPlayer] Not found in availability, checking players table for free agent...");
      const { data: freeAgentRecord } = await supabase
        .from("players")
        .select("id, is_free_agent")
        .eq("id", targetId)
        .eq("is_free_agent", true)
        .maybeSingle();

      if (freeAgentRecord) {
        console.log("[SignPlayer] Found free agent in players table, creating availability record...");
        // Create availability record for this save game
        const { error: createError } = await supabase
          .from("free_agent_availability")
          .insert({
            player_id: targetId,
            save_game_id: saveGameId,
            archived: false,
            entered_free_agency_season: 2025, // Default season
            reason: "initial",
          });

        if (createError) {
          console.warn("[SignPlayer] Failed to create availability record:", createError);
          // Continue anyway - we can still sign the player
        } else {
          // Re-fetch the availability record we just created
          const { data: newAvailability } = await supabase
            .from("free_agent_availability")
            .select("player_id, prospect_id, archived")
            .eq("save_game_id", saveGameId)
            .eq("player_id", targetId)
            .maybeSingle();
          availability = newAvailability;
        }
      }
    }

    // If still not found, check draft_prospects table
    if (!availability) {
      console.log("[SignPlayer] Not found in players table, checking draft_prospects...");
      const { data: prospectRecord } = await supabase
        .from("draft_prospects")
        .select("id, save_game_id")
        .eq("id", targetId)
        .eq("save_game_id", saveGameId)
        .maybeSingle();

      if (prospectRecord) {
        console.log("[SignPlayer] Found in draft_prospects, creating availability record...");
        // Create availability record for this prospect
        const { error: createError } = await supabase
          .from("free_agent_availability")
          .insert({
            prospect_id: targetId,
            save_game_id: saveGameId,
            archived: false,
            entered_free_agency_season: 2025, // Default season
            reason: "draft_undrafted",
          });

        if (createError) {
          console.warn("[SignPlayer] Failed to create availability record:", createError);
          // Continue anyway - we can still sign the player
        } else {
          // Re-fetch the availability record we just created
          const { data: newAvailability } = await supabase
            .from("free_agent_availability")
            .select("player_id, prospect_id, archived")
            .eq("save_game_id", saveGameId)
            .eq("prospect_id", targetId)
            .maybeSingle();
          availability = newAvailability;
        }
      }
    }

    if (!availability) {
      // Log more details for debugging
      const { data: allAvailability } = await supabase
        .from("free_agent_availability")
        .select("player_id, prospect_id, archived, save_game_id")
        .eq("save_game_id", saveGameId)
        .limit(10);

      console.log("[SignPlayer] Sample availability records:", allAvailability);
      console.log("[SignPlayer] Looking for targetId:", targetId);

      return NextResponse.json(
        { error: "Free agent not found or not available for this save game" },
        { status: 404 }
      );
    }

    // 2. Fetch the player/prospect data
    const isProspect = !!availability.prospect_id;
    let freeAgent: any = null;

    if (isProspect) {
      // Fetch from draft_prospects
      const { data: prospect, error: prospectError } = await supabase
        .from("draft_prospects")
        .select("*")
        .eq("id", targetId)
        .eq("save_game_id", saveGameId)
        .single();

      if (prospectError || !prospect) {
        return NextResponse.json(
          { error: "Prospect not found" },
          { status: 404 }
        );
      }
      freeAgent = prospect;
    } else {
      // Fetch from players table
      const { data: player, error: playerError } = await supabase
        .from("players")
        .select("*")
        .eq("id", targetId)
        .single();

      if (playerError || !player) {
        return NextResponse.json(
          { error: "Player not found" },
          { status: 404 }
        );
      }
      freeAgent = player;
    }

    // 3. Get current season and week (needed for player assignments and transactions)
    let seasonQuery = supabase
      .from("seasons")
      .select("year, current_week")
      .eq("is_active", true);
    
    if (saveGameId) {
      seasonQuery = seasonQuery.eq("save_game_id", saveGameId);
    } else {
      seasonQuery = seasonQuery.is("save_game_id", null);
    }
    
    const { data: activeSeason } = await seasonQuery.maybeSingle();
    const season = activeSeason?.year || 2025;
    const week = activeSeason?.current_week || 1;

    // 4. Check if team exists and get salary cap info
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id, salary_cap_total")
      .eq("id", teamId)
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        { error: "Team not found" },
        { status: 404 }
      );
    }

    // 5. Calculate current team salary cap usage
    const totalCapHit = await calculateTeamCapHit(teamId, saveGameId);

    // Get team's salary cap (default to 255M if not set)
    const SALARY_CAP = team.salary_cap_total ?? 255000000;
    const remainingCap = SALARY_CAP - totalCapHit;

    // 6. League minimum contract
    const LEAGUE_MINIMUM = 750000;

    // 7. Check if signing this player would exceed the cap
    if (remainingCap < LEAGUE_MINIMUM) {
      return NextResponse.json(
        { 
          error: `Team is over the salary cap. Remaining cap space: $${remainingCap.toLocaleString()}. Cannot sign player for $${LEAGUE_MINIMUM.toLocaleString()}.`,
          remainingCap,
          requiredCap: LEAGUE_MINIMUM,
        },
        { status: 400 }
      );
    }

    // isProspect is already determined above when fetching the player/prospect data

    // 8. Create/update contract in player_contracts_per_save_game
    // Use prospect_id if it's a prospect, player_id if it's a seed player
    let contractResult;
    if (isProspect) {
      const { upsertProspectContract } = await import("@/lib/utils/player-contracts");
      contractResult = await upsertProspectContract(targetId, saveGameId, {
        team_id: teamId,
        contract_year_1: LEAGUE_MINIMUM,
        contract_year_2: LEAGUE_MINIMUM,
        contract_year_3: LEAGUE_MINIMUM,
        contract_year_4: LEAGUE_MINIMUM,
        signing_bonus: 0,
      });
    } else {
      contractResult = await upsertPlayerContract(targetId, saveGameId, {
        team_id: teamId,
        contract_year_1: LEAGUE_MINIMUM,
        contract_year_2: LEAGUE_MINIMUM,
        contract_year_3: LEAGUE_MINIMUM,
        contract_year_4: LEAGUE_MINIMUM,
        signing_bonus: 0,
      });
    }

    if (!contractResult.success) {
      console.error("Error creating contract:", contractResult.error);
      return NextResponse.json(
        { error: "Failed to create contract: " + contractResult.error },
        { status: 500 }
      );
    }

    // 9. Create/update player_team_assignments for this save game
    // Use prospect_id if it's a prospect, player_id if it's a seed player
    {
      // Check if assignment already exists
      const { data: existing } = await supabase
        .from("player_team_assignments")
        .select("id")
        .eq(isProspect ? "prospect_id" : "player_id", targetId)
        .eq("save_game_id", saveGameId)
        .maybeSingle();

      const assignmentData = {
        [isProspect ? "prospect_id" : "player_id"]: targetId,
        [isProspect ? "player_id" : "prospect_id"]: null,
        team_id: teamId,
        save_game_id: saveGameId,
        assigned_reason: "signing",
        season: season,
        week: week,
      };

      let assignmentError;
      if (existing) {
        const { error } = await supabase
          .from("player_team_assignments")
          .update(assignmentData)
          .eq("id", existing.id);
        assignmentError = error;
      } else {
        const { error } = await supabase
          .from("player_team_assignments")
          .insert(assignmentData);
        assignmentError = error;
      }

      if (assignmentError) {
        console.error("Failed to create player assignment:", assignmentError.message);
        return NextResponse.json(
          { error: `Failed to assign player to team: ${assignmentError.message}` },
          { status: 500 }
        );
      }
    }

    // 10. Remove from free agent availability for this save game
    {
      const deleteFilter = isProspect
        ? { prospect_id: targetId, save_game_id: saveGameId }
        : { player_id: targetId, save_game_id: saveGameId };

      const { error: deleteAvailabilityError } = await supabase
        .from("free_agent_availability")
        .delete()
        .match(deleteFilter);

      if (deleteAvailabilityError) {
        console.warn("Failed to remove from free agent availability:", deleteAvailabilityError.message);
        // Don't fail - this is not critical
      }
    }

    // 11. Log transaction
    await supabase.from("transactions").insert({
      player_id: isProspect ? null : targetId,
      prospect_id: isProspect ? targetId : null,
      to_team_id: teamId,
      transaction_type: "signed",
      season: season,
      week: week,
      save_game_id: saveGameId,
      details: JSON.stringify({
        player_name: freeAgent.full_name,
        position: freeAgent.position,
        contract_value: LEAGUE_MINIMUM,
        signing_method: "league_minimum",
      }),
    });

    return NextResponse.json({
      success: true,
      message: `Successfully signed ${freeAgent.full_name} to ${teamId}`,
      player: {
        id: freeAgent.id,
        full_name: freeAgent.full_name,
        position: freeAgent.position,
      },
    });
  } catch (error) {
    console.error("Error signing player:", error);
    return NextResponse.json(
      { error: "Server error: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  }
}

