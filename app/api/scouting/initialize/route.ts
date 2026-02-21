import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { generateScoutPool } from "@/lib/scouting/scout-generator";

export async function POST(req: Request) {
  try {
    const { teamId, season, saveGameId } = await req.json();

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 }
      );
    }

    if (!season) {
      return NextResponse.json(
        { error: "season is required" },
        { status: 400 }
      );
    }

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    // Check if resources already exist for THIS save game
    let resourcesQuery = supabase
      .from("team_scouting_resources")
      .select("id, scouting_budget")
      .eq("team_id", teamId)
      .eq("season", season);
    
    if (saveGameId) {
      resourcesQuery = resourcesQuery.eq("save_game_id", saveGameId);
    } else {
      resourcesQuery = resourcesQuery.is("save_game_id", null);
    }
    
    const { data: existingResources } = await resourcesQuery.maybeSingle();

    // Create resources if they don't exist for this save game
    let insertedResources = null;
    
    if (!existingResources) {
      // Ensure we're creating fresh resources with correct save_game_id
      const resourcesData: any = {
        team_id: teamId,
        season: season,
        scouting_budget: 7000000, // $7M default per season - always start fresh
        // Note: scouting_points, points_regenerated_per_week, and last_week are deprecated
        // Points are now tracked per-scout in scout_priority table (25/15/10/5 based on priority)
      };
      
      // Always set save_game_id to ensure proper isolation
      if (saveGameId) {
        resourcesData.save_game_id = saveGameId;
      }
      
      const { data: newResources, error: resourcesError } = await supabase
        .from("team_scouting_resources")
        .insert(resourcesData)
        .select()
        .single();

      if (resourcesError) {
        // Handle duplicate key by fetching existing
        if (resourcesError.code === "23505" || resourcesError.message?.includes("duplicate key")) {
          let fetchQuery = supabase
            .from("team_scouting_resources")
            .select("*")
            .eq("team_id", teamId)
            .eq("season", season);
          
          if (saveGameId) {
            fetchQuery = fetchQuery.eq("save_game_id", saveGameId);
          } else {
            fetchQuery = fetchQuery.is("save_game_id", null);
          }
          
          const { data: existing } = await fetchQuery.single();
          insertedResources = existing;
        } else {
          throw resourcesError;
        }
      } else {
        insertedResources = newResources;
      }
    } else {
      // Resources exist - verify they have the correct budget (reset if corrupted)
      // If budget is 0 or negative, reset it to default
      if (!existingResources.scouting_budget || existingResources.scouting_budget <= 0) {
        let updateQuery = supabase
          .from("team_scouting_resources")
          .update({ scouting_budget: 7000000 })
          .eq("team_id", teamId)
          .eq("season", season);
        
        if (saveGameId) {
          updateQuery = updateQuery.eq("save_game_id", saveGameId);
        } else {
          updateQuery = updateQuery.is("save_game_id", null);
        }
        
        await updateQuery;
        existingResources.scouting_budget = 7000000;
      }
      
      // Fetch full resources
      let fetchQuery = supabase
        .from("team_scouting_resources")
        .select("*")
        .eq("team_id", teamId)
        .eq("season", season);
      
      if (saveGameId) {
        fetchQuery = fetchQuery.eq("save_game_id", saveGameId);
      } else {
        fetchQuery = fetchQuery.is("save_game_id", null);
      }
      
      const { data: resourcesData } = await fetchQuery.single();
      insertedResources = resourcesData;
    }
    
    // Verify no scout contracts exist for this save game that shouldn't be there
    // (This is a safety check - contracts should already be filtered by save_game_id)
    let contractsCheckQuery = supabase
      .from("scout_contracts")
      .select("id")
      .eq("team_id", teamId);
    
    if (saveGameId) {
      contractsCheckQuery = contractsCheckQuery.eq("save_game_id", saveGameId);
    } else {
      contractsCheckQuery = contractsCheckQuery.is("save_game_id", null);
    }
    
    const { data: existingContracts } = await contractsCheckQuery;
    
    // Log for debugging
    if (existingContracts && existingContracts.length > 0) {
      console.log(`Found ${existingContracts.length} existing scout contracts for team ${teamId} in save game ${saveGameId || 'null'}`);
    }

    // Ensure scout pool exists for this save game (generate if needed)
    const { data: existingScouts } = await supabase
      .from("scouts")
      .select("id")
      .eq("save_game_id", saveGameId)
      .limit(1);

    if (!existingScouts || existingScouts.length === 0) {
      // Generate initial scout pool (150 scouts) for this save game
      const scoutPool = generateScoutPool(150, saveGameId);
      const { error: poolError } = await supabase
        .from("scouts")
        .insert(scoutPool);

      if (poolError) {
        console.error("Error generating scout pool:", poolError);
        // Continue anyway - pool can be generated later
      } else {
        console.log(`Generated ${scoutPool.length} scouts in the free agent pool for save game ${saveGameId}`);
      }
    }

    return NextResponse.json({
      success: true,
      resources: insertedResources,
      message: "Scouting system initialized. Hire scouts in preseason to begin scouting.",
    });
  } catch (error) {
    console.error("Error initializing scouting:", error);
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : "Failed to initialize scouting";
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
