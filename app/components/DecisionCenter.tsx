"use client";

import React, { useState, useMemo } from "react";
import {
  Users,
  Briefcase,
  ClipboardList,
  Scale,
  AlertTriangle,
  CheckCircle,
  XCircle,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  Zap,
  Target,
  TrendingUp,
  TrendingDown,
  Clock,
  Shield,
  Award,
} from "lucide-react";
import {
  Recommendation,
  RecommendationSource,
  Disagreement,
  StakeholderReaction,
} from "@/lib/relationships/relationship-types";

// =============================================================================
// RECOMMENDATION CARD
// =============================================================================

interface RecommendationCardProps {
  recommendation: Recommendation;
  isSelected?: boolean;
  onSelect?: () => void;
  showFullDetails?: boolean;
}

function RecommendationCard({
  recommendation: rec,
  isSelected = false,
  onSelect,
  showFullDetails = false,
}: RecommendationCardProps) {
  const getSourceConfig = (source: RecommendationSource) => {
    switch (source) {
      case "owner":
        return { icon: Briefcase, color: "amber", label: "Owner" };
      case "coach":
        return { icon: ClipboardList, color: "blue", label: "Coach" };
      case "scout":
        return { icon: Users, color: "green", label: "Scout" };
      default:
        return { icon: MessageSquare, color: "gray", label: "Other" };
    }
  };

  const config = getSourceConfig(rec.source);
  const Icon = config.icon;

  const confidenceColor =
    rec.confidence >= 80 ? "text-green-600" :
    rec.confidence >= 60 ? "text-blue-600" :
    rec.confidence >= 40 ? "text-amber-600" : "text-gray-500";

  return (
    <div
      className={`bg-white rounded-xl border-2 p-4 transition-all cursor-pointer ${
        isSelected
          ? `border-${config.color}-500 ring-2 ring-${config.color}-200`
          : "border-gray-200 hover:border-gray-300"
      }`}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full bg-${config.color}-100 text-${config.color}-600 flex items-center justify-center`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-gray-900">{rec.sourceName}</div>
            <div className="text-xs text-gray-500">{config.label}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold ${confidenceColor}`}>{rec.confidence}%</div>
          <div className="text-xs text-gray-500">confidence</div>
        </div>
      </div>

      {/* Recommendation */}
      <div className="mb-3">
        <div className="text-sm font-medium text-gray-900 mb-1">
          {rec.action.description}
        </div>
        {rec.action.playerName && (
          <div className="text-xs text-gray-500">
            {rec.action.position} • {rec.action.playerName}
          </div>
        )}
        {rec.action.prospectName && (
          <div className="text-xs text-gray-500">
            {rec.action.position} • {rec.action.prospectName}
          </div>
        )}
      </div>

      {/* Reasoning */}
      <div className="p-3 bg-gray-50 rounded-lg mb-3">
        <div className="text-sm text-gray-600 italic">"{rec.reasoning}"</div>
      </div>

      {/* Full Details */}
      {showFullDetails && (
        <>
          {/* Risks */}
          {rec.risks && rec.risks.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-medium text-gray-500 mb-1">Risks</div>
              <div className="space-y-1">
                {rec.risks.map((risk, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-red-600">
                    <AlertTriangle className="w-3 h-3" />
                    {risk}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upside */}
          {rec.upside && rec.upside.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-medium text-gray-500 mb-1">Upside</div>
              <div className="space-y-1">
                {rec.upside.map((up, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-green-600">
                    <TrendingUp className="w-3 h-3" />
                    {up}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Selection indicator */}
      {isSelected && (
        <div className={`flex items-center justify-center gap-2 py-2 bg-${config.color}-100 text-${config.color}-700 rounded-lg text-sm font-medium`}>
          <CheckCircle className="w-4 h-4" />
          Selected
        </div>
      )}
    </div>
  );
}

// =============================================================================
// IMPACT PREVIEW
// =============================================================================

interface ImpactPreviewProps {
  selectedOption: string | null;
  recommendations: Recommendation[];
  onImpactCalculated?: (impacts: PredictedImpact[]) => void;
}

interface PredictedImpact {
  source: RecommendationSource;
  sourceName: string;
  agreedWith: boolean;
  trustChange: number;
  respectChange: number;
  message: string;
}

function ImpactPreview({ selectedOption, recommendations }: ImpactPreviewProps) {
  const impacts = useMemo(() => {
    if (!selectedOption) return [];

    return recommendations.map(rec => {
      const agreed = rec.action.prospectId === selectedOption ||
                    rec.action.playerId === selectedOption ||
                    rec.action.description === selectedOption;

      let trustChange = 0;
      let respectChange = 0;
      let message = "";

      if (agreed) {
        trustChange = Math.round(rec.confidence / 20);
        respectChange = Math.round(rec.confidence / 25);
        message = "Will be pleased with this decision";
      } else {
        trustChange = -Math.round(rec.confidence / 15);
        respectChange = -Math.round(rec.confidence / 20);

        if (rec.confidence >= 80) {
          message = "Will be very disappointed";
        } else if (rec.confidence >= 60) {
          message = "May question this decision";
        } else {
          message = "Will accept the decision";
        }
      }

      return {
        source: rec.source,
        sourceName: rec.sourceName,
        agreedWith: agreed,
        trustChange,
        respectChange,
        message,
      };
    });
  }, [selectedOption, recommendations]);

  if (!selectedOption) {
    return (
      <div className="bg-gray-50 rounded-xl p-6 text-center">
        <HelpCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <div className="text-gray-600">Select an option to see relationship impacts</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50">
        <div className="font-bold text-gray-900">Relationship Impact Preview</div>
        <div className="text-sm text-gray-500">How this decision will affect your relationships</div>
      </div>

      <div className="divide-y divide-gray-100">
        {impacts.map((impact, i) => (
          <div key={i} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {impact.agreedWith ? (
                  <ThumbsUp className="w-5 h-5 text-green-600" />
                ) : (
                  <ThumbsDown className="w-5 h-5 text-red-600" />
                )}
                <span className="font-medium text-gray-900">{impact.sourceName}</span>
              </div>
              <span className={`text-sm font-medium ${impact.agreedWith ? "text-green-600" : "text-red-600"}`}>
                {impact.agreedWith ? "Agrees" : "Disagrees"}
              </span>
            </div>

            <div className="text-sm text-gray-600 mb-2">{impact.message}</div>

            <div className="flex gap-4">
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Trust:</span>
                <span className={`text-xs font-medium ${impact.trustChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {impact.trustChange >= 0 ? "+" : ""}{impact.trustChange}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Respect:</span>
                <span className={`text-xs font-medium ${impact.respectChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {impact.respectChange >= 0 ? "+" : ""}{impact.respectChange}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Warning if going against strong opinions */}
      {impacts.some(i => !i.agreedWith && i.trustChange <= -4) && (
        <div className="p-4 bg-amber-50 border-t border-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-700">
              <span className="font-medium">Warning:</span> This decision goes against strong recommendations.
              Consider if you're confident this is the right call.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// DECISION OPTIONS
// =============================================================================

interface DecisionOption {
  id: string;
  label: string;
  description?: string;
  prospectId?: string;
  playerId?: string;
  supportedBy: string[];
  opposedBy: string[];
}

interface DecisionOptionsProps {
  options: DecisionOption[];
  selectedOption: string | null;
  onSelect: (optionId: string) => void;
}

function DecisionOptions({ options, selectedOption, onSelect }: DecisionOptionsProps) {
  return (
    <div className="space-y-3">
      {options.map((option) => (
        <div
          key={option.id}
          className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
            selectedOption === option.id
              ? "border-blue-500 bg-blue-50"
              : "border-gray-200 hover:border-gray-300 bg-white"
          }`}
          onClick={() => onSelect(option.id)}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">{option.label}</div>
              {option.description && (
                <div className="text-sm text-gray-500">{option.description}</div>
              )}
            </div>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
              selectedOption === option.id
                ? "border-blue-500 bg-blue-500"
                : "border-gray-300"
            }`}>
              {selectedOption === option.id && (
                <CheckCircle className="w-4 h-4 text-white" />
              )}
            </div>
          </div>

          {/* Support indicators */}
          <div className="flex gap-4 mt-2">
            {option.supportedBy.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <ThumbsUp className="w-3 h-3" />
                {option.supportedBy.join(", ")}
              </div>
            )}
            {option.opposedBy.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-red-600">
                <ThumbsDown className="w-3 h-3" />
                {option.opposedBy.join(", ")}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// MAIN DECISION CENTER
// =============================================================================

interface DecisionCenterProps {
  title: string;
  subtitle?: string;
  decisionType: "draft" | "free_agency" | "trade" | "contract" | "other";
  options: DecisionOption[];
  recommendations: Recommendation[];
  disagreement?: Disagreement | null;
  deadline?: Date;
  onMakeDecision: (optionId: string, notes?: string) => void;
  onCancel?: () => void;
}

export function DecisionCenter({
  title,
  subtitle,
  decisionType,
  options,
  recommendations,
  disagreement,
  deadline,
  onMakeDecision,
  onCancel,
}: DecisionCenterProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);

  // Find consensus (if any)
  const consensus = useMemo(() => {
    const optionVotes = new Map<string, number>();

    for (const rec of recommendations) {
      const optionId = rec.action.prospectId || rec.action.playerId || rec.action.description;
      optionVotes.set(optionId, (optionVotes.get(optionId) || 0) + 1);
    }

    let maxVotes = 0;
    let consensusOption: string | null = null;

    for (const [optionId, votes] of optionVotes) {
      if (votes > maxVotes && votes >= recommendations.length / 2) {
        maxVotes = votes;
        consensusOption = optionId;
      }
    }

    return consensusOption;
  }, [recommendations]);

  const handleConfirm = () => {
    if (selectedOption) {
      onMakeDecision(selectedOption, notes || undefined);
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
              {subtitle && <p className="text-gray-500">{subtitle}</p>}
            </div>
            {deadline && (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-lg">
                <Clock className="w-5 h-5" />
                <span className="font-medium">
                  Decide by: {deadline.toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Disagreement Warning */}
        {disagreement && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
              <div>
                <div className="font-bold text-amber-900">Stakeholder Disagreement</div>
                <div className="text-sm text-amber-700 mt-1">
                  Your team has different opinions on this decision.
                  {disagreement.importance === "major" && " This is a major decision that will be remembered."}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {disagreement.parties.map((party, i) => (
                    <span key={i} className="px-2 py-1 bg-white text-amber-800 rounded text-xs">
                      {party.sourceName}: {party.position}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Consensus Badge */}
        {consensus && !disagreement && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <div className="font-bold text-green-900">Consensus Recommendation</div>
                <div className="text-sm text-green-700">
                  Your team agrees on this decision
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Options */}
          <div className="lg:col-span-2 space-y-6">
            {/* Decision Options */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Your Options</h2>
              <DecisionOptions
                options={options}
                selectedOption={selectedOption}
                onSelect={setSelectedOption}
              />
            </div>

            {/* Recommendations */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Recommendations</h2>
                {recommendations.length > 3 && (
                  <button
                    onClick={() => setShowAllRecommendations(!showAllRecommendations)}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    {showAllRecommendations ? "Show less" : `Show all ${recommendations.length}`}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(showAllRecommendations ? recommendations : recommendations.slice(0, 4)).map((rec) => (
                  <RecommendationCard
                    key={rec.id}
                    recommendation={rec}
                    isSelected={
                      selectedOption === rec.action.prospectId ||
                      selectedOption === rec.action.playerId ||
                      selectedOption === rec.action.description
                    }
                    onSelect={() => {
                      const optionId = rec.action.prospectId || rec.action.playerId || rec.action.description;
                      setSelectedOption(optionId);
                    }}
                    showFullDetails={showAllRecommendations}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Impact & Actions */}
          <div className="space-y-6">
            {/* Impact Preview */}
            <ImpactPreview
              selectedOption={selectedOption}
              recommendations={recommendations}
            />

            {/* Notes */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Decision Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Record your reasoning for this decision..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none h-24 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleConfirm}
                disabled={!selectedOption}
                className={`w-full py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                  selectedOption
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                <CheckCircle className="w-5 h-5" />
                Confirm Decision
              </button>

              {onCancel && (
                <button
                  onClick={onCancel}
                  className="w-full py-3 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Tip */}
            <div className="p-4 bg-blue-50 rounded-xl">
              <div className="flex items-start gap-2">
                <Zap className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-700">
                  <span className="font-medium">Tip:</span> Building trust means listening to your team,
                  but also showing conviction when you disagree. They'll respect you more if you're
                  right—and they'll remember if you're wrong.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DecisionCenter;
