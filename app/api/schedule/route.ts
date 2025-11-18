import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { generateSchedule } from "@/lib/schedule-generator";

interface ScheduleTeam {
  id: string | number;
  name?: string;
  abbreviation?: string;
  conference: string;
  division: string;
  owner_expected_wins?: number;
}

const SUPABASE_CONFIGURED =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export async function GET() {
  try {
    const teams = await fetchTeamsFromSupabase();
    // Convert ScheduleTeam to Team format
    const teamData = teams.map(t => ({
      id: String(t.id),
      division: t.division,
      conference: t.conference,
    }));
    // Default to 2025 season if not provided
    const games = generateSchedule(teamData, 2025);
    return NextResponse.json({ games, gameCount: games.length });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseBody(req);
    let teams: ScheduleTeam[] | undefined = sanitizeTeams(body?.teams);

    if (!teams) {
      teams = await fetchTeamsFromSupabase();
    }

    // Convert ScheduleTeam to Team format
    const teamData = teams.map(t => ({
      id: String(t.id),
      division: t.division,
      conference: t.conference,
    }));
    // Default to 2025 season if not provided
    const games = generateSchedule(teamData, 2025);
    return NextResponse.json({ games, gameCount: games.length });
  } catch (error) {
    return handleError(error);
  }
}

async function fetchTeamsFromSupabase(): Promise<ScheduleTeam[]> {
  if (!SUPABASE_CONFIGURED) {
    throw new Error(
      "Supabase credentials missing. Provide NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY or POST a custom team list."
    );
  }

  const { data, error } = await supabase
    .from("teams")
    .select("id,name,abbreviation,conference,division,owner_expected_wins")
    .order("conference", { ascending: true })
    .order("division", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Unable to fetch teams: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error("No teams available to build a schedule.");
  }

  return data;
}

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

function sanitizeTeams(input: unknown): ScheduleTeam[] | undefined {
  if (!Array.isArray(input) || input.length === 0) {
    return undefined;
  }

  const teams: ScheduleTeam[] = [];
  for (const candidate of input) {
    if (typeof candidate !== "object" || candidate === null) {
      return undefined;
    }

    const { id, name, abbreviation, conference, division, owner_expected_wins } = candidate as Record<
      string,
      unknown
    >;

    if (
      typeof id === "undefined" ||
      typeof name !== "string" ||
      typeof abbreviation !== "string" ||
      typeof conference !== "string" ||
      typeof division !== "string"
    ) {
      return undefined;
    }

    teams.push({
      id: typeof id === "string" || typeof id === "number" ? id : String(id),
      name,
      abbreviation,
      conference,
      division,
      owner_expected_wins:
        typeof owner_expected_wins === "number" ? owner_expected_wins : undefined,
    });
  }

  return teams.length ? teams : undefined;
}

function handleError(error: unknown) {
  console.error(error);
  const message =
    error instanceof Error ? error.message : "Failed to generate schedule.";
  const status = message.includes("32 teams") ? 422 : 500;
  return NextResponse.json({ error: message }, { status });
}

