// app/players/[id]/page.tsx
import { supabase } from "@/lib/supabase-client";
import Link from "next/link";
import { ContractDisplay } from "./contract-display";
import { StatsDisplay } from "./stats-display";
import { DetailedAttributes } from "./detailed-attributes";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  // Handle both sync and async params (Next.js 15+ uses async params)
  const resolvedParams = await Promise.resolve(params);
  const playerId = resolvedParams.id;

  // Try to fetch from players table first, then draft_prospects if not found
  // Use maybeSingle() to avoid errors if player doesn't exist
  interface PlayerData {
    id: string;
    full_name: string;
    position: string;
    age: number;
    college: string | null;
    archetype: string | null;
    overall: number;
    potential: number;
    traits?: string | { speed: number; strength: number; awareness: number };
    team_id: string | null;
  }

  interface TeamData {
    name: string;
    abbreviation: string;
  }

  let player: PlayerData | null = null;
  let error: { message: string } | null = null;
  let team: TeamData | null = null;

  // Try players table first (no contract fields - contracts are in per-save-game table)
  // Select ALL player attributes for detailed breakdown
  const { data: playerData, error: playerError } = await supabase
    .from("players")
    .select("*")
    .eq("id", playerId)
    .maybeSingle();

  if (playerData) {
    player = playerData;
    // Fetch team separately to avoid join issues
    if (playerData.team_id) {
      const { data: teamData } = await supabase
        .from("teams")
        .select("name, abbreviation")
        .eq("id", playerData.team_id)
        .maybeSingle();
      team = teamData;
    }
  } else {
    // Try draft_prospects table
    const { data: prospectData, error: prospectError } = await supabase
      .from("draft_prospects")
      .select(
        `
        id,
        full_name,
        position,
        age,
        college,
        archetype,
        overall,
        potential
      `
      )
      .eq("id", playerId)
      .maybeSingle();

    if (prospectData) {
      player = {
        ...prospectData,
        team_id: null,
        traits: undefined,
      };
    } else {
      error = prospectError || playerError;
    }
  }

  // Load contract from player_contracts_per_save_game if we can determine saveGameId
  // Note: In a server component, we can't easily get saveGameId from client store
  // For now, contracts will be loaded client-side via ContractDisplay component
  // This is a limitation - contracts require saveGameId context

  if (error || !player) {
    return (
      <div className="max-w-3xl mx-auto mt-12 p-10">
        <div className="text-red-600">
          <h2 className="text-2xl font-bold mb-2">Player not found</h2>
          {error && <p className="text-sm">Error: {error.message}</p>}
        </div>
        <Link
          href="/players"
          className="text-blue-600 underline mt-4 inline-block"
        >
          ← Back to Players
        </Link>
      </div>
    );
  }

  const traits = player.traits
    ? typeof player.traits === "string"
      ? JSON.parse(player.traits)
      : player.traits
    : null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <Link
        href="/players"
        className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-6 transition-colors"
      >
        <svg
          className="w-4 h-4 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to Players
      </Link>

      <div className="bg-white rounded-lg shadow-md p-8 border border-gray-200">
        {/* Header */}
        <div className="mb-8 pb-6 border-b border-gray-200">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold mb-2 text-gray-900">
                {player.full_name}
              </h1>
              <div className="flex items-center gap-4 text-gray-600">
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg font-semibold text-lg">
                  {player.position}
                </span>
                <span>Age {player.age}</span>
                <span>•</span>
                <span>{player.college}</span>
              </div>
            </div>
          </div>

          {team && player.team_id && (
            <div className="mt-4">
              <span className="text-gray-600">Team: </span>
              <Link
                href={`/teams/${player.team_id}`}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                {team.name || "Unknown Team"} ({team.abbreviation || "UNK"})
              </Link>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Ratings */}
          <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Ratings</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">Overall</span>
                <span className="text-3xl font-bold text-gray-900">
                  {player.overall}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">Potential</span>
                <span className="text-3xl font-bold text-gray-900">
                  {player.potential}
                </span>
              </div>
              {player.archetype && (
                <div className="pt-3 border-t border-gray-200">
                  <span className="text-gray-600 font-medium">Archetype: </span>
                  <span className="font-semibold text-gray-900">
                    {player.archetype}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Traits */}
          {traits && (
            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
              <h2 className="text-2xl font-bold mb-4 text-gray-900">Traits</h2>
              <div className="space-y-3">
                {traits.speed !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Speed</span>
                    <span className="text-xl font-semibold text-gray-900">
                      {traits.speed}
                    </span>
                  </div>
                )}
                {traits.strength !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Strength</span>
                    <span className="text-xl font-semibold text-gray-900">
                      {traits.strength}
                    </span>
                  </div>
                )}
                {traits.awareness !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Awareness</span>
                    <span className="text-xl font-semibold text-gray-900">
                      {traits.awareness}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Contract - Loaded client-side via ContractDisplay component */}
        <ContractDisplay playerId={playerId} />

        {/* Detailed Attributes Breakdown */}
        <DetailedAttributes player={player} />

        {/* Stats - Loaded client-side via StatsDisplay component */}
        <StatsDisplay playerId={playerId} />
      </div>
    </div>
  );
}
