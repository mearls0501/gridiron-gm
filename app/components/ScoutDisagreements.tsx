"use client";

import React, { useState, useMemo } from "react";
import {
  AlertTriangle,
  Users,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  X,
  Scale,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Clock,
  CheckCircle,
} from "lucide-react";

// Types
interface ScoutPersonality {
  type: "optimistic" | "pessimistic" | "cautious" | "bold" | "analytical" | "old_school";
  biasDirection: number;
  riskTolerance: number;
}

interface Scout {
  id: string;
  name: string;
  archetype: "evaluator" | "tape_grinder" | "character_coach" | "athletic_analyst";
  personality_type?: string;
  personality_bias?: number;
  personality_risk_tolerance?: number;
  avatar_seed?: string;
  region?: string;
}

interface ProspectBasic {
  id: string;
  full_name: string;
  position: string;
  college: string;
}

interface ScoutOpinion {
  scoutId: string;
  scoutName: string;
  archetype: string;
  personalityType: string;
  rating: number;
  headline: string;
  note: string;
  confidence: "high" | "medium" | "low";
}

interface Disagreement {
  id: string;
  prospect: ProspectBasic;
  scout1: ScoutOpinion;
  scout2: ScoutOpinion;
  disagreementLevel: "minor" | "major";
  ratingDifference: number;
  resolved: boolean;
  resolutionNotes?: string;
  createdAt: string;
}

// Helper to get personality color
function getPersonalityColor(type: string): string {
  const colors: Record<string, string> = {
    optimistic: "text-green-600",
    pessimistic: "text-red-600",
    cautious: "text-amber-600",
    bold: "text-purple-600",
    analytical: "text-blue-600",
    old_school: "text-stone-600",
  };
  return colors[type] || "text-gray-600";
}

// Helper to get personality icon
function getPersonalityIndicator(type: string): React.ReactNode {
  switch (type) {
    case "optimistic":
      return <TrendingUp className="w-4 h-4 text-green-600" />;
    case "pessimistic":
      return <TrendingDown className="w-4 h-4 text-red-600" />;
    case "cautious":
      return <Minus className="w-4 h-4 text-amber-600" />;
    case "bold":
      return <TrendingUp className="w-4 h-4 text-purple-600" />;
    case "analytical":
      return <Scale className="w-4 h-4 text-blue-600" />;
    case "old_school":
      return <Eye className="w-4 h-4 text-stone-600" />;
    default:
      return null;
  }
}

// Single Disagreement Card
function DisagreementCard({
  disagreement,
  onResolve,
  onViewProspect,
  expanded,
  onToggleExpand,
}: {
  disagreement: Disagreement;
  onResolve?: (id: string, notes: string) => void;
  onViewProspect?: (prospectId: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [showResolveForm, setShowResolveForm] = useState(false);

  const { scout1, scout2, prospect, disagreementLevel, ratingDifference } = disagreement;

  // Who's higher?
  const higherScout = scout1.rating > scout2.rating ? scout1 : scout2;
  const lowerScout = scout1.rating > scout2.rating ? scout2 : scout1;

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-all ${
        disagreementLevel === "major"
          ? "border-red-300 bg-red-50/50"
          : "border-amber-300 bg-amber-50/50"
      }`}
    >
      {/* Header */}
      <div
        className="p-4 cursor-pointer hover:bg-white/50 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-full ${
                disagreementLevel === "major" ? "bg-red-100" : "bg-amber-100"
              }`}
            >
              <AlertTriangle
                className={`w-5 h-5 ${
                  disagreementLevel === "major" ? "text-red-600" : "text-amber-600"
                }`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">
                  {prospect.full_name}
                </span>
                <span className="text-sm text-gray-500">
                  {prospect.position} - {prospect.college}
                </span>
                {disagreement.resolved && (
                  <span className="flex items-center gap-1 text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                    <CheckCircle className="w-3 h-3" />
                    Resolved
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                <span className={getPersonalityColor(scout1.personalityType)}>
                  {scout1.scoutName}
                </span>
                {" vs "}
                <span className={getPersonalityColor(scout2.personalityType)}>
                  {scout2.scoutName}
                </span>
                <span className="mx-2">|</span>
                <span
                  className={`font-medium ${
                    disagreementLevel === "major" ? "text-red-600" : "text-amber-600"
                  }`}
                >
                  {ratingDifference} point difference
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${
                disagreementLevel === "major"
                  ? "bg-red-200 text-red-800"
                  : "bg-amber-200 text-amber-800"
              }`}
            >
              {disagreementLevel === "major" ? "Major" : "Minor"} Disagreement
            </span>
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
        <div className="border-t px-4 py-4 bg-white">
          {/* Side-by-side opinions */}
          <div className="grid grid-cols-2 gap-4">
            {/* Higher Rating Scout */}
            <div className="border rounded-lg p-4 bg-green-50/50 border-green-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ThumbsUp className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-gray-900">{higherScout.scoutName}</span>
                </div>
                <div className="flex items-center gap-1">
                  {getPersonalityIndicator(higherScout.personalityType)}
                  <span className={`text-xs ${getPersonalityColor(higherScout.personalityType)}`}>
                    {higherScout.personalityType}
                  </span>
                </div>
              </div>
              <div className="text-2xl font-bold text-green-700 mb-2">
                {higherScout.rating}
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({higherScout.archetype})
                </span>
              </div>
              <div className="font-medium text-gray-800 mb-2">"{higherScout.headline}"</div>
              <p className="text-sm text-gray-600 italic">"{higherScout.note}"</p>
              <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                Confidence:{" "}
                <span
                  className={`font-medium ${
                    higherScout.confidence === "high"
                      ? "text-green-600"
                      : higherScout.confidence === "medium"
                        ? "text-amber-600"
                        : "text-gray-500"
                  }`}
                >
                  {higherScout.confidence}
                </span>
              </div>
            </div>

            {/* Lower Rating Scout */}
            <div className="border rounded-lg p-4 bg-red-50/50 border-red-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ThumbsDown className="w-4 h-4 text-red-600" />
                  <span className="font-medium text-gray-900">{lowerScout.scoutName}</span>
                </div>
                <div className="flex items-center gap-1">
                  {getPersonalityIndicator(lowerScout.personalityType)}
                  <span className={`text-xs ${getPersonalityColor(lowerScout.personalityType)}`}>
                    {lowerScout.personalityType}
                  </span>
                </div>
              </div>
              <div className="text-2xl font-bold text-red-700 mb-2">
                {lowerScout.rating}
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({lowerScout.archetype})
                </span>
              </div>
              <div className="font-medium text-gray-800 mb-2">"{lowerScout.headline}"</div>
              <p className="text-sm text-gray-600 italic">"{lowerScout.note}"</p>
              <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                Confidence:{" "}
                <span
                  className={`font-medium ${
                    lowerScout.confidence === "high"
                      ? "text-green-600"
                      : lowerScout.confidence === "medium"
                        ? "text-amber-600"
                        : "text-gray-500"
                  }`}
                >
                  {lowerScout.confidence}
                </span>
              </div>
            </div>
          </div>

          {/* Resolution Notes */}
          {disagreement.resolved && disagreement.resolutionNotes && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium text-green-800 mb-1">
                <CheckCircle className="w-4 h-4" />
                Resolution Notes
              </div>
              <p className="text-sm text-green-700">{disagreement.resolutionNotes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <button
              onClick={() => onViewProspect?.(prospect.id)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              <Eye className="w-4 h-4" />
              View Prospect
            </button>

            {!disagreement.resolved && (
              <div>
                {showResolveForm ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      placeholder="Resolution notes..."
                      className="px-3 py-2 text-sm border rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => {
                        onResolve?.(disagreement.id, resolutionNotes);
                        setShowResolveForm(false);
                        setResolutionNotes("");
                      }}
                      className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    >
                      Resolve
                    </button>
                    <button
                      onClick={() => setShowResolveForm(false)}
                      className="p-2 text-gray-500 hover:text-gray-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowResolveForm(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Mark Resolved
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Main Component
interface ScoutDisagreementsProps {
  disagreements: Disagreement[];
  onResolve?: (id: string, notes: string) => void;
  onViewProspect?: (prospectId: string) => void;
  onDismissAll?: () => void;
  compact?: boolean;
}

export function ScoutDisagreements({
  disagreements,
  onResolve,
  onViewProspect,
  onDismissAll,
  compact = false,
}: ScoutDisagreementsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "major" | "minor" | "unresolved">("unresolved");

  const filteredDisagreements = useMemo(() => {
    return disagreements.filter((d) => {
      if (filter === "unresolved") return !d.resolved;
      if (filter === "major") return d.disagreementLevel === "major";
      if (filter === "minor") return d.disagreementLevel === "minor";
      return true;
    });
  }, [disagreements, filter]);

  const majorCount = disagreements.filter(
    (d) => d.disagreementLevel === "major" && !d.resolved
  ).length;
  const minorCount = disagreements.filter(
    (d) => d.disagreementLevel === "minor" && !d.resolved
  ).length;
  const unresolvedCount = disagreements.filter((d) => !d.resolved).length;

  if (compact) {
    // Compact notification banner
    if (unresolvedCount === 0) return null;

    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-full">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="font-medium text-amber-900">
                {unresolvedCount} Scout Disagreement{unresolvedCount !== 1 ? "s" : ""}
              </div>
              <div className="text-sm text-amber-700">
                {majorCount > 0 && (
                  <span className="text-red-600 font-medium">{majorCount} major</span>
                )}
                {majorCount > 0 && minorCount > 0 && ", "}
                {minorCount > 0 && <span>{minorCount} minor</span>}
              </div>
            </div>
          </div>
          <button
            onClick={onDismissAll}
            className="text-amber-700 hover:text-amber-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border">
      {/* Header */}
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 rounded-xl">
              <Users className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Scout Disagreements</h2>
              <p className="text-sm text-gray-500">
                Review conflicting opinions from your scouting staff
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {majorCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                <AlertTriangle className="w-4 h-4" />
                {majorCount} Major
              </div>
            )}
            {minorCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
                <MessageSquare className="w-4 h-4" />
                {minorCount} Minor
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mt-4">
          {(["all", "unresolved", "major", "minor"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === "unresolved" && unresolvedCount > 0 && (
                <span className="ml-1">({unresolvedCount})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Disagreements List */}
      <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
        {filteredDisagreements.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
            <p className="text-lg font-medium">No disagreements to review</p>
            <p className="text-sm">Your scouts are in agreement</p>
          </div>
        ) : (
          filteredDisagreements.map((disagreement) => (
            <DisagreementCard
              key={disagreement.id}
              disagreement={disagreement}
              onResolve={onResolve}
              onViewProspect={onViewProspect}
              expanded={expandedId === disagreement.id}
              onToggleExpand={() =>
                setExpandedId(expandedId === disagreement.id ? null : disagreement.id)
              }
            />
          ))
        )}
      </div>

      {/* Footer */}
      {filteredDisagreements.length > 0 && (
        <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {filteredDisagreements.length} of {disagreements.length} disagreements
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Clock className="w-4 h-4" />
            Updated live as scouts report
          </div>
        </div>
      )}
    </div>
  );
}

// Export types for API usage
export type { Disagreement, ScoutOpinion };
