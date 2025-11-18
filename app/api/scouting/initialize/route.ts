import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { generateScoutingStaff, getDefaultScoutingResources } from "@/lib/scouting/staff-generator";

export async function POST(req: Request) {
  try {
    const { teamId, season } = await req.json();

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

    // Check if scouting is already initialized
    const { data: existingStaff, error: staffCheckError } = await supabase
      .from("scouting_staff")
      .select("id")
      .eq("team_id", teamId)
      .limit(1);

    if (staffCheckError && staffCheckError.code !== "PGRST116") {
      console.error("Error checking existing staff:", staffCheckError);
    }

    const { data: existingResources, error: resourcesCheckError } = await supabase
      .from("team_scouting_resources")
      .select("id")
      .eq("team_id", teamId)
      .eq("season", season)
      .maybeSingle();

    // If error is not "not found", log it but continue
    if (resourcesCheckError && resourcesCheckError.code !== "PGRST116") {
      console.error("Error checking existing resources:", resourcesCheckError);
    }

    const hasStaff = existingStaff && existingStaff.length > 0;
    const hasResources = !!existingResources;

    // If both exist, scouting is already initialized
    if (hasStaff && hasResources) {
      return NextResponse.json({
        success: true,
        message: "Scouting is already initialized for this team and season",
        alreadyInitialized: true,
      });
    }

    let insertedStaff = null;

    // Create staff if it doesn't exist
    if (!hasStaff) {
      // Generate scouting staff
      const staff = generateScoutingStaff(teamId);

      // Insert staff
      const { data: newStaff, error: staffError } = await supabase
        .from("scouting_staff")
        .insert(staff)
        .select();

      if (staffError) {
        console.error("Error inserting scouting staff:", staffError);
        throw new Error(`Failed to insert scouting staff: ${staffError.message}`);
      }

      insertedStaff = newStaff;
    } else {
      // Fetch existing staff for response
      const { data: staffData } = await supabase
        .from("scouting_staff")
        .select("*")
        .eq("team_id", teamId);
      insertedStaff = staffData;
    }

    // Create resources if they don't exist
    let insertedResources = null;
    
    if (!hasResources) {
      const resources = getDefaultScoutingResources();
      const resourcesData: any = {
        team_id: teamId,
        season: season,
        ...resources,
        last_regeneration: new Date().toISOString(),
      };
      
      // Add last_week if the column exists (from migration update_scouting_weekly_budget.sql)
      // The migration should have added this column, but we'll handle gracefully if it hasn't
      resourcesData.last_week = 1;
      
      const { data: newResources, error: resourcesError } = await supabase
        .from("team_scouting_resources")
        .insert(resourcesData)
        .select()
        .single();

      if (resourcesError) {
        // If error is about last_week column not existing, try without it
        if (resourcesError.message?.includes("last_week") || resourcesError.code === "42703") {
          delete resourcesData.last_week;
          const { data: retryResources, error: retryError } = await supabase
            .from("team_scouting_resources")
            .insert(resourcesData)
            .select()
            .single();
          
          if (retryError) {
            throw retryError;
          }
          insertedResources = retryResources;
        } else {
          throw resourcesError;
        }
      } else {
        insertedResources = newResources;
      }
    } else {
      // Fetch existing resources for response
      const { data: resourcesData } = await supabase
        .from("team_scouting_resources")
        .select("*")
        .eq("team_id", teamId)
        .eq("season", season)
        .single();
      insertedResources = resourcesData;
    }

    const staffCount = Array.isArray(insertedStaff) ? insertedStaff.length : (insertedStaff ? 1 : 0);
    const createdStaff = !hasStaff ? "Created scouting staff and " : "";
    const createdResources = !hasResources ? "created resources" : "resources already existed";

    return NextResponse.json({
      success: true,
      staff: insertedStaff,
      resources: insertedResources,
      message: `${createdStaff}${createdResources}. ${staffCount} staff members available.`,
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

