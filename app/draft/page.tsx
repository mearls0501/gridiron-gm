"use client";

import { useState, useEffect, useCallback } from "react";
import { useGameStore } from "@/lib/store/game-store";
import { supabase } from "@/lib/supabase-client";
import DraftProspectCard from "@/app/components/DraftProspectCard";
import DraftStateDisplay from "@/app/components/DraftStateDisplay";
import {
  Search,
  Play,
  FastForward,
  Zap,
  Target,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

interface DraftPick {
  id: string;
  season: number;
  round: number;
  pick_overall: number;
  pick_in_round: number;
  owning_team_id: string;
  original_team_id: string | null;
  status: string;
  selected_player_id: string | null;
  teams: {
    id: string;
    name: string;
    abbreviation: string;
  };
  selected_player?: {
    id: string;
    full_name: string;
    position: string;
    overall: number;
    potential: number;
  };
}

interface Prospect {
  id: string;
  full_name: string;
  position: string;
  age: number;
  college: string | null;
  overall: number;
  potential: number;
  traits: Record<string, unknown>;
  season: number;
}

interface ScoutedProspect {
  prospect_id: string;
  est_overall_low: number | null;
  est_overall_high: number | null;
  est_potential_low: number | null;
  est_potential_high: number | null;
  trait_reveals: Record<string, unknown>;
  athletic_bands: Record<string, unknown>;
  psych_reveals: Record<string, unknown>;
  confidence: number | null;
}

interface DraftState {
  status: string;
  current_round: number | null;
  current_pick_overall: number | null;
  started_at: string | null;
  completed_at: string | null;
}

export default function DraftPage() {
  const { currentSeason, saveGameId, selectedTeamId, seasonPhase } =
    useGameStore();
  // Draft season always equals current season
  // Year 1 prospects are generated in Year 1 preseason, scouted in Year 1 regular season, and drafted in Year 1 offseason
  const draftSeason = currentSeason;
  const [season, setSeason] = useState<number>(draftSeason);
  const [draftPicks, setDraftPicks] = useState<DraftPick[]>([]);
  const [availableProspects, setAvailableProspects] = useState<Prospect[]>([]);
  const [scoutedProspects, setScoutedProspects] = useState<
    Map<string, ScoutedProspect>
  >(new Map());
  const [currentPick, setCurrentPick] = useState<DraftPick | null>(null);
  const [draftHistory, setDraftHistory] = useState<DraftPick[]>([]);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [showScoutedOnly, setShowScoutedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"overall" | "potential" | "name">(
    "overall"
  );
  const [sortOrder] = useState<"asc" | "desc">("desc");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Draft season always equals current season
    const draftSeason = currentSeason;
    setSeason(draftSeason);
  }, [currentSeason, seasonPhase]);

  const loadDraftState = useCallback(async () => {
    if (!saveGameId || !season) return;

    try {
      const response = await fetch(
        `/api/draft/state?season=${season}&saveGameId=${saveGameId}`
      );
      const data = await response.json();
      setDraftState(data);
    } catch (err) {
      console.error("Error loading draft state:", err);
    }
  }, [season, saveGameId]);

  const loadDraftData = useCallback(async () => {
    if (!saveGameId) return;

    setLoading(true);
    setError(null);

    try {
      // During offseason, always use the current season for the draft
      // The draft is for the current season's prospects (generated in preseason, scouted in regular season)
      if (seasonPhase === "offseason") {
        // In offseason, the draft is always for the current season
        if (currentSeason !== season) {
          console.log(
            `[Draft Page] In offseason, using current season ${currentSeason} for draft (was ${season})`
          );
          setSeason(currentSeason);
          setLoading(false);
          return;
        }
        // Continue with currentSeason
      } else {
        // For other phases, try to find active draft
        // First, check if current season has an in_progress draft
        const { data: currentSeasonDraftState } = await supabase
          .from("draft_state")
          .select("season, status")
          .eq("season", currentSeason)
          .eq("save_game_id", saveGameId)
          .eq("status", "in_progress")
          .maybeSingle();

        if (currentSeasonDraftState) {
          // Current season has an active draft, use it
          if (currentSeason !== season) {
            console.log(
              `[Draft Page] Found in-progress draft for current season ${currentSeason}`
            );
            setSeason(currentSeason);
            setLoading(false);
            return;
          }
        } else {
          // Check for most recent draft with picks made
          const { data: picksBySeason } = await supabase
            .from("draft_picks")
            .select("season")
            .eq("save_game_id", saveGameId)
            .not("selected_player_id", "is", null)
            .order("season", { ascending: false })
            .limit(1);

          let actualDraftSeason = picksBySeason?.[0]?.season;

          if (!actualDraftSeason) {
            // Check draft_state for in_progress or completed drafts
            const { data: draftStates } = await supabase
              .from("draft_state")
              .select("season, status")
              .eq("save_game_id", saveGameId)
              .in("status", ["in_progress", "completed"])
              .order("season", { ascending: false })
              .limit(1);

            actualDraftSeason = draftStates?.[0]?.season;
          }

          // If still no season found, use current season as fallback
          if (!actualDraftSeason) {
            actualDraftSeason = currentSeason;
          }

          // Only switch to a different season if it's not a past season and we're not in offseason
          // Don't switch to past seasons - always prefer current season
          if (
            actualDraftSeason &&
            actualDraftSeason === currentSeason &&
            actualDraftSeason !== season
          ) {
            console.log(
              `[Draft Page] Using current season ${currentSeason} for draft`
            );
            setSeason(currentSeason);
            setLoading(false);
            return;
          } else if (actualDraftSeason && actualDraftSeason < currentSeason) {
            // Don't switch to past seasons - use current season instead
            console.log(
              `[Draft Page] Ignoring past season ${actualDraftSeason}, using current season ${currentSeason}`
            );
            if (currentSeason !== season) {
              setSeason(currentSeason);
              setLoading(false);
              return;
            }
          }
        }
      }

      // Load draft state first and get the result
      let currentDraftState: DraftState | null = null;
      if (saveGameId && season) {
        try {
          const response = await fetch(
            `/api/draft/state?season=${season}&saveGameId=${saveGameId}`
          );
          const data = await response.json();
          currentDraftState = data;
          setDraftState(data);
        } catch (err) {
          console.error("Error loading draft state:", err);
        }
      }

      // Load draft picks
      const { data: picks, error: picksError } = await supabase
        .from("draft_picks")
        .select(
          `
          *,
          teams!draft_picks_owning_team_id_fkey (id, name, abbreviation)
        `
        )
        .eq("season", season)
        .eq("save_game_id", saveGameId)
        .order("pick_overall", { ascending: true });

      if (picksError) {
        throw picksError;
      }

      const allPicks = (picks || []) as DraftPick[];

      // Load selected player details
      const picksWithSelectedPlayers = await Promise.all(
        allPicks.map(async (pick) => {
          if (pick.selected_player_id) {
            const { data: prospect } = await supabase
              .from("draft_prospects")
              .select("id, full_name, position, overall, potential")
              .eq("id", pick.selected_player_id)
              .single();

            if (prospect) {
              return {
                ...pick,
                selected_player: prospect,
              };
            }
          }
          return pick;
        })
      );

      setDraftPicks(picksWithSelectedPlayers);

      // Find current pick - use draft_state if available, otherwise find first unused
      let nextPick: DraftPick | null = null;

      if (currentDraftState?.current_pick_overall) {
        // Use draft_state as source of truth
        nextPick =
          picksWithSelectedPlayers.find(
            (p) => p.pick_overall === currentDraftState!.current_pick_overall
          ) || null;
        console.log(
          `[Draft Page] Using draft_state pick ${currentDraftState.current_pick_overall}, found:`,
          nextPick?.pick_overall
        );
      }

      // Fallback to finding first unused pick if draft_state doesn't match
      if (!nextPick) {
        nextPick =
          picksWithSelectedPlayers.find(
            (p) => !p.selected_player_id && p.status !== "used"
          ) || null;
        console.log(
          `[Draft Page] Using first unused pick, found:`,
          nextPick?.pick_overall
        );
      }

      setCurrentPick(nextPick);
      console.log(
        `[Draft Page] Set currentPick to:`,
        nextPick
          ? `Round ${nextPick.round}, Pick ${nextPick.pick_in_round} (Overall #${nextPick.pick_overall})`
          : "null"
      );

      // Get draft history
      const history = picksWithSelectedPlayers.filter(
        (p) => p.selected_player_id || p.status === "used"
      );
      setDraftHistory(history);

      // Load available prospects
      const draftedProspectIds = new Set(
        history.map((p) => p.selected_player_id).filter(Boolean) as string[]
      );

      const { data: prospects, error: prospectsError } = await supabase
        .from("draft_prospects")
        .select("*")
        .eq("season", season)
        .eq("save_game_id", saveGameId)
        .order("overall", { ascending: false });

      if (prospectsError) {
        throw prospectsError;
      }

      const available = (prospects || []).filter(
        (p: Prospect) => !draftedProspectIds.has(p.id)
      );
      setAvailableProspects(available);

      // Load scouted prospects
      if (selectedTeamId) {
        const { data: scouted } = await supabase
          .from("scouted_prospects")
          .select("*")
          .eq("team_id", selectedTeamId)
          .eq("save_game_id", saveGameId);

        if (scouted) {
          const scoutedMap = new Map<string, ScoutedProspect>();
          scouted.forEach((sp: ScoutedProspect) => {
            scoutedMap.set(sp.prospect_id, sp);
          });
          setScoutedProspects(scoutedMap);
        }
      }
    } catch (err) {
      console.error("Error loading draft data:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load draft data"
      );
    } finally {
      setLoading(false);
    }
  }, [season, saveGameId, selectedTeamId, currentSeason, seasonPhase]);

  useEffect(() => {
    if (mounted && saveGameId) {
      loadDraftData();
    }
  }, [season, mounted, saveGameId, loadDraftData]);

  const handleStartDraft = async () => {
    if (!saveGameId || !season) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/draft/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, saveGameId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start draft");
      }

      await loadDraftData();
    } catch (err) {
      console.error("Error starting draft:", err);
      setError(err instanceof Error ? err.message : "Failed to start draft");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlayer = async (prospectId: string) => {
    if (!currentPick || !selectedTeamId || selecting) return;

    if (currentPick.owning_team_id !== selectedTeamId) {
      setError("It's not your turn to pick!");
      return;
    }

    setSelecting(true);
    setError(null);

    try {
      const response = await fetch("/api/draft/select-player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeamId,
          prospectId,
          pickId: currentPick.id,
          season,
          saveGameId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to select player");
      }

      await loadDraftData();
    } catch (err) {
      console.error("Error selecting player:", err);
      setError(err instanceof Error ? err.message : "Failed to select player");
    } finally {
      setSelecting(false);
    }
  };

  const handleSimulate = async (type: "to_next_user_pick" | "full_draft") => {
    if (!saveGameId || !season || !selectedTeamId || simulating) return;

    setSimulating(true);
    setError(null);

    try {
      console.log(`[Draft Page] Starting simulation: ${type}`);
      const response = await fetch("/api/draft/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          season,
          saveGameId,
          userTeamId: selectedTeamId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error(`[Draft Page] Simulation failed:`, data);
        throw new Error(data.error || "Failed to simulate draft");
      }

      console.log(`[Draft Page] Simulation complete:`, data);
      console.log(
        `[Draft Page] Picks made: ${data.picksMade}, Draft state:`,
        data.draftState
      );

      // Force reload of both draft state and draft data
      await Promise.all([loadDraftState(), loadDraftData()]);

      console.log(`[Draft Page] Data reloaded after simulation`);
    } catch (err) {
      console.error("[Draft Page] Error simulating draft:", err);
      setError(err instanceof Error ? err.message : "Failed to simulate draft");
    } finally {
      setSimulating(false);
    }
  };

  // Filter and sort prospects
  const filteredProspects = availableProspects
    .filter((p) => {
      if (
        searchQuery &&
        !p.full_name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !p.position.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !(
          p.college &&
          p.college.toLowerCase().includes(searchQuery.toLowerCase())
        )
      ) {
        return false;
      }
      if (positionFilter !== "all" && p.position !== positionFilter) {
        return false;
      }
      if (showScoutedOnly && !scoutedProspects.has(p.id)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "overall") {
        return sortOrder === "desc"
          ? b.overall - a.overall
          : a.overall - b.overall;
      } else if (sortBy === "potential") {
        return sortOrder === "desc"
          ? b.potential - a.potential
          : a.potential - b.potential;
      } else {
        return sortOrder === "desc"
          ? b.full_name.localeCompare(a.full_name)
          : a.full_name.localeCompare(b.full_name);
      }
    });

  const positions = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K", "P"];
  const isUserTurn = currentPick?.owning_team_id === selectedTeamId;
  const draftComplete = draftState?.status === "completed" || !currentPick;

  // Debug logging
  useEffect(() => {
    if (currentPick) {
      console.log(
        `[Draft Page] currentPick updated: Round ${currentPick.round}, Pick ${currentPick.pick_in_round} (Overall #${currentPick.pick_overall}), Team: ${currentPick.owning_team_id}`
      );
    }
    if (draftState) {
      console.log(
        `[Draft Page] draftState: Round ${draftState.current_round}, Pick ${draftState.current_pick_overall}`
      );
    }
  }, [currentPick, draftState]);
  const needsDraftPicks = draftPicks.length === 0 && !loading;
  const needsStart =
    draftPicks.length > 0 && draftState?.status === "not_started";

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
    <div className="min-h-screen bg-gradient-to-br from-futuristic-bg-primary via-futuristic-bg-secondary to-futuristic-bg-tertiary grid-pattern scan-line">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="glass-panel rounded-xl mb-6 overflow-hidden holographic">
          <div className="bg-gradient-to-r from-futuristic-bg-secondary via-futuristic-bg-tertiary to-futuristic-bg-secondary px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1
                  className="text-4xl font-black tracking-tight mb-2 digital-display"
                  style={{
                    color: "var(--futuristic-neon-cyan)",
                    textShadow:
                      "0 0 10px rgba(0, 240, 255, 0.8), 0 0 20px rgba(0, 240, 255, 0.5)",
                  }}
                >
                  {season} NFL DRAFT
                </h1>
                <p style={{ color: "var(--futuristic-text-secondary)" }}>
                  {draftComplete
                    ? "Draft Complete"
                    : currentPick
                      ? `Round ${currentPick.round}, Pick ${currentPick.pick_in_round} (Overall #${currentPick.pick_overall})`
                      : draftState?.current_round &&
                          draftState?.current_pick_overall
                        ? (() => {
                            // Calculate pick_in_round from pick_overall: ((pick_overall - 1) % 32) + 1
                            const pickInRound =
                              ((draftState.current_pick_overall - 1) % 32) + 1;
                            return `Round ${draftState.current_round}, Pick ${pickInRound} (Overall #${draftState.current_pick_overall})`;
                          })()
                        : "War Room"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="glass-card rounded-lg p-4 mb-6 border-2 border-red-500/50">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <p className="font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* Initialize Draft Picks Alert */}
        {needsDraftPicks && (
          <div className="glass-card rounded-lg p-6 mb-6 border-2 border-futuristic-neon-purple/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Target
                  className="w-6 h-6"
                  style={{ color: "var(--futuristic-neon-purple)" }}
                />
                <div>
                  <p
                    className="font-bold text-lg"
                    style={{ color: "var(--futuristic-text-primary)" }}
                  >
                    Draft Picks Not Initialized
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: "var(--futuristic-text-secondary)" }}
                  >
                    Draft picks need to be initialized for the {season} season
                    before you can start the draft.
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  try {
                    const response = await fetch(
                      "/api/initialize-draft-picks",
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          season,
                          saveGameId,
                          futureSeasons: 0,
                        }),
                      }
                    );
                    const data = await response.json();
                    if (!response.ok) {
                      throw new Error(
                        data.error || "Failed to initialize draft picks"
                      );
                    }
                    await loadDraftData();
                  } catch (err) {
                    console.error("Error initializing draft picks:", err);
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Failed to initialize draft picks"
                    );
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading || !saveGameId}
                className="px-6 py-3 btn-futuristic-purple rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Initializing..." : "Initialize Draft Picks"}
              </button>
            </div>
          </div>
        )}

        {/* Start Draft Button */}
        {needsStart && (
          <div className="glass-card rounded-lg p-6 mb-6 border-2 border-futuristic-electric-blue/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Play
                  className="w-6 h-6"
                  style={{ color: "var(--futuristic-electric-blue)" }}
                />
                <div>
                  <p
                    className="font-bold text-lg"
                    style={{ color: "var(--futuristic-text-primary)" }}
                  >
                    Ready to Start Draft
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: "var(--futuristic-text-secondary)" }}
                  >
                    Draft picks are initialized. Click below to begin the{" "}
                    {season} NFL Draft.
                  </p>
                </div>
              </div>
              <button
                onClick={handleStartDraft}
                disabled={loading || !saveGameId}
                className="px-6 py-3 btn-futuristic-blue pulse-glow-blue rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Starting..." : "Start Draft"}
              </button>
            </div>
          </div>
        )}

        {loading && !draftPicks.length ? (
          <div className="glass-panel rounded-xl p-8">
            <p style={{ color: "var(--futuristic-text-secondary)" }}>
              Loading draft...
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Draft Board - Left Panel */}
            <div className="lg:col-span-2">
              <div className="glass-panel rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2
                    className="text-2xl font-bold"
                    style={{
                      color: "var(--futuristic-neon-cyan)",
                      textShadow:
                        "0 0 10px rgba(0, 240, 255, 0.8), 0 0 20px rgba(0, 240, 255, 0.5)",
                    }}
                  >
                    Draft Board
                  </h2>
                  <span
                    className="text-sm"
                    style={{ color: "var(--futuristic-text-secondary)" }}
                  >
                    {filteredProspects.length} available
                  </span>
                </div>

                {/* Filters */}
                <div className="mb-4 space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <Search
                        className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
                        style={{ color: "var(--futuristic-text-muted)" }}
                      />
                      <input
                        type="text"
                        placeholder="Search prospects..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 glass-card border rounded-lg"
                        style={{
                          borderColor: "rgba(0, 240, 255, 0.3)",
                          backgroundColor: "rgba(26, 31, 58, 0.5)",
                          color: "var(--futuristic-text-primary)",
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor =
                            "var(--futuristic-neon-cyan)";
                          e.currentTarget.style.boxShadow =
                            "0 0 0 2px rgba(0, 240, 255, 0.2)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor =
                            "rgba(0, 240, 255, 0.3)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      />
                    </div>
                    <select
                      value={positionFilter}
                      onChange={(e) => setPositionFilter(e.target.value)}
                      className="px-4 py-2 glass-card border rounded-lg"
                      style={{
                        borderColor: "rgba(168, 85, 247, 0.3)",
                        backgroundColor: "rgba(26, 31, 58, 0.5)",
                        color: "var(--futuristic-text-primary)",
                      }}
                    >
                      <option value="all">All Positions</option>
                      {positions.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showScoutedOnly}
                        onChange={(e) => setShowScoutedOnly(e.target.checked)}
                        className="rounded border-futuristic-neon-cyan/50 text-futuristic-neon-cyan focus:ring-futuristic-neon-cyan"
                      />
                      <span
                        className="text-sm"
                        style={{ color: "var(--futuristic-text-secondary)" }}
                      >
                        Scouted only
                      </span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm"
                        style={{ color: "var(--futuristic-text-secondary)" }}
                      >
                        Sort by:
                      </span>
                      <select
                        value={sortBy}
                        onChange={(e) =>
                          setSortBy(
                            e.target.value as "overall" | "potential" | "name"
                          )
                        }
                        className="px-3 py-1 glass-card border rounded text-sm"
                        style={{
                          borderColor: "rgba(0, 240, 255, 0.3)",
                          backgroundColor: "rgba(26, 31, 58, 0.5)",
                          color: "var(--futuristic-text-primary)",
                        }}
                      >
                        <option value="overall">Overall</option>
                        <option value="potential">Potential</option>
                        <option value="name">Name</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Prospects List */}
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {availableProspects.length === 0 ? (
                    <div className="text-center py-12">
                      <Target
                        className="w-16 h-16 mx-auto mb-4"
                        style={{ color: "var(--futuristic-text-muted)" }}
                      />
                      <p
                        className="font-semibold text-lg mb-2"
                        style={{ color: "var(--futuristic-text-primary)" }}
                      >
                        No Draft Prospects Available
                      </p>
                      <p
                        className="text-sm mb-6"
                        style={{ color: "var(--futuristic-text-secondary)" }}
                      >
                        No prospects found for the {season} draft class.
                      </p>
                    </div>
                  ) : filteredProspects.length === 0 ? (
                    <div
                      className="text-center py-8"
                      style={{ color: "var(--futuristic-text-secondary)" }}
                    >
                      No prospects match your current filters.
                    </div>
                  ) : (
                    filteredProspects.map((prospect) => (
                      <DraftProspectCard
                        key={prospect.id}
                        prospect={prospect}
                        scouted={scoutedProspects.get(prospect.id)}
                        isUserTurn={isUserTurn}
                        canSelect={isUserTurn && !draftComplete && !selecting}
                        onSelect={handleSelectPlayer}
                        selecting={selecting}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* War Room Controls - Right Panel */}
            <div className="lg:col-span-1 space-y-6">
              {/* Draft State Display */}
              <DraftStateDisplay
                currentRound={
                  draftState?.current_round || currentPick?.round || null
                }
                currentPickOverall={
                  draftState?.current_pick_overall ||
                  currentPick?.pick_overall ||
                  null
                }
                totalPicks={draftPicks.length}
                picksMade={
                  draftHistory.filter(
                    (p) => p.selected_player_id || p.status === "used"
                  ).length
                }
                teamOnClock={currentPick?.teams}
                isUserTurn={isUserTurn}
                draftComplete={draftComplete}
              />

              {/* Simulation Controls */}
              {!draftComplete && draftState?.status === "in_progress" && (
                <div className="glass-panel rounded-xl p-6">
                  <h3
                    className="text-xl font-bold mb-4"
                    style={{
                      color: "var(--futuristic-neon-purple)",
                      textShadow:
                        "0 0 10px rgba(168, 85, 247, 0.8), 0 0 20px rgba(168, 85, 247, 0.5)",
                    }}
                  >
                    Simulation Controls
                  </h3>
                  <div className="space-y-3">
                    <button
                      onClick={() => handleSimulate("to_next_user_pick")}
                      disabled={simulating || isUserTurn}
                      className="w-full px-4 py-3 btn-futuristic-cyan rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <FastForward className="w-5 h-5" />
                      {simulating ? "Simulating..." : "Simulate to My Pick"}
                    </button>
                    <button
                      onClick={() => handleSimulate("full_draft")}
                      disabled={simulating}
                      className="w-full px-4 py-3 btn-futuristic-purple rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Zap className="w-5 h-5" />
                      {simulating ? "Simulating..." : "Simulate Full Draft"}
                    </button>
                  </div>
                </div>
              )}

              {/* Conclude Draft Button */}
              {(draftState?.status === "in_progress" ||
                draftState?.status === "completed") && (
                <div className="glass-panel rounded-xl p-6 mb-6">
                  <h3
                    className="text-xl font-bold mb-4"
                    style={{
                      color: "var(--futuristic-neon-purple)",
                      textShadow:
                        "0 0 10px rgba(168, 85, 247, 0.8), 0 0 20px rgba(168, 85, 247, 0.5)",
                    }}
                  >
                    Draft Management
                  </h3>
                  <div className="space-y-3">
                    <button
                      onClick={async () => {
                        if (
                          !confirm(
                            "Are you sure you want to conclude the draft? This will move all undrafted prospects to free agency."
                          )
                        ) {
                          return;
                        }
                        setLoading(true);
                        setError(null);
                        try {
                          const response = await fetch("/api/draft/complete", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              season,
                              saveGameId,
                            }),
                          });
                          const data = await response.json();
                          if (!response.ok) {
                            throw new Error(
                              data.error || "Failed to conclude draft"
                            );
                          }
                          await loadDraftData();
                          alert(
                            data.message || "Draft concluded successfully!"
                          );
                        } catch (err) {
                          console.error("Error concluding draft:", err);
                          setError(
                            err instanceof Error
                              ? err.message
                              : "Failed to conclude draft"
                          );
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading}
                      className="w-full px-4 py-3 btn-futuristic-purple rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? "Concluding..." : "Conclude Draft"}
                    </button>
                    <Link
                      href={`/draft/summary?season=${season}&saveGameId=${saveGameId}`}
                      className="block w-full px-4 py-3 btn-futuristic-cyan rounded-lg font-semibold text-center"
                    >
                      View Draft Summary
                    </Link>
                  </div>
                </div>
              )}

              {/* Recent Picks */}
              <div className="glass-panel rounded-xl p-6">
                <h3
                  className="text-xl font-bold mb-4"
                  style={{
                    color: "var(--futuristic-electric-blue)",
                    textShadow:
                      "0 0 10px rgba(59, 130, 246, 0.8), 0 0 20px rgba(59, 130, 246, 0.5)",
                  }}
                >
                  Recent Picks
                </h3>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {draftHistory
                    .slice(-20)
                    .reverse()
                    .map((pick) => (
                      <div
                        key={pick.id}
                        className="glass-card rounded-lg p-3 border slide-in-right"
                        style={{ borderColor: "rgba(0, 240, 255, 0.2)" }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className="text-xs font-semibold"
                            style={{ color: "var(--futuristic-neon-cyan)" }}
                          >
                            #{pick.pick_overall}
                          </span>
                          <span
                            className="text-xs"
                            style={{
                              color: "var(--futuristic-text-secondary)",
                            }}
                          >
                            R{pick.round}.{pick.pick_in_round}
                          </span>
                        </div>
                        {pick.selected_player ? (
                          <>
                            <p
                              className="font-semibold text-sm"
                              style={{
                                color: "var(--futuristic-text-primary)",
                              }}
                            >
                              {pick.selected_player.full_name}
                            </p>
                            <p
                              className="text-xs"
                              style={{
                                color: "var(--futuristic-text-secondary)",
                              }}
                            >
                              {pick.selected_player.position} • OVR{" "}
                              {pick.selected_player.overall}
                            </p>
                          </>
                        ) : (
                          <p
                            className="text-sm"
                            style={{ color: "var(--futuristic-text-muted)" }}
                          >
                            No selection
                          </p>
                        )}
                        <p
                          className="text-xs mt-1"
                          style={{ color: "var(--futuristic-text-muted)" }}
                        >
                          {pick.teams.abbreviation}
                        </p>
                      </div>
                    ))}
                  {draftHistory.length === 0 && (
                    <div
                      className="text-center py-8 text-sm"
                      style={{ color: "var(--futuristic-text-secondary)" }}
                    >
                      No picks made yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Links */}
        <div className="mt-6 flex gap-4">
          <Link
            href="/draft/picks"
            className="px-4 py-2 glass-card rounded-lg transition-all"
            style={{ color: "var(--futuristic-text-primary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "var(--glow-cyan)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            View All Picks
          </Link>
          <Link
            href="/"
            className="px-4 py-2 glass-card rounded-lg transition-all"
            style={{ color: "var(--futuristic-text-primary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "var(--glow-purple)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
