// @ts-nocheck
"use client";

import React, { useState } from "react";
import {
  Owner,
  Coach,
  ScoutRelationship,
  Recommendation,
  StakeholderReaction,
  Disagreement,
  DecisionOption,
} from "@/lib/relationships/relationship-types";
import RelationshipDashboard from "./RelationshipDashboard";
import OwnerOffice from "./OwnerOffice";
import CoachCorner from "./CoachCorner";
import DecisionCenter from "./DecisionCenter";
import ScoutRoom from "./ScoutRoom";

type HubView = "dashboard" | "owner" | "coach" | "scouts" | "decision";

interface RelationshipHubProps {
  // Core relationship data
  owner: Owner;
  coach: Coach;
  scouts: ScoutRelationship[];

  // Recommendations and reactions
  ownerRecommendations: Recommendation[];
  coachRecommendations: Recommendation[];
  scoutRecommendations: Recommendation[];
  ownerReactions: StakeholderReaction[];
  coachReactions: StakeholderReaction[];
  scoutReactions: StakeholderReaction[];

  // Current pending decision (if any)
  pendingDecision?: {
    type: "draft" | "trade" | "free_agent" | "contract" | "roster";
    description: string;
    options: DecisionOption[];
    disagreement?: Disagreement;
  };

  // Team context
  teamContext: {
    record: { wins: number; losses: number; ties: number };
    playoffAppearances: number;
    yearsAsGM: number;
    capSpace: number;
    rosterFits: { position: string; player: string; fitScore: number }[];
    schemeNeeds: { position: string; priority: "critical" | "high" | "medium" | "low" }[];
  };

  // Callbacks
  onMakeDecision?: (optionId: string) => void;
  onMeetWithOwner?: () => void;
  onMeetWithCoach?: () => void;
  onSelectScout?: (scoutId: string) => void;
  onAssignScout?: (scoutId: string, assignment: string) => void;
  onDevelopScout?: (scoutId: string) => void;
  onFireScout?: (scoutId: string) => void;
  onHireScout?: () => void;
  onViewDepthChart?: () => void;
}

export default function RelationshipHub({
  owner,
  coach,
  scouts,
  ownerRecommendations,
  coachRecommendations,
  scoutRecommendations,
  ownerReactions,
  coachReactions,
  scoutReactions,
  pendingDecision,
  teamContext,
  onMakeDecision,
  onMeetWithOwner,
  onMeetWithCoach,
  onSelectScout,
  onAssignScout,
  onDevelopScout,
  onFireScout,
  onHireScout,
  onViewDepthChart,
}: RelationshipHubProps) {
  const [currentView, setCurrentView] = useState<HubView>("dashboard");
  const [selectedScoutId, setSelectedScoutId] = useState<string | undefined>();

  // Aggregate all recommendations
  const allRecommendations = {
    owner: ownerRecommendations,
    coach: coachRecommendations,
    scouts: scoutRecommendations,
  };

  // Count pending recommendations
  const pendingCount = [
    ...ownerRecommendations,
    ...coachRecommendations,
    ...scoutRecommendations,
  ].filter((r) => r.status === "pending").length;

  // Navigation items
  const navItems: { id: HubView; label: string; icon: string; badge?: number }[] = [
    { id: "dashboard", label: "Overview", icon: "📊" },
    { id: "owner", label: "Owner's Office", icon: "🏛️" },
    { id: "coach", label: "Coach's Corner", icon: "🏈" },
    { id: "scouts", label: "Scout Room", icon: "🔍" },
    {
      id: "decision",
      label: "Decision Center",
      icon: "⚖️",
      badge: pendingDecision ? 1 : pendingCount > 0 ? pendingCount : undefined,
    },
  ];

  const handleScoutSelect = (scoutId: string) => {
    setSelectedScoutId(scoutId);
    onSelectScout?.(scoutId);
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header Navigation */}
      <div className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-xl font-bold text-white">Relationship Management</h1>

            {/* View Tabs */}
            <div className="flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors relative ${
                    currentView === item.id
                      ? "bg-gray-800 text-white"
                      : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                  }`}
                >
                  <span>{item.icon}</span>
                  <span className="hidden md:inline">{item.label}</span>
                  {item.badge && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Urgent Decision Alert */}
        {pendingDecision && currentView !== "decision" && (
          <div
            className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center justify-between cursor-pointer hover:bg-yellow-500/20 transition-colors"
            onClick={() => setCurrentView("decision")}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="text-yellow-400 font-medium">Pending Decision Required</h3>
                <p className="text-gray-400 text-sm">{pendingDecision.description}</p>
              </div>
            </div>
            <button className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors">
              Make Decision
            </button>
          </div>
        )}

        {/* View Content */}
        {currentView === "dashboard" && (
          <RelationshipDashboard
            owner={owner}
            coach={coach}
            scouts={scouts}
            recommendations={allRecommendations}
            recentDecisions={[
              ...ownerReactions.slice(0, 2),
              ...coachReactions.slice(0, 2),
              ...scoutReactions.slice(0, 2),
            ].slice(0, 5)}
            onViewOwner={() => setCurrentView("owner")}
            onViewCoach={() => setCurrentView("coach")}
            onViewScouts={() => setCurrentView("scouts")}
            onViewDecisions={() => setCurrentView("decision")}
          />
        )}

        {currentView === "owner" && (
          <OwnerOffice
            owner={owner}
            recentRecommendations={ownerRecommendations}
            recentReactions={ownerReactions}
            currentRecord={teamContext.record}
            playoffAppearances={teamContext.playoffAppearances}
            yearsAsGM={teamContext.yearsAsGM}
            onMeetWithOwner={onMeetWithOwner}
          />
        )}

        {currentView === "coach" && (
          <CoachCorner
            coach={coach}
            recentRecommendations={coachRecommendations}
            recentReactions={coachReactions}
            rosterFits={teamContext.rosterFits}
            schemeNeeds={teamContext.schemeNeeds}
            onMeetWithCoach={onMeetWithCoach}
            onViewDepthChart={onViewDepthChart}
          />
        )}

        {currentView === "scouts" && (
          <ScoutRoom
            scouts={scouts}
            selectedScoutId={selectedScoutId}
            recentRecommendations={scoutRecommendations}
            recentReactions={scoutReactions}
            onSelectScout={handleScoutSelect}
            onAssignScout={onAssignScout}
            onDevelopScout={onDevelopScout}
            onFireScout={onFireScout}
            onHireScout={onHireScout}
          />
        )}

        {currentView === "decision" && (
          <DecisionCenter
            decisionType={pendingDecision?.type || "draft"}
            decisionDescription={pendingDecision?.description || "No pending decisions"}
            options={pendingDecision?.options || []}
            disagreement={pendingDecision?.disagreement}
            onSelectOption={onMakeDecision || (() => {})}
          />
        )}
      </div>

      {/* Quick Stats Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 py-2 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Owner:</span>
              <span
                className={`font-medium ${
                  owner.metrics.trust >= 70
                    ? "text-green-400"
                    : owner.metrics.trust >= 40
                    ? "text-yellow-400"
                    : "text-red-400"
                }`}
              >
                {owner.metrics.trust}% Trust
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Coach:</span>
              <span
                className={`font-medium ${
                  coach.metrics.trust >= 70
                    ? "text-green-400"
                    : coach.metrics.trust >= 40
                    ? "text-yellow-400"
                    : "text-red-400"
                }`}
              >
                {coach.metrics.trust}% Trust
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Scouts:</span>
              <span
                className={`font-medium ${
                  scouts.reduce((sum, s) => sum + s.metrics.morale, 0) / scouts.length >= 70
                    ? "text-green-400"
                    : scouts.reduce((sum, s) => sum + s.metrics.morale, 0) / scouts.length >= 40
                    ? "text-yellow-400"
                    : "text-red-400"
                }`}
              >
                {Math.round(scouts.reduce((sum, s) => sum + s.metrics.morale, 0) / scouts.length)}%
                Morale
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Job Security:</span>
              <span
                className={`font-medium ${
                  owner.seatTemperature === "safe" || owner.seatTemperature === "stable"
                    ? "text-green-400"
                    : owner.seatTemperature === "lukewarm" || owner.seatTemperature === "warm"
                    ? "text-yellow-400"
                    : "text-red-400"
                }`}
              >
                {owner.seatTemperature.replace("_", " ")}
              </span>
            </div>
            <div className="text-gray-400">
              Cap: ${(teamContext.capSpace / 1000000).toFixed(1)}M
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
