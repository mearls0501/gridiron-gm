import { supabase } from "@/lib/supabase-client";
import { selectCPUProspect, isCPUTeam } from "@/lib/draft/cpu-drafting";
import { generateContract } from "@/lib/contract-generator";
import { upsertProspectContract } from "@/lib/utils/player-contracts";

/**
 * Get the next available pick for a team (with round info)
 * currentPickOverall represents the NEXT pick to be made (not the last made pick)
 * So we query for picks >= currentPickOverall to include the current pick
 * @deprecated - kept for backwards compatibility but not used in optimized simulation
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getNextPickWithRound(
  season: number,
  saveGameId: string,
  currentPickOverall: number
): Promise<{
  pickId: string;
  teamId: string;
  pickOverall: number;
  round: number;
} | null> {
  const { data: nextPick } = await supabase
    .from("draft_picks")
    .select("id, owning_team_id, pick_overall, round")
    .eq("season", season)
    .eq("save_game_id", saveGameId)
    .gte("pick_overall", currentPickOverall) // Use >= to include current pick
    .is("selected_player_id", null)
    .order("pick_overall", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextPick) {
    return null;
  }

  return {
    pickId: nextPick.id,
    teamId: nextPick.owning_team_id,
    pickOverall: nextPick.pick_overall,
    round: nextPick.round,
  };
}

/**
 * Make a draft pick directly (without HTTP call)
 * @deprecated - kept for backwards compatibility but not used in optimized simulation
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function makeDraftPick(
  pickId: string,
  teamId: string,
  prospectId: string,
  season: number,
  saveGameId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get draft pick
    const { data: draftPick, error: pickError } = await supabase
      .from("draft_picks")
      .select("*")
      .eq("id", pickId)
      .eq("owning_team_id", teamId)
      .eq("save_game_id", saveGameId)
      .single();

    if (pickError || !draftPick) {
      return { success: false, error: "Draft pick not found" };
    }

    // Check if pick is already used
    if (draftPick.selected_player_id || draftPick.status === "used") {
      return { success: false, error: "Pick already used" };
    }

    // Get prospect
    const { data: prospect, error: prospectError } = await supabase
      .from("draft_prospects")
      .select("*")
      .eq("id", prospectId)
      .single();

    if (prospectError || !prospect) {
      return { success: false, error: "Prospect not found" };
    }

    // Note: Already drafted check is handled in simulation loop, skip here for performance
    // Get scouting report if available (non-blocking, use prospect data if not found)
    const { data: scoutingReport } = await supabase
      .from("scouted_prospects")
      .select(
        "est_overall_low, est_overall_high, est_potential_low, est_potential_high"
      )
      .eq("team_id", teamId)
      .eq("prospect_id", prospectId)
      .eq("save_game_id", saveGameId)
      .maybeSingle();

    // Use scouted ratings if available
    const overall =
      scoutingReport?.est_overall_low && scoutingReport?.est_overall_high
        ? Math.round(
            (scoutingReport.est_overall_low + scoutingReport.est_overall_high) /
              2
          )
        : prospect.overall;
    // Note: potential is calculated but not currently used in contract generation
    // const potential = scoutingReport?.est_potential_low && scoutingReport?.est_potential_high
    //   ? Math.round((scoutingReport.est_potential_low + scoutingReport.est_potential_high) / 2)
    //   : prospect.potential;

    // Generate rookie contract based on draft position
    // Rookie contracts only have year 1 - years 2-4 are NULL (no contract yet)
    const draftPosition = draftPick.pick_overall;
    const contractMultiplier = Math.max(0.5, 1 - (draftPosition - 1) / 256);
    const adjustedOverall = 60 + (overall - 60) * contractMultiplier;
    const contract = generateContract(prospect.position, adjustedOverall);

    // Draft prospects stay in draft_prospects table - do NOT insert into players table
    // Create contract in player_contracts_per_save_game using prospect_id
    // Rookie contracts: only year 1 has a value, years 2-4 are NULL (no contract yet)
    const contractResult = await upsertProspectContract(
      prospectId,
      saveGameId,
      {
        team_id: teamId,
        contract_year_1: contract.contract_year_1, // Year 1 salary
        contract_year_2: undefined, // undefined - no contract for year 2 yet (rookie contract)
        contract_year_3: undefined, // undefined - no contract for year 3 yet (rookie contract)
        contract_year_4: undefined, // undefined - no contract for year 4 yet (rookie contract)
        signing_bonus: contract.signing_bonus,
      }
    );

    if (!contractResult.success) {
      return {
        success: false,
        error: `Failed to create contract: ${contractResult.error}`,
      };
    }

    // Create player_team_assignments entry for this save game using prospect_id
    // Draft prospects are tracked via prospect_id, not player_id
    if (saveGameId) {
      // Check if assignment already exists
      const { data: existing } = await supabase
        .from("player_team_assignments")
        .select("id")
        .eq("prospect_id", prospectId)
        .eq("save_game_id", saveGameId)
        .maybeSingle();

      const assignmentData = {
        prospect_id: prospectId, // Use prospect_id, not player_id
        player_id: null, // NULL for drafted prospects
        team_id: teamId,
        save_game_id: saveGameId,
        assigned_reason: "draft",
        season: season,
        week: 0, // Draft happens in offseason
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

      if (
        assignmentError &&
        !assignmentError.message?.includes("does not exist") &&
        assignmentError.code !== "42P01"
      ) {
        console.error(
          "Failed to create player assignment:",
          assignmentError.message
        );
        return {
          success: false,
          error: `Failed to assign drafted player to team: ${assignmentError.message}`,
        };
      }
    }

    // Update draft pick
    const { error: updatePickError } = await supabase
      .from("draft_picks")
      .update({
        selected_player_id: prospectId,
        status: "used",
        updated_at: new Date().toISOString(),
      })
      .eq("id", pickId);

    if (updatePickError) {
      console.error("Error updating draft pick:", updatePickError);
      return {
        success: false,
        error: `Failed to update draft pick: ${updatePickError.message}`,
      };
    }

    // Create draft_results entry
    const { error: draftResultError } = await supabase
      .from("draft_results")
      .upsert(
        {
          draft_pick_id: pickId,
          prospect_id: prospectId,
          player_id: prospectId, // Same ID since we use prospect ID for player
          team_id: teamId,
          season: draftPick.season,
          signed_at: new Date().toISOString(),
          save_game_id: saveGameId,
        },
        {
          onConflict: "draft_pick_id",
        }
      );

    if (draftResultError) {
      console.error("Error creating draft result:", draftResultError);
      // Don't fail if draft result logging fails
    }

    // Update draft state to advance to next pick
    const { data: nextPick } = await supabase
      .from("draft_picks")
      .select("round, pick_overall")
      .eq("season", draftPick.season)
      .eq("save_game_id", saveGameId)
      .gt("pick_overall", draftPick.pick_overall)
      .is("selected_player_id", null)
      .order("pick_overall", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextPick) {
      // Update draft state with next pick
      await supabase
        .from("draft_state")
        .update({
          current_round: nextPick.round,
          current_pick_overall: nextPick.pick_overall,
          updated_at: new Date().toISOString(),
        })
        .eq("save_game_id", saveGameId)
        .eq("season", draftPick.season);
    } else {
      // No more picks, mark draft as completed
      await supabase
        .from("draft_state")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("save_game_id", saveGameId)
        .eq("season", draftPick.season);
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Draft Simulation API
 * Simulates CPU picks until user's turn or full draft completion
 * Uses Server-Sent Events to stream progress updates
 */
export async function POST(req: Request) {
  const { type, season, saveGameId, userTeamId } = await req.json();

  if (!season || !saveGameId) {
    return new Response(
      JSON.stringify({ error: "season and saveGameId are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (type !== "to_next_user_pick" && type !== "full_draft") {
    return new Response(
      JSON.stringify({
        error: "type must be 'to_next_user_pick' or 'full_draft'",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        // Get current draft state
        const { data: draftState } = await supabase
          .from("draft_state")
          .select("*")
          .eq("save_game_id", saveGameId)
          .eq("season", season)
          .single();

        if (!draftState || draftState.status !== "in_progress") {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "Draft is not in progress",
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        let currentPickOverall = draftState.current_pick_overall || 1;
        const maxPicks = 224; // 7 rounds × 32 teams
        let picksMade = 0;
        const maxIterations = type === "full_draft" ? maxPicks : 100; // Safety limit

        console.log(
          `[Simulate] Starting draft simulation: type=${type}, season=${season}, currentPick=${currentPickOverall}, userTeamId=${userTeamId}`
        );

        // Send start message
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "start",
              total: maxPicks,
              current: currentPickOverall - 1,
              message: `Starting draft simulation...`,
            })}\n\n`
          )
        );

        // Get all available prospects
        const prospectsQuery = supabase
          .from("draft_prospects")
          .select("id, full_name, position, overall, potential, traits")
          .eq("season", season)
          .eq("save_game_id", saveGameId);

        const { data: allProspects } = await prospectsQuery.order("overall", {
          ascending: false,
        });

        if (!allProspects || allProspects.length === 0) {
          console.error(
            `[Simulate] No prospects available for season ${season}, saveGameId ${saveGameId}`
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "No prospects available for draft",
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        console.log(`[Simulate] Found ${allProspects.length} total prospects`);

        // Get all drafted prospect IDs
        const { data: draftedPicks } = await supabase
          .from("draft_picks")
          .select("selected_player_id")
          .eq("season", season)
          .eq("save_game_id", saveGameId)
          .not("selected_player_id", "is", null);

        const draftedProspectIds = new Set(
          (draftedPicks || []).map((p) => p.selected_player_id).filter(Boolean)
        );

        console.log(
          `[Simulate] Found ${draftedProspectIds.size} already drafted prospects`
        );

        // Filter available prospects
        const availableProspects = allProspects.filter(
          (p) => !draftedProspectIds.has(p.id)
        );

        console.log(
          `[Simulate] ${availableProspects.length} prospects available for drafting`
        );

        // OPTIMIZATION: Fetch all upcoming picks upfront to avoid per-pick queries
        const { data: allPicks } = await supabase
          .from("draft_picks")
          .select("id, owning_team_id, pick_overall, round, season")
          .eq("season", season)
          .eq("save_game_id", saveGameId)
          .gte("pick_overall", currentPickOverall)
          .is("selected_player_id", null)
          .order("pick_overall", { ascending: true })
          .limit(maxIterations);

        if (!allPicks || allPicks.length === 0) {
          console.log("[Simulate] No picks to simulate");
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "complete",
                picksMade: 0,
                message: "No picks to simulate",
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        console.log(
          `[Simulate] Processing ${allPicks.length} picks in batches`
        );

        // Process picks and collect batch operations
        const picksToProcess: typeof allPicks = [];
        const pickUpdates: Array<{ id: string; selected_player_id: string }> =
          [];
        const contractInserts: Array<{
          player_id: null;
          prospect_id: string;
          save_game_id: string;
          team_id: string;
          contract_year_1: number;
          contract_year_2: null;
          contract_year_3: null;
          contract_year_4: null;
          signing_bonus: number;
          created_at: string;
          updated_at: string;
        }> = [];
        const assignmentInserts: Array<{
          prospect_id: string;
          player_id: null;
          team_id: string;
          save_game_id: string;
          assigned_reason: string;
          season: number;
          week: number;
        }> = [];
        const draftResultInserts: Array<{
          draft_pick_id: string;
          prospect_id: string;
          player_id: string;
          team_id: string;
          season: number;
          signed_at: string;
          save_game_id: string;
        }> = [];

        // Determine which picks to process
        for (const pick of allPicks) {
          // For "to_next_user_pick", stop at user's first pick
          if (type === "to_next_user_pick" && userTeamId) {
            const isCPU = isCPUTeam(pick.owning_team_id, userTeamId);
            if (!isCPU) {
              console.log(
                `[Simulate] Stopping - user's turn at pick ${pick.pick_overall}`
              );
              break;
            }
          }
          picksToProcess.push(pick);
        }

        console.log(`[Simulate] Will process ${picksToProcess.length} picks`);

        // Process picks and collect batch operations
        for (const pick of picksToProcess) {
          // Select prospect
          const selectedProspect = await selectCPUProspect(
            pick.owning_team_id,
            availableProspects,
            saveGameId
          );

          if (!selectedProspect) {
            console.error(
              `[Simulate] No available prospect for pick ${pick.pick_overall}`
            );
            break;
          }

          // Remove from available prospects
          const prospectIndex = availableProspects.findIndex(
            (p) => p.id === selectedProspect.id
          );
          if (prospectIndex !== -1) {
            availableProspects.splice(prospectIndex, 1);
          }
          draftedProspectIds.add(selectedProspect.id);

          // Generate contract
          const draftPosition = pick.pick_overall;
          const contractMultiplier = Math.max(
            0.5,
            1 - (draftPosition - 1) / 256
          );
          const adjustedOverall =
            60 + (selectedProspect.overall - 60) * contractMultiplier;
          const contract = generateContract(
            selectedProspect.position,
            adjustedOverall
          );

          // Collect batch operations
          pickUpdates.push({
            id: pick.id,
            selected_player_id: selectedProspect.id,
          });

          contractInserts.push({
            player_id: null,
            prospect_id: selectedProspect.id,
            save_game_id: saveGameId,
            team_id: pick.owning_team_id,
            contract_year_1: contract.contract_year_1,
            contract_year_2: null,
            contract_year_3: null,
            contract_year_4: null,
            signing_bonus: contract.signing_bonus,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          assignmentInserts.push({
            prospect_id: selectedProspect.id,
            player_id: null,
            team_id: pick.owning_team_id,
            save_game_id: saveGameId,
            assigned_reason: "draft",
            season: season,
            week: 0,
          });

          draftResultInserts.push({
            draft_pick_id: pick.id,
            prospect_id: selectedProspect.id,
            player_id: selectedProspect.id,
            team_id: pick.owning_team_id,
            season: pick.season,
            signed_at: new Date().toISOString(),
            save_game_id: saveGameId,
          });

          picksMade++;

          // Send progress updates every 10 picks
          if (picksMade % 10 === 0 || picksMade === picksToProcess.length) {
            const percentage = Math.round((pick.pick_overall / maxPicks) * 100);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "progress",
                  total: maxPicks,
                  current: pick.pick_overall,
                  picksMade,
                  round: pick.round,
                  pickOverall: pick.pick_overall,
                  percentage,
                  message: `Round ${pick.round}, Pick ${pick.pick_overall}/${maxPicks} (${percentage}%)`,
                })}\n\n`
              )
            );
          }
        }

        console.log(
          `[Simulate] Selected ${picksMade} prospects, now writing to database in batches...`
        );

        // BATCH 1: Update draft picks (one update per pick, but in Promise.all)
        const pickUpdatePromises = pickUpdates.map((update) =>
          supabase
            .from("draft_picks")
            .update({
              selected_player_id: update.selected_player_id,
              status: "used",
              updated_at: new Date().toISOString(),
            })
            .eq("id", update.id)
        );
        await Promise.all(pickUpdatePromises);
        console.log(`[Simulate] Updated ${pickUpdates.length} draft picks`);

        // BATCH 2: Insert contracts (batch insert)
        // Note: We use individual upserts because of partial unique indexes
        if (contractInserts.length > 0) {
          const contractPromises = contractInserts.map((contract) =>
            upsertProspectContract(
              contract.prospect_id,
              contract.save_game_id,
              {
                team_id: contract.team_id,
                contract_year_1: contract.contract_year_1,
                contract_year_2: undefined,
                contract_year_3: undefined,
                contract_year_4: undefined,
                signing_bonus: contract.signing_bonus,
              }
            )
          );
          const contractResults = await Promise.all(contractPromises);
          const successCount = contractResults.filter((r) => r.success).length;
          console.log(
            `[Simulate] Inserted ${successCount}/${contractInserts.length} contracts`
          );
        }

        // BATCH 3: Insert player assignments (batch insert in chunks)
        // Partial unique indexes don't work well with Supabase upsert, so we insert directly
        if (assignmentInserts.length > 0) {
          // Split into chunks to avoid overwhelming the database
          const chunkSize = 100;
          for (let i = 0; i < assignmentInserts.length; i += chunkSize) {
            const chunk = assignmentInserts.slice(i, i + chunkSize);
            const { error: assignmentError } = await supabase
              .from("player_team_assignments")
              .insert(chunk)
              .select();
            if (assignmentError) {
              console.error(
                `Error inserting assignments chunk ${i}-${i + chunkSize}:`,
                assignmentError
              );
            }
          }
          console.log(
            `[Simulate] Inserted ${assignmentInserts.length} assignments`
          );
        }

        // BATCH 4: Insert draft results (batch insert)
        if (draftResultInserts.length > 0) {
          const { error: draftResultError } = await supabase
            .from("draft_results")
            .upsert(draftResultInserts, {
              onConflict: "draft_pick_id",
            });
          if (draftResultError) {
            console.error("Error inserting draft results:", draftResultError);
          } else {
            console.log(
              `[Simulate] Inserted ${draftResultInserts.length} draft results`
            );
          }
        }

        // Update draft state
        const lastProcessedPick = picksToProcess[picksToProcess.length - 1];
        if (lastProcessedPick) {
          currentPickOverall = lastProcessedPick.pick_overall + 1;

          // Find next pick after last processed
          const { data: nextPick } = await supabase
            .from("draft_picks")
            .select("round, pick_overall")
            .eq("season", season)
            .eq("save_game_id", saveGameId)
            .gte("pick_overall", currentPickOverall)
            .is("selected_player_id", null)
            .order("pick_overall", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (nextPick) {
            await supabase
              .from("draft_state")
              .update({
                current_round: nextPick.round,
                current_pick_overall: nextPick.pick_overall,
                updated_at: new Date().toISOString(),
              })
              .eq("save_game_id", saveGameId)
              .eq("season", season);
          } else {
            // Draft complete
            await supabase
              .from("draft_state")
              .update({
                status: "completed",
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("save_game_id", saveGameId)
              .eq("season", season);
            console.log(`[Simulate] Draft complete`);
          }
        }

        // Get updated draft state
        const { data: updatedState } = await supabase
          .from("draft_state")
          .select("*")
          .eq("save_game_id", saveGameId)
          .eq("season", season)
          .single();

        console.log(
          `[Simulate] Completed. Made ${picksMade} picks. Final state:`,
          updatedState
        );

        // Send completion message
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "complete",
              picksMade,
              draftState: updatedState,
              message:
                type === "to_next_user_pick"
                  ? `Simulated ${picksMade} CPU picks. It's now your turn!`
                  : `Successfully simulated ${picksMade} picks!`,
            })}\n\n`
          )
        );

        controller.close();
      } catch (error) {
        console.error("Error simulating draft:", error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              error: error instanceof Error ? error.message : "Unknown error",
            })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
