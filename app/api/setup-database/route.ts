import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * API endpoint to set up the games table if it doesn't exist
 * This should be called before trying to generate schedules
 */
export async function POST(req: Request) {
  try {
    // First, check if the table exists by trying to query it
    const { error: checkError } = await supabase
      .from("games")
      .select("id")
      .limit(1);

    // If the table exists, return success
    if (!checkError) {
      return NextResponse.json({
        success: true,
        message: "Games table already exists",
        created: false,
      });
    }

    // If error is about table not existing, we need to create it
    if (
      checkError.code === "PGRST116" ||
      checkError.message.includes("does not exist") ||
      checkError.message.includes("Could not find the table")
    ) {
      // Note: Supabase client doesn't support DDL operations directly
      // The user needs to run the migration SQL manually
      return NextResponse.json(
        {
          success: false,
          message:
            "Games table does not exist. Please run the migration SQL manually in your Supabase dashboard.",
          instructions: [
            "1. Go to your Supabase dashboard",
            "2. Navigate to SQL Editor",
            "3. Run the SQL from: supabase/migrations/create_games_table.sql",
            "4. Or use the Supabase CLI: supabase db push",
          ],
          sqlFile: "supabase/migrations/create_games_table.sql",
        },
        { status: 400 }
      );
    }

    // Other errors
    return NextResponse.json(
      {
        success: false,
        message: `Error checking games table: ${checkError.message}`,
      },
      { status: 500 }
    );
  } catch (error) {
    console.error("Error in setup-database:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown error setting up database",
      },
      { status: 500 }
    );
  }
}

