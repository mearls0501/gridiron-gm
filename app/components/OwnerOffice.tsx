// @ts-nocheck
"use client";

import React, { useState } from "react";
import {
  Owner,
  OwnerType,
  Recommendation,
  StakeholderReaction,
  SeatTemperature,
} from "@/lib/relationships/relationship-types";
import { calculateOwnerEffects, OwnerRelationshipEffects } from "@/lib/relationships/relationship-effects";

// Owner type descriptions
const OWNER_TYPE_INFO: Record<OwnerType, { name: string; description: string; icon: string }> = {
  win_now: {
    name: "Win Now",
    description: "Demands immediate results. Will spend big but expects playoffs every year.",
    icon: "🏆",
  },
  patient_builder: {
    name: "Patient Builder",
    description: "Understands rebuilding takes time. Values long-term planning over quick fixes.",
    icon: "🏗️",
  },
  meddler: {
    name: "The Meddler",
    description: "Wants input on every decision. May override your choices or push pet projects.",
    icon: "👀",
  },
  hands_off: {
    name: "Hands Off",
    description: "Trusts you completely. Rarely interferes but still expects results.",
    icon: "🙌",
  },
  penny_pincher: {
    name: "Penny Pincher",
    description: "Obsessed with cutting costs. Hates big contracts and wants cap flexibility.",
    icon: "💰",
  },
  big_spender: {
    name: "Big Spender",
    description: "Loves splashy signings and star players. Will always push to spend more.",
    icon: "💎",
  },
  legacy_obsessed: {
    name: "Legacy Builder",
    description: "Wants to build a dynasty. Values franchise players and long-term success.",
    icon: "👑",
  },
  new_money: {
    name: "New Money",
    description: "Recently wealthy and eager to prove themselves. May be impulsive or image-conscious.",
    icon: "🌟",
  },
  family_tradition: {
    name: "Family Tradition",
    description: "Third generation owner. Values tradition and loyalty to franchise history.",
    icon: "📜",
  },
};

const SEAT_TEMPERATURE_STYLES: Record<SeatTemperature, { bg: string; text: string; label: string }> = {
  safe: { bg: "bg-green-500/20", text: "text-green-400", label: "Job Secure" },
  stable: { bg: "bg-green-500/10", text: "text-green-300", label: "Stable" },
  lukewarm: { bg: "bg-yellow-500/10", text: "text-yellow-300", label: "Lukewarm" },
  warm: { bg: "bg-orange-500/20", text: "text-orange-400", label: "Getting Warm" },
  hot: { bg: "bg-red-500/20", text: "text-red-400", label: "Hot Seat" },
  ejection_seat: { bg: "bg-red-600/30", text: "text-red-500", label: "Ejection Seat" },
};

interface OwnerOfficeProps {
  owner: Owner;
  recentRecommendations: Recommendation[];
  recentReactions: StakeholderReaction[];
  currentRecord: { wins: number; losses: number; ties: number };
  playoffAppearances: number;
  yearsAsGM: number;
  onMeetWithOwner?: () => void;
}

export default function OwnerOffice({
  owner,
  recentRecommendations,
  recentReactions,
  currentRecord,
  playoffAppearances,
  yearsAsGM,
  onMeetWithOwner,
}: OwnerOfficeProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "expectations">("overview");

  const ownerInfo = OWNER_TYPE_INFO[owner.type];
  const seatStyle = SEAT_TEMPERATURE_STYLES[owner.seatTemperature];
  const effects = calculateOwnerEffects(owner);

  const winPercentage = currentRecord.wins + currentRecord.losses + currentRecord.ties > 0
    ? ((currentRecord.wins + currentRecord.ties * 0.5) / (currentRecord.wins + currentRecord.losses + currentRecord.ties) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 p-6 border-b border-gray-700">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-gray-800 rounded-lg flex items-center justify-center text-4xl">
              {ownerInfo.icon}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{owner.name}</h2>
              <p className="text-indigo-300">{ownerInfo.name} Owner</p>
              <p className="text-gray-400 text-sm mt-1">{ownerInfo.description}</p>
            </div>
          </div>

          {/* Job Security */}
          <div className={`px-4 py-2 rounded-lg ${seatStyle.bg}`}>
            <div className={`text-sm font-medium ${seatStyle.text}`}>{seatStyle.label}</div>
            <div className="flex items-center gap-1 mt-1">
              {["safe", "stable", "lukewarm", "warm", "hot", "ejection_seat"].map((temp, idx) => {
                const isActive = ["safe", "stable", "lukewarm", "warm", "hot", "ejection_seat"].indexOf(owner.seatTemperature) >= idx;
                return (
                  <div
                    key={temp}
                    className={`w-2 h-4 rounded-sm ${
                      isActive
                        ? idx < 2 ? "bg-green-500" : idx < 4 ? "bg-yellow-500" : "bg-red-500"
                        : "bg-gray-700"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Relationship Metrics */}
      <div className="grid grid-cols-4 gap-4 p-4 border-b border-gray-700 bg-gray-800/50">
        <MetricCard
          label="Trust"
          value={owner.metrics.trust}
          color="blue"
          description="How much the owner trusts your decisions"
        />
        <MetricCard
          label="Satisfaction"
          value={owner.metrics.satisfaction}
          color="green"
          description="Overall happiness with team performance"
        />
        <MetricCard
          label="Patience"
          value={owner.patience}
          color="yellow"
          description="Willingness to wait for results"
        />
        <MetricCard
          label="Meddling"
          value={owner.meddlesomeness}
          color="red"
          description="Tendency to interfere with decisions"
          inverted
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-700">
        <div className="flex">
          {(["overview", "history", "expectations"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "text-indigo-400 border-b-2 border-indigo-400 bg-gray-800/50"
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
              <h3 className="text-lg font-semibold text-white mb-4">Current Effects on Team</h3>
              <div className="grid grid-cols-2 gap-4">
                <EffectCard
                  label="Budget Modifier"
                  value={`${effects.budgetModifier > 0 ? "+" : ""}${(effects.budgetModifier * 100).toFixed(0)}%`}
                  positive={effects.budgetModifier >= 0}
                  description="Affects available budget for signings"
                />
                <EffectCard
                  label="FA Interest"
                  value={`${effects.freeAgentInterestModifier > 0 ? "+" : ""}${(effects.freeAgentInterestModifier * 100).toFixed(0)}%`}
                  positive={effects.freeAgentInterestModifier >= 0}
                  description="Free agent willingness to sign"
                />
                <EffectCard
                  label="Trade Difficulty"
                  value={`${effects.tradeDifficultyModifier > 0 ? "+" : ""}${(effects.tradeDifficultyModifier * 100).toFixed(0)}%`}
                  positive={effects.tradeDifficultyModifier <= 0}
                  description="Difficulty negotiating trades"
                />
                <EffectCard
                  label="Scout Morale"
                  value={`${effects.scoutMoraleModifier > 0 ? "+" : ""}${(effects.scoutMoraleModifier * 100).toFixed(0)}%`}
                  positive={effects.scoutMoraleModifier >= 0}
                  description="Staff morale and productivity"
                />
              </div>
            </div>

            {/* Priorities */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Owner Priorities</h3>
              <div className="flex flex-wrap gap-2">
                {owner.priorities.map((priority, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-sm"
                  >
                    {priority.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>

            {/* Pet Peeves */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Pet Peeves</h3>
              <div className="flex flex-wrap gap-2">
                {owner.petPeeves.map((peeve, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-red-500/20 text-red-300 rounded-full text-sm"
                  >
                    {peeve.replace(/_/g, " ")}
                  </span>
                ))}
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

        {activeTab === "history" && (
          <div className="space-y-6">
            {/* Your Tenure Stats */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Your Tenure</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-800 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-white">{yearsAsGM}</div>
                  <div className="text-gray-400 text-sm">Years as GM</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-white">
                    {currentRecord.wins}-{currentRecord.losses}
                    {currentRecord.ties > 0 && `-${currentRecord.ties}`}
                  </div>
                  <div className="text-gray-400 text-sm">Overall Record ({winPercentage}%)</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-white">{playoffAppearances}</div>
                  <div className="text-gray-400 text-sm">Playoff Appearances</div>
                </div>
              </div>
            </div>

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
                          {reaction.relationshipChange} relationship
                        </span>
                      </div>
                      <p className="text-gray-300 italic">"{reaction.quote}"</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-2xl">{reaction.emotion === "pleased" ? "😊" : reaction.emotion === "angry" ? "😠" : reaction.emotion === "neutral" ? "😐" : "😞"}</span>
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
          </div>
        )}

        {activeTab === "expectations" && (
          <div className="space-y-6">
            {/* Expectations */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Current Expectations</h3>
              <div className="bg-gray-800 rounded-lg p-4 space-y-4">
                <ExpectationItem
                  label="Win Expectations"
                  value={owner.expectations.winsExpected}
                  max={17}
                  description="Minimum wins expected this season"
                />
                <ExpectationItem
                  label="Playoff Expectations"
                  value={owner.expectations.playoffsExpected ? 1 : 0}
                  max={1}
                  description={owner.expectations.playoffsExpected ? "Expects playoff appearance" : "Playoffs not required"}
                  boolean
                />
                <ExpectationItem
                  label="Budget Preference"
                  value={owner.expectations.budgetPreference === "aggressive" ? 3 : owner.expectations.budgetPreference === "moderate" ? 2 : 1}
                  max={3}
                  description={`Prefers ${owner.expectations.budgetPreference} spending`}
                />
                <ExpectationItem
                  label="Rebuild Timeline"
                  value={owner.expectations.rebuildTolerance}
                  max={5}
                  description={`Will wait ${owner.expectations.rebuildTolerance} years for rebuild`}
                />
              </div>
            </div>

            {/* Forced Actions */}
            {effects.forcedActions.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Mandatory Actions</h3>
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <p className="text-red-400 text-sm mb-3">
                    The owner is requiring you to take these actions:
                  </p>
                  <ul className="space-y-2">
                    {effects.forcedActions.map((action, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-white">
                        <span className="text-red-400">•</span>
                        {action}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Blocked Actions */}
            {effects.blockedActions.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Prohibited Actions</h3>
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <p className="text-yellow-400 text-sm mb-3">
                    The owner will not allow these actions:
                  </p>
                  <ul className="space-y-2">
                    {effects.blockedActions.map((action, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-white">
                        <span className="text-yellow-400">✗</span>
                        {action}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Meeting Button */}
            {onMeetWithOwner && (
              <div className="pt-4">
                <button
                  onClick={onMeetWithOwner}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
                >
                  Request Meeting with Owner
                </button>
                <p className="text-gray-500 text-sm text-center mt-2">
                  Discuss expectations, negotiate budget, or defend your decisions
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Sub-components
function MetricCard({
  label,
  value,
  color,
  description,
  inverted = false,
}: {
  label: string;
  value: number;
  color: "blue" | "green" | "yellow" | "red";
  description: string;
  inverted?: boolean;
}) {
  const colorClasses = {
    blue: "text-blue-400",
    green: "text-green-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
  };

  const effectiveValue = inverted ? 100 - value : value;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-sm">{label}</span>
        <span className={`font-bold ${colorClasses[color]}`}>{value}</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${
            effectiveValue >= 70
              ? "bg-green-500"
              : effectiveValue >= 40
              ? "bg-yellow-500"
              : "bg-red-500"
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

function ExpectationItem({
  label,
  value,
  max,
  description,
  boolean = false,
}: {
  label: string;
  value: number;
  max: number;
  description: string;
  boolean?: boolean;
}) {
  const percentage = (value / max) * 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="text-white font-medium">
          {boolean ? (value ? "Yes" : "No") : `${value}/${max}`}
        </span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-gray-500 text-xs mt-1">{description}</p>
    </div>
  );
}
