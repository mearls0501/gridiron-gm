"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import { StageProgress } from "@/lib/progression/types";
import {
  Trophy,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Loader2,
  Calendar,
  Users,
  DollarSign,
  FileText,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";

interface SeasonData {
  year: number;
  phase: string;
  current_week: number;
  champion_team_id: string | null;
  champion?: {
    name: string;
    abbreviation: string;
  };
}

export default function OffseasonPage() {
  const {
    saveGameId,
    currentSeason,
    currentWeek,
    selectedTeamId,
    settings,
    setCurrentWeek,
    setCurrentSeason,
    setSeasonPhase,
  } = useGameStore();

  const [season, setSeason] = useState<SeasonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<StageProgress | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadOffseasonData = useCallback(async () => {
    if (!saveGameId) return;

    try {
      setLoading(true);

      // Get active season
      let seasonQuery = supabase
        .from("seasons")
        .select("*")
        .eq("is_active", true);

      if (saveGameId) {
        seasonQuery = seasonQuery.eq("save_game_id", saveGameId);
      } else {
        seasonQuery = seasonQuery.is("save_game_id", null);
      }

      const { data: seasonData } = await seasonQuery.maybeSingle();

      if (seasonData) {
        // Check for champion
        let champion = null;
        if (seasonData.champion_team_id) {
          const { data: champData } = await supabase
            .from("teams")
            .select("name, abbreviation")
            .eq("id", seasonData.champion_team_id)
            .single();
          champion = champData;
        }

        setSeason({
          year: seasonData.year,
          phase: seasonData.phase,
          current_week: seasonData.current_week,
          champion_team_id: seasonData.champion_team_id,
          champion: champion || undefined,
        });

        // Update game store
        setSeasonPhase(seasonData.phase);
        setCurrentWeek(seasonData.current_week);
        setCurrentSeason(seasonData.year);

        // Get progress for current week
        if (selectedTeamId) {
          try {
            const response = await fetch("/api/progression/status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                teamId: selectedTeamId,
                saveGameId,
                season: seasonData.year,
                week: seasonData.current_week,
                phase: "offseason",
                settings,
              }),
            });

            const data = await response.json();
            if (data.progress) {
              setProgress(data.progress);
            } else {
              // Default progress if none returned
              setProgress({
                stage: "offseason",
                week: seasonData.current_week,
                completionPercentage: 100,
                items: [],
                canAdvance: true,
              });
            }
          } catch (err) {
            console.error("Error loading progress:", err);
            setProgress({
              stage: "offseason",
              week: seasonData.current_week,
              completionPercentage: 100,
              items: [],
              canAdvance: true,
            });
          }
        } else {
          setProgress({
            stage: "offseason",
            week: seasonData.current_week,
            completionPercentage: 100,
            items: [],
            canAdvance: true,
          });
        }
      }
    } catch (err) {
      console.error("Error loading offseason data:", err);
    } finally {
      setLoading(false);
    }
  }, [
    saveGameId,
    selectedTeamId,
    settings,
    setSeasonPhase,
    setCurrentWeek,
    setCurrentSeason,
  ]);

  useEffect(() => {
    if (mounted) {
      loadOffseasonData();
    }
  }, [mounted, loadOffseasonData]);

  // Refresh when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadOffseasonData();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [loadOffseasonData]);

  // Refresh when week changes in store
  useEffect(() => {
    if (mounted && currentWeek) {
      loadOffseasonData();
    }
  }, [saveGameId, currentWeek, mounted]);

  const handleAdvance = async () => {
    if (!saveGameId || !season) {
      alert("Missing save game or season data");
      return;
    }

    if (progress?.blockingReason) {
      alert(`Cannot advance: ${progress.blockingReason}`);
      return;
    }

    setAdvancing(true);
    try {
      const isFinalWeek = season.current_week >= 25;
      const advanceType = isFinalWeek ? "preseason" : "next_week";

      console.log("Advancing:", {
        season: season.year,
        currentWeek: season.current_week,
        advanceType,
        saveGameId,
      });

      if (isFinalWeek) {
        if (
          !confirm(
            `Are you sure you want to start the ${season.year + 1} season? This cannot be undone.`
          )
        ) {
          setAdvancing(false);
          return;
        }
      }

      const response = await fetch("/api/simulate-advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season: season.year,
          currentWeek: season.current_week,
          advanceType,
          saveGameId,
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Handle stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let done = false;
      let hasCompleted = false;
      let buffer = "";

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === "error") {
                  throw new Error(data.error || "Unknown error");
                }

                if (data.type === "complete") {
                  hasCompleted = true;
                  if (isFinalWeek) {
                    setCurrentWeek(0);
                    setCurrentSeason(season.year + 1);
                    setSeasonPhase("preseason");
                    window.location.href = "/preseason";
                  } else {
                    setCurrentWeek(data.finalWeek || season.current_week + 1);
                    window.location.reload();
                  }
                  return;
                }
              } catch (parseError) {
                console.error("Error parsing stream data:", parseError);
              }
            }
          }
        }
      }

      if (!hasCompleted) {
        console.warn("Stream ended without completion, reloading anyway");
        window.location.reload();
      }
    } catch (error) {
      console.error("Error advancing:", error);
      alert(
        `Failed to advance: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setAdvancing(false);
    }
  };

  const getWeekTitle = (week: number): string => {
    switch (week) {
      case 23:
        return "Resign Phase";
      case 24:
        return "Free Agency";
      case 25:
        return "NFL Draft";
      default:
        return "Offseason";
    }
  };

  const getWeekDescription = (week: number): string => {
    switch (week) {
      case 23:
        return "Review expiring contracts and resign key players before they hit the open market.";
      case 24:
        return "Compete with CPU teams in a 4-stage bidding process to sign the best free agents.";
      case 25:
        return "Select the next generation of stars in the NFL Draft.";
      default:
        return "Prepare for the upcoming season.";
    }
  };

  const getWeekIcon = (week: number) => {
    switch (week) {
      case 23:
        return <DollarSign className="w-6 h-6" />;
      case 24:
        return <Users className="w-6 h-6" />;
      case 25:
        return <FileText className="w-6 h-6" />;
      default:
        return <Calendar className="w-6 h-6" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!season) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            No Active Season
          </h2>
          <p className="text-gray-600">
            No active season found. Please start a new season.
          </p>
        </div>
      </div>
    );
  }

  // Ensure we're in offseason weeks
  if (season.current_week < 23 || season.current_week > 25) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Not in Offseason
          </h2>
          <p className="text-gray-600">
            Current week is {season.current_week}. Offseason is weeks 23-25.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Champion Header */}
        {season.champion && (
          <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-200 rounded-xl p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-yellow-100 p-2 rounded-full">
                <Trophy className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-yellow-800 font-medium uppercase tracking-wider">
                  Super Bowl Champion
                </p>
                <h3 className="text-xl font-black text-gray-900">
                  {season.champion.name}
                </h3>
              </div>
            </div>
            <div className="text-right">
              <span className="text-3xl font-bold text-yellow-600/20">
                {season.year}
              </span>
            </div>
          </div>
        )}

        {/* Main Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-8 py-8">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-blue-300 mb-1 font-medium">
                  <Calendar className="w-4 h-4" />
                  <span>Week {season.current_week} of 25</span>
                </div>
                <h1 className="text-4xl font-black text-white tracking-tight mb-2">
                  {getWeekTitle(season.current_week)}
                </h1>
                <p className="text-slate-300 text-lg max-w-2xl">
                  {getWeekDescription(season.current_week)}
                </p>
              </div>
              <div className="hidden lg:flex items-center gap-2">
                {[23, 24, 25].map((w) => (
                  <div
                    key={w}
                    className={`w-3 h-3 rounded-full transition-all ${
                      season.current_week === w
                        ? "bg-blue-500 ring-4 ring-blue-500/30"
                        : season.current_week > w
                          ? "bg-blue-500/50"
                          : "bg-slate-700"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Checklist */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Tasks for this Week</h2>
            <button
              onClick={() => loadOffseasonData()}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              title="Refresh data"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>

          <div className="p-6">
            {progress && progress.items.length > 0 ? (
              <div className="space-y-3">
                {progress.items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-start gap-4 p-4 rounded-lg border ${
                      item.status === "completed"
                        ? "bg-green-50 border-green-200"
                        : item.isBlocking
                          ? "bg-red-50 border-red-200"
                          : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {item.status === "completed" ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : item.isBlocking ? (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="font-semibold text-gray-900">
                          {item.label}
                        </h3>
                        {item.isRequired && (
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                            Required
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {item.description}
                      </p>
                      {item.actionUrl && (
                        <Link
                          href={item.actionUrl}
                          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium mt-2"
                        >
                          {item.actionLabel || "View"}
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No tasks for this week.</p>
              </div>
            )}

            {/* Progress Bar */}
            {progress && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Progress
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {progress.completionPercentage}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress.completionPercentage}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Advance Button */}
          <div className="p-4 bg-slate-50 border-t border-slate-100">
            {progress && !progress.canAdvance && progress.blockingReason && (
              <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                {progress.blockingReason}
              </div>
            )}
            <button
              onClick={handleAdvance}
              disabled={
                advancing ||
                (progress !== null &&
                  progress !== undefined &&
                  !progress.canAdvance)
              }
              className={`w-full py-3 px-4 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-all ${
                progress === null ||
                progress === undefined ||
                progress.canAdvance
                  ? "bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg"
                  : "bg-slate-300 cursor-not-allowed text-slate-500"
              }`}
            >
              {advancing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {season.current_week >= 25
                    ? "Start New Season"
                    : "Advance Week"}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

