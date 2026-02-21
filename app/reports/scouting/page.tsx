"use client";

import { useState, useEffect } from "react";
import { useGameStore } from "@/lib/store/game-store";
import { CheckCircle, AlertCircle, TrendingUp, EyeOff, Target, FileText } from "lucide-react";

interface ScoutingReport {
  id: string;
  prospect_id: string;
  team_id: string;
  save_game_id?: string | null;
  season?: number | null;
  total_points_invested: number;
  scouting_progress: number;
  overall_min?: number;
  overall_max?: number;
  overall_estimate?: number;
  potential_min?: number;
  potential_max?: number;
  potential_estimate?: number;
  accuracy_percentage: number;
  confidence_level: "high" | "medium" | "low";
  traits_scouted: Record<string, { value: number; confidence: string }>;
  character_assessment?: Record<string, string | number | boolean>;
  injury_risk?: "low" | "medium" | "high";
  scheme_fit?: string;
  scout_notes?: string;
  methods_used?: string[];
  scouted_at: string;
  prospect?: {
    id: string;
    full_name: string;
    position: string;
    college: string | null;
    season: number;
    save_game_id?: string | null;
    overall: number;
    potential: number;
  };
  scout?: {
    name: string;
    role: string;
  };
}

export default function ScoutingReportsPage() {
  const { selectedTeamId, currentSeason, saveGameId } = useGameStore();
  const [reports, setReports] = useState<ScoutingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && selectedTeamId) {
      loadReports();
    }
  }, [mounted, selectedTeamId, currentSeason, saveGameId]);

  async function loadReports() {
    if (!selectedTeamId) {
      setError("No team selected");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const reportsUrl = saveGameId
        ? `/api/scouting/reports?teamId=${selectedTeamId}&saveGameId=${saveGameId}`
        : `/api/scouting/reports?teamId=${selectedTeamId}`;

      console.log("Fetching reports from:", reportsUrl);

      const res = await fetch(reportsUrl);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch reports");
      }

      console.log("Reports API response:", {
        success: data.success,
        reportsCount: data.reports?.length || 0,
        sampleReport: data.reports?.[0],
        allReports: data.reports?.map((r: any) => ({
          id: r.id,
          prospect_id: r.prospect_id,
          report_save_game_id: r.save_game_id,
          prospect_save_game_id: r.prospect?.save_game_id,
          prospect_name: r.prospect?.full_name,
        })),
      });

      setReports(data.reports || []);
    } catch (err) {
      console.error("Error loading reports:", err);
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }

  function getConfidenceBadge(confidence: string) {
    const badges = {
      high: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-100" },
      medium: { icon: TrendingUp, color: "text-yellow-600", bg: "bg-yellow-100" },
      low: { icon: AlertCircle, color: "text-orange-600", bg: "bg-orange-100" },
    };
    const badge = badges[confidence as keyof typeof badges] || badges.medium;
    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${badge.bg} ${badge.color}`}>
        <Icon className="w-3 h-3" />
        {confidence.toUpperCase()}
      </span>
    );
  }

  function getProgressColor(progress: number) {
    if (progress >= 70) return "bg-green-500";
    if (progress >= 40) return "bg-yellow-500";
    return "bg-orange-500";
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <p className="text-slate-500">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedTeamId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <p className="text-slate-500">Please select a team to view scouting reports.</p>
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
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black text-white tracking-tight mb-2">
                  Scouting Reports
                </h1>
                <p className="text-slate-300 text-sm">
                  {currentSeason} Draft Class • {reports.length} Report{reports.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={loadReports}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Target className="w-4 h-4" />
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>
          </div>
        </div>

        {/* Debug Info */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="text-sm text-yellow-800">
            <strong>Debug Info:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Team ID: {selectedTeamId}</li>
              <li>Save Game ID: {saveGameId || "None"}</li>
              <li>Current Season: {currentSeason}</li>
              <li>Reports Found: {reports.length}</li>
            </ul>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 font-semibold">Error: {error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <p className="text-slate-500">Loading scouting reports...</p>
          </div>
        )}

        {/* Reports List */}
        {!loading && !error && (
          <>
            {reports.length === 0 ? (
              <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                <EyeOff className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 text-lg font-semibold mb-2">No Scouting Reports Found</p>
                <p className="text-slate-400 text-sm">
                  Start scouting prospects to generate reports.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden"
                  >
                    <div className="p-6">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-xl font-bold text-slate-900">
                              {report.prospect?.full_name || "Unknown Prospect"}
                            </h3>
                            {getConfidenceBadge(report.confidence_level)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-600">
                            <span>
                              <strong>Position:</strong> {report.prospect?.position || "N/A"}
                            </span>
                            <span>
                              <strong>College:</strong> {report.prospect?.college || "N/A"}
                            </span>
                            {report.prospect?.season && (
                              <span>
                                <strong>Season:</strong> {report.prospect.season}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right text-sm text-slate-500">
                          <div>Scouted: {new Date(report.scouted_at).toLocaleDateString()}</div>
                          {report.save_game_id && (
                            <div className="text-xs mt-1">Save Game: {report.save_game_id.slice(0, 8)}...</div>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-slate-700">
                            Scouting Progress: {report.scouting_progress}%
                          </span>
                          <span className="text-sm text-slate-500">
                            {report.total_points_invested} points invested
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                          <div
                            className={`h-3 rounded-full transition-all ${getProgressColor(report.scouting_progress)}`}
                            style={{ width: `${report.scouting_progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Ratings */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="bg-slate-50 rounded-lg p-3">
                          <div className="text-xs text-slate-600 mb-1">Overall Estimate</div>
                          <div className="text-2xl font-bold text-slate-900">
                            {report.overall_estimate || "??"}
                          </div>
                          {report.overall_min && report.overall_max && (
                            <div className="text-xs text-slate-500 mt-1">
                              Range: {report.overall_min}-{report.overall_max}
                            </div>
                          )}
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <div className="text-xs text-slate-600 mb-1">Potential Estimate</div>
                          <div className="text-2xl font-bold text-slate-900">
                            {report.potential_estimate || "??"}
                          </div>
                          {report.potential_min && report.potential_max && (
                            <div className="text-xs text-slate-500 mt-1">
                              Range: {report.potential_min}-{report.potential_max}
                            </div>
                          )}
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <div className="text-xs text-slate-600 mb-1">Accuracy</div>
                          <div className="text-2xl font-bold text-slate-900">
                            {report.accuracy_percentage}%
                          </div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <div className="text-xs text-slate-600 mb-1">True Overall</div>
                          <div className="text-2xl font-bold text-slate-900">
                            {report.prospect?.overall || "??"}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            (Hidden from user)
                          </div>
                        </div>
                      </div>

                      {/* Additional Info */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        {report.injury_risk && (
                          <div>
                            <strong>Injury Risk:</strong>{" "}
                            <span className="capitalize">{report.injury_risk}</span>
                          </div>
                        )}
                        {report.scheme_fit && (
                          <div>
                            <strong>Scheme Fit:</strong> {report.scheme_fit}
                          </div>
                        )}
                        {report.methods_used && report.methods_used.length > 0 && (
                          <div>
                            <strong>Methods Used:</strong> {report.methods_used.join(", ")}
                          </div>
                        )}
                        {report.scout && (
                          <div>
                            <strong>Scouted By:</strong> {report.scout.name} ({report.scout.role})
                          </div>
                        )}
                      </div>

                      {/* Debug Info for this report */}
                      <details className="mt-4 pt-4 border-t border-slate-200">
                        <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
                          Debug Info
                        </summary>
                        <pre className="mt-2 text-xs bg-slate-100 p-3 rounded overflow-auto">
                          {JSON.stringify(
                            {
                              report_id: report.id,
                              prospect_id: report.prospect_id,
                              prospect_db_id: report.prospect?.id,
                              save_game_id: report.save_game_id,
                              prospect_save_game_id: report.prospect?.save_game_id,
                              season: report.season,
                              prospect_season: report.prospect?.season,
                            },
                            null,
                            2
                          )}
                        </pre>
                      </details>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

