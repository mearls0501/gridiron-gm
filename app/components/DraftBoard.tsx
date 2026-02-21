"use client";

import React, { useState, useMemo } from "react";
import {
  Grid,
  List,
  Filter,
  Search,
  Star,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Eye,
  Target,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Zap,
} from "lucide-react";
import {
  DraftPick,
  DraftProspect,
  checkProspectFalling,
  checkReach,
  getPickValue,
} from "@/lib/draft/draft-utils";

// Position colors
const POSITION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  QB: { bg: "bg-red-100", text: "text-red-700", border: "border-red-300" },
  RB: { bg: "bg-green-100", text: "text-green-700", border: "border-green-300" },
  WR: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-300" },
  TE: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-300" },
  OT: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
  OG: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
  C: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
  DE: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
  DT: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
  LB: { bg: "bg-cyan-100", text: "text-cyan-700", border: "border-cyan-300" },
  CB: { bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-300" },
  S: { bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-300" },
  K: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" },
  P: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" },
};

// Get position colors with fallback
function getPositionColors(position: string) {
  return POSITION_COLORS[position] || { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" };
}

// Team logos/badges (simplified - would normally be actual logos)
interface Team {
  id: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
}

// Pick Card Component
function PickCard({
  pick,
  prospect,
  team,
  isYourPick,
  isCurrentPick,
  yourBoardRank,
  onViewProspect,
}: {
  pick: DraftPick;
  prospect?: DraftProspect;
  team?: Team;
  isYourPick: boolean;
  isCurrentPick: boolean;
  yourBoardRank?: number;
  onViewProspect?: (prospectId: string) => void;
}) {
  const isPicked = !!prospect;
  const posColors = prospect ? getPositionColors(prospect.position) : null;

  // Check for value/reach
  const { isReach, reachDistance } = prospect ? checkReach(prospect, pick.pickNumber) : { isReach: false, reachDistance: 0 };
  const { isFalling, fallDistance } = prospect ? checkProspectFalling(prospect, pick.pickNumber) : { isFalling: false, fallDistance: 0 };

  // Calculate if this was a value pick for the team
  const isValuePick = isFalling && fallDistance >= 15;

  return (
    <div
      className={`relative rounded-lg border-2 transition-all ${
        isCurrentPick
          ? "border-amber-400 bg-amber-50 ring-2 ring-amber-300"
          : isPicked
            ? `${posColors?.border || "border-gray-200"} ${posColors?.bg || "bg-white"}`
            : isYourPick
              ? "border-blue-400 bg-blue-50"
              : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      {/* Pick Number Badge */}
      <div
        className={`absolute -top-2 -left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
          isYourPick ? "bg-blue-600 text-white" : "bg-gray-700 text-white"
        }`}
      >
        {pick.pickNumber}
      </div>

      {/* Trade Indicator */}
      {pick.isTraded && (
        <div className="absolute -top-2 -right-2 px-1.5 py-0.5 bg-amber-500 text-white text-xs rounded-full font-medium">
          T
        </div>
      )}

      <div className="p-3 pt-4">
        {isPicked && prospect ? (
          <>
            {/* Prospect Info */}
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-gray-900 text-sm leading-tight">
                  {prospect.name}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs font-medium ${posColors?.bg} ${posColors?.text}`}
                  >
                    {prospect.position}
                  </span>
                </div>
              </div>

              {/* Indicators */}
              <div className="flex flex-col items-end gap-1">
                {isReach && (
                  <span className="flex items-center gap-0.5 text-xs text-orange-600" title={`Reach: ${reachDistance} picks`}>
                    <TrendingUp className="w-3 h-3" />
                  </span>
                )}
                {isValuePick && (
                  <span className="flex items-center gap-0.5 text-xs text-green-600" title={`Value: Fell ${fallDistance} picks`}>
                    <TrendingDown className="w-3 h-3" />
                  </span>
                )}
              </div>
            </div>

            {/* College */}
            <div className="text-xs text-gray-500 mt-1 truncate">{prospect.college}</div>

            {/* Your Board vs Consensus */}
            {yourBoardRank && (
              <div className="mt-2 pt-2 border-t border-gray-200 text-xs">
                <span className="text-gray-500">Your Board:</span>
                <span className={`ml-1 font-medium ${yourBoardRank < prospect.consensusRank ? "text-green-600" : "text-red-600"}`}>
                  #{yourBoardRank}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Empty Pick */}
            <div className="text-sm font-medium text-gray-600 truncate">
              {team?.name || "Unknown Team"}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {isCurrentPick ? "On the clock..." : "Pending"}
            </div>
          </>
        )}
      </div>

      {/* View Button */}
      {isPicked && onViewProspect && (
        <button
          onClick={() => onViewProspect(prospect.id)}
          className="absolute bottom-1 right-1 p-1 hover:bg-white/50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Eye className="w-3 h-3 text-gray-400" />
        </button>
      )}
    </div>
  );
}

// Prospect List Row
function ProspectListRow({
  prospect,
  rank,
  isTaken,
  takenAt,
  isTargeted,
  onSelect,
  onViewDetails,
}: {
  prospect: DraftProspect;
  rank: number;
  isTaken: boolean;
  takenAt?: number;
  isTargeted: boolean;
  onSelect?: () => void;
  onViewDetails?: () => void;
}) {
  const posColors = getPositionColors(prospect.position);

  return (
    <div
      className={`flex items-center gap-3 p-3 border-b last:border-b-0 transition-colors ${
        isTaken
          ? "bg-gray-50 opacity-60"
          : isTargeted
            ? "bg-blue-50 hover:bg-blue-100"
            : "hover:bg-gray-50"
      }`}
    >
      {/* Rank */}
      <div className="w-10 text-center font-bold text-gray-400">#{rank}</div>

      {/* Position */}
      <div className={`px-2 py-1 rounded text-xs font-medium ${posColors.bg} ${posColors.text}`}>
        {prospect.position}
      </div>

      {/* Name & College */}
      <div className="flex-1 min-w-0">
        <div className={`font-medium ${isTaken ? "line-through text-gray-500" : "text-gray-900"}`}>
          {prospect.name}
        </div>
        <div className="text-sm text-gray-500 truncate">{prospect.college}</div>
      </div>

      {/* Scouted Info */}
      {prospect.scoutedOverall && (
        <div className="text-sm text-gray-600">
          {prospect.scoutedOverall.low}-{prospect.scoutedOverall.high}
        </div>
      )}

      {/* Status */}
      <div className="w-24 text-right">
        {isTaken ? (
          <span className="text-sm text-gray-500">Pick #{takenAt}</span>
        ) : isTargeted ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
            <Target className="w-3 h-3" />
            Target
          </span>
        ) : (
          <span className="text-sm text-green-600">Available</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {!isTaken && onSelect && (
          <button
            onClick={onSelect}
            className="p-2 hover:bg-gray-200 rounded-lg"
            title="Select"
          >
            <Check className="w-4 h-4 text-green-600" />
          </button>
        )}
        {onViewDetails && (
          <button
            onClick={onViewDetails}
            className="p-2 hover:bg-gray-200 rounded-lg"
            title="View Details"
          >
            <Eye className="w-4 h-4 text-gray-400" />
          </button>
        )}
      </div>
    </div>
  );
}

// Main Draft Board Component
interface DraftBoardProps {
  picks: DraftPick[];
  prospects: DraftProspect[];
  teams: Team[];
  currentPickNumber: number;
  yourTeamId: string;
  yourPicks: number[];
  targetProspectIds: string[];
  onViewProspect?: (prospectId: string) => void;
  onSelectProspect?: (prospectId: string) => void;
  onToggleTarget?: (prospectId: string) => void;
}

export function DraftBoard({
  picks,
  prospects,
  teams,
  currentPickNumber,
  yourTeamId,
  yourPicks,
  targetProspectIds,
  onViewProspect,
  onSelectProspect,
  onToggleTarget,
}: DraftBoardProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeTab, setActiveTab] = useState<"board" | "available" | "taken">("board");
  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("");
  const [showOnlyTargets, setShowOnlyTargets] = useState(false);
  const [expandedRound, setExpandedRound] = useState<number | null>(1);

  // Build taken map
  const takenMap = useMemo(() => {
    const map = new Map<string, number>();
    picks.forEach((pick) => {
      if (pick.prospectId) {
        map.set(pick.prospectId, pick.pickNumber);
      }
    });
    return map;
  }, [picks]);

  // Get prospect by ID
  const prospectMap = useMemo(() => {
    return new Map(prospects.map((p) => [p.id, p]));
  }, [prospects]);

  // Filter prospects
  const filteredProspects = useMemo(() => {
    return prospects.filter((p) => {
      if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !p.college.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (positionFilter && p.position !== positionFilter) {
        return false;
      }
      if (showOnlyTargets && !targetProspectIds.includes(p.id)) {
        return false;
      }
      return true;
    });
  }, [prospects, searchQuery, positionFilter, showOnlyTargets, targetProspectIds]);

  // Available vs Taken
  const availableProspects = filteredProspects.filter((p) => !takenMap.has(p.id));
  const takenProspects = filteredProspects.filter((p) => takenMap.has(p.id));

  // Positions for filter
  const positions = useMemo(() => {
    return Array.from(new Set(prospects.map((p) => p.position))).sort();
  }, [prospects]);

  // Group picks by round
  const picksByRound = useMemo(() => {
    const rounds: Map<number, DraftPick[]> = new Map();
    picks.forEach((pick) => {
      if (!rounds.has(pick.round)) {
        rounds.set(pick.round, []);
      }
      rounds.get(pick.round)!.push(pick);
    });
    return rounds;
  }, [picks]);

  return (
    <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Draft Board</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded-lg ${viewMode === "grid" ? "bg-blue-100 text-blue-600" : "text-gray-400 hover:bg-gray-100"}`}
            >
              <Grid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded-lg ${viewMode === "list" ? "bg-blue-100 text-blue-600" : "text-gray-400 hover:bg-gray-100"}`}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {(["board", "available", "taken"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab === "board" && "Full Board"}
              {tab === "available" && `Available (${availableProspects.length})`}
              {tab === "taken" && `Taken (${takenProspects.length})`}
            </button>
          ))}
        </div>

        {/* Filters */}
        {activeTab !== "board" && (
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search prospects..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Positions</option>
              {positions.map((pos) => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
            </select>
            <button
              onClick={() => setShowOnlyTargets(!showOnlyTargets)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                showOnlyTargets ? "bg-blue-100 border-blue-300 text-blue-700" : "hover:bg-gray-50"
              }`}
            >
              <Target className="w-4 h-4" />
              Targets Only
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {activeTab === "board" && viewMode === "grid" && (
          <div className="space-y-6">
            {Array.from(picksByRound.entries()).map(([round, roundPicks]) => (
              <div key={round}>
                {/* Round Header */}
                <button
                  onClick={() => setExpandedRound(expandedRound === round ? null : round)}
                  className="w-full flex items-center justify-between p-3 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors mb-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900">Round {round}</span>
                    <span className="text-sm text-gray-500">
                      ({roundPicks.filter((p) => p.prospectId).length}/{roundPicks.length} picks made)
                    </span>
                  </div>
                  {expandedRound === round ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {/* Round Picks Grid */}
                {expandedRound === round && (
                  <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                    {roundPicks.map((pick) => {
                      const prospect = pick.prospectId ? prospectMap.get(pick.prospectId) : undefined;
                      const team = teams.find((t) => t.id === pick.currentTeamId);

                      return (
                        <PickCard
                          key={pick.pickNumber}
                          pick={pick}
                          prospect={prospect}
                          team={team}
                          isYourPick={yourPicks.includes(pick.pickNumber)}
                          isCurrentPick={pick.pickNumber === currentPickNumber}
                          yourBoardRank={prospect?.yourBoardRank}
                          onViewProspect={onViewProspect}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === "board" && viewMode === "list" && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-sm text-gray-500">
                  <th className="p-3 font-medium">Pick</th>
                  <th className="p-3 font-medium">Team</th>
                  <th className="p-3 font-medium">Player</th>
                  <th className="p-3 font-medium">Pos</th>
                  <th className="p-3 font-medium">College</th>
                  <th className="p-3 font-medium">Consensus</th>
                  <th className="p-3 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {picks.slice(0, 64).map((pick) => {
                  const prospect = pick.prospectId ? prospectMap.get(pick.prospectId) : undefined;
                  const team = teams.find((t) => t.id === pick.currentTeamId);
                  const isYourPick = yourPicks.includes(pick.pickNumber);
                  const { isFalling, fallDistance } = prospect ? checkProspectFalling(prospect, pick.pickNumber) : { isFalling: false, fallDistance: 0 };
                  const { isReach, reachDistance } = prospect ? checkReach(prospect, pick.pickNumber) : { isReach: false, reachDistance: 0 };

                  return (
                    <tr
                      key={pick.pickNumber}
                      className={`border-b ${
                        pick.pickNumber === currentPickNumber
                          ? "bg-amber-50"
                          : isYourPick
                            ? "bg-blue-50"
                            : prospect
                              ? "hover:bg-gray-50"
                              : "bg-gray-50"
                      }`}
                    >
                      <td className="p-3">
                        <span className={`font-bold ${isYourPick ? "text-blue-600" : "text-gray-900"}`}>
                          {pick.pickNumber}
                        </span>
                        {pick.isTraded && (
                          <span className="ml-1 text-xs text-amber-600">T</span>
                        )}
                      </td>
                      <td className="p-3 text-sm">{team?.abbreviation || "?"}</td>
                      <td className="p-3">
                        {prospect ? (
                          <span className="font-medium">{prospect.name}</span>
                        ) : (
                          <span className="text-gray-400 italic">
                            {pick.pickNumber === currentPickNumber ? "On the clock..." : "—"}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {prospect && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPositionColors(prospect.position).bg} ${getPositionColors(prospect.position).text}`}>
                            {prospect.position}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-sm text-gray-500">{prospect?.college || "—"}</td>
                      <td className="p-3 text-sm">
                        {prospect?.consensusRank ? `#${prospect.consensusRank}` : "—"}
                      </td>
                      <td className="p-3">
                        {prospect && (
                          <div className="flex items-center gap-1">
                            {isReach && (
                              <span className="flex items-center text-xs text-orange-600">
                                <TrendingUp className="w-3 h-3 mr-0.5" />
                                +{reachDistance}
                              </span>
                            )}
                            {isFalling && fallDistance >= 10 && (
                              <span className="flex items-center text-xs text-green-600">
                                <TrendingDown className="w-3 h-3 mr-0.5" />
                                -{fallDistance}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Available Tab */}
        {activeTab === "available" && (
          <div className="divide-y">
            {availableProspects.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No prospects match your filters
              </div>
            ) : (
              availableProspects.map((prospect, i) => (
                <ProspectListRow
                  key={prospect.id}
                  prospect={prospect}
                  rank={i + 1}
                  isTaken={false}
                  isTargeted={targetProspectIds.includes(prospect.id)}
                  onSelect={() => onSelectProspect?.(prospect.id)}
                  onViewDetails={() => onViewProspect?.(prospect.id)}
                />
              ))
            )}
          </div>
        )}

        {/* Taken Tab */}
        {activeTab === "taken" && (
          <div className="divide-y">
            {takenProspects.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No prospects taken yet
              </div>
            ) : (
              takenProspects
                .sort((a, b) => (takenMap.get(a.id) || 999) - (takenMap.get(b.id) || 999))
                .map((prospect) => (
                  <ProspectListRow
                    key={prospect.id}
                    prospect={prospect}
                    rank={prospect.consensusRank}
                    isTaken={true}
                    takenAt={takenMap.get(prospect.id)}
                    isTargeted={targetProspectIds.includes(prospect.id)}
                    onViewDetails={() => onViewProspect?.(prospect.id)}
                  />
                ))
            )}
          </div>
        )}
      </div>

      {/* Position Legend */}
      <div className="p-4 border-t bg-gray-50">
        <div className="flex flex-wrap gap-2">
          {positions.map((pos) => {
            const colors = getPositionColors(pos);
            return (
              <span
                key={pos}
                className={`px-2 py-1 rounded text-xs font-medium ${colors.bg} ${colors.text}`}
              >
                {pos}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export type { DraftPick, DraftProspect, Team };
