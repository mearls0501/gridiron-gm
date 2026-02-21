"use client";

import React, { useState, useMemo } from "react";
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Star,
  ChevronDown,
  ChevronUp,
  Users,
  Target,
  Sparkles,
  Medal,
  Flame,
  ThumbsUp,
  ThumbsDown,
  BarChart3,
  Award,
  MessageSquare,
  Eye,
  Filter,
} from "lucide-react";
import {
  PickGrade,
  TeamDraftGrade,
  DraftClassGrade,
  getGradeColor,
  generateMediaReaction,
} from "@/lib/draft/draft-grades";

// Grade Badge Component
function GradeBadge({
  grade,
  size = "md",
  showLabel,
  label,
}: {
  grade: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  label?: string;
}) {
  const colors = getGradeColor(grade);

  const sizeClasses = {
    sm: "w-8 h-8 text-sm",
    md: "w-12 h-12 text-lg",
    lg: "w-16 h-16 text-2xl",
  };

  return (
    <div className="flex flex-col items-center">
      <div
        className={`${sizeClasses[size]} rounded-lg ${colors.bg} ${colors.text} ${colors.border} border-2 flex items-center justify-center font-bold`}
      >
        {grade}
      </div>
      {showLabel && label && (
        <span className="text-xs text-gray-500 mt-1">{label}</span>
      )}
    </div>
  );
}

// Score Bar Component
function ScoreBar({
  score,
  label,
  showGrade = true,
}: {
  score: number;
  label: string;
  showGrade?: boolean;
}) {
  const getBarColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 70) return "bg-blue-500";
    if (score >= 60) return "bg-amber-500";
    if (score >= 50) return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{score}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${getBarColor(score)} transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

// Media Reaction Component
function MediaReaction({ pickGrade }: { pickGrade: PickGrade }) {
  const reaction = useMemo(() => generateMediaReaction(pickGrade), [pickGrade]);

  const sentimentIcons = {
    positive: <ThumbsUp className="w-4 h-4 text-green-600" />,
    negative: <ThumbsDown className="w-4 h-4 text-red-600" />,
    neutral: <MessageSquare className="w-4 h-4 text-gray-600" />,
  };

  const sentimentBg = {
    positive: "bg-green-50 border-green-200",
    negative: "bg-red-50 border-red-200",
    neutral: "bg-gray-50 border-gray-200",
  };

  return (
    <div className={`p-3 rounded-lg border ${sentimentBg[reaction.sentiment]}`}>
      <div className="flex items-center gap-2 mb-1">
        {sentimentIcons[reaction.sentiment]}
        <span className="text-sm font-medium text-gray-700">{reaction.source}</span>
      </div>
      <p className="text-sm italic text-gray-600">"{reaction.reaction}"</p>
    </div>
  );
}

// Individual Pick Grade Card
function PickGradeCard({
  pickGrade,
  expanded = false,
  onToggle,
}: {
  pickGrade: PickGrade;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const colors = getGradeColor(pickGrade.overallGrade);

  return (
    <div className={`bg-white rounded-xl border ${colors.border} shadow-sm overflow-hidden`}>
      {/* Header */}
      <div
        onClick={onToggle}
        className={`${colors.bg} px-4 py-3 cursor-pointer hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`text-3xl font-bold ${colors.text}`}>
              {pickGrade.overallGrade}
            </div>
            <div>
              <div className="font-bold text-gray-900">
                #{pickGrade.pickNumber} - {pickGrade.prospectName}
              </div>
              <div className="text-sm text-gray-600">
                {pickGrade.position} • {pickGrade.teamName}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pickGrade.isSteal && (
              <span className="px-2 py-1 bg-green-600 text-white text-xs font-bold rounded-full flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                STEAL
              </span>
            )}
            {pickGrade.isReach && (
              <span className="px-2 py-1 bg-amber-600 text-white text-xs font-bold rounded-full flex items-center gap-1">
                <TrendingDown className="w-3 h-3" />
                REACH
              </span>
            )}
            {expanded ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </div>
        </div>
        <div className="mt-2 text-sm font-medium text-gray-700">
          {pickGrade.headline}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Score Breakdown */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <GradeBadge grade={pickGrade.valueGrade} size="sm" showLabel label="Value" />
            </div>
            <div className="text-center">
              <GradeBadge grade={pickGrade.needGrade} size="sm" showLabel label="Need" />
            </div>
            <div className="text-center">
              <GradeBadge grade={pickGrade.talentGrade} size="sm" showLabel label="Talent" />
            </div>
          </div>

          {/* Analysis */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Analysis</h4>
            <p className="text-sm text-gray-600">{pickGrade.analysis}</p>
          </div>

          {/* Upside & Concerns */}
          <div className="grid grid-cols-2 gap-4">
            {pickGrade.upside && (
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2 text-green-700 font-medium text-sm mb-1">
                  <Sparkles className="w-4 h-4" />
                  Upside
                </div>
                <p className="text-sm text-green-600">{pickGrade.upside}</p>
              </div>
            )}
            {pickGrade.concerns && pickGrade.concerns.length > 0 && (
              <div className="p-3 bg-amber-50 rounded-lg">
                <div className="flex items-center gap-2 text-amber-700 font-medium text-sm mb-1">
                  <AlertTriangle className="w-4 h-4" />
                  Concerns
                </div>
                <ul className="text-sm text-amber-600 space-y-1">
                  {pickGrade.concerns.map((concern, i) => (
                    <li key={i}>• {concern}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Comparisons */}
          {pickGrade.comparisons && pickGrade.comparisons.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Comparisons</h4>
              <div className="flex flex-wrap gap-2">
                {pickGrade.comparisons.map((comp, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                  >
                    {comp}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Media Reaction */}
          <MediaReaction pickGrade={pickGrade} />

          {/* Pick Details */}
          <div className="text-xs text-gray-400 flex items-center justify-between">
            <span>Consensus Rank: #{pickGrade.consensusRank}</span>
            <span>
              {pickGrade.pickDiff > 0
                ? `+${pickGrade.pickDiff} value`
                : `${pickGrade.pickDiff} from consensus`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Team Draft Grade Card
function TeamGradeCard({
  teamGrade,
  expanded = false,
  onToggle,
}: {
  teamGrade: TeamDraftGrade;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const colors = getGradeColor(teamGrade.overallGrade);

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden`}>
      {/* Header */}
      <div
        onClick={onToggle}
        className={`px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors ${colors.border} border-l-4`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <GradeBadge grade={teamGrade.overallGrade} size="lg" />
            <div>
              <div className="font-bold text-gray-900 text-lg">{teamGrade.teamName}</div>
              <div className="text-sm text-gray-500">{teamGrade.totalPicks} picks</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex gap-2">
              <GradeBadge grade={teamGrade.valueGrade} size="sm" showLabel label="Value" />
              <GradeBadge grade={teamGrade.needGrade} size="sm" showLabel label="Need" />
              <GradeBadge grade={teamGrade.talentGrade} size="sm" showLabel label="Talent" />
            </div>
            {expanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-4 space-y-4 border-t border-gray-100">
          {/* Summary */}
          <p className="text-gray-600">{teamGrade.summary}</p>

          {/* Strengths & Weaknesses */}
          <div className="grid grid-cols-2 gap-4">
            {teamGrade.strengths.length > 0 && (
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2 text-green-700 font-medium text-sm mb-2">
                  <ThumbsUp className="w-4 h-4" />
                  Strengths
                </div>
                <ul className="text-sm text-green-600 space-y-1">
                  {teamGrade.strengths.map((s, i) => (
                    <li key={i}>• {s}</li>
                  ))}
                </ul>
              </div>
            )}
            {teamGrade.weaknesses.length > 0 && (
              <div className="p-3 bg-red-50 rounded-lg">
                <div className="flex items-center gap-2 text-red-700 font-medium text-sm mb-2">
                  <ThumbsDown className="w-4 h-4" />
                  Weaknesses
                </div>
                <ul className="text-sm text-red-600 space-y-1">
                  {teamGrade.weaknesses.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* MVP Pick */}
          {teamGrade.mvp && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <div className="flex items-center gap-2 text-amber-700 font-medium text-sm mb-1">
                <Award className="w-4 h-4" />
                Draft MVP
              </div>
              <p className="text-sm text-amber-600">{teamGrade.mvp}</p>
            </div>
          )}

          {/* All Picks */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">All Picks</h4>
            <div className="space-y-2">
              {teamGrade.picks.map((pick) => (
                <div
                  key={pick.pickNumber}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <GradeBadge grade={pick.overallGrade} size="sm" />
                    <div>
                      <div className="font-medium text-gray-900">
                        #{pick.pickNumber} - {pick.prospectName}
                      </div>
                      <div className="text-xs text-gray-500">{pick.position}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pick.isSteal && (
                      <TrendingUp className="w-4 h-4 text-green-600" />
                    )}
                    {pick.isReach && (
                      <TrendingDown className="w-4 h-4 text-amber-600" />
                    )}
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

// Draft Class Superlatives
function DraftSuperlatives({
  classGrade,
}: {
  classGrade: DraftClassGrade;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Best Draft */}
      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
        <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
          <Trophy className="w-5 h-5" />
          Best Draft
        </div>
        <div className="text-xl font-bold text-green-800">{classGrade.bestDraft.teamName}</div>
        <div className="text-3xl font-bold text-green-600">{classGrade.bestDraft.grade}</div>
      </div>

      {/* Best Pick */}
      <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
        <div className="flex items-center gap-2 text-amber-700 font-medium mb-2">
          <Star className="w-5 h-5" />
          Best Pick
        </div>
        <div className="text-lg font-bold text-amber-800">
          #{classGrade.bestPick.pickNumber} - {classGrade.bestPick.prospectName}
        </div>
        <div className="text-sm text-amber-600">{classGrade.bestPick.teamName}</div>
        <div className="text-2xl font-bold text-amber-600 mt-1">
          {classGrade.bestPick.overallGrade}
        </div>
      </div>

      {/* Biggest Steal */}
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
        <div className="flex items-center gap-2 text-blue-700 font-medium mb-2">
          <Flame className="w-5 h-5" />
          Biggest Steal
        </div>
        <div className="text-lg font-bold text-blue-800">
          #{classGrade.biggestSteal.pickNumber} - {classGrade.biggestSteal.prospectName}
        </div>
        <div className="text-sm text-blue-600">{classGrade.biggestSteal.teamName}</div>
        <div className="text-sm text-blue-500 mt-1">
          +{classGrade.biggestSteal.pickDiff} from consensus
        </div>
      </div>
    </div>
  );
}

// Position Breakdown Chart
function PositionBreakdown({
  breakdown,
}: {
  breakdown: Record<string, { count: number; avgPick: number }>;
}) {
  const sortedPositions = Object.entries(breakdown)
    .sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-gray-600" />
        <h3 className="font-medium text-gray-900">Position Breakdown</h3>
      </div>
      <div className="space-y-2">
        {sortedPositions.slice(0, 10).map(([position, data]) => (
          <div key={position} className="flex items-center gap-3">
            <div className="w-10 text-sm font-bold text-gray-700">{position}</div>
            <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full flex items-center justify-end pr-2"
                style={{ width: `${Math.max(10, (data.count / sortedPositions[0][1].count) * 100)}%` }}
              >
                <span className="text-xs text-white font-medium">{data.count}</span>
              </div>
            </div>
            <div className="text-xs text-gray-500 w-20 text-right">
              Avg: #{data.avgPick}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Main Draft Grades Component
interface DraftGradesProps {
  mode: "live" | "summary" | "team";
  // For live mode - show single pick grades as they happen
  latestPickGrade?: PickGrade;
  // For summary mode - show full class analysis
  classGrade?: DraftClassGrade;
  // For team mode - show single team's draft
  teamGrade?: TeamDraftGrade;
  // All pick grades for filtering
  allPickGrades?: PickGrade[];
  // Callback to view team details
  onViewTeam?: (teamId: string) => void;
}

export function DraftGrades({
  mode,
  latestPickGrade,
  classGrade,
  teamGrade,
  allPickGrades = [],
  onViewTeam,
}: DraftGradesProps) {
  const [expandedPicks, setExpandedPicks] = useState<Set<number>>(new Set());
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [filterRound, setFilterRound] = useState<number | null>(null);
  const [filterPosition, setFilterPosition] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"pick" | "grade">("pick");

  const togglePick = (pickNumber: number) => {
    setExpandedPicks((prev) => {
      const next = new Set(prev);
      if (next.has(pickNumber)) {
        next.delete(pickNumber);
      } else {
        next.add(pickNumber);
      }
      return next;
    });
  };

  const toggleTeam = (teamId: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  };

  // Filter and sort picks
  const filteredPicks = useMemo(() => {
    let picks = [...allPickGrades];

    if (filterRound !== null) {
      picks = picks.filter((p) => p.round === filterRound);
    }
    if (filterPosition !== null) {
      picks = picks.filter((p) => p.position === filterPosition);
    }

    if (sortBy === "grade") {
      picks.sort((a, b) => b.overallScore - a.overallScore);
    } else {
      picks.sort((a, b) => a.pickNumber - b.pickNumber);
    }

    return picks;
  }, [allPickGrades, filterRound, filterPosition, sortBy]);

  // Get unique positions for filter
  const positions = useMemo(() => {
    return [...new Set(allPickGrades.map((p) => p.position))].sort();
  }, [allPickGrades]);

  return (
    <div className="space-y-6">
      {/* Live Mode - Single Pick */}
      {mode === "live" && latestPickGrade && (
        <div className="animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-gray-900">Latest Pick Grade</h2>
          </div>
          <PickGradeCard
            pickGrade={latestPickGrade}
            expanded={true}
          />
        </div>
      )}

      {/* Summary Mode - Full Class Analysis */}
      {mode === "summary" && classGrade && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {classGrade.draftYear} Draft Grades
              </h2>
              <p className="text-gray-500">{classGrade.totalPicks} total picks</p>
            </div>
          </div>

          {/* Superlatives */}
          <DraftSuperlatives classGrade={classGrade} />

          {/* Position Breakdown */}
          <PositionBreakdown breakdown={classGrade.positionBreakdown} />

          {/* Team Grades */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Team Grades</h3>
            <div className="space-y-3">
              {classGrade.teamGrades.map((team) => (
                <TeamGradeCard
                  key={team.teamId}
                  teamGrade={team}
                  expanded={expandedTeams.has(team.teamId)}
                  onToggle={() => toggleTeam(team.teamId)}
                />
              ))}
            </div>
          </div>

          {/* Round Analysis */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-medium text-gray-900 mb-4">Round-by-Round</h3>
            <div className="grid grid-cols-7 gap-2">
              {classGrade.roundAnalysis.map((round) => (
                <div
                  key={round.round}
                  className="text-center p-3 bg-gray-50 rounded-lg"
                >
                  <div className="text-xs text-gray-500 mb-1">Round {round.round}</div>
                  <div className="text-lg font-bold text-gray-900">{round.avgScore}</div>
                  <div className="text-xs text-gray-400">avg score</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Team Mode - Single Team's Draft */}
      {mode === "team" && teamGrade && (
        <div className="space-y-6">
          <TeamGradeCard teamGrade={teamGrade} expanded={true} />
        </div>
      )}

      {/* All Picks List (with filters) */}
      {allPickGrades.length > 0 && mode !== "live" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h3 className="text-lg font-bold text-gray-900">All Picks</h3>

            {/* Filters */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />

                {/* Round Filter */}
                <select
                  value={filterRound ?? ""}
                  onChange={(e) =>
                    setFilterRound(e.target.value ? parseInt(e.target.value) : null)
                  }
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Rounds</option>
                  {[1, 2, 3, 4, 5, 6, 7].map((r) => (
                    <option key={r} value={r}>
                      Round {r}
                    </option>
                  ))}
                </select>

                {/* Position Filter */}
                <select
                  value={filterPosition ?? ""}
                  onChange={(e) => setFilterPosition(e.target.value || null)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Positions</option>
                  {positions.map((pos) => (
                    <option key={pos} value={pos}>
                      {pos}
                    </option>
                  ))}
                </select>

                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "pick" | "grade")}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="pick">By Pick</option>
                  <option value="grade">By Grade</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {filteredPicks.map((pick) => (
              <PickGradeCard
                key={pick.pickNumber}
                pickGrade={pick}
                expanded={expandedPicks.has(pick.pickNumber)}
                onToggle={() => togglePick(pick.pickNumber)}
              />
            ))}
          </div>

          {filteredPicks.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No picks match the selected filters
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Export individual components for flexibility
export { GradeBadge, ScoreBar, PickGradeCard, TeamGradeCard, MediaReaction };
