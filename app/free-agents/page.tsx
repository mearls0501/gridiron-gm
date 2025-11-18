"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import Link from "next/link";
import { useDebounce } from "use-debounce";
import { Search, Filter } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";

// Position list for dropdown filter
const positions = [
  "All",
  "QB",
  "RB",
  "WR",
  "TE",
  "OL",
  "DL",
  "LB",
  "CB",
  "S",
  "K",
  "P",
];

interface FreeAgent {
  id: string;
  full_name: string;
  position: string;
  overall: number;
  potential: number;
  age: number;
  college: string;
  contract_year_1: number;
  signing_bonus: number;
  traits: string | object | null;
}

interface Team {
  id: string;
  name: string;
  abbreviation: string;
  salary_cap_total?: number;
}

interface TeamCapSpace {
  teamId: string;
  remainingCap: number;
  totalCap: number;
  currentCapHit: number;
}

function FreeAgentsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingPlayerId, setSigningPlayerId] = useState<string | null>(null);
  const [signingTeamId, setSigningTeamId] = useState<Record<string, string>>(
    {}
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [teamCapSpaces, setTeamCapSpaces] = useState<
    Record<string, TeamCapSpace>
  >({});

  const selectedPosition = searchParams.get("position") || "All";
  const search = searchParams.get("search") || "";
  const [debouncedSearch] = useDebounce(search, 300);

  useEffect(() => {
    fetchTeams();
    fetchFreeAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchFreeAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPosition, debouncedSearch]);

  // Set default team for free agents when both teams and free agents are loaded
  useEffect(() => {
    if (teams.length > 0 && freeAgents.length > 0) {
      const defaultTeamId = teams[0].id;
      setSigningTeamId((prev) => {
        const updated = { ...prev };
        freeAgents.forEach((agent) => {
          if (!updated[agent.id]) {
            updated[agent.id] = defaultTeamId;
          }
        });
        return updated;
      });
    }
  }, [teams, freeAgents]);

  async function fetchTeams() {
    try {
      const { data, error: teamsError } = await supabase
        .from("teams")
        .select("id, name, abbreviation, salary_cap_total")
        .order("name", { ascending: true });

      if (!teamsError && data) {
        setTeams(data || []);
        // Fetch cap space for all teams
        await fetchTeamCapSpaces(data.map((t) => t.id));
      }
    } catch (err) {
      console.error("Error fetching teams:", err);
    }
  }

  async function fetchTeamCapSpaces(teamIds: string[]) {
    try {
      const capSpaces: Record<string, TeamCapSpace> = {};

      for (const teamId of teamIds) {
        // Get team salary cap
        const { data: team } = await supabase
          .from("teams")
          .select("salary_cap_total")
          .eq("id", teamId)
          .single();

        const totalCap = team?.salary_cap_total ?? 255000000;

        // Get current players
        const { data: players } = await supabase
          .from("players")
          .select("contract_year_1")
          .eq("team_id", teamId);

        const currentCapHit = (players || []).reduce(
          (sum, p) => sum + (p.contract_year_1 || 0),
          0
        );

        const remainingCap = totalCap - currentCapHit;

        capSpaces[teamId] = {
          teamId,
          remainingCap,
          totalCap,
          currentCapHit,
        };
      }

      setTeamCapSpaces(capSpaces);
    } catch (err) {
      console.error("Error fetching team cap spaces:", err);
    }
  }

  async function fetchFreeAgents() {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("free_agents")
        .select(
          `
          id,
          full_name,
          position,
          overall,
          potential,
          age,
          college,
          contract_year_1,
          signing_bonus,
          traits,
          archived,
          entered_free_agency_season
        `
        )
        .order("overall", { ascending: false });

      // Filter out archived players
      // Note: Run the migration add_free_agent_archiving.sql if this column doesn't exist
      query = query.eq("archived", false);

      // Apply position filter
      if (selectedPosition !== "All") {
        // Handle OL and DL as position groups
        if (selectedPosition === "OL") {
          query = query.in("position", ["OT", "OG", "C"]);
        } else if (selectedPosition === "DL") {
          query = query.in("position", ["DE", "DT"]);
        } else {
          query = query.eq("position", selectedPosition);
        }
      }

      // Apply search filter
      if (debouncedSearch) {
        query = query.ilike("full_name", `%${debouncedSearch}%`);
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        setError(queryError.message);
      } else {
        setFreeAgents(data || []);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load free agents"
      );
    } finally {
      setLoading(false);
    }
  }

  function handlePositionChange(pos: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (pos === "All") {
      params.delete("position");
    } else {
      params.set("position", pos);
    }
    router.push(`/free-agents?${params.toString()}`);
  }

  function handleSearchChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("search", value);
    } else {
      params.delete("search");
    }
    router.push(`/free-agents?${params.toString()}`);
  }

  async function handleSignPlayer(playerId: string) {
    const teamId = signingTeamId[playerId];

    if (!teamId) {
      setError("Please select a team");
      return;
    }

    setSigningPlayerId(playerId);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/sign-player", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ playerId, teamId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to sign player");
      }

      setSuccessMessage(data.message || "Player signed successfully!");

      // Refresh the free agents list
      await fetchFreeAgents();

      // Refresh cap spaces for all teams (since one team's cap changed)
      if (teams.length > 0) {
        await fetchTeamCapSpaces(teams.map((t) => t.id));
      }

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign player");
    } finally {
      setSigningPlayerId(null);
    }
  }

  function handleTeamChange(playerId: string, teamId: string) {
    setSigningTeamId((prev) => ({
      ...prev,
      [playerId]: teamId,
    }));
  }

  // League minimum contract
  const LEAGUE_MINIMUM = 750000;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto mt-12 p-6">
        <h1 className="text-4xl font-bold mb-6">Free Agents</h1>
        <p className="text-gray-600">Loading free agents...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto mt-12 p-6">
        <h1 className="text-4xl font-bold mb-6">Free Agents</h1>
        <div className="p-6 text-red-600">
          Error loading free agents: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="ootp-container">
      <div className="mb-8">
        <h1 className="ootp-page-title">Free Agents</h1>
      </div>

      {/* Filters */}
      <div className="ootp-panel mb-6">
        <div className="ootp-panel-header">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            <span>Filters</span>
          </div>
        </div>
        <div className="ootp-panel-body">
          <div className="flex flex-wrap gap-4">
            {/* Position Filter */}
            <div className="flex-1 min-w-[150px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Position
              </label>
              <select
                value={selectedPosition}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onChange={(e) => handlePositionChange(e.target.value)}
              >
                {positions.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Bar */}
            <div className="flex-1 min-w-[250px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {/* Free Agents List */}
      {freeAgents.length === 0 ? (
        <div className="ootp-panel">
          <div className="ootp-panel-body">
            <div className="text-center py-12">
              <p className="ootp-text-muted text-lg">No free agents found</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="ootp-panel">
          <div className="ootp-panel-header">
            Available Free Agents ({freeAgents.length})
          </div>
          <div className="ootp-panel-body p-0">
            <div className="space-y-0">
              {freeAgents.map((agent) => (
                <div
                  key={agent.id}
                  className="p-6 border-b last:border-b-0 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-3 flex-wrap">
                        <Link
                          href={`/players/${agent.id}`}
                          className="text-xl font-semibold text-blue-600 hover:text-blue-800"
                        >
                          {agent.full_name}
                        </Link>
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm font-medium">
                          {agent.position}
                        </span>
                        <span className="text-lg font-semibold text-gray-900">
                          OVR {agent.overall}
                        </span>
                        <span className="text-lg text-gray-700">
                          POT {agent.potential}
                        </span>
                        <span className="text-lg text-gray-700">
                          Age {agent.age}
                        </span>
                        <span className="text-lg text-gray-700">
                          {agent.college}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        League Min Contract: {formatCurrency(LEAGUE_MINIMUM)}
                      </div>
                    </div>
                    <div className="ml-6 flex items-center gap-3">
                      <div className="flex flex-col gap-1">
                        <select
                          value={signingTeamId[agent.id] || ""}
                          onChange={(e) =>
                            handleTeamChange(agent.id, e.target.value)
                          }
                          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          disabled={signingPlayerId === agent.id}
                        >
                          {teams.map((team) => {
                            const capSpace = teamCapSpaces[team.id];
                            const canAfford =
                              capSpace &&
                              capSpace.remainingCap >= LEAGUE_MINIMUM;
                            return (
                              <option key={team.id} value={team.id}>
                                {team.abbreviation}
                                {capSpace
                                  ? ` (${canAfford ? formatCurrency(capSpace.remainingCap) : "OVER CAP"})`
                                  : ""}
                              </option>
                            );
                          })}
                        </select>
                        {signingTeamId[agent.id] &&
                          teamCapSpaces[signingTeamId[agent.id]] && (
                            <div className="text-xs">
                              {(() => {
                                const capSpace =
                                  teamCapSpaces[signingTeamId[agent.id]];
                                const canAfford =
                                  capSpace.remainingCap >= LEAGUE_MINIMUM;
                                return (
                                  <span
                                    className={
                                      canAfford
                                        ? "text-green-600"
                                        : "text-red-600 font-semibold"
                                    }
                                  >
                                    Cap Space:{" "}
                                    {formatCurrency(capSpace.remainingCap)}
                                    {!canAfford && " (Cannot afford)"}
                                  </span>
                                );
                              })()}
                            </div>
                          )}
                      </div>
                      <button
                        onClick={() => handleSignPlayer(agent.id)}
                        disabled={Boolean(
                          signingPlayerId === agent.id ||
                            !signingTeamId[agent.id] ||
                            (signingTeamId[agent.id] &&
                              teamCapSpaces[signingTeamId[agent.id]] &&
                              teamCapSpaces[signingTeamId[agent.id]]
                                .remainingCap < LEAGUE_MINIMUM)
                        )}
                        className="ootp-button ootp-button-success"
                      >
                        {signingPlayerId === agent.id ? "Signing..." : "Sign"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FreeAgentsPage() {
  return (
    <Suspense
      fallback={
        <div className="ootp-container">
          <div className="mb-8">
            <h1 className="ootp-page-title">Free Agents</h1>
          </div>
          <div className="ootp-panel">
            <div className="ootp-panel-body">
              <div className="text-center py-12">
                <p className="ootp-text-muted">Loading...</p>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <FreeAgentsPageContent />
    </Suspense>
  );
}
