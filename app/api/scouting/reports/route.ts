import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const prospectId = searchParams.get("prospectId");
    const season = searchParams.get("season");
    const saveGameId = searchParams.get("saveGameId");

    console.log("Scouting reports API called with:", {
      teamId,
      prospectId,
      season,
      saveGameId,
    });

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 }
      );
    }

    // Build base query - we'll try to filter by save_game_id on scouting_reports if column exists
    // Use left join (not inner) so we get reports even if prospect relationship fails
    let query = supabase
      .from("scouting_reports")
      .select(`
        *,
        prospect:draft_prospects(*),
        scout:scouting_staff(name, role)
      `)
      .eq("team_id", teamId);
    
    // Filter prospects by save_game_id in the nested query if provided
    // This ensures we only get reports for prospects that belong to this save game
    if (saveGameId) {
      // Note: Supabase doesn't support direct nested filtering like this
      // We'll filter in JavaScript after fetching
      console.log("Will filter by saveGameId:", saveGameId);
    }
    
    console.log("Base query built for team_id:", teamId, "saveGameId:", saveGameId);

    if (prospectId) {
      query = query.eq("prospect_id", prospectId);
    }

    // Try to filter by save_game_id on scouting_reports (may not exist if migration hasn't run)
    // If it fails, we'll filter results in JavaScript after fetching
    // For now, fetch all reports for the team and filter in JavaScript to handle NULL save_game_id
    let reports, error;
    try {
      // Fetch all reports for this team (we'll filter by save_game_id in JavaScript)
      // This allows us to include reports with NULL save_game_id if the prospect matches
      const result = await query.order("scouted_at", {
        ascending: false,
      });
      reports = result.data;
      error = result.error;
      
      // Filter by save_game_id in JavaScript (handles NULL reports by checking prospect)
      if (reports && !error) {
        console.log(`Filtering ${reports.length} reports for saveGameId: ${saveGameId}`);
        console.log("Sample reports before filtering:", reports.slice(0, 3).map((r: any) => ({
          id: r.id,
          prospect_id: r.prospect_id,
          report_save_game_id: r.save_game_id,
          prospect_save_game_id: r.prospect?.save_game_id,
          has_prospect: !!r.prospect,
        })));
        
        if (saveGameId) {
          // Include reports where:
          // 1. report.save_game_id matches saveGameId, OR
          // 2. report.save_game_id is NULL but prospect.save_game_id matches saveGameId, OR
          // 3. BOTH are NULL (legacy data - include temporarily until migration updates them)
          const beforeFilter = reports.length;
          reports = reports.filter((r: any) => {
            const reportSaveGameId = r.save_game_id;
            const prospectSaveGameId = r.prospect?.save_game_id;
            
            // Direct match on report
            if (reportSaveGameId === saveGameId) {
              console.log(`Report ${r.id} matches: report.save_game_id === saveGameId`);
              return true;
            }
            
            // Report has NULL but prospect matches (should be updated by migration)
            if (reportSaveGameId === null && prospectSaveGameId === saveGameId) {
              console.log(`Report ${r.id} matches: prospect.save_game_id === saveGameId`);
              return true;
            }
            
            // BOTH NULL (legacy data) - include for now since migration might not have run
            // This is a temporary measure - ideally these should be updated by migration
            if (reportSaveGameId === null && (prospectSaveGameId === null || prospectSaveGameId === undefined)) {
              console.log(`Report ${r.id} included as legacy (both NULL)`);
              return true;
            }
            
            return false;
          });
          console.log(`Filtered from ${beforeFilter} to ${reports.length} reports`);
        } else {
          // No saveGameId - only include reports/prospects with NULL save_game_id
          reports = reports.filter((r: any) => 
            !r.save_game_id && (!r.prospect?.save_game_id || r.prospect.save_game_id === null)
          );
        }
      }
      
      // If error is about save_game_id column not existing, retry without it
      if (error && (error.message?.includes("save_game_id") || error.code === "42703")) {
        console.warn("save_game_id column not found on scouting_reports, filtering results in JavaScript");
        const retryResult = await query.order("scouted_at", {
          ascending: false,
        });
        reports = retryResult.data;
        error = retryResult.error;
        
        // Filter results in JavaScript by prospect.save_game_id only (report doesn't have the column)
        if (reports && !error) {
          if (saveGameId) {
            // Include if prospect matches OR both are NULL (legacy)
            reports = reports.filter((r: any) => {
              const prospectSaveGameId = r.prospect?.save_game_id;
              return prospectSaveGameId === saveGameId || 
                     (prospectSaveGameId === null || prospectSaveGameId === undefined);
            });
          } else {
            reports = reports.filter((r: any) => 
              !r.prospect?.save_game_id || r.prospect.save_game_id === null
            );
          }
        }
      }
    } catch (err) {
      // If query construction fails, try without save_game_id filter
      console.warn("Error with save_game_id filter, retrying without it:", err);
      const retryResult = await query.order("scouted_at", {
        ascending: false,
      });
      reports = retryResult.data;
      error = retryResult.error;
      
      // Filter results in JavaScript by report.save_game_id or prospect.save_game_id
      if (reports && !error) {
        if (saveGameId) {
          // Include reports where:
          // 1. report.save_game_id matches saveGameId, OR
          // 2. report.save_game_id is NULL but prospect.save_game_id matches saveGameId, OR
          // 3. BOTH are NULL (legacy data - include temporarily)
          reports = reports.filter((r: any) => {
            const reportSaveGameId = r.save_game_id;
            const prospectSaveGameId = r.prospect?.save_game_id;
            
            // Direct match on report
            if (reportSaveGameId === saveGameId) return true;
            
            // Report has NULL but prospect matches
            if (reportSaveGameId === null && prospectSaveGameId === saveGameId) return true;
            
            // BOTH NULL (legacy data) - include for now
            if (reportSaveGameId === null && (prospectSaveGameId === null || prospectSaveGameId === undefined)) {
              return true;
            }
            
            return false;
          });
        } else {
          reports = reports.filter((r: any) => 
            !r.save_game_id && (!r.prospect?.save_game_id || r.prospect.save_game_id === null)
          );
        }
      }
    }
    
    // Also filter by season if provided (filter in JavaScript if needed)
    if (season && reports && !error) {
      const seasonValue = parseInt(season, 10);
      reports = reports.filter((r: any) => {
        // Try prospect.season first, then fallback to report.season if it exists
        return r.prospect?.season === seasonValue || r.season === seasonValue;
      });
    }

    if (error) {
      // Log the full error for debugging
      console.error("Scouting reports query error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      
      // If error is about table or column not existing, return empty array
      const isTableError = 
        error.message?.includes("does not exist") ||
        error.message?.includes("relation") ||
        error.code === "42P01" ||
        error.code === "42703";
      
      if (isTableError) {
        console.warn("Table or column not found, returning empty reports array");
        return NextResponse.json({
          success: true,
          reports: [],
        });
      }
      
      throw error;
    }

    console.log("Scouting reports API returning:", {
      totalReports: reports?.length || 0,
      teamId,
      saveGameId,
      sampleReportIds: reports?.slice(0, 3).map((r: any) => ({
        id: r.id,
        prospect_id: r.prospect_id,
        save_game_id: r.save_game_id,
      })),
    });

    return NextResponse.json({
      success: true,
      reports: reports || [],
    });
  } catch (error) {
    console.error("Error fetching scouting reports:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch scouting reports";
    
    // Log full error details for debugging
    const errorDetails: any = {
      message: errorMessage,
    };
    
    if (error && typeof error === 'object') {
      const err = error as any;
      errorDetails.code = err.code;
      errorDetails.details = err.details;
      errorDetails.hint = err.hint;
      errorDetails.message = err.message || errorMessage;
    }
    
    console.error("Full error details:", errorDetails);
    
    // If it's a table/column error, return empty array instead of error
    if (errorDetails.code === "42P01" || errorDetails.code === "42703" || 
        errorDetails.message?.includes("does not exist")) {
      return NextResponse.json({
        success: true,
        reports: [],
      });
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? errorDetails : undefined
      },
      { status: 500 }
    );
  }
}

