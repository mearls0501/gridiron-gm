"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import { Search, Filter, Users, UserCheck, UserX } from "lucide-react";

interface Scout {
  id: string;
  name: string;
  archetype: string;
  evaluation: number;
  football_iq: number;
  athletic_analysis: number;
  psych_insight: number;
  medical_read: number;
  analytics: number;
  confidence: number;
  experience: number;
  communication: number;
  salary: number;
  reputation: number;
  loyalty: number;
  created_at: string;
}

interface ScoutWithStatus extends Scout {
  status: "hired" | "free_agent";
  team_id?: string;
  team_name?: string;
  team_abbreviation?: string;
  contract_years?: number;
  priority?: number;
}

export default function AllScoutsPage() {
  const { saveGameId } = useGameStore();
  const [scouts, setScouts] = useState<ScoutWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [selectedArchetype, setSelectedArchetype] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "hired" | "free_agent">("all");
  const [teams, setTeams] = useState<Array<{ id: string; name: string; abbreviation: string }>>([]);

  useEffect(() => {
    loadData();
  }, [saveGameId]);

  async function loadData() {
    try {
      setLoading(true);

      // Load all contracts for this save game ONLY
      // Always require saveGameId to prevent data bleeding
      if (!saveGameId) {
        setError("No save game loaded. Please load a game to view scouts.");
        setLoading(false);
        return;
      }

      // Load all scouts for this save game only
      const { data: allScouts, error: scoutsError } = await supabase
        .from("scouts")
        .select("*")
        .eq("save_game_id", saveGameId)
        .order("reputation", { ascending: false });

      if (scoutsError) {
        console.error("Error loading scouts:", scoutsError);
        return;
      }
      
      let contractsQuery = supabase
        .from("scout_contracts")
        .select(`
          scout_id,
          team_id,
          contract_years,
          save_game_id,
          teams!inner(id, name, abbreviation)
        `)
        .eq("save_game_id", saveGameId); // Always filter by save_game_id

      const { data: contracts, error: contractsError } = await contractsQuery;

      if (contractsError) {
        console.error("Error loading contracts:", contractsError);
      }

      // Load priorities (always filter by save_game_id)
      const prioritiesQuery = supabase
        .from("scout_priority")
        .select("scout_id, team_id, priority")
        .eq("save_game_id", saveGameId); // Always filter by save_game_id

      const { data: priorities, error: prioritiesError } = await prioritiesQuery;

      if (prioritiesError) {
        console.error("Error loading priorities:", prioritiesError);
      }

      // Load teams for filter dropdown
      // Note: Teams table doesn't have save_game_id, so we load all teams
      const { data: teamsData, error: teamsError } = await supabase
        .from("teams")
        .select("id, name, abbreviation")
        .order("name", { ascending: true });

      if (teamsError) {
        console.error("Error loading teams:", teamsError);
      } else if (teamsData) {
        setTeams(teamsData);
      }

      // Combine scouts with contract info
      const contractsMap = new Map<string, any>();
      const prioritiesMap = new Map<string, { team_id: string; priority: number }>();

      contracts?.forEach((contract: any) => {
        contractsMap.set(contract.scout_id, {
          team_id: contract.team_id,
          team_name: contract.teams?.name || "Unknown",
          team_abbreviation: contract.teams?.abbreviation || "UNK",
          contract_years: contract.contract_years,
        });
      });

      priorities?.forEach((priority: any) => {
        prioritiesMap.set(`${priority.scout_id}-${priority.team_id}`, {
          team_id: priority.team_id,
          priority: priority.priority,
        });
      });

      const scoutsWithStatus: ScoutWithStatus[] = (allScouts || []).map((scout) => {
        const contract = contractsMap.get(scout.id);
        const priority = contract
          ? prioritiesMap.get(`${scout.id}-${contract.team_id}`)
          : null;

        return {
          ...scout,
          status: contract ? "hired" : "free_agent",
          team_id: contract?.team_id,
          team_name: contract?.team_name,
          team_abbreviation: contract?.team_abbreviation,
          contract_years: contract?.contract_years,
          priority: priority?.priority,
        };
      });

      setScouts(scoutsWithStatus);
    } catch (error) {
      console.error("Error loading scouts data:", error);
    } finally {
      setLoading(false);
    }
  }

  // Filter scouts
  const filteredScouts = scouts.filter((scout) => {
    // Search term filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      if (
        !scout.name.toLowerCase().includes(searchLower) &&
        !scout.archetype.toLowerCase().includes(searchLower) &&
        !scout.team_name?.toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }

    // Team filter
    if (selectedTeam !== "all" && scout.team_id !== selectedTeam) {
      return false;
    }

    // Archetype filter
    if (selectedArchetype !== "all" && scout.archetype !== selectedArchetype) {
      return false;
    }

    // Status filter
    if (statusFilter !== "all" && scout.status !== statusFilter) {
      return false;
    }

    return true;
  });

  const archetypeColors: Record<string, string> = {
    evaluator: "bg-purple-100 text-purple-700",
    tape_grinder: "bg-blue-100 text-blue-700",
    character_coach: "bg-green-100 text-green-700",
    athletic_analyst: "bg-orange-100 text-orange-700",
  };

  const priorityLabels: Record<number, string> = {
    1: "Primary",
    2: "Secondary",
    3: "Tertiary",
    4: "Quaternary",
  };

  const priorityColors: Record<number, string> = {
    1: "text-purple-600 font-bold",
    2: "text-blue-600 font-semibold",
    3: "text-yellow-600",
    4: "text-slate-600",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <p className="text-slate-500">Loading scouts...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-8 py-6">
            <h1 className="text-3xl font-black text-white tracking-tight mb-2">
              All Scouts
            </h1>
            <p className="text-slate-300 text-sm">
              {scouts.length} total scouts • {scouts.filter((s) => s.status === "hired").length} hired • {scouts.filter((s) => s.status === "free_agent").length} free agents
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-bold text-slate-900">Filters</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Team Filter */}
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} ({team.abbreviation})
                </option>
              ))}
            </select>

            {/* Archetype Filter */}
            <select
              value={selectedArchetype}
              onChange={(e) => setSelectedArchetype(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Archetypes</option>
              <option value="evaluator">Evaluator</option>
              <option value="tape_grinder">Tape Grinder</option>
              <option value="character_coach">Character Coach</option>
              <option value="athletic_analyst">Athletic Analyst</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "hired" | "free_agent")}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Status</option>
              <option value="hired">Hired</option>
              <option value="free_agent">Free Agent</option>
            </select>
          </div>
        </div>

        {/* Scouts Table */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-gradient-to-r from-slate-50 to-slate-100">
                  <th className="text-left py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Scout
                  </th>
                  <th className="text-left py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Archetype
                  </th>
                  <th className="text-center py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Team
                  </th>
                  <th className="text-center py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="text-center py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Evaluation
                  </th>
                  <th className="text-center py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Football IQ
                  </th>
                  <th className="text-center py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Reputation
                  </th>
                  <th className="text-right py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Salary
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredScouts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p className="font-medium">No scouts found</p>
                      <p className="text-sm">Try adjusting your filters</p>
                    </td>
                  </tr>
                ) : (
                  filteredScouts.map((scout) => (
                    <tr
                      key={scout.id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-all"
                    >
                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-900">{scout.name}</div>
                        <div className="text-xs text-slate-500">
                          {scout.experience} years exp.
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                            archetypeColors[scout.archetype] || "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {scout.archetype.replace("_", " ")}
                        </span>
                      </td>
                      <td className="text-center py-4 px-4">
                        {scout.status === "hired" ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <UserCheck className="w-4 h-4 text-green-600" />
                            <span className="text-xs font-semibold text-green-700">
                              Hired
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            <UserX className="w-4 h-4 text-slate-400" />
                            <span className="text-xs font-medium text-slate-500">
                              Free Agent
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {scout.team_name ? (
                          <div>
                            <div className="font-medium text-slate-900">
                              {scout.team_name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {scout.team_abbreviation}
                              {scout.contract_years && ` • ${scout.contract_years}yr`}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="text-center py-4 px-4">
                        {scout.priority ? (
                          <span className={priorityColors[scout.priority] || "text-slate-600"}>
                            {priorityLabels[scout.priority] || `P${scout.priority}`}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="text-center py-4 px-4">
                        <span className="font-semibold text-slate-900">
                          {scout.evaluation}
                        </span>
                      </td>
                      <td className="text-center py-4 px-4">
                        <span className="font-semibold text-slate-900">
                          {scout.football_iq}
                        </span>
                      </td>
                      <td className="text-center py-4 px-4">
                        <span
                          className={`font-semibold ${
                            scout.reputation >= 80
                              ? "text-purple-600"
                              : scout.reputation >= 60
                                ? "text-blue-600"
                                : "text-slate-600"
                          }`}
                        >
                          {scout.reputation}
                        </span>
                      </td>
                      <td className="text-right py-4 px-4">
                        <span className="font-semibold text-slate-900">
                          ${(scout.salary / 1000000).toFixed(2)}M
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4 border border-slate-200">
            <div className="text-sm text-slate-600 mb-1">Total Scouts</div>
            <div className="text-2xl font-bold text-slate-900">{scouts.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border border-slate-200">
            <div className="text-sm text-slate-600 mb-1">Hired</div>
            <div className="text-2xl font-bold text-green-600">
              {scouts.filter((s) => s.status === "hired").length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border border-slate-200">
            <div className="text-sm text-slate-600 mb-1">Free Agents</div>
            <div className="text-2xl font-bold text-slate-600">
              {scouts.filter((s) => s.status === "free_agent").length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border border-slate-200">
            <div className="text-sm text-slate-600 mb-1">Filtered Results</div>
            <div className="text-2xl font-bold text-blue-600">{filteredScouts.length}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

