"use client";

import { useState, useEffect, useMemo } from "react";
import { useGameStore } from "@/lib/store/game-store";
import { supabase } from "@/lib/supabase-client";
import { Search, Calendar, Users, ArrowLeft, Trophy } from "lucide-react";
import Link from "next/link";

interface DraftHistoryPick {
  id: string;
  season: number;
  round: number;
  pick_overall: number;
  pick_in_round: number;
  owning_team_id: string;
  selected_player_id: string | null;
  teams: {
    id: string;
    name: string;
    abbreviation: string;
  };
  prospect: {
    id: string;
    full_name: string;
    position: string;
    overall: number;
    potential: number;
    college: string | null;
  } | null;
  player: {
    id: string;
    full_name: string;
    position: string;
    overall: number;
    potential: number;
    team_id: string | null;
  } | null;
}

interface TeamDraftHistory {
  team: {
    id: string;
    name: string;
    abbreviation: string;
  };
  seasons: Record<number, DraftHistoryPick[]>;
}

export default function DraftHistoryPage() {
  const { saveGameId, selectedTeamId, currentSeason } = useGameStore();
  const [seasonFilter, setSeasonFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [roundFilter, setRoundFilter] = useState<string>("all");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [draftHistory, setDraftHistory] = useState<DraftHistoryPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && saveGameId) {
      loadDraftHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, saveGameId]);

  const loadDraftHistory = async () => {
    if (!saveGameId) return;

    setLoading(true);
    setError(null);

    try {
      // Load all draft picks that have been used (have selected_player_id)
      // Only load picks from past seasons (before current season)
      const picksQuery = supabase
        .from("draft_picks")
        .select(
          `
          id,
          season,
          round,
          pick_overall,
          pick_in_round,
          owning_team_id,
          selected_player_id,
          teams!draft_picks_owning_team_id_fkey (id, name, abbreviation)
        `
        )
        .eq("save_game_id", saveGameId)
        .not("selected_player_id", "is", null)
        .lt("season", currentSeason)
        .order("season", { ascending: false })
        .order("pick_overall", { ascending: true });

      const { data: draftedPicks, error: picksError } = await picksQuery;

      if (picksError) {
        throw picksError;
      }

      if (!draftedPicks || draftedPicks.length === 0) {
        setDraftHistory([]);
        setLoading(false);
        return;
      }

      // Load player/prospect data for each pick
      const enrichedPicks = await Promise.all(
        draftedPicks.map(async (pick) => {
          let prospect = null;
          let player = null;

          if (pick.selected_player_id) {
            // Try to load from draft_prospects first
            let prospectQuery = supabase
              .from("draft_prospects")
              .select("id, full_name, position, overall, potential, college")
              .eq("id", pick.selected_player_id);

            if (saveGameId) {
              prospectQuery = prospectQuery.eq("save_game_id", saveGameId);
            } else {
              prospectQuery = prospectQuery.is("save_game_id", null);
            }

            const { data: prospectData } = await prospectQuery.maybeSingle();
            prospect = prospectData;

            // Also try to load from players table (in case they're now in the league)
            const { data: playerData } = await supabase
              .from("players")
              .select("id, full_name, position, overall, potential, team_id")
              .eq("id", pick.selected_player_id)
              .maybeSingle();
            player = playerData;
          }

          // Handle teams - Supabase returns it as an array from the join, but we need a single object
          const teamData = Array.isArray(pick.teams)
            ? pick.teams[0]
            : pick.teams;

          return {
            id: pick.id,
            season: pick.season,
            round: pick.round,
            pick_overall: pick.pick_overall,
            pick_in_round: pick.pick_in_round,
            owning_team_id: pick.owning_team_id,
            selected_player_id: pick.selected_player_id,
            teams: teamData || {
              id: pick.owning_team_id,
              name: "Unknown",
              abbreviation: "UNK",
            },
            prospect,
            player,
          } as DraftHistoryPick;
        })
      );

      setDraftHistory(enrichedPicks);
    } catch (err) {
      console.error("Error loading draft history:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load draft history"
      );
    } finally {
      setLoading(false);
    }
  };

  // Get available seasons from history
  const availableSeasons = useMemo(() => {
    const seasons = new Set<number>();
    draftHistory.forEach((pick) => seasons.add(pick.season));
    return Array.from(seasons).sort((a, b) => b - a); // Most recent first
  }, [draftHistory]);

  // Get all teams from history
  const allTeams = useMemo(() => {
    const teamMap = new Map<
      string,
      { id: string; name: string; abbreviation: string }
    >();
    draftHistory.forEach((pick) => {
      if (pick.teams) {
        teamMap.set(pick.teams.id, pick.teams);
      }
    });
    return Array.from(teamMap.values()).sort((a, b) =>
      (a.abbreviation || a.name).localeCompare(b.abbreviation || b.name)
    );
  }, [draftHistory]);

  // Filter picks
  const filteredPicks = useMemo(() => {
    return draftHistory.filter((pick) => {
      // Season filter
      if (seasonFilter !== "all" && pick.season !== parseInt(seasonFilter)) {
        return false;
      }

      // Team filter
      if (teamFilter !== "all" && pick.owning_team_id !== teamFilter) {
        return false;
      }

      // Round filter
      if (roundFilter !== "all" && pick.round !== parseInt(roundFilter)) {
        return false;
      }

      // Position filter
      if (positionFilter !== "all") {
        const position = pick.prospect?.position || pick.player?.position || "";
        if (position !== positionFilter) {
          return false;
        }
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const playerName =
          pick.prospect?.full_name?.toLowerCase() ||
          pick.player?.full_name?.toLowerCase() ||
          "";
        const position =
          pick.prospect?.position?.toLowerCase() ||
          pick.player?.position?.toLowerCase() ||
          "";
        const college = pick.prospect?.college?.toLowerCase() || "";
        const teamName = pick.teams?.name?.toLowerCase() || "";

        if (
          !playerName.includes(query) &&
          !position.includes(query) &&
          !college.includes(query) &&
          !teamName.includes(query)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    draftHistory,
    seasonFilter,
    teamFilter,
    roundFilter,
    positionFilter,
    searchQuery,
  ]);

  // Group by team and season
  const groupedByTeam = useMemo(() => {
    const teamMap = new Map<string, TeamDraftHistory>();

    filteredPicks.forEach((pick) => {
      if (!teamMap.has(pick.owning_team_id)) {
        teamMap.set(pick.owning_team_id, {
          team: pick.teams,
          seasons: {},
        });
      }

      const teamHistory = teamMap.get(pick.owning_team_id)!;
      if (!teamHistory.seasons[pick.season]) {
        teamHistory.seasons[pick.season] = [];
      }
      teamHistory.seasons[pick.season].push(pick);
    });

    // Sort picks within each season by overall pick number
    teamMap.forEach((teamHistory) => {
      Object.keys(teamHistory.seasons).forEach((season) => {
        teamHistory.seasons[parseInt(season)].sort(
          (a, b) => a.pick_overall - b.pick_overall
        );
      });
    });

    // Sort teams: user's team first, then alphabetically
    return Array.from(teamMap.values()).sort((a, b) => {
      if (selectedTeamId) {
        if (a.team.id === selectedTeamId) return -1;
        if (b.team.id === selectedTeamId) return 1;
      }
      return (a.team.abbreviation || a.team.name).localeCompare(
        b.team.abbreviation || b.team.name
      );
    });
  }, [filteredPicks, selectedTeamId]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-futuristic-bg-primary via-futuristic-bg-secondary to-futuristic-bg-tertiary grid-pattern">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="glass-panel rounded-xl p-8">
            <p style={{ color: "var(--futuristic-text-secondary)" }}>
              Loading...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-futuristic-bg-primary via-futuristic-bg-secondary to-futuristic-bg-tertiary grid-pattern">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="glass-panel rounded-xl mb-6 overflow-hidden holographic">
          <div className="bg-gradient-to-r from-futuristic-bg-secondary via-futuristic-bg-tertiary to-futuristic-bg-secondary px-8 py-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1
                  className="text-4xl font-black tracking-tight mb-2 digital-display"
                  style={{
                    color: "var(--futuristic-neon-cyan)",
                    textShadow:
                      "0 0 10px rgba(0, 240, 255, 0.8), 0 0 20px rgba(0, 240, 255, 0.5)",
                  }}
                >
                  DRAFT HISTORY
                </h1>
                <p style={{ color: "var(--futuristic-text-secondary)" }}>
                  {filteredPicks.length} picks across {availableSeasons.length}{" "}
                  season{availableSeasons.length !== 1 ? "s" : ""}
                </p>
              </div>
              <Link
                href="/draft"
                className="px-4 py-2 btn-futuristic-cyan rounded-lg font-semibold flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Draft
              </Link>
            </div>
          </div>
        </div>

        {error && (
          <div className="glass-card rounded-lg p-4 mb-6 border-2 border-red-500/50">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Filters */}
        <div className="glass-card rounded-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Search */}
            <div className="relative lg:col-span-2">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5"
                style={{ color: "var(--futuristic-text-secondary)" }}
              />
              <input
                type="text"
                placeholder="Search players, teams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 glass-input rounded-lg"
                style={{ color: "var(--futuristic-text-primary)" }}
              />
            </div>

            {/* Season Filter */}
            <div className="relative">
              <Calendar
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5"
                style={{ color: "var(--futuristic-text-secondary)" }}
              />
              <select
                value={seasonFilter}
                onChange={(e) => setSeasonFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 glass-input rounded-lg"
                style={{ color: "var(--futuristic-text-primary)" }}
              >
                <option value="all">All Seasons</option>
                {availableSeasons.map((season) => (
                  <option key={season} value={season.toString()}>
                    {season}
                  </option>
                ))}
              </select>
            </div>

            {/* Team Filter */}
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="px-4 py-2 glass-input rounded-lg"
              style={{ color: "var(--futuristic-text-primary)" }}
            >
              <option value="all">All Teams</option>
              {allTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.abbreviation || team.name}
                </option>
              ))}
            </select>

            {/* Round Filter */}
            <select
              value={roundFilter}
              onChange={(e) => setRoundFilter(e.target.value)}
              className="px-4 py-2 glass-input rounded-lg"
              style={{ color: "var(--futuristic-text-primary)" }}
            >
              <option value="all">All Rounds</option>
              {[1, 2, 3, 4, 5, 6, 7].map((round) => (
                <option key={round} value={round.toString()}>
                  Round {round}
                </option>
              ))}
            </select>
          </div>

          {/* Position Filter */}
          <div className="mt-4">
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="px-4 py-2 glass-input rounded-lg"
              style={{ color: "var(--futuristic-text-primary)" }}
            >
              <option value="all">All Positions</option>
              {["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K", "P"].map(
                (pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                )
              )}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="glass-panel rounded-xl p-8 text-center">
            <p style={{ color: "var(--futuristic-text-secondary)" }}>
              Loading draft history...
            </p>
          </div>
        ) : filteredPicks.length === 0 ? (
          <div className="glass-panel rounded-xl p-8 text-center">
            <p style={{ color: "var(--futuristic-text-secondary)" }}>
              No draft history found.
            </p>
            <p
              className="text-sm mt-2"
              style={{ color: "var(--futuristic-text-secondary)" }}
            >
              Draft picks from previous seasons will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedByTeam.map((teamHistory) => {
              const isUserTeam = teamHistory.team.id === selectedTeamId;
              const seasons = Object.keys(teamHistory.seasons)
                .map(Number)
                .sort((a, b) => b - a); // Most recent first

              return (
                <div
                  key={teamHistory.team.id}
                  className={`glass-card rounded-lg overflow-hidden ${
                    isUserTeam ? "border-2 border-futuristic-neon-cyan/50" : ""
                  }`}
                >
                  {/* Team Header */}
                  <div
                    className={`px-6 py-4 ${
                      isUserTeam
                        ? "bg-gradient-to-r from-futuristic-neon-cyan/20 to-futuristic-neon-purple/20"
                        : "bg-gradient-to-r from-slate-800/50 to-slate-700/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Users
                          className="w-6 h-6"
                          style={{
                            color: isUserTeam
                              ? "var(--futuristic-neon-cyan)"
                              : "var(--futuristic-text-secondary)",
                          }}
                        />
                        <div>
                          <h2
                            className="text-2xl font-bold"
                            style={{
                              color: isUserTeam
                                ? "var(--futuristic-neon-cyan)"
                                : "var(--futuristic-text-primary)",
                            }}
                          >
                            {teamHistory.team.name}
                            {isUserTeam && (
                              <span
                                className="ml-2 text-sm font-normal"
                                style={{
                                  color: "var(--futuristic-text-secondary)",
                                }}
                              >
                                (Your Team)
                              </span>
                            )}
                          </h2>
                          <p
                            style={{
                              color: "var(--futuristic-text-secondary)",
                            }}
                          >
                            {seasons.length} season
                            {seasons.length !== 1 ? "s" : ""} •{" "}
                            {Object.values(teamHistory.seasons).reduce(
                              (sum, picks) => sum + picks.length,
                              0
                            )}{" "}
                            total picks
                          </p>
                        </div>
                      </div>
                      {teamHistory.seasons[seasons[0]]?.some(
                        (p) => p.pick_overall === 1
                      ) && (
                        <div
                          className="flex items-center gap-2 px-3 py-1 rounded-full"
                          style={{
                            backgroundColor: "rgba(255, 215, 0, 0.2)",
                            border: "1px solid rgba(255, 215, 0, 0.5)",
                          }}
                        >
                          <Trophy
                            className="w-4 h-4"
                            style={{ color: "#FFD700" }}
                          />
                          <span
                            className="text-xs font-semibold"
                            style={{ color: "#FFD700" }}
                          >
                            #1 Overall
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Seasons */}
                  <div className="p-6 space-y-6">
                    {seasons.map((season) => {
                      const picks = teamHistory.seasons[season];
                      return (
                        <div key={season}>
                          <h3
                            className="text-lg font-bold mb-4"
                            style={{ color: "var(--futuristic-neon-purple)" }}
                          >
                            {season} Season ({picks.length} pick
                            {picks.length !== 1 ? "s" : ""})
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {picks.map((pick) => {
                              const player = pick.prospect || pick.player;
                              return (
                                <div
                                  key={pick.id}
                                  className="glass-panel rounded-lg p-4 border border-futuristic-neon-cyan/20 hover:border-futuristic-neon-cyan/50 transition-all"
                                >
                                  <div className="flex items-start justify-between mb-2">
                                    <div>
                                      <p
                                        className="font-bold text-sm"
                                        style={{
                                          color: "var(--futuristic-neon-cyan)",
                                        }}
                                      >
                                        R{pick.round}.{pick.pick_in_round} (#
                                        {pick.pick_overall})
                                      </p>
                                    </div>
                                    {pick.pick_overall === 1 && (
                                      <Trophy
                                        className="w-4 h-4"
                                        style={{ color: "#FFD700" }}
                                      />
                                    )}
                                  </div>
                                  {player ? (
                                    <>
                                      <h4
                                        className="font-bold text-lg mb-1"
                                        style={{
                                          color:
                                            "var(--futuristic-text-primary)",
                                        }}
                                      >
                                        {player.full_name}
                                      </h4>
                                      <p
                                        className="text-sm mb-2"
                                        style={{
                                          color:
                                            "var(--futuristic-text-secondary)",
                                        }}
                                      >
                                        {player.position} •{" "}
                                        {pick.prospect?.college || "N/A"}
                                      </p>
                                      <div className="flex gap-4 text-sm">
                                        <div>
                                          <span
                                            style={{
                                              color:
                                                "var(--futuristic-text-secondary)",
                                            }}
                                          >
                                            OVR:{" "}
                                          </span>
                                          <span
                                            style={{
                                              color:
                                                "var(--futuristic-neon-green)",
                                            }}
                                          >
                                            {player.overall}
                                          </span>
                                        </div>
                                        <div>
                                          <span
                                            style={{
                                              color:
                                                "var(--futuristic-text-secondary)",
                                            }}
                                          >
                                            POT:{" "}
                                          </span>
                                          <span
                                            style={{
                                              color:
                                                "var(--futuristic-neon-purple)",
                                            }}
                                          >
                                            {player.potential}
                                          </span>
                                        </div>
                                      </div>
                                      {pick.player?.team_id && (
                                        <p
                                          className="text-xs mt-2"
                                          style={{
                                            color:
                                              "var(--futuristic-text-secondary)",
                                          }}
                                        >
                                          ✓ Active player
                                        </p>
                                      )}
                                    </>
                                  ) : (
                                    <p
                                      className="text-sm"
                                      style={{
                                        color:
                                          "var(--futuristic-text-secondary)",
                                      }}
                                    >
                                      Player data not available
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
