"use client";

import React, { useState, useMemo } from "react";
import {
  Play,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Star,
  Target,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Clock,
  Percent,
  Shuffle,
  Zap,
  Eye,
  Filter,
} from "lucide-react";
import {
  MockDraftProspect,
  MockDraftTeam,
  MockDraftPick,
  MockDraftResult,
  AvailabilityProbability,
  runMockDraftSimulations,
  findValuePicks,
} from "@/lib/scouting/mock-draft";

// Position colors
const POSITION_COLORS: Record<string, string> = {
  QB: "bg-red-100 text-red-700",
  RB: "bg-green-100 text-green-700",
  WR: "bg-blue-100 text-blue-700",
  TE: "bg-purple-100 text-purple-700",
  OT: "bg-amber-100 text-amber-700",
  OG: "bg-amber-100 text-amber-700",
  C: "bg-amber-100 text-amber-700",
  DE: "bg-orange-100 text-orange-700",
  DT: "bg-orange-100 text-orange-700",
  LB: "bg-cyan-100 text-cyan-700",
  CB: "bg-indigo-100 text-indigo-700",
  S: "bg-violet-100 text-violet-700",
  K: "bg-gray-100 text-gray-700",
  P: "bg-gray-100 text-gray-700",
};

// Probability badge
function ProbabilityBadge({ percent }: { percent: number }) {
  let colorClass = "bg-gray-100 text-gray-600";
  if (percent >= 80) colorClass = "bg-green-100 text-green-700";
  else if (percent >= 50) colorClass = "bg-amber-100 text-amber-700";
  else if (percent >= 20) colorClass = "bg-orange-100 text-orange-700";
  else colorClass = "bg-red-100 text-red-700";

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {percent}%
    </span>
  );
}

// Individual Pick Card
function PickCard({
  pick,
  isYourPick,
  onProspectClick,
}: {
  pick: MockDraftPick;
  isYourPick: boolean;
  onProspectClick?: (prospectId: string) => void;
}) {
  return (
    <div
      className={`p-3 border rounded-lg ${
        isYourPick ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white"
      } hover:shadow-md transition-shadow cursor-pointer`}
      onClick={() => onProspectClick?.(pick.prospectId)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              isYourPick ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700"
            }`}
          >
            {pick.pickNumber}
          </div>
          <div>
            <div className="font-medium text-gray-900">{pick.prospectName}</div>
            <div className="text-xs text-gray-500">{pick.teamName}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs ${POSITION_COLORS[pick.position] || "bg-gray-100"}`}>
            {pick.position}
          </span>

          {pick.wasReach && (
            <span className="flex items-center gap-1 text-xs text-orange-600" title="Reach">
              <TrendingUp className="w-3 h-3" />
            </span>
          )}
          {pick.wasDrop && (
            <span className="flex items-center gap-1 text-xs text-green-600" title="Value">
              <TrendingDown className="w-3 h-3" />
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 text-xs text-gray-500">
        Consensus: #{pick.consensusRank}
        {pick.wasReach && (
          <span className="ml-2 text-orange-600">
            (Reach: {pick.pickNumber - pick.consensusRank} picks early)
          </span>
        )}
        {pick.wasDrop && (
          <span className="ml-2 text-green-600">
            (Fell: {pick.consensusRank - pick.pickNumber} picks)
          </span>
        )}
      </div>
    </div>
  );
}

// Availability Chart for a prospect
function AvailabilityChart({
  probability,
  yourPicks,
}: {
  probability: AvailabilityProbability;
  yourPicks: number[];
}) {
  // Show probability at key picks
  const keyPicks = probability.pickProbabilities.filter(
    (p) => p.pickNumber <= 64 || yourPicks.includes(p.pickNumber)
  );

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1 h-8">
        {keyPicks.slice(0, 40).map((p) => {
          const isYourPick = yourPicks.includes(p.pickNumber);
          const height = Math.max(4, (p.availablePercent / 100) * 100);

          return (
            <div
              key={p.pickNumber}
              className="flex-1 flex flex-col justify-end"
              title={`Pick ${p.pickNumber}: ${p.availablePercent}% available`}
            >
              <div
                className={`w-full rounded-t ${
                  isYourPick
                    ? "bg-blue-500"
                    : p.availablePercent >= 50
                      ? "bg-green-400"
                      : p.availablePercent >= 20
                        ? "bg-amber-400"
                        : "bg-red-400"
                }`}
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>Pick 1</span>
        <span>Pick {Math.min(40, keyPicks.length)}</span>
      </div>
    </div>
  );
}

// Prospect Availability Card
function ProspectAvailabilityCard({
  probability,
  yourPicks,
  onViewProspect,
}: {
  probability: AvailabilityProbability;
  yourPicks: number[];
  onViewProspect?: (prospectId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Find availability at your picks
  const availabilityAtYourPicks = yourPicks.map((pick) => {
    const pickProb = probability.pickProbabilities.find((p) => p.pickNumber === pick);
    return {
      pick,
      available: pickProb?.availablePercent || 0,
    };
  });

  return (
    <div className="border rounded-lg p-3 bg-white">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="text-lg font-bold text-gray-400">#{probability.consensusRank}</div>
          <div>
            <div className="font-medium text-gray-900">{probability.prospectName}</div>
            <span className={`px-2 py-0.5 rounded text-xs ${POSITION_COLORS[probability.position] || "bg-gray-100"}`}>
              {probability.position}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-sm font-medium">Pick {probability.expectedPick}</div>
            <div className="text-xs text-gray-500">Expected</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-medium">±{probability.variance}</div>
            <div className="text-xs text-gray-500">Variance</div>
          </div>
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* Availability at your picks */}
      <div className="flex gap-2 mt-3">
        {availabilityAtYourPicks.map(({ pick, available }) => (
          <div
            key={pick}
            className={`flex-1 text-center p-2 rounded ${
              available >= 80
                ? "bg-green-50"
                : available >= 50
                  ? "bg-amber-50"
                  : available >= 20
                    ? "bg-orange-50"
                    : "bg-red-50"
            }`}
          >
            <div className="text-xs text-gray-500">Pick {pick}</div>
            <ProbabilityBadge percent={available} />
          </div>
        ))}
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t">
          <div className="text-xs text-gray-500 mb-2">Availability by Pick</div>
          <AvailabilityChart probability={probability} yourPicks={yourPicks} />

          <button
            onClick={() => onViewProspect?.(probability.prospectId)}
            className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
          >
            <Eye className="w-4 h-4" />
            View Scouting Report
          </button>
        </div>
      )}
    </div>
  );
}

// Main Component
interface MockDraftSimulatorProps {
  prospects: MockDraftProspect[];
  teams: MockDraftTeam[];
  yourTeamId: string;
  yourPicks: number[];
  onViewProspect?: (prospectId: string) => void;
}

export function MockDraftSimulator({
  prospects,
  teams,
  yourTeamId,
  yourPicks,
  onViewProspect,
}: MockDraftSimulatorProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [numSimulations, setNumSimulations] = useState(100);
  const [result, setResult] = useState<MockDraftResult | null>(null);
  const [activeTab, setActiveTab] = useState<"mock" | "availability" | "value">("mock");
  const [roundFilter, setRoundFilter] = useState<number | null>(null);
  const [positionFilter, setPositionFilter] = useState<string>("");

  // Run simulation
  const runSimulation = async () => {
    setIsRunning(true);

    // Simulate with a small delay to show loading state
    await new Promise((resolve) => setTimeout(resolve, 100));

    const simResult = runMockDraftSimulations(
      prospects,
      teams,
      numSimulations,
      yourPicks
    );

    setResult(simResult);
    setIsRunning(false);
  };

  // Filter picks
  const filteredPicks = useMemo(() => {
    if (!result) return [];

    return result.picks.filter((pick) => {
      if (roundFilter && pick.round !== roundFilter) return false;
      if (positionFilter && pick.position !== positionFilter) return false;
      return true;
    });
  }, [result, roundFilter, positionFilter]);

  // Get value picks
  const valuePicks = useMemo(() => {
    if (!result) return [];
    return findValuePicks(prospects, result.prospectProbabilities, yourPicks);
  }, [result, prospects, yourPicks]);

  // Get unique positions for filter
  const positions = useMemo(() => {
    return Array.from(new Set(prospects.map((p) => p.position))).sort();
  }, [prospects]);

  return (
    <div className="bg-white rounded-xl shadow-lg border">
      {/* Header */}
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-100 rounded-xl">
              <Shuffle className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Mock Draft Simulator</h2>
              <p className="text-sm text-gray-500">
                Simulate drafts to predict prospect availability
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">Simulations:</label>
              <select
                value={numSimulations}
                onChange={(e) => setNumSimulations(Number(e.target.value))}
                className="px-3 py-1.5 border rounded-lg text-sm"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
              </select>
            </div>

            <button
              onClick={runSimulation}
              disabled={isRunning}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                isRunning
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
              }`}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run Simulation
                </>
              )}
            </button>
          </div>
        </div>

        {/* Your Picks Summary */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <div className="text-sm font-medium text-blue-800 mb-2">Your Draft Picks</div>
          <div className="flex flex-wrap gap-2">
            {yourPicks.map((pick) => (
              <span
                key={pick}
                className="px-3 py-1 bg-blue-600 text-white rounded-full text-sm font-medium"
              >
                #{pick} (Rd {Math.ceil(pick / 32)})
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {([
          { key: "mock", label: "Mock Draft", icon: BarChart3 },
          { key: "availability", label: "Availability", icon: Percent },
          { key: "value", label: "Value Picks", icon: Star },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === key
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4">
        {!result ? (
          <div className="text-center py-12">
            <Shuffle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-600">Ready to Simulate</p>
            <p className="text-sm text-gray-400">
              Click "Run Simulation" to generate mock draft results
            </p>
          </div>
        ) : (
          <>
            {/* Mock Draft Tab */}
            {activeTab === "mock" && (
              <>
                {/* Filters */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select
                      value={roundFilter || ""}
                      onChange={(e) => setRoundFilter(e.target.value ? Number(e.target.value) : null)}
                      className="px-3 py-1.5 border rounded-lg text-sm"
                    >
                      <option value="">All Rounds</option>
                      {[1, 2, 3, 4, 5, 6, 7].map((r) => (
                        <option key={r} value={r}>
                          Round {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  <select
                    value={positionFilter}
                    onChange={(e) => setPositionFilter(e.target.value)}
                    className="px-3 py-1.5 border rounded-lg text-sm"
                  >
                    <option value="">All Positions</option>
                    {positions.map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Picks Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto">
                  {filteredPicks.map((pick) => (
                    <PickCard
                      key={pick.pickNumber}
                      pick={pick}
                      isYourPick={yourPicks.includes(pick.pickNumber)}
                      onProspectClick={onViewProspect}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Availability Tab */}
            {activeTab === "availability" && (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {Object.values(result.prospectProbabilities)
                  .sort((a, b) => a.consensusRank - b.consensusRank)
                  .slice(0, 50)
                  .map((prob) => (
                    <ProspectAvailabilityCard
                      key={prob.prospectId}
                      probability={prob}
                      yourPicks={yourPicks}
                      onViewProspect={onViewProspect}
                    />
                  ))}
              </div>
            )}

            {/* Value Picks Tab */}
            {activeTab === "value" && (
              <div>
                {valuePicks.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Target className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No value picks identified</p>
                    <p className="text-sm">Add prospects to your big board to find value picks</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm text-gray-500 mb-4">
                      Prospects you rank significantly higher than consensus and may be available at your picks
                    </div>

                    {valuePicks.map(({ prospect, valueDiff, availableAtPick }) => (
                      <div
                        key={prospect.id}
                        className="p-4 border rounded-lg bg-green-50 border-green-200"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-gray-900">{prospect.name}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`px-2 py-0.5 rounded text-xs ${POSITION_COLORS[prospect.position]}`}>
                                {prospect.position}
                              </span>
                              <span className="text-sm text-gray-500">{prospect.college}</span>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="flex items-center gap-1 text-green-700">
                              <TrendingUp className="w-4 h-4" />
                              <span className="font-bold">+{valueDiff} value</span>
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              Target at pick #{availableAtPick}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Consensus:</span>
                            <span className="ml-2 font-medium">#{prospect.consensusRank}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Your Board:</span>
                            <span className="ml-2 font-medium text-green-700">
                              #{prospect.yourBoardRank}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {result && (
        <div className="p-4 border-t bg-gray-50">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div>
              Based on {numSimulations} simulations
            </div>
            <button
              onClick={runSimulation}
              className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
            >
              <RefreshCw className="w-4 h-4" />
              Run Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export type { MockDraftProspect, MockDraftTeam, MockDraftResult };
