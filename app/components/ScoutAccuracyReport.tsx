"use client";

import React, { useState, useMemo } from "react";
import {
  Award,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Users,
  BarChart3,
  Star,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Flame,
  ThumbsUp,
  ThumbsDown,
  Eye,
  Medal,
} from "lucide-react";
import {
  ScoutAccuracyStats,
  ScoutPrediction,
  getAccuracyRating,
} from "@/lib/scouting/scout-accuracy";

// Helper to format position groups
const POSITION_GROUPS = {
  QB: "Quarterbacks",
  RB: "Running Backs",
  WR: "Wide Receivers",
  TE: "Tight Ends",
  OT: "Offensive Tackles",
  OG: "Guards",
  C: "Centers",
  DE: "Defensive Ends",
  DT: "Defensive Tackles",
  LB: "Linebackers",
  CB: "Cornerbacks",
  S: "Safeties",
  K: "Kickers",
  P: "Punters",
};

// Accuracy Meter Component
function AccuracyMeter({
  value,
  label,
  size = "md",
}: {
  value: number;
  label: string;
  size?: "sm" | "md" | "lg";
}) {
  const rating = getAccuracyRating(value);

  const sizeClasses = {
    sm: { container: "w-24", text: "text-lg", label: "text-xs" },
    md: { container: "w-32", text: "text-2xl", label: "text-sm" },
    lg: { container: "w-40", text: "text-3xl", label: "text-base" },
  };

  const sizes = sizeClasses[size];

  return (
    <div className={`${sizes.container} text-center`}>
      <div className="relative">
        {/* Background circle */}
        <svg className="w-full" viewBox="0 0 100 50">
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Filled portion */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke={value >= 70 ? "#10b981" : value >= 50 ? "#f59e0b" : "#ef4444"}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(value / 100) * 126} 126`}
          />
        </svg>
        {/* Value */}
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <span className={`${sizes.text} font-bold`}>{value}</span>
        </div>
      </div>
      <div className={`${sizes.label} text-gray-500 mt-1`}>{label}</div>
      <div className={`text-xs px-2 py-0.5 rounded-full ${rating.color} mt-1 inline-block`}>
        {rating.label}
      </div>
    </div>
  );
}

// Trend Indicator
function TrendIndicator({ trend }: { trend: "improving" | "declining" | "stable" }) {
  if (trend === "improving") {
    return (
      <div className="flex items-center gap-1 text-green-600 text-sm">
        <TrendingUp className="w-4 h-4" />
        <span>Improving</span>
      </div>
    );
  }
  if (trend === "declining") {
    return (
      <div className="flex items-center gap-1 text-red-600 text-sm">
        <TrendingDown className="w-4 h-4" />
        <span>Declining</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-gray-500 text-sm">
      <Minus className="w-4 h-4" />
      <span>Stable</span>
    </div>
  );
}

// Prediction Card
function PredictionCard({
  prediction,
  type,
}: {
  prediction: ScoutPrediction;
  type: "best" | "worst" | "hit" | "miss";
}) {
  const icons = {
    best: <Star className="w-5 h-5 text-amber-500" />,
    worst: <AlertTriangle className="w-5 h-5 text-red-500" />,
    hit: <Sparkles className="w-5 h-5 text-emerald-500" />,
    miss: <Flame className="w-5 h-5 text-orange-500" />,
  };

  const labels = {
    best: "Best Prediction",
    worst: "Worst Prediction",
    hit: "Called the Breakout",
    miss: "Missed the Mark",
  };

  const colors = {
    best: "bg-amber-50 border-amber-200",
    worst: "bg-red-50 border-red-200",
    hit: "bg-emerald-50 border-emerald-200",
    miss: "bg-orange-50 border-orange-200",
  };

  return (
    <div className={`p-3 rounded-lg border ${colors[type]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icons[type]}
        <span className="text-sm font-medium text-gray-700">{labels[type]}</span>
      </div>
      <div className="font-medium text-gray-900">{prediction.prospectName}</div>
      <div className="text-sm text-gray-500">
        {prediction.position} - Round {prediction.actualDraftRound}
      </div>
      <div className="mt-2 text-sm">
        <span className="text-gray-500">Predicted: </span>
        <span className="font-medium">
          {prediction.predictedOverallLow}-{prediction.predictedOverallHigh}
        </span>
        <span className="text-gray-400 mx-2">|</span>
        <span className="text-gray-500">Actual: </span>
        <span className="font-medium">{prediction.actualOverall}</span>
      </div>
      {prediction.overallAccuracy !== undefined && (
        <div className="mt-1">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              prediction.overallAccuracy >= 80
                ? "bg-green-100 text-green-700"
                : prediction.overallAccuracy >= 60
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700"
            }`}
          >
            {prediction.overallAccuracy}% accurate
          </span>
        </div>
      )}
    </div>
  );
}

// Individual Scout Card
function ScoutCard({
  stats,
  expanded,
  onToggle,
  rank,
}: {
  stats: ScoutAccuracyStats;
  expanded: boolean;
  onToggle: () => void;
  rank: number;
}) {
  const rating = getAccuracyRating(stats.compositeAccuracy);

  const archetypeLabels: Record<string, string> = {
    evaluator: "Evaluator",
    tape_grinder: "Tape Grinder",
    character_coach: "Character Coach",
    athletic_analyst: "Athletic Analyst",
  };

  return (
    <div className="border rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <div
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Rank Badge */}
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                rank === 1
                  ? "bg-amber-100 text-amber-700"
                  : rank === 2
                    ? "bg-gray-200 text-gray-700"
                    : rank === 3
                      ? "bg-orange-100 text-orange-700"
                      : "bg-gray-100 text-gray-500"
              }`}
            >
              #{rank}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">{stats.scoutName}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${rating.color}`}>
                  {rating.label}
                </span>
              </div>
              <div className="text-sm text-gray-500">
                {archetypeLabels[stats.archetype] || stats.archetype}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Key Stats */}
            <div className="text-center hidden md:block">
              <div className="text-2xl font-bold">{stats.compositeAccuracy}</div>
              <div className="text-xs text-gray-500">Accuracy</div>
            </div>

            <div className="text-center hidden md:block">
              <div className="text-lg font-semibold text-gray-700">
                {stats.evaluatedPredictions}/{stats.totalPredictions}
              </div>
              <div className="text-xs text-gray-500">Evaluated</div>
            </div>

            <TrendIndicator trend={stats.recentAccuracyTrend} />

            {expanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t p-4 bg-gray-50">
          {/* Accuracy Meters */}
          <div className="flex flex-wrap justify-around gap-4 mb-6">
            <AccuracyMeter value={stats.overallAccuracyAvg} label="Overall" size="sm" />
            <AccuracyMeter value={stats.potentialAccuracyAvg} label="Potential" size="sm" />
            <AccuracyMeter value={stats.roundAccuracyAvg} label="Round" size="sm" />
            <AccuracyMeter value={stats.bustPredictionAccuracyAvg} label="Bust Calls" size="sm" />
            <AccuracyMeter value={stats.breakoutPredictionAccuracyAvg} label="Breakouts" size="sm" />
          </div>

          {/* Notable Predictions */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {stats.bestPrediction && (
              <PredictionCard prediction={stats.bestPrediction} type="best" />
            )}
            {stats.worstPrediction && (
              <PredictionCard prediction={stats.worstPrediction} type="worst" />
            )}
            {stats.biggestHit && (
              <PredictionCard prediction={stats.biggestHit} type="hit" />
            )}
            {stats.biggestMiss && (
              <PredictionCard prediction={stats.biggestMiss} type="miss" />
            )}
          </div>

          {/* Accuracy by Position */}
          {Object.keys(stats.accuracyByPosition).length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Accuracy by Position</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.accuracyByPosition)
                  .sort((a, b) => b[1] - a[1])
                  .map(([pos, acc]) => (
                    <div
                      key={pos}
                      className={`px-3 py-1 rounded-full text-sm ${
                        acc >= 75
                          ? "bg-green-100 text-green-700"
                          : acc >= 60
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {pos}: {acc}%
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Accuracy by Round */}
          {Object.keys(stats.accuracyByRound).length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Accuracy by Draft Round</h4>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map((round) => {
                  const acc = stats.accuracyByRound[round];
                  return (
                    <div
                      key={round}
                      className="flex-1 text-center p-2 rounded-lg bg-white border"
                    >
                      <div className="text-xs text-gray-500">Rd {round}</div>
                      <div
                        className={`font-semibold ${
                          acc === undefined
                            ? "text-gray-300"
                            : acc >= 75
                              ? "text-green-600"
                              : acc >= 60
                                ? "text-amber-600"
                                : "text-red-600"
                        }`}
                      >
                        {acc !== undefined ? `${acc}%` : "-"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Main Component
interface ScoutAccuracyReportProps {
  scoutStats: ScoutAccuracyStats[];
  draftYear?: number;
  onViewScout?: (scoutId: string) => void;
}

export function ScoutAccuracyReport({
  scoutStats,
  draftYear,
  onViewScout,
}: ScoutAccuracyReportProps) {
  const [expandedScout, setExpandedScout] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"accuracy" | "predictions" | "trend">("accuracy");

  // Sort scouts
  const sortedStats = useMemo(() => {
    return [...scoutStats].sort((a, b) => {
      switch (sortBy) {
        case "predictions":
          return b.evaluatedPredictions - a.evaluatedPredictions;
        case "trend":
          const trendOrder = { improving: 0, stable: 1, declining: 2 };
          return trendOrder[a.recentAccuracyTrend] - trendOrder[b.recentAccuracyTrend];
        case "accuracy":
        default:
          return b.compositeAccuracy - a.compositeAccuracy;
      }
    });
  }, [scoutStats, sortBy]);

  // Calculate team-wide stats
  const teamStats = useMemo(() => {
    const totalPredictions = scoutStats.reduce((sum, s) => sum + s.totalPredictions, 0);
    const evaluatedPredictions = scoutStats.reduce((sum, s) => sum + s.evaluatedPredictions, 0);
    const avgAccuracy =
      scoutStats.length > 0
        ? Math.round(
            scoutStats.reduce((sum, s) => sum + s.compositeAccuracy, 0) / scoutStats.length
          )
        : 0;
    const improvingCount = scoutStats.filter((s) => s.recentAccuracyTrend === "improving").length;
    const decliningCount = scoutStats.filter((s) => s.recentAccuracyTrend === "declining").length;

    return {
      totalPredictions,
      evaluatedPredictions,
      avgAccuracy,
      improvingCount,
      decliningCount,
    };
  }, [scoutStats]);

  return (
    <div className="bg-white rounded-xl shadow-lg border">
      {/* Header */}
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-xl">
              <Award className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Scout Accuracy Report</h2>
              <p className="text-sm text-gray-500">
                {draftYear ? `${draftYear} Draft Class Evaluation` : "All-Time Performance"}
              </p>
            </div>
          </div>
        </div>

        {/* Team Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <div className="text-2xl font-bold text-gray-900">{teamStats.avgAccuracy}%</div>
            <div className="text-xs text-gray-500">Team Average</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <div className="text-2xl font-bold text-gray-900">{scoutStats.length}</div>
            <div className="text-xs text-gray-500">Scouts</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <div className="text-2xl font-bold text-gray-900">{teamStats.evaluatedPredictions}</div>
            <div className="text-xs text-gray-500">Evaluated</div>
          </div>
          <div className="p-3 bg-green-50 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-600">{teamStats.improvingCount}</div>
            <div className="text-xs text-gray-500">Improving</div>
          </div>
          <div className="p-3 bg-red-50 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-600">{teamStats.decliningCount}</div>
            <div className="text-xs text-gray-500">Declining</div>
          </div>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Sort by:</span>
          {(["accuracy", "predictions", "trend"] as const).map((option) => (
            <button
              key={option}
              onClick={() => setSortBy(option)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                sortBy === option
                  ? "bg-purple-600 text-white"
                  : "bg-white border text-gray-700 hover:bg-gray-100"
              }`}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Scout List */}
      <div className="p-4 space-y-3">
        {sortedStats.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-lg font-medium">No accuracy data available</p>
            <p className="text-sm">Complete a draft season to see scout performance</p>
          </div>
        ) : (
          sortedStats.map((stats, index) => (
            <ScoutCard
              key={stats.scoutId}
              stats={stats}
              rank={index + 1}
              expanded={expandedScout === stats.scoutId}
              onToggle={() =>
                setExpandedScout(expandedScout === stats.scoutId ? null : stats.scoutId)
              }
            />
          ))
        )}
      </div>

      {/* Footer */}
      {sortedStats.length > 0 && (
        <div className="p-4 border-t bg-gray-50">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div>
              Accuracy calculated from {teamStats.evaluatedPredictions} scouting reports
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                75%+ = Good
              </span>
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                60-74% = Average
              </span>
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                &lt;60% = Poor
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export type { ScoutAccuracyStats, ScoutPrediction };
