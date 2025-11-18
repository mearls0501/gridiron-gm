"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import Link from "next/link";
import { Trophy, Users, ArrowUpDown } from "lucide-react";

interface DraftPick {
  id: string;
  season: number;
  round: number;
  pick_overall: number;
  pick_in_round: number;
  owning_team_id: string;
  original_team_id: string;
  status: string;
  notes: string | null;
  teams: {
    id: string;
    name: string;
    abbreviation: string;
  };
  original_team?: {
    id: string;
    name: string;
    abbreviation: string;
  };
}

interface TeamPicks {
  team: {
    id: string;
    name: string;
    abbreviation: string;
  };
  picks: DraftPick[];
  totalPicks: number;
}

export default function DraftPicksPage() {
  const { currentSeason } = useGameStore();
  const [season, setSeason] = useState<number>(currentSeason);
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("all");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSeason(currentSeason);
  }, [currentSeason]);

  useEffect(() => {
    if (mounted) {
      loadPicks();
    }
  }, [season, mounted]);

  async function loadPicks() {
    setLoading(true);
    setError(null);
    try {
      // Load picks for current season and 3 future seasons
      const seasonsToLoad = [season, season + 1, season + 2, season + 3];
      const { data, error: fetchError } = await supabase
        .from("draft_picks")
        .select(
          `
          *,
          teams!draft_picks_owning_team_id_fkey (id, name, abbreviation),
          original_team:teams!draft_picks_original_team_id_fkey (id, name, abbreviation)
        `
        )
        .in("season", seasonsToLoad)
        .order("season", { ascending: true })
        .order("pick_overall", { ascending: true });

      if (fetchError) {
        throw fetchError;
      }

      setPicks(data || []);
    } catch (err) {
      console.error("Error loading draft picks:", err);
      setError(err instanceof Error ? err.message : "Failed to load draft picks");
    } finally {
      setLoading(false);
    }
  }

  async function recalculatePicks() {
    setInitializing(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/draft-picks/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to recalculate draft picks");
      }

      setSuccess(data.message || "Draft picks recalculated successfully!");
      await loadPicks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recalculate draft picks");
    } finally {
      setInitializing(false);
    }
  }

  async function initializePicks() {
    setInitializing(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/initialize-draft-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to initialize draft picks");
      }

      setSuccess(data.message || "Draft picks initialized successfully");
      await loadPicks();
    } catch (err) {
      console.error("Error initializing draft picks:", err);
      setError(err instanceof Error ? err.message : "Failed to initialize draft picks");
    } finally {
      setInitializing(false);
    }
  }

  // Group picks by team and season
  const picksByTeamAndSeason = useMemo(() => {
    const teamSeasonMap = new Map<string, TeamPicks>();

    picks.forEach((pick) => {
      // Filter by selected season if not "all"
      if (selectedTeamId !== "all" && pick.owning_team_id !== selectedTeamId) {
        return;
      }

      const key = `${pick.owning_team_id}-${pick.season}`;
      if (!teamSeasonMap.has(key)) {
        teamSeasonMap.set(key, {
          team: pick.teams,
          picks: [],
          totalPicks: 0,
        });
      }
      const teamPicks = teamSeasonMap.get(key)!;
      teamPicks.picks.push(pick);
      teamPicks.totalPicks += 1;
    });

    // Sort picks within each team by overall pick number
    teamSeasonMap.forEach((teamPicks) => {
      teamPicks.picks.sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return a.pick_overall - b.pick_overall;
      });
    });

    // Sort teams by season, then by best pick
    const sortedTeams = Array.from(teamSeasonMap.values()).sort((a, b) => {
      const aSeason = a.picks[0]?.season || 9999;
      const bSeason = b.picks[0]?.season || 9999;
      if (aSeason !== bSeason) return aSeason - bSeason;
      const aBest = a.picks[0]?.pick_overall || 999;
      const bBest = b.picks[0]?.pick_overall || 999;
      return aBest - bBest;
    });

    return sortedTeams;
  }, [picks, selectedTeamId]);

  // Get available seasons from picks
  const availableSeasons = useMemo(() => {
    const seasons = new Set<number>();
    picks.forEach((pick) => seasons.add(pick.season));
    return Array.from(seasons).sort((a, b) => a - b);
  }, [picks]);

  // Get all teams for filter dropdown
  const allTeams = useMemo(() => {
    const teamMap = new Map<string, { id: string; name: string; abbreviation: string }>();
    picks.forEach((pick) => {
      if (pick.teams) {
        teamMap.set(pick.teams.id, pick.teams);
      }
    });
    return Array.from(teamMap.values()).sort((a, b) =>
      (a.abbreviation || a.name).localeCompare(b.abbreviation || b.name)
    );
  }, [picks]);

  if (!mounted) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Draft Picks</h1>
        <p className="text-slate-600">View and manage draft picks for your team and the league</p>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 border-b border-slate-200 px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <label className="text-xs text-slate-600 uppercase tracking-wider block mb-1">
                  Season
                </label>
                <select
                  value={season}
                  onChange={(e) => setSeason(parseInt(e.target.value) || 2025)}
                  className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {availableSeasons.length > 0 ? (
                    availableSeasons.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))
                  ) : (
                    <option value={season}>{season}</option>
                  )}
                </select>
              </div>
              {picks.length === 0 ? (
                <button
                  onClick={initializePicks}
                  disabled={initializing}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {initializing ? "Initializing..." : "Initialize Draft Picks"}
                </button>
              ) : (
                <button
                  onClick={recalculatePicks}
                  disabled={initializing}
                  className="px-6 py-2 bg-yellow-600 text-white rounded-lg font-semibold hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {initializing ? "Recalculating..." : "Recalculate Draft Picks"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        {picks.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 px-8 py-4">
            <div className="flex items-center gap-4">
              <div>
                <label className="text-xs text-slate-600 uppercase tracking-wider block mb-1">
                  Filter by Team
                </label>
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Teams</option>
                  {allTeams.map(
                    (team) =>
                      team && (
                        <option key={team.id} value={team.id}>
                          {team.abbreviation || team.name}
                        </option>
                      )
                  )}
                </select>
              </div>
              <div className="ml-auto text-sm text-slate-600">
                {picksByTeamAndSeason.length} team{picksByTeamAndSeason.length !== 1 ? "s" : ""} •{" "}
                {picks.filter((p) => selectedTeamId === "all" || p.owning_team_id === selectedTeamId).length}{" "}
                picks • Seasons: {availableSeasons.join(", ")}
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700 font-medium">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-green-700 font-medium">{success}</p>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
          <p className="text-slate-500">Loading draft picks...</p>
        </div>
      ) : picks.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
          <p className="text-slate-500 text-lg mb-4">
            No draft picks found for season {season}.
          </p>
          <p className="text-slate-400 text-sm mb-6">
            Initialize draft picks to create the draft order based on team records.
          </p>
          <button
            onClick={initializePicks}
            disabled={initializing}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {initializing ? "Initializing..." : "Initialize Draft Picks"}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {picksByTeamAndSeason.map((teamPicks) => {
            const currentSeasonPicks = teamPicks.picks.filter((p) => p.season === season);
            const futureSeasons = teamPicks.picks.filter((p) => p.season > season);
            const displaySeason = teamPicks.picks[0]?.season || season;
            
            return (
              <div
                key={`${teamPicks.team.id}-${displaySeason}`}
                className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden"
              >
                {/* Team Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Users className="w-6 h-6" />
                      <div>
                        <h3 className="text-xl font-bold">
                          {teamPicks.team.abbreviation || teamPicks.team.name}
                        </h3>
                        <p className="text-blue-100 text-sm">
                          {teamPicks.totalPicks} pick{teamPicks.totalPicks !== 1 ? "s" : ""} across{" "}
                          {new Set(teamPicks.picks.map((p) => p.season)).size} season
                          {new Set(teamPicks.picks.map((p) => p.season)).size !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    {teamPicks.picks.some((p) => p.pick_overall === 1) && (
                      <div className="flex items-center gap-2 bg-yellow-500 px-3 py-1 rounded-full">
                        <Trophy className="w-4 h-4" />
                        <span className="text-xs font-semibold">#1 Overall</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Picks Grid */}
                <div className="p-6">
                  {/* Current Season */}
                  {currentSeasonPicks.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
                        {season} Season
                      </h4>
                      <div className="grid grid-cols-7 gap-2">
                        {currentSeasonPicks.map((pick) => (
                          <div
                            key={pick.id}
                            className={`p-3 rounded-lg border-2 text-center ${
                              pick.pick_overall === 1
                                ? "bg-yellow-50 border-yellow-400"
                                : pick.pick_overall <= 10
                                ? "bg-blue-50 border-blue-300"
                                : "bg-slate-50 border-slate-200"
                            }`}
                          >
                            <div className="text-xs text-slate-600 mb-1">Round {pick.round}</div>
                            <div className="text-lg font-bold text-slate-900">
                              #{pick.pick_overall}
                            </div>
                            <div className="text-xs text-slate-500">
                              Pick {pick.pick_in_round} in Round
                            </div>
                            {pick.original_team_id !== pick.owning_team_id && pick.original_team && (
                              <div className="text-xs text-orange-600 mt-1 font-medium">
                                From {pick.original_team.abbreviation || pick.original_team.name}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Future Seasons */}
                  {futureSeasons.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
                        Future Seasons
                      </h4>
                      <div className="grid grid-cols-7 gap-2">
                        {futureSeasons.map((pick) => (
                          <div
                            key={pick.id}
                            className="p-3 rounded-lg border-2 border-slate-200 bg-slate-50 text-center opacity-75"
                          >
                            <div className="text-xs text-slate-600 mb-1">
                              {pick.season} • Round {pick.round}
                            </div>
                            <div className="text-lg font-bold text-slate-900">
                              #{pick.pick_overall}
                            </div>
                            <div className="text-xs text-slate-500">
                              Pick {pick.pick_in_round} in Round
                            </div>
                            {pick.original_team_id !== pick.owning_team_id && pick.original_team && (
                              <div className="text-xs text-orange-600 mt-1 font-medium">
                                From {pick.original_team.abbreviation || pick.original_team.name}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
