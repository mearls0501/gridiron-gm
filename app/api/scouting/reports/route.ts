import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const prospectId = searchParams.get("prospectId");
    const season = searchParams.get("season");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("scouting_reports")
      .select(`
        *,
        prospect:draft_prospects(*),
        scout:scouting_staff(name, role)
      `)
      .eq("team_id", teamId);

    if (prospectId) {
      query = query.eq("prospect_id", prospectId);
    }

    // Note: season column might not exist if migration hasn't run
    // We'll filter by prospect.season instead if season column doesn't work
    if (season) {
      const seasonValue = parseInt(season, 10);
      // Try to filter by season column on scouting_reports table
      // If that fails, we'll filter by prospect.season in the nested query
      query = query.eq("season", seasonValue);
    }

    const { data: reports, error } = await query.order("scouted_at", {
      ascending: false,
    });

    if (error) {
      // If error is about season column not existing, try filtering by prospect.season instead
      if (error.message?.includes("season") || error.code === "42703") {
        console.warn("Season column not found on scouting_reports, filtering by prospect.season instead");
        
        // Rebuild query without season filter on scouting_reports
        let fallbackQuery = supabase
          .from("scouting_reports")
          .select(`
            *,
            prospect:draft_prospects(*),
            scout:scouting_staff(name, role)
          `)
          .eq("team_id", teamId);
        
        if (prospectId) {
          fallbackQuery = fallbackQuery.eq("prospect_id", prospectId);
        }
        
        if (season) {
          // Filter by prospect.season in nested query
          fallbackQuery = fallbackQuery.eq("prospect.season", parseInt(season, 10));
        }
        
        const { data: fallbackReports, error: fallbackError } = await fallbackQuery.order("scouted_at", {
          ascending: false,
        });
        
        if (fallbackError) {
          throw fallbackError;
        }
        
        return NextResponse.json({
          success: true,
          reports: fallbackReports || [],
        });
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      reports: reports || [],
    });
  } catch (error) {
    console.error("Error fetching scouting reports:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch scouting reports" },
      { status: 500 }
    );
  }
}

