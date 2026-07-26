// @ts-nocheck
"use client";

import React, { useState } from "react";
import {
  Coach,
  CoachPersonality,
  CoachSchemePreference,
  Recommendation,
  StakeholderReaction,
} from "@/lib/relationships/relationship-types";
import { calculateCoachEffects, CoachRelationshipEffects } from "@/lib/relationships/relationship-effects";

// Coach personality descriptions
const PERSONALITY_INFO: Record<CoachPersonality, { name: string; description: string; icon: string }> = {
  players_coach: {
    name: "Players' Coach",
    description: "Beloved by players, focuses on culture and development. May overlook talent deficiencies.",
    icon: "🤝",
  },
  disciplinarian: {
    name: "Disciplinarian",
    description: "Strict rules and high standards. Demands character and accountability above all.",
    icon: "📋",
  },
  offensive_innovator: {
    name: "Offensive Innovator",
    description: "Creative playcaller who prioritizes offensive weapons and scheme fits.",
    icon: "🎯",
  },
  defensive_mastermind: {
    name: "Defensive Mastermind",
    description: "Defense wins championships. Prioritizes defensive talent and versatility.",
    icon: "🛡️",
  },
  old_school: {
    name: "Old School",
    description: "Run the ball, play defense, win games. Values physical players and toughness.",
    icon: "🏈",
  },
  analytics_driven: {
    name: "Analytics Driven",
    description: "Data-first approach. Values efficiency metrics and positional value.",
    icon: "📊",
  },
  developmental: {
    name: "Developmental",
    description: "Excels at developing raw talent. Patient with young players, loves upside.",
    icon: "📈",
  },
  win_now: {
    name: "Win Now",
    description: "Wants proven veterans and immediate impact players. No time for projects.",
    icon: "🏆",
  },
};

const SCHEME_INFO: Record<CoachSchemePreference, { name: string; positions: string[] }> = {
  spread_offense: { name: "Spread Offense", positions: ["QB", "WR", "Slot WR", "Athletic TE"] },
  pro_style: { name: "Pro Style", positions: ["Pocket QB", "Power RB", "Blocking TE", "Big WR"] },
  west_coast: { name: "West Coast", positions: ["Accurate QB", "Route Runners", "YAC WR"] },
  air_raid: { name: "Air Raid", positions: ["Strong Arm QB", "Speed WR", "Multiple WRs"] },
  power_run: { name: "Power Run", positions: ["Physical RB", "Mauling OL", "Blocking FB"] },
  zone_run: { name: "Zone Run", positions: ["Agile RB", "Athletic OL", "Movement Skills"] },
  "3-4_defense": { name: "3-4 Defense", positions: ["2-Gap NT", "OLB Pass Rushers", "Coverage ILB"] },
  "4-3_defense": { name: "4-3 Defense", positions: ["4-Tech DE", "3-Tech DT", "Mike LB"] },
  multiple_defense: { name: "Multiple Defense", positions: ["Versatile Front 7", "Hybrid LB/S"] },
  cover_2: { name: "Cover 2", positions: ["Zone CBs", "Range Safeties", "Fast LBs"] },
  cover_3: { name: "Cover 3", positions: ["Single High S", "Press CBs", "Run Support S"] },
  man_heavy: { name: "Man Coverage", positions: ["Elite CBs", "Athletic LBs", "Tight Coverage"] },
};

interface CoachCornerProps {
  coach: Coach;
  recentRecommendations: Recommendation[];
  recentReactions: StakeholderReaction[];
  rosterFits: { position: string; player: string; fitScore: number }[];
  schemeNeeds: { position: string; priority: "critical" | "high" | "medium" | "low" }[];
  onMeetWithCoach?: () => void;
  onViewDepthChart?: () => void;
}

export default function CoachCorner({
  coach,
  recentRecommendations,
  recentReactions,
  rosterFits,
  schemeNeeds,
  onMeetWithCoach,
  onViewDepthChart,
}: CoachCornerProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "scheme" | "history">("overview");

  const personalityInfo = PERSONALITY_INFO[coach.personality];
  const effects = calculateCoachEffects(coach);

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-900/50 to-red-900/50 p-6 border-b border-gray-700">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-gray-800 rounded-lg flex items-center justify-center text-4xl">
              {personalityInfo.icon}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{coach.name}</h2>
              <p className="text-orange-300">{personalityInfo.name}</p>
              <p className="text-gray-400 text-sm mt-1">{personalityInfo.description}</p>
            </div>
          </div>

          {/* Coach Record */}
          <div className="text-right">
            <div className="text-2xl font-bold text-white">{coach.experience} Years</div>
            <div className="text-gray-400 text-sm">Experience</div>
          </div>
        </div>
      </div>

      {/* Relationship Metrics */}
      <div className="grid grid-cols-4 gap-4 p-4 border-b border-gray-700 bg-gray-800/50">
        <MetricCard
          label="Trust"
          value={coach.metrics.trust}
          color="blue"
          description="Coach trusts your personnel decisions"
        />
        <MetricCard
          label="Respect"
          value={coach.metrics.respect}
          color="purple"
          description="Mutual professional respect"
        />
        <MetricCard
          label="Alignment"
          value={calculateAlignment(coach)}
          color="green"
          description="Vision alignment on roster building"
        />
        <MetricCard
          label="Influence"
          value={coach.influence}
          color="orange"
          description="Coach's sway in organization"
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-700">
        <div className="flex">
          {(["overview", "scheme", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "text-orange-400 border-b-2 border-orange-400 bg-gray-800/50"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Current Effects */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Coaching Effects</h3>
              <div className="grid grid-cols-2 gap-4">
                <EffectCard
                  label="Player Development"
                  value={`${effects.playerDevelopmentModifier > 0 ? "+" : ""}${(effects.playerDevelopmentModifier * 100).toFixed(0)}%`}
                  positive={effects.playerDevelopmentModifier >= 0}
                  description="Affects how quickly players improve"
                />
                <EffectCard
                  label="Scheme Fit Bonus"
                  value={`${effects.schemeFitBonus > 0 ? "+" : ""}${(effects.schemeFitBonus * 100).toFixed(0)}%`}
                  positive={effects.schemeFitBonus >= 0}
                  description="Performance boost for scheme fits"
                />
                <EffectCard
                  label="Position Value Shift"
                  value={effects.positionPriorityShift.length > 0 ? "Active" : "None"}
                  positive={effects.positionPriorityShift.length > 0}
                  description="Modified position valuations"
                />
                <EffectCard
                  label="Free Agent Appeal"
                  value={`${effects.freeAgentAppealModifier > 0 ? "+" : ""}${(effects.freeAgentAppealModifier * 100).toFixed(0)}%`}
                  positive={effects.freeAgentAppealModifier >= 0}
                  description="Player interest in joining"
                />
              </div>
            </div>

            {/* Coach Preferences */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Draft Preferences</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-orange-400 font-medium mb-2">Preferred Traits</h4>
                  <div className="flex flex-wrap gap-2">
                    {coach.preferredTraits.map((trait, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-green-500/20 text-green-300 rounded text-sm"
                      >
                        {trait.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-red-400 font-medium mb-2">Avoided Traits</h4>
                  <div className="flex flex-wrap gap-2">
                    {coach.avoidedTraits.map((trait, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-sm"
                      >
                        {trait.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Recommendations */}
            {recentRecommendations.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Recent Recommendations</h3>
                <div className="space-y-2">
                  {recentRecommendations.slice(0, 3).map((rec) => (
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
                        <span className="text-white font-medium">{rec.action.description}</span>
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
                      <p className="text-gray-400 text-sm mt-1">{rec.reasoning}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "scheme" && (
          <div className="space-y-6">
            {/* Offensive Scheme */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Offensive Scheme</h3>
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">⚔️</span>
                  <div>
                    <h4 className="text-orange-400 font-medium">
                      {SCHEME_INFO[coach.schemePreferences.offense].name}
                    </h4>
                    <p className="text-gray-400 text-sm">Primary offensive system</p>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-gray-400 text-sm mb-2">Key Position Fits:</p>
                  <div className="flex flex-wrap gap-2">
                    {SCHEME_INFO[coach.schemePreferences.offense].positions.map((pos, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded text-sm"
                      >
                        {pos}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Defensive Scheme */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Defensive Scheme</h3>
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">🛡️</span>
                  <div>
                    <h4 className="text-blue-400 font-medium">
                      {SCHEME_INFO[coach.schemePreferences.defense].name}
                    </h4>
                    <p className="text-gray-400 text-sm">Primary defensive system</p>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-gray-400 text-sm mb-2">Key Position Fits:</p>
                  <div className="flex flex-wrap gap-2">
                    {SCHEME_INFO[coach.schemePreferences.defense].positions.map((pos, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-sm"
                      >
                        {pos}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Scheme Needs */}
            {schemeNeeds.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Current Scheme Needs</h3>
                <div className="space-y-2">
                  {schemeNeeds.map((need, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border flex items-center justify-between ${
                        need.priority === "critical"
                          ? "bg-red-500/10 border-red-500/30"
                          : need.priority === "high"
                          ? "bg-orange-500/10 border-orange-500/30"
                          : need.priority === "medium"
                          ? "bg-yellow-500/10 border-yellow-500/30"
                          : "bg-gray-800 border-gray-700"
                      }`}
                    >
                      <span className="text-white font-medium">{need.position}</span>
                      <span
                        className={`text-xs px-2 py-1 rounded uppercase font-medium ${
                          need.priority === "critical"
                            ? "bg-red-500/20 text-red-400"
                            : need.priority === "high"
                            ? "bg-orange-500/20 text-orange-400"
                            : need.priority === "medium"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-gray-700 text-gray-400"
                        }`}
                      >
                        {need.priority}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Roster Fit Analysis */}
            {rosterFits.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Current Roster Scheme Fits</h3>
                <div className="space-y-2">
                  {rosterFits.slice(0, 5).map((fit, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-gray-800 rounded-lg flex items-center justify-between"
                    >
                      <div>
                        <span className="text-white font-medium">{fit.player}</span>
                        <span className="text-gray-400 text-sm ml-2">({fit.position})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              fit.fitScore >= 80
                                ? "bg-green-500"
                                : fit.fitScore >= 60
                                ? "bg-yellow-500"
                                : "bg-red-500"
                            }`}
                            style={{ width: `${fit.fitScore}%` }}
                          />
                        </div>
                        <span
                          className={`text-sm font-medium ${
                            fit.fitScore >= 80
                              ? "text-green-400"
                              : fit.fitScore >= 60
                              ? "text-yellow-400"
                              : "text-red-400"
                          }`}
                        >
                          {fit.fitScore}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {onViewDepthChart && (
              <button
                onClick={onViewDepthChart}
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors border border-gray-700"
              >
                View Full Depth Chart
              </button>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-6">
            {/* Recent Reactions */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Recent Reactions</h3>
              {recentReactions.length > 0 ? (
                <div className="space-y-3">
                  {recentReactions.slice(0, 5).map((reaction, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border ${
                        reaction.relationshipChange > 5
                          ? "bg-green-500/10 border-green-500/30"
                          : reaction.relationshipChange < -5
                          ? "bg-red-500/10 border-red-500/30"
                          : "bg-gray-800 border-gray-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-white">{reaction.decision}</span>
                        <span
                          className={`text-sm ${
                            reaction.relationshipChange > 0 ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {reaction.relationshipChange > 0 ? "+" : ""}
                          {reaction.relationshipChange} trust
                        </span>
                      </div>
                      <p className="text-gray-300 italic">"{reaction.quote}"</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-2xl">
                          {reaction.emotion === "pleased"
                            ? "😊"
                            : reaction.emotion === "angry"
                            ? "😠"
                            : reaction.emotion === "neutral"
                            ? "😐"
                            : "😞"}
                        </span>
                        <span className="text-gray-400 text-sm capitalize">{reaction.emotion}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No recent reactions to display
                </div>
              )}
            </div>

            {/* Meeting Button */}
            {onMeetWithCoach && (
              <div className="pt-4">
                <button
                  onClick={onMeetWithCoach}
                  className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors"
                >
                  Meet with Coach
                </button>
                <p className="text-gray-500 text-sm text-center mt-2">
                  Discuss roster needs, scheme fits, and draft targets
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper functions
function calculateAlignment(coach: Coach): number {
  // Simplified alignment calculation based on trust and respect
  return Math.round((coach.metrics.trust + coach.metrics.respect) / 2);
}

// Sub-components
function MetricCard({
  label,
  value,
  color,
  description,
}: {
  label: string;
  value: number;
  color: "blue" | "purple" | "green" | "orange";
  description: string;
}) {
  const colorClasses = {
    blue: "text-blue-400",
    purple: "text-purple-400",
    green: "text-green-400",
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
      <p className="text-gray-500 text-xs mt-2">{description}</p>
    </div>
  );
}

function EffectCard({
  label,
  value,
  positive,
  description,
}: {
  label: string;
  value: string;
  positive: boolean;
  description: string;
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <span className="text-gray-300">{label}</span>
        <span className={`font-bold ${positive ? "text-green-400" : "text-red-400"}`}>
          {value}
        </span>
      </div>
      <p className="text-gray-500 text-xs mt-1">{description}</p>
    </div>
  );
}
