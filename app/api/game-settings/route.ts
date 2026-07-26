import { NextResponse } from "next/server";
import {
  requireUser,
  isRowLevelSecurityError,
  forbiddenSaveGameResponse,
} from "@/lib/auth/route-auth";
import { isMissingSupabaseTableError } from "@/lib/supabase-errors";

const DEFAULT_SETTINGS = {
  injury_management: "manual",
  depth_chart_management: "manual",
  scouting_management: "manual",
  contract_management: "manual",
  roster_management: "manual",
};

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth.context;

  try {
    const { searchParams } = new URL(req.url);
    const saveGameId = searchParams.get("saveGameId");

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    // Get game settings for this save game
    const { data: settings, error } = await supabase
      .from("game_settings")
      .select("*")
      .eq("save_game_id", saveGameId)
      .maybeSingle();

    if (error) {
      if (isMissingSupabaseTableError(error)) {
        console.warn("game_settings table is missing; returning manual defaults");
        return NextResponse.json({
          settings: DEFAULT_SETTINGS,
          isDefault: true,
          schemaMissing: true,
        });
      }

      console.error("Error fetching game settings:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // If no settings exist, return defaults
    if (!settings) {
      return NextResponse.json({
        settings: DEFAULT_SETTINGS,
        isDefault: true,
      });
    }

    return NextResponse.json({ settings, isDefault: false });
  } catch (error: unknown) {
    console.error("Error in GET /api/game-settings:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth.context;

  try {
    const { saveGameId, settings } = await req.json();

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    if (!settings) {
      return NextResponse.json(
        { error: "settings object is required" },
        { status: 400 }
      );
    }

    // Validate settings
    const validSettings = ["auto", "manual"];
    const settingFields = [
      "injury_management",
      "depth_chart_management",
      "scouting_management",
      "contract_management",
      "roster_management",
    ];

    for (const field of settingFields) {
      if (settings[field] && !validSettings.includes(settings[field])) {
        return NextResponse.json(
          { error: `Invalid value for ${field}. Must be 'auto' or 'manual'` },
          { status: 400 }
        );
      }
    }

    // Upsert settings
    const { data, error } = await supabase
      .from("game_settings")
      .upsert(
        {
          save_game_id: saveGameId,
          ...settings,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "save_game_id",
        }
      )
      .select()
      .single();

    if (error) {
      if (isMissingSupabaseTableError(error)) {
        return NextResponse.json(
          {
            error: "game_settings table is missing. Apply supabase/migrations/20240101000046_create_game_settings.sql before saving automation preferences.",
            schemaMissing: true,
          },
          { status: 503 }
        );
      }

      if (isRowLevelSecurityError(error)) {
        return forbiddenSaveGameResponse();
      }

      console.error("Error upserting game settings:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ settings: data });
  } catch (error: unknown) {
    console.error("Error in POST /api/game-settings:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

