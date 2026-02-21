"use client";

import { useState, useEffect, useMemo } from "react";
import { useGameStore } from "@/lib/store/game-store";
import { supabase } from "@/lib/supabase-client";
import { useSearchParams } from "next/navigation";
import { Search, Filter, Download, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface DraftResult {
  id: string;
  draft_pick_id: string;
  prospect_id: string;
  player_id: string;
  team_id: string;
  season: number;
  signed_at: string;
  draft_picks: {
    id: string;
    round: number;
    pick_overall: number;
    pick_in_round: number;
    owning_team_id: string;
    teams: {
      id: string;
      name: string;
      abbreviation: string;
    };
  };
  draft_prospects: {
    id: string;
    full_name: string;
    position: string;
    overall: number;
    potential: number;
    college: string | null;
  } | null;
  players: {
    id: string;
    full_name: string;
    position: string;
    overall: number;
    potential: number;
    team_id: string;
  } | null;
  teams: {
    id: string;
    name: string;
    abbreviation: string;
  };
}

export default function DraftSummaryPage() {
  const searchParams = useSearchParams();
  const { saveGameId } = useGameStore();
  const [season, setSeason] = useState<number>(
    parseInt(searchParams.get("season") || "2025")
  );
  const [draftResults, setDraftResults] = useState<DraftResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [roundFilter, setRoundFilter] = useState<string>("all");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && saveGameId) {
      loadDraftResults();
    }
  }, [mounted, season, saveGameId]);

  const loadDraftResults = async () => {
    if (!saveGameId) return;

    setLoading(true);
    setError(null);

    try {
      // Load all drafted picks (those with selected_player_id)
      const { data: draftedPicks, error: picksError } = await supabase
        .from("draft_picks")
        .select(
          `
          id,
          round,
          pick_overall,
          pick_in_round,
          owning_team_id,
          selected_player_id,
          teams!draft_picks_owning_team_id_fkey (id, name, abbreviation)
        `
        )
        .eq("season", season)
        .eq("save_game_id", saveGameId)
        .not("selected_player_id", "is", null)
        .order("pick_overall", { ascending: true });

      if (picksError) {
        throw picksError;
      }

      if (!draftedPicks || draftedPicks.length === 0) {
        setDraftResults([]);
        return;
      }

      // Load related data for each pick
      const enrichedResults = await Promise.all(
        draftedPicks.map(async (pick) => {
          // Load prospect/player
          let prospect = null;
          let player = null;
          if (pick.selected_player_id) {
            // Try to load from draft_prospects first - filter by save_game_id
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

            // Also try to load from players
            const { data: playerData } = await supabase
              .from("players")
              .select("id, full_name, position, overall, potential, team_id")
              .eq("id", pick.selected_player_id)
              .maybeSingle();
            player = playerData;
          }

          // Get team from the pick (handle array or single object)
          const team = Array.isArray(pick.teams) ? pick.teams[0] : pick.teams;

          // Try to get draft_result if it exists
          const { data: draftResult } = await supabase
            .from("draft_results")
            .select("*")
            .eq("draft_pick_id", pick.id)
            .maybeSingle();

          return {
            id: draftResult?.id || pick.id,
            draft_pick_id: pick.id,
            prospect_id: pick.selected_player_id,
            player_id: pick.selected_player_id,
            team_id: pick.owning_team_id,
            season: season,
            signed_at: draftResult?.signed_at || new Date().toISOString(),
            draft_picks: {
              id: pick.id,
              round: pick.round,
              pick_overall: pick.pick_overall,
              pick_in_round: pick.pick_in_round,
              owning_team_id: pick.owning_team_id,
              teams: team || { id: "", name: "", abbreviation: "" },
            },
            draft_prospects: prospect,
            players: player,
            teams: team || { id: "", name: "", abbreviation: "" },
          } as DraftResult;
        })
      );

      setDraftResults(enrichedResults);
    } catch (err) {
      console.error("Error loading draft results:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load draft results"
      );
    } finally {
      setLoading(false);
    }
  };

  // Get unique teams for filter
  const teams = useMemo(() => {
    const teamSet = new Set<string>();
    draftResults.forEach((result) => {
      if (result.teams) {
        teamSet.add(result.teams.id);
      }
    });
    return Array.from(teamSet).map((teamId) => {
      const result = draftResults.find((r) => r.teams?.id === teamId);
      return result?.teams;
    }).filter(Boolean);
  }, [draftResults]);

  // Filter and sort results
  const filteredResults = useMemo(() => {
    return draftResults.filter((result) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const playerName = result.draft_prospects?.full_name?.toLowerCase() || 
                          result.players?.full_name?.toLowerCase() || "";
        const position = result.draft_prospects?.position?.toLowerCase() || 
                        result.players?.position?.toLowerCase() || "";
        const college = result.draft_prospects?.college?.toLowerCase() || "";
        const teamName = result.teams?.name?.toLowerCase() || "";
        
        if (!playerName.includes(query) && 
            !position.includes(query) && 
            !college.includes(query) &&
            !teamName.includes(query)) {
          return false;
        }
      }

      // Team filter
      if (teamFilter !== "all" && result.team_id !== teamFilter) {
        return false;
      }

      // Round filter
      if (roundFilter !== "all" && result.draft_picks?.round !== parseInt(roundFilter)) {
        return false;
      }

      // Position filter
      if (positionFilter !== "all") {
        const position = result.draft_prospects?.position || result.players?.position;
        if (position !== positionFilter) {
          return false;
        }
      }

      return true;
    });
  }, [draftResults, searchQuery, teamFilter, roundFilter, positionFilter]);

  // Group by team
  const resultsByTeam = useMemo(() => {
    const grouped: Record<string, DraftResult[]> = {};
    filteredResults.forEach((result) => {
      const teamId = result.team_id;
      if (!grouped[teamId]) {
        grouped[teamId] = [];
      }
      grouped[teamId].push(result);
    });
    return grouped;
  }, [filteredResults]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-futuristic-bg-primary via-futuristic-bg-secondary to-futuristic-bg-tertiary grid-pattern">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="glass-panel rounded-xl p-8">
            <p style={{ color: "var(--futuristic-text-secondary)" }}>Loading...</p>
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
                <h1 className="text-4xl font-black tracking-tight mb-2 digital-display" style={{ color: 'var(--futuristic-neon-cyan)', textShadow: '0 0 10px rgba(0, 240, 255, 0.8), 0 0 20px rgba(0, 240, 255, 0.5)' }}>
                  {season} NFL DRAFT SUMMARY
                </h1>
                <p style={{ color: 'var(--futuristic-text-secondary)' }}>
                  {filteredResults.length} picks made
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: 'var(--futuristic-text-secondary)' }} />
              <input
                type="text"
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 glass-input rounded-lg"
                style={{ color: 'var(--futuristic-text-primary)' }}
              />
            </div>

            {/* Team Filter */}
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="px-4 py-2 glass-input rounded-lg"
              style={{ color: 'var(--futuristic-text-primary)' }}
            >
              <option value="all">All Teams</option>
              {teams.map((team) => (
                <option key={team?.id} value={team?.id}>
                  {team?.name}
                </option>
              ))}
            </select>

            {/* Round Filter */}
            <select
              value={roundFilter}
              onChange={(e) => setRoundFilter(e.target.value)}
              className="px-4 py-2 glass-input rounded-lg"
              style={{ color: 'var(--futuristic-text-primary)' }}
            >
              <option value="all">All Rounds</option>
              {[1, 2, 3, 4, 5, 6, 7].map((round) => (
                <option key={round} value={round.toString()}>
                  Round {round}
                </option>
              ))}
            </select>

            {/* Position Filter */}
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="px-4 py-2 glass-input rounded-lg"
              style={{ color: 'var(--futuristic-text-primary)' }}
            >
              <option value="all">All Positions</option>
              {["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K", "P"].map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="glass-panel rounded-xl p-8 text-center">
            <p style={{ color: 'var(--futuristic-text-secondary)' }}>Loading draft results...</p>
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="glass-panel rounded-xl p-8 text-center">
            <p style={{ color: 'var(--futuristic-text-secondary)' }}>No draft results found.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Grouped by Team */}
            {Object.entries(resultsByTeam).map(([teamId, picks]) => {
              const team = picks[0]?.teams;
              return (
                <div key={teamId} className="glass-card rounded-lg p-6">
                  <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--futuristic-neon-purple)' }}>
                    {team?.name} ({picks.length} picks)
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {picks.map((result) => {
                      const player = result.draft_prospects || result.players;
                      const pick = result.draft_picks;
                      return (
                        <div
                          key={result.id}
                          className="glass-panel rounded-lg p-4 border border-futuristic-neon-cyan/20 hover:border-futuristic-neon-cyan/50 transition-all"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-bold text-sm" style={{ color: 'var(--futuristic-neon-cyan)' }}>
                                R{pick?.round}.{pick?.pick_in_round} (#{pick?.pick_overall})
                              </p>
                            </div>
                          </div>
                          <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--futuristic-text-primary)' }}>
                            {player?.full_name}
                          </h3>
                          <p className="text-sm mb-2" style={{ color: 'var(--futuristic-text-secondary)' }}>
                            {player?.position} • {("college" in (player || {})) ? (player as any).college || "N/A" : "N/A"}
                          </p>
                          <div className="flex gap-4 text-sm">
                            <div>
                              <span style={{ color: 'var(--futuristic-text-secondary)' }}>OVR: </span>
                              <span style={{ color: 'var(--futuristic-neon-green)' }}>{player?.overall}</span>
                            </div>
                            <div>
                              <span style={{ color: 'var(--futuristic-text-secondary)' }}>POT: </span>
                              <span style={{ color: 'var(--futuristic-neon-purple)' }}>{player?.potential}</span>
                            </div>
                          </div>
                          {result.players?.team_id && (
                            <p className="text-xs mt-2" style={{ color: 'var(--futuristic-text-secondary)' }}>
                              ✓ Assigned to team
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
        )}
      </div>
    </div>
  );
}

