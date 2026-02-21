"use client";

import React, { useState } from "react";
import {
  Users,
  Briefcase,
  ClipboardList,
  Shield,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  Clock,
  Star,
  Zap,
  Heart,
  ThumbsUp,
  ThumbsDown,
  Eye,
  AlertCircle,
  Award,
  Target,
} from "lucide-react";
import {
  Owner,
  Coach,
  ScoutRelationship,
  Recommendation,
  Disagreement,
  JobSecurityStatus,
  SeatTemperature,
} from "@/lib/relationships/relationship-types";

// =============================================================================
// RELATIONSHIP METER COMPONENT
// =============================================================================

interface RelationshipMeterProps {
  label: string;
  value: number;
  previousValue?: number;
  showTrend?: boolean;
  colorScheme?: "trust" | "satisfaction" | "morale" | "neutral";
}

function RelationshipMeter({
  label,
  value,
  previousValue,
  showTrend = true,
  colorScheme = "neutral",
}: RelationshipMeterProps) {
  const trend = previousValue !== undefined ? value - previousValue : 0;

  const getColor = (v: number) => {
    if (v >= 80) return "bg-green-500";
    if (v >= 60) return "bg-blue-500";
    if (v >= 40) return "bg-amber-500";
    if (v >= 20) return "bg-orange-500";
    return "bg-red-500";
  };

  const getBgColor = (v: number) => {
    if (v >= 80) return "bg-green-100";
    if (v >= 60) return "bg-blue-100";
    if (v >= 40) return "bg-amber-100";
    if (v >= 20) return "bg-orange-100";
    return "bg-red-100";
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <div className="flex items-center gap-2">
          <span className="font-medium">{value}</span>
          {showTrend && trend !== 0 && (
            <span className={`text-xs flex items-center ${trend > 0 ? "text-green-600" : "text-red-600"}`}>
              {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(trend)}
            </span>
          )}
        </div>
      </div>
      <div className={`h-2 ${getBgColor(value)} rounded-full overflow-hidden`}>
        <div
          className={`h-full ${getColor(value)} transition-all duration-500`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// JOB SECURITY INDICATOR
// =============================================================================

interface JobSecurityIndicatorProps {
  status: JobSecurityStatus;
}

function JobSecurityIndicator({ status }: JobSecurityIndicatorProps) {
  const getSeatConfig = (temp: SeatTemperature) => {
    switch (temp) {
      case "safe":
        return { color: "bg-green-500", text: "text-green-700", bg: "bg-green-50", label: "SAFE", icon: CheckCircle };
      case "stable":
        return { color: "bg-blue-500", text: "text-blue-700", bg: "bg-blue-50", label: "STABLE", icon: Shield };
      case "lukewarm":
        return { color: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50", label: "LUKEWARM", icon: Eye };
      case "warm":
        return { color: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50", label: "WARM SEAT", icon: AlertCircle };
      case "hot":
        return { color: "bg-red-500", text: "text-red-700", bg: "bg-red-50", label: "HOT SEAT", icon: AlertTriangle };
      case "ejection_seat":
        return { color: "bg-red-700", text: "text-red-900", bg: "bg-red-100", label: "EJECTION SEAT", icon: Zap };
    }
  };

  const config = getSeatConfig(status.status);
  const Icon = config.icon;

  return (
    <div className={`${config.bg} rounded-xl p-4 border border-${config.color.replace("bg-", "")}/30`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${config.text}`} />
          <span className={`font-bold ${config.text}`}>{config.label}</span>
        </div>
        <span className={`text-xs ${config.text} opacity-75`}>
          {status.contractYearsRemaining} years left
        </span>
      </div>

      {/* Firing probability */}
      {status.firingProbability > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 mb-1">Firing Risk</div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-500 transition-all"
              style={{ width: `${status.firingProbability}%` }}
            />
          </div>
        </div>
      )}

      {/* Warnings */}
      {status.warnings.length > 0 && (
        <div className="text-sm">
          <div className="font-medium text-gray-700 mb-1">Recent Warnings:</div>
          {status.warnings.slice(0, 2).map((warning, i) => (
            <div key={i} className={`text-xs ${config.text} opacity-75`}>
              • {warning.message}
            </div>
          ))}
        </div>
      )}

      {/* Path to safety */}
      {status.pathToSafety.length > 0 && status.status !== "safe" && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="text-xs text-gray-500 mb-1">To improve:</div>
          {status.pathToSafety.slice(0, 2).map((path, i) => (
            <div key={i} className="text-xs text-gray-600">
              • {path}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// OWNER CARD
// =============================================================================

interface OwnerCardProps {
  owner: Owner;
  jobSecurity: JobSecurityStatus;
  onViewDetails: () => void;
}

function OwnerCard({ owner, jobSecurity, onViewDetails }: OwnerCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-amber-600 rounded-full flex items-center justify-center text-white">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-gray-900">{owner.name}</div>
              <div className="text-sm text-gray-500">Owner • {owner.type.replace(/_/g, " ")}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-gray-500">Trust</div>
              <div className={`text-xl font-bold ${owner.trust >= 60 ? "text-green-600" : owner.trust >= 40 ? "text-amber-600" : "text-red-600"}`}>
                {owner.trust}
              </div>
            </div>
            {expanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="p-4 border-t border-gray-100 bg-gray-50 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <RelationshipMeter label="Trust" value={owner.trust} colorScheme="trust" />
            <RelationshipMeter label="Satisfaction" value={owner.satisfaction} colorScheme="satisfaction" />
          </div>

          {/* Priorities */}
          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">Priorities</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(owner.priorities)
                .sort((a, b) => b[1] - a[1])
                .map(([key, value]) => (
                  <span
                    key={key}
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      value >= 30
                        ? "bg-blue-100 text-blue-800"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {key.charAt(0).toUpperCase() + key.slice(1)}: {value}
                  </span>
                ))}
            </div>
          </div>

          {/* Job Security */}
          <JobSecurityIndicator status={jobSecurity} />

          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
            }}
            className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            View Full Details
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// COACH CARD
// =============================================================================

interface CoachCardProps {
  coach: Coach;
  onViewDetails: () => void;
}

function CoachCard({ coach, onViewDetails }: CoachCardProps) {
  const [expanded, setExpanded] = useState(false);

  const alignment = coach.alignmentWithGM;
  const alignmentLabel =
    alignment >= 80 ? "Excellent" :
    alignment >= 60 ? "Good" :
    alignment >= 40 ? "Mixed" :
    alignment >= 20 ? "Poor" : "Conflict";

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-gray-900">{coach.name}</div>
              <div className="text-sm text-gray-500">
                Head Coach • {coach.offenseScheme.replace(/_/g, " ")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-gray-500">Alignment</div>
              <div className={`text-lg font-bold ${
                alignment >= 60 ? "text-green-600" :
                alignment >= 40 ? "text-amber-600" : "text-red-600"
              }`}>
                {alignmentLabel}
              </div>
            </div>
            {expanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="p-4 border-t border-gray-100 bg-gray-50 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <RelationshipMeter label="Trust" value={coach.trustInGM} />
            <RelationshipMeter label="Respect" value={coach.respectForGM} />
            <RelationshipMeter label="Alignment" value={coach.alignmentWithGM} />
          </div>

          {/* Scheme */}
          <div className="flex gap-4">
            <div className="flex-1 p-3 bg-white rounded-lg border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">Offense</div>
              <div className="font-medium text-gray-900">{coach.offenseScheme.replace(/_/g, " ")}</div>
            </div>
            <div className="flex-1 p-3 bg-white rounded-lg border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">Defense</div>
              <div className="font-medium text-gray-900">{coach.defenseScheme.replace(/_/g, " ")}</div>
            </div>
          </div>

          {/* Disagreements */}
          {(coach.publicDisagreements > 0 || coach.privateDisagreements > 0) && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-1">
                <AlertTriangle className="w-4 h-4" />
                Disagreements
              </div>
              <div className="text-xs text-amber-600">
                {coach.publicDisagreements > 0 && `${coach.publicDisagreements} public • `}
                {coach.privateDisagreements} private this season
              </div>
            </div>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
            }}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            View Full Details
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SCOUT OVERVIEW
// =============================================================================

interface ScoutOverviewProps {
  scouts: ScoutRelationship[];
  onViewScout: (scoutId: string) => void;
}

function ScoutOverview({ scouts, onViewScout }: ScoutOverviewProps) {
  const avgMorale = Math.round(scouts.reduce((sum, s) => sum + s.morale, 0) / scouts.length);
  const avgTrust = Math.round(scouts.reduce((sum, s) => sum + s.trust, 0) / scouts.length);
  const atRisk = scouts.filter(s => s.flightRisk >= 60).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-gray-900">Scout Staff</div>
              <div className="text-sm text-gray-500">{scouts.length} scouts</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-lg font-bold text-gray-900">{avgMorale}</div>
              <div className="text-xs text-gray-500">Avg Morale</div>
            </div>
            {atRisk > 0 && (
              <div className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                {atRisk} at risk
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {scouts.slice(0, 4).map((scout) => (
          <div
            key={scout.scoutId}
            className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg cursor-pointer"
            onClick={() => onViewScout(scout.scoutId)}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                scout.morale >= 70 ? "bg-green-500" :
                scout.morale >= 50 ? "bg-amber-500" : "bg-red-500"
              }`}>
                {scout.scoutName.charAt(0)}
              </div>
              <div>
                <div className="font-medium text-gray-900 text-sm">{scout.scoutName}</div>
                <div className="text-xs text-gray-500">{scout.archetype.replace(/_/g, " ")}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium">{scout.morale}</div>
                <div className="text-xs text-gray-400">morale</div>
              </div>
              {scout.flightRisk >= 60 && (
                <AlertTriangle className="w-4 h-4 text-red-500" />
              )}
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
          </div>
        ))}

        {scouts.length > 4 && (
          <button className="w-full py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            View all {scouts.length} scouts
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// PENDING RECOMMENDATIONS
// =============================================================================

interface PendingRecommendationsProps {
  recommendations: Recommendation[];
  onViewRecommendation: (rec: Recommendation) => void;
}

function PendingRecommendations({ recommendations, onViewRecommendation }: PendingRecommendationsProps) {
  const pending = recommendations.filter(r => r.status === "pending");

  const getSourceIcon = (source: string) => {
    switch (source) {
      case "owner": return Briefcase;
      case "coach": return ClipboardList;
      case "scout": return Users;
      default: return MessageSquare;
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case "owner": return "text-amber-600 bg-amber-100";
      case "coach": return "text-blue-600 bg-blue-100";
      case "scout": return "text-green-600 bg-green-100";
      default: return "text-gray-600 bg-gray-100";
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "critical": return "bg-red-100 text-red-700";
      case "high": return "bg-orange-100 text-orange-700";
      case "medium": return "bg-amber-100 text-amber-700";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  if (pending.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <div className="font-medium text-gray-900">All Caught Up</div>
        <div className="text-sm text-gray-500">No pending recommendations</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="font-bold text-gray-900">Pending Recommendations</div>
          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
            {pending.length}
          </span>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {pending.slice(0, 5).map((rec) => {
          const Icon = getSourceIcon(rec.source);
          return (
            <div
              key={rec.id}
              className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => onViewRecommendation(rec)}
            >
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getSourceColor(rec.source)}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 text-sm">{rec.sourceName}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getUrgencyColor(rec.urgency)}`}>
                      {rec.urgency}
                    </span>
                  </div>
                  <div className="text-sm text-gray-700 truncate">{rec.action.description}</div>
                  <div className="text-xs text-gray-500 mt-1 line-clamp-1">{rec.reasoning}</div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              </div>
            </div>
          );
        })}
      </div>

      {pending.length > 5 && (
        <div className="p-3 border-t border-gray-100 text-center">
          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            View all {pending.length} recommendations
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ACTIVE DISAGREEMENTS
// =============================================================================

interface ActiveDisagreementsProps {
  disagreements: Disagreement[];
  onViewDisagreement: (dis: Disagreement) => void;
}

function ActiveDisagreements({ disagreements, onViewDisagreement }: ActiveDisagreementsProps) {
  const active = disagreements.filter(d => !d.resolved);

  if (active.length === 0) {
    return null;
  }

  return (
    <div className="bg-amber-50 rounded-xl border border-amber-200 overflow-hidden">
      <div className="p-4 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <span className="font-bold text-amber-900">Active Disagreements</span>
          <span className="px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full text-xs font-medium">
            {active.length}
          </span>
        </div>
      </div>

      <div className="divide-y divide-amber-200">
        {active.map((dis) => (
          <div
            key={dis.id}
            className="p-4 hover:bg-amber-100/50 cursor-pointer transition-colors"
            onClick={() => onViewDisagreement(dis)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-amber-900">
                {dis.type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                dis.importance === "critical" ? "bg-red-200 text-red-800" :
                dis.importance === "major" ? "bg-orange-200 text-orange-800" :
                "bg-amber-200 text-amber-800"
              }`}>
                {dis.importance}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {dis.parties.map((party, i) => (
                <span key={i} className="text-xs bg-white text-amber-800 px-2 py-1 rounded">
                  {party.sourceName}: {party.position}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN DASHBOARD
// =============================================================================

interface RelationshipDashboardProps {
  owner: Owner;
  coach: Coach;
  scouts: ScoutRelationship[];
  jobSecurity: JobSecurityStatus;
  recommendations: Recommendation[];
  disagreements: Disagreement[];
  onViewOwner: () => void;
  onViewCoach: () => void;
  onViewScout: (scoutId: string) => void;
  onViewRecommendation: (rec: Recommendation) => void;
  onViewDisagreement: (dis: Disagreement) => void;
}

export function RelationshipDashboard({
  owner,
  coach,
  scouts,
  jobSecurity,
  recommendations,
  disagreements,
  onViewOwner,
  onViewCoach,
  onViewScout,
  onViewRecommendation,
  onViewDisagreement,
}: RelationshipDashboardProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relationships</h1>
          <p className="text-gray-500">Manage your relationships with key stakeholders</p>
        </div>
      </div>

      {/* Active Disagreements (if any) */}
      <ActiveDisagreements
        disagreements={disagreements}
        onViewDisagreement={onViewDisagreement}
      />

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Key Relationships */}
        <div className="space-y-6">
          <OwnerCard owner={owner} jobSecurity={jobSecurity} onViewDetails={onViewOwner} />
          <CoachCard coach={coach} onViewDetails={onViewCoach} />
          <ScoutOverview scouts={scouts} onViewScout={onViewScout} />
        </div>

        {/* Right Column - Recommendations */}
        <div className="space-y-6">
          <PendingRecommendations
            recommendations={recommendations}
            onViewRecommendation={onViewRecommendation}
          />

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3 mb-2">
                <ThumbsUp className="w-5 h-5 text-green-600" />
                <span className="text-sm text-gray-600">Followed Advice</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {recommendations.filter(r => r.status === "followed").length}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3 mb-2">
                <ThumbsDown className="w-5 h-5 text-red-600" />
                <span className="text-sm text-gray-600">Went Own Way</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {recommendations.filter(r => r.status === "ignored").length}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RelationshipDashboard;
