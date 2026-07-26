import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { generatePlayer } from "@/lib/player-generator";

export async function POST(req: Request) {
  try {
    // Check if Supabase is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const season = body?.season;
    if (!season) {
      return NextResponse.json({ error: "Season is required" }, { status: 400 });
    }

    interface Prospect {
      full_name: string;
      position: string;
      age: number;
      college: string;
      archetype: string;
      overall: number;
      potential: number;
      is_free_agent: boolean;
      contract_year_1: number;
      contract_year_2: number;
      contract_year_3: number;
      contract_year_4: number;
      signing_bonus: number;
    }
    const prospects: Prospect[] = [];
    for (let i = 0; i < 256; i++) {
      const player = generatePlayer({ isProspect: true });
      prospects.push(player);
    }

    if (prospects.length === 0) {
      return NextResponse.json({ error: "No prospects generated" }, { status: 500 });
    }

    const header = Object.keys(prospects[0]).join(",");
    const rows = prospects.map((p) =>
      Object.values(p)
        .map((v) =>
          typeof v === "string"
            ? `"${v.replace(/"/g, '""')}"`
            : `"${v}"`
        )
        .join(",")
    );

    const csv = [header, ...rows].join("\n");

    const fileName = `draft_${season}.csv`;

    const { error: uploadError } = await supabase.storage
      .from("draft-classes")
      .upload(fileName, csv, {
        contentType: "text/csv",
        upsert: true,
      });

    if (uploadError) {
      console.error(uploadError);
      return NextResponse.json({ error: "Failed to upload CSV" }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from("draft-classes").getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    return NextResponse.json({
      success: true,
      message: "Draft class generated",
      url: publicUrl,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
