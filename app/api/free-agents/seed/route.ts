import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * API endpoint to seed free agents into the database
 * Uses service role client to bypass RLS
 * Should only be called during initial setup or when replenishing free agent pool
 */
export async function POST(req: Request) {
  try {
    const { count = 200 } = await req.json();

    // Validate count
    if (typeof count !== "number" || count < 1 || count > 1000) {
      return NextResponse.json(
        { error: "Count must be between 1 and 1000" },
        { status: 400 }
      );
    }

    // Create service role client to bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Supabase configuration missing" },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Import player generator
    const { generatePlayer } = await import("@/lib/player-generator");

    if (!generatePlayer || typeof generatePlayer !== "function") {
      return NextResponse.json(
        { error: "Failed to import player generator" },
        { status: 500 }
      );
    }

    console.log(`[Seed Free Agents] Generating ${count} free agents...`);

    // Generate free agents
    const freeAgents = [];
    for (let i = 0; i < count; i++) {
      const player = generatePlayer({ isProspect: false });
      if (!player) {
        console.warn(`Failed to generate free agent at index ${i}`);
        continue;
      }

      freeAgents.push({
        id: crypto.randomUUID(),
        full_name: player.full_name,
        position: player.position,
        age: player.age,
        college: player.college || null,
        archetype: player.archetype || null,
        overall: player.overall,
        potential: player.potential,
        is_free_agent: true, // Mark as free agent
        team_id: null, // Free agents have no team
      });
    }

    if (freeAgents.length === 0) {
      return NextResponse.json(
        { error: "Failed to generate any free agents" },
        { status: 500 }
      );
    }

    console.log(`[Seed Free Agents] Inserting ${freeAgents.length} free agents into database...`);

    // Insert free agents using service role client (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from("players")
      .upsert(freeAgents, { onConflict: "id" });

    if (error) {
      console.error("[Seed Free Agents] Error inserting free agents:", error);
      return NextResponse.json(
        { error: `Failed to insert free agents: ${error.message}` },
        { status: 500 }
      );
    }

    console.log(`[Seed Free Agents] Successfully seeded ${freeAgents.length} free agents`);

    return NextResponse.json({
      success: true,
      message: `Successfully seeded ${freeAgents.length} free agents`,
      count: freeAgents.length,
    });
  } catch (error) {
    console.error("[Seed Free Agents] Unexpected error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to seed free agents: ${errorMessage}` },
      { status: 500 }
    );
  }
}



