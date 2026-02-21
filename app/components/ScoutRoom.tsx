"use client";

import React, { useState } from "react";
import {
  ScoutRelationship,
  Recommendation,
  StakeholderReaction,
} from "@/lib/relationships/relationship-types";
import { calculateScoutEffects, ScoutRelationshipEffects } from "@/lib/relationships/relationship-effects";

// Scout archetype info (from existing scout system)
const ARCHETYPE_INFO: Record<string, { name: string; description: string; icon: string; strengths: string[] }> = {
  evaluator: {
    name: "The Evaluator",
    description: "Balanced approach, values all-around players with minimal weaknesses.",
    icon: "⚖️",
    strengths: ["Overall Assessment", "Balanced Analysis", "Risk Evaluation"],
  },
  tape_grinder: {
    name: "Tape Grinder",
    description: "Lives in the film room. Notices technical details others miss.",
    icon: "📼",
    strengths: ["Technique Analysis", "Play Recognition", "Situational Awareness"],
  },
  character_coach: {
    name: "Character Coach",
    description: "Believes in drafting the person, not just the player.",
    icon: "💪",
    strengths: ["Character Assessment", "Leadership Evaluation", "Work Ethic"],
  },
  athletic_analyst: {
    name: "Athletic Analyst",
    description: "Numbers don't lie. Prioritizes measurables and athletic testing.",
    icon: "📊",
    strengths: ["Combine Analysis", "Athletic Testing", "Physical Projection"],
  },
  regional_specialist: {
    name: "Regional Specialist",
    description: "Deep connections in specific areas. Knows the hidden gems.",
    icon: "🗺️",
    strengths: ["Regional Coverage", "Network Connections", "Local Intel"],
  },
  pro_personnel: {
    name: "Pro Personnel",
    description: "Specializes in evaluating current NFL players for trades and FA.",
    icon: "🏈",
    strengths: ["NFL Evaluation", "Contract Analysis", "Scheme Fit"],
  },
};

interface ScoutRoomProps {
  scouts: ScoutRelationship[];
  selectedScoutId?: string;
  recentRecommendations: Recommendation[];
  recentReactions: StakeholderReaction[];
  onSelectScout?: (scoutId: string) => void;
  onAssignScout?: (scoutId: string, assignment: string) => void;
  onDevelopScout?: (scoutId: string) => void;
  onFireScout?: (scoutId: string) => void;
  onHireScout?: () => void;
}

export default function ScoutRoom({
  scouts,
  selectedScoutId,
  recentRecommendations,
  recentReactions,
  onSelectScout,
  onAssignScout,
  onDevelopScout,
  onFireScout,
  onHireScout,
}: ScoutRoomProps) {
  const [activeTab, setActiveTab] = useState<"roster" | "detail" | "assignments">("roster");
  const [filterArchetype, setFilterArchetype] = useState<string | null>(null);

  const selectedScout = scouts.find((s) => s.scoutId === selectedScoutId);
  const filteredScouts = filterArchetype
    ? scouts.filter((s) => s.archetype === filterArchetype)
    : scouts;

  // Calculate overall staff stats
  const staffStats = {
    totalScouts: scouts.length,
    averageMorale: Math.round(scouts.reduce((sum, s) => sum + s.metrics.morale, 0) / scouts.length) || 0,
    averageLoyalty: Math.round(scouts.reduce((sum, s) => sum + s.metrics.loyalty, 0) / scouts.length) || 0,
    averageAccuracy: Math.round(scouts.reduce((sum, s) => sum + s.accuracy, 0) / scouts.length) || 0,
  };

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-900/50 to-teal-900/50 p-6 border-b border-gray-700">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Scout Room</h2>
            <p className="text-emerald-300 mt-1">Manage your scouting department</p>
          </div>

          {/* Staff Overview */}
          <div className="flex gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{staffStats.totalScouts}</div>
              <div className="text-gray-400 text-sm">Scouts</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">{staffStats.averageAccuracy}%</div>
              <div className="text-gray-400 text-sm">Avg Accuracy</div>
            </div>
            <div className="text-center">
              <div
                className={`text-2xl font-bold ${
                  staffStats.averageMorale >= 70
                    ? "text-green-400"
                    : staffStats.averageMorale >= 40
                    ? "text-yellow-400"
                    : "text-red-400"
                }`}
              >
                {staffStats.averageMorale}%
              </div>
              <div className="text-gray-400 text-sm">Avg Morale</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-700">
        <div className="flex">
          {(["roster", "detail", "assignments"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "text-emerald-400 border-b-2 border-emerald-400 bg-gray-800/50"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {tab === "roster" ? "Scout Roster" : tab === "detail" ? "Scout Detail" : "Assignments"}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === "roster" && (
          <div className="space-y-6">
            {/* Archetype Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-gray-400 text-sm">Filter:</span>
              <button
                onClick={() => setFilterArchetype(null)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  filterArchetype === null
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                    : "bg-gray-800 text-gray-400 hover:text-gray-200"
                }`}
              >
                All
              </button>
              {Object.entries(ARCHETYPE_INFO).map(([key, info]) => (
                <button
                  key={key}
                  onClick={() => setFilterArchetype(key)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    filterArchetype === key
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                      : "bg-gray-800 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {info.icon} {info.name}
                </button>
              ))}
            </div>

            {/* Scout List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredScouts.map((scout) => {
                const archetype = ARCHETYPE_INFO[scout.archetype] || ARCHETYPE_INFO.evaluator;
                const isSelected = scout.scoutId === selectedScoutId;

                return (
                  <div
                    key={scout.scoutId}
                    onClick={() => onSelectScout?.(scout.scoutId)}
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-emerald-500/10 border-emerald-500/50"
                        : "bg-gray-800 border-gray-700 hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center text-2xl">
                        {archetype.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h3 className="text-white font-medium">{scout.name}</h3>
                          <span className="text-emerald-400 text-sm font-medium">
                            {scout.accuracy}% Accuracy
                          </span>
                        </div>
                        <p className="text-gray-400 text-sm">{archetype.name}</p>

                        {/* Mini Stats */}
                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500 text-xs">Morale:</span>
                            <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  scout.metrics.morale >= 70
                                    ? "bg-green-500"
                                    : scout.metrics.morale >= 40
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                                }`}
                                style={{ width: `${scout.metrics.morale}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500 text-xs">Loyalty:</span>
                            <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  scout.metrics.loyalty >= 70
                                    ? "bg-blue-500"
                                    : scout.metrics.loyalty >= 40
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                                }`}
                                style={{ width: `${scout.metrics.loyalty}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Hire Button */}
            {onHireScout && (
              <button
                onClick={onHireScout}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
              >
                + Hire New Scout
              </button>
            )}
          </div>
        )}

        {activeTab === "detail" && (
          <div>
            {selectedScout ? (
              <ScoutDetailView
                scout={selectedScout}
                recommendations={recentRecommendations.filter(
                  (r) => r.source === "scout" && r.id.includes(selectedScout.scoutId)
                )}
                reactions={recentReactions.filter((r) => r.sourceId === selectedScout.scoutId)}
                onDevelop={() => onDevelopScout?.(selectedScout.scoutId)}
                onFire={() => onFireScout?.(selectedScout.scoutId)}
              />
            ) : (
              <div className="text-center py-12 text-gray-500">
                Select a scout from the roster to view details
              </div>
            )}
          </div>
        )}

        {activeTab === "assignments" && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {/* College Scouting */}
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                  <span>🎓</span> College Scouting
                </h3>
                <div className="space-y-2">
                  {scouts
                    .filter((s) => s.currentAssignment?.startsWith("college"))
                    .map((scout) => (
                      <div
                        key={scout.scoutId}
                        className="p-2 bg-gray-700 rounded flex items-center justify-between"
                      >
                        <span className="text-gray-300 text-sm">{scout.name}</span>
                        <span className="text-gray-500 text-xs">
                          {scout.currentAssignment?.replace("college_", "")}
                        </span>
                      </div>
                    ))}
                  {scouts.filter((s) => s.currentAssignment?.startsWith("college")).length ===
                    0 && (
                    <div className="text-gray-500 text-sm text-center py-4">No scouts assigned</div>
                  )}
                </div>
              </div>

              {/* Pro Scouting */}
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                  <span>🏈</span> Pro Scouting
                </h3>
                <div className="space-y-2">
                  {scouts
                    .filter((s) => s.currentAssignment?.startsWith("pro"))
                    .map((scout) => (
                      <div
                        key={scout.scoutId}
                        className="p-2 bg-gray-700 rounded flex items-center justify-between"
                      >
                        <span className="text-gray-300 text-sm">{scout.name}</span>
                        <span className="text-gray-500 text-xs">
                          {scout.currentAssignment?.replace("pro_", "")}
                        </span>
                      </div>
                    ))}
                  {scouts.filter((s) => s.currentAssignment?.startsWith("pro")).length === 0 && (
                    <div className="text-gray-500 text-sm text-center py-4">No scouts assigned</div>
                  )}
                </div>
              </div>

              {/* Unassigned */}
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                  <span>📋</span> Unassigned
                </h3>
                <div className="space-y-2">
                  {scouts
                    .filter((s) => !s.currentAssignment)
                    .map((scout) => (
                      <div
                        key={scout.scoutId}
                        className="p-2 bg-gray-700 rounded flex items-center justify-between"
                      >
                        <span className="text-gray-300 text-sm">{scout.name}</span>
                        <button
                          onClick={() => onAssignScout?.(scout.scoutId, "college_general")}
                          className="text-emerald-400 text-xs hover:text-emerald-300"
                        >
                          Assign
                        </button>
                      </div>
                    ))}
                  {scouts.filter((s) => !s.currentAssignment).length === 0 && (
                    <div className="text-gray-500 text-sm text-center py-4">
                      All scouts assigned
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Assignment Regions */}
            <div>
              <h3 className="text-white font-medium mb-3">Coverage Map</h3>
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="grid grid-cols-4 gap-3">
                  {["Northeast", "Southeast", "Midwest", "West", "Southwest", "Northwest", "National", "International"].map(
                    (region) => {
                      const assignedScouts = scouts.filter(
                        (s) => s.currentAssignment?.toLowerCase().includes(region.toLowerCase())
                      );
                      return (
                        <div key={region} className="p-3 bg-gray-700 rounded-lg">
                          <div className="text-gray-300 font-medium text-sm">{region}</div>
                          <div className="text-emerald-400 text-lg font-bold">
                            {assignedScouts.length}
                          </div>
                          <div className="text-gray-500 text-xs">scouts</div>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Scout Detail Sub-component
function ScoutDetailView({
  scout,
  recommendations,
  reactions,
  onDevelop,
  onFire,
}: {
  scout: ScoutRelationship;
  recommendations: Recommendation[];
  reactions: StakeholderReaction[];
  onDevelop?: () => void;
  onFire?: () => void;
}) {
  const archetype = ARCHETYPE_INFO[scout.archetype] || ARCHETYPE_INFO.evaluator;
  const effects = calculateScoutEffects(scout);

  return (
    <div className="space-y-6">
      {/* Scout Header */}
      <div className="flex items-start gap-4">
        <div className="w-20 h-20 bg-gray-800 rounded-lg flex items-center justify-center text-4xl">
          {archetype.icon}
        </div>
        <div className="flex-1">
          <h3 className="text-2xl font-bold text-white">{scout.name}</h3>
          <p className="text-emerald-400">{archetype.name}</p>
          <p className="text-gray-400 text-sm mt-1">{archetype.description}</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-emerald-400">{scout.accuracy}%</div>
          <div className="text-gray-400 text-sm">Accuracy Rating</div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Morale" value={scout.metrics.morale} color="green" />
        <MetricCard label="Loyalty" value={scout.metrics.loyalty} color="blue" />
        <MetricCard label="Respect" value={scout.metrics.respect} color="purple" />
        <MetricCard label="Trust" value={scout.metrics.trust} color="orange" />
      </div>

      {/* Strengths */}
      <div>
        <h4 className="text-white font-medium mb-3">Evaluation Strengths</h4>
        <div className="flex flex-wrap gap-2">
          {archetype.strengths.map((strength, idx) => (
            <span
              key={idx}
              className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-sm"
            >
              {strength}
            </span>
          ))}
        </div>
      </div>

      {/* Effects */}
      <div>
        <h4 className="text-white font-medium mb-3">Current Effects</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Report Quality</span>
              <span
                className={`font-medium ${
                  effects.reportQualityModifier >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {effects.reportQualityModifier > 0 ? "+" : ""}
                {(effects.reportQualityModifier * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Discovery Chance</span>
              <span
                className={`font-medium ${
                  effects.hiddenGemChanceModifier >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {effects.hiddenGemChanceModifier > 0 ? "+" : ""}
                {(effects.hiddenGemChanceModifier * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Recommendations */}
      {recommendations.length > 0 && (
        <div>
          <h4 className="text-white font-medium mb-3">Recent Recommendations</h4>
          <div className="space-y-2">
            {recommendations.slice(0, 3).map((rec) => (
              <div
                key={rec.id}
                className={`p-3 rounded-lg border ${
                  rec.status === "followed"
                    ? "bg-green-500/10 border-green-500/30"
                    : rec.status === "ignored"
                    ? "bg-red-500/10 border-red-500/30"
                    : "bg-gray-800 border-gray-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-white">{rec.action.description}</span>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      rec.status === "followed"
                        ? "bg-green-500/20 text-green-400"
                        : rec.status === "ignored"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-gray-700 text-gray-400"
                    }`}
                  >
                    {rec.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {onDevelop && (
          <button
            onClick={onDevelop}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
          >
            Develop Scout
          </button>
        )}
        {onFire && (
          <button
            onClick={onFire}
            className="px-6 py-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-medium rounded-lg transition-colors border border-red-600/30"
          >
            Release Scout
          </button>
        )}
      </div>
    </div>
  );
}

// Metric Card Sub-component
function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "green" | "blue" | "purple" | "orange";
}) {
  const colorClasses = {
    green: "text-green-400",
    blue: "text-blue-400",
    purple: "text-purple-400",
    orange: "text-orange-400",
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-sm">{label}</span>
        <span className={`font-bold ${colorClasses[color]}`}>{value}</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${
            value >= 70 ? "bg-green-500" : value >= 40 ? "bg-yellow-500" : "bg-red-500"
          }`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
