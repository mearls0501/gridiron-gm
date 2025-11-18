import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import {
  calculateScoutingAccuracy,
  generateScoutingReport,
  selectBestScout,
  getScoutingCost,
  getProspectRegion,
  calculateScoutingProgress,
  ScoutingMethod,
} from "@/lib/scouting/engine";

export async function POST(req: Request) {
  try {
    const { teamId, prospectId, method } = await req.json();

    if (!teamId || !prospectId || !method) {
      return NextResponse.json(
        { error: "teamId, prospectId, and method are required" },
        { status: 400 }
      );
    }

    // Validate method
    const validMethods: ScoutingMethod[] = [
      "initial",
      "tape",
      "combine",
      "pro_day",
      "workout",
      "medical",
      "character", // Keep for backward compatibility
      "team_interview", // New name
    ];
    if (!validMethods.includes(method)) {
      return NextResponse.json(
        { error: "Invalid scouting method" },
        { status: 400 }
      );
    }

    // Get prospect true data
    const { data: prospect, error: prospectError } = await supabase
      .from("draft_prospects")
      .select("*")
      .eq("id", prospectId)
      .single();

    if (prospectError || !prospect) {
      return NextResponse.json(
        { error: "Prospect not found" },
        { status: 404 }
      );
    }

    // Get team scouting resources
    const { data: resources, error: resourcesError } = await supabase
      .from("team_scouting_resources")
      .select("*")
      .eq("team_id", teamId)
      .single();

    if (resourcesError || !resources) {
      return NextResponse.json(
        { error: "Scouting resources not found. Initialize scouting first." },
        { status: 404 }
      );
    }

    // Check if team has enough scouting points
    const cost = getScoutingCost(method);
    if (resources.scouting_points < cost) {
      return NextResponse.json(
        {
          error: `Not enough scouting points. Need ${cost}, have ${resources.scouting_points}`,
        },
        { status: 400 }
      );
    }

    // Get scouting staff
    const { data: staff, error: staffError } = await supabase
      .from("scouting_staff")
      .select("*")
      .eq("team_id", teamId);

    if (staffError || !staff || staff.length === 0) {
      return NextResponse.json(
        { error: "No scouting staff found. Initialize scouting first." },
        { status: 404 }
      );
    }

    // Select best scout for this prospect
    const prospectRegion = getProspectRegion(prospect.college);
    const bestScout = selectBestScout(staff, prospect.position, prospectRegion);

    if (!bestScout) {
      return NextResponse.json(
        { error: "Could not select scout" },
        { status: 500 }
      );
    }

    // Calculate accuracy
    const accuracy = calculateScoutingAccuracy(
      bestScout,
      method,
      prospect.position,
      prospectRegion,
      0 // time decay - could be calculated based on when prospect was generated
    );

    // Get true prospect data (from traits JSONB)
    const trueTraits =
      typeof prospect.traits === "string"
        ? JSON.parse(prospect.traits)
        : prospect.traits || {};

    const trueData = {
      true_overall: prospect.overall,
      true_potential: prospect.potential,
      true_traits: trueTraits,
      character: {
        work_ethic: "good", // Could be stored in prospect data
        leadership: "average",
        coachability: "good",
      },
      injury_history: [], // Could be stored in prospect data
      scheme_fit: "balanced",
    };

    // Get existing aggregated report (one per team/prospect)
    const { data: existingReport, error: existingReportError } = await supabase
      .from("scouting_reports")
      .select("*")
      .eq("team_id", teamId)
      .eq("prospect_id", prospectId)
      .maybeSingle();

    // If error is not "not found", it's a real error
    if (existingReportError && existingReportError.code !== "PGRST116") {
      console.error("Error fetching existing report:", existingReportError);
      return NextResponse.json(
        { error: `Database error: ${existingReportError.message}` },
        { status: 500 }
      );
    }

    // Calculate total points invested (existing + new)
    const existingPoints = existingReport?.total_points_invested || 0;
    const totalPointsInvested = existingPoints + cost;

    // Generate scouting report with progressive revelation
    // Map team_interview to character for engine compatibility
    const engineMethod = method === "team_interview" ? "character" : method;
    let report;
    try {
      report = generateScoutingReport(
        trueData,
        accuracy,
        engineMethod,
        bestScout,
        totalPointsInvested,
        existingReport || undefined
      );
    } catch (reportError) {
      console.error("Error generating scouting report:", reportError);
      return NextResponse.json(
        {
          error: `Failed to generate report: ${reportError instanceof Error ? reportError.message : "Unknown error"}`,
        },
        { status: 500 }
      );
    }

    const scoutingProgress = calculateScoutingProgress(totalPointsInvested);

    // Update methods_used array
    // Handle both array and null/undefined cases
    let methodsUsed: string[] = [];
    if (existingReport?.methods_used) {
      if (Array.isArray(existingReport.methods_used)) {
        methodsUsed = [...existingReport.methods_used];
      } else {
        methodsUsed = [];
      }
    }
    if (!methodsUsed.includes(method)) {
      methodsUsed.push(method);
    }

    // Save or update aggregated report
    const reportData: Record<string, unknown> = {
      team_id: teamId,
      prospect_id: prospectId,
      scouted_by: bestScout.id,
      total_points_invested: totalPointsInvested,
      scouting_progress: scoutingProgress,
      overall_min: report.overall_min,
      overall_max: report.overall_max,
      overall_estimate: report.overall_estimate,
      potential_min: report.potential_min,
      potential_max: report.potential_max,
      potential_estimate: report.potential_estimate,
      accuracy_percentage: report.accuracy_percentage,
      confidence_level: report.confidence_level,
      traits_scouted: report.traits_scouted,
      character_assessment: report.character_assessment,
      injury_risk: report.injury_risk,
      scheme_fit: report.scheme_fit,
      scout_notes: report.scout_notes,
      methods_used: methodsUsed,
      updated_at: new Date().toISOString(),
    };

    // Try to include season if prospect has it (column might not exist if migration hasn't run)
    const reportDataWithSeason = { ...reportData };
    if (prospect.season !== undefined && prospect.season !== null) {
      reportDataWithSeason.season = prospect.season;
    }

    let savedReport;
    if (existingReport) {
      // Update existing aggregated report
      // Try with season first, fallback to without season if column doesn't exist
      let data, error;
      ({ data, error } = await supabase
        .from("scouting_reports")
        .update(reportDataWithSeason)
        .eq("id", existingReport.id)
        .select()
        .single());

      // If error is about season column, try without it
      if (
        error &&
        (error.message?.includes("season") ||
          error.code === "42703" ||
          (error.message?.includes("column") &&
            error.message?.includes("season")))
      ) {
        console.warn("Season column not found, updating without season field");
        ({ data, error } = await supabase
          .from("scouting_reports")
          .update(reportData)
          .eq("id", existingReport.id)
          .select()
          .single());
      }

      if (error) {
        console.error("Error updating scouting report:", error);
        return NextResponse.json(
          { error: `Failed to update report: ${error.message}` },
          { status: 500 }
        );
      }
      savedReport = data;
    } else {
      // Create new aggregated report
      // Try with season first, fallback to without season if column doesn't exist
      let data, error;
      ({ data, error } = await supabase
        .from("scouting_reports")
        .insert(reportDataWithSeason)
        .select()
        .single());

      // If error is about season column, try without it
      if (
        error &&
        (error.message?.includes("season") ||
          error.code === "42703" ||
          (error.message?.includes("column") &&
            error.message?.includes("season")))
      ) {
        console.warn("Season column not found, inserting without season field");
        ({ data, error } = await supabase
          .from("scouting_reports")
          .insert(reportData)
          .select()
          .single());
      }

      if (error) {
        console.error("Error creating scouting report:", error);
        // Check if it's a table doesn't exist error
        if (
          error.code === "PGRST116" ||
          error.message.includes("does not exist")
        ) {
          return NextResponse.json(
            {
              error:
                "Scouting reports table does not exist. Please run the migration.",
              instructions: [
                "1. Go to Supabase Dashboard → SQL Editor",
                "2. Run: supabase/migrations/create_scouting_system.sql",
              ],
            },
            { status: 500 }
          );
        }
        return NextResponse.json(
          { error: `Failed to create report: ${error.message}` },
          { status: 500 }
        );
      }
      savedReport = data;
    }

    // Save scouting history entry
    const { error: historyError } = await supabase
      .from("scouting_history")
      .insert({
        team_id: teamId,
        prospect_id: prospectId,
        scouted_by: bestScout.id,
        scouting_method: method,
        points_spent: cost,
      });

    if (historyError) {
      console.error("Error saving scouting history:", historyError);
      // Don't fail the request, but log the error
    }

    // Deduct scouting points
    const { error: updateError } = await supabase
      .from("team_scouting_resources")
      .update({
        scouting_points: resources.scouting_points - cost,
        updated_at: new Date().toISOString(),
      })
      .eq("team_id", teamId);

    if (updateError) {
      console.error("Error updating scouting points:", updateError);
      // Don't fail the request, but log the error
    }

    return NextResponse.json({
      success: true,
      report: savedReport,
      points_remaining: resources.scouting_points - cost,
    });
  } catch (error) {
    console.error("Error scouting prospect:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to scout prospect";

    // Provide more helpful error messages
    if (
      errorMessage.includes("does not exist") ||
      errorMessage.includes("Could not find the table")
    ) {
      return NextResponse.json(
        {
          error: "Scouting tables do not exist. Please run the migration.",
          instructions: [
            "1. Go to Supabase Dashboard → SQL Editor",
            "2. Run: supabase/migrations/create_scouting_system.sql",
          ],
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
