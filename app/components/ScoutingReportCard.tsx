"use client";

import { useState } from "react";
import {
  Star,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Sparkles,
  Shield,
  Zap,
  Brain,
  Heart,
  Target,
  ChevronDown,
  ChevronUp,
  User,
  MessageSquare,
  Award,
} from "lucide-react";

interface ScoutInfo {
  name: string;
  archetype: string;
  personalityType?: string;
  confidence?: number;
}

interface AttributeGrade {
  value: number | { low: number; high: number };
  confidence: "high" | "medium" | "low";
  scoutName?: string;
}

interface ScoutingReportCardProps {
  prospect: {
    id: string;
    name: string;
    position: string;
    college?: string;
    age?: number;
  };
  report: {
    overallLow?: number;
    overallHigh?: number;
    overallEstimate?: number;
    potentialLow?: number;
    potentialHigh?: number;
    potentialEstimate?: number;
    confidence: "high" | "medium" | "low";
    confidenceScore?: number;
    roundProjection?: number;
    traits?: Record<string, AttributeGrade>;
    athleticBands?: Record<string, any>;
    psychReveals?: Record<string, any>;
    schemeFit?: string;
    bustRisk?: "low" | "medium" | "high";
    boomPotential?: boolean;
    scoutNotes?: Array<{
      scout: ScoutInfo;
      note: string;
      headline?: string;
      timestamp?: string;
    }>;
  };
  onClose?: () => void;
  compact?: boolean;
}

/**
 * Convert a numeric rating (0-100) to a letter grade
 */
function getLetterGrade(value: number): {
  letter: string;
  color: string;
  bgColor: string;
  borderColor: string;
} {
  if (value >= 95) return { letter: "A+", color: "text-emerald-700", bgColor: "bg-emerald-100", borderColor: "border-emerald-300" };
  if (value >= 90) return { letter: "A", color: "text-emerald-600", bgColor: "bg-emerald-50", borderColor: "border-emerald-200" };
  if (value >= 85) return { letter: "A-", color: "text-green-600", bgColor: "bg-green-50", borderColor: "border-green-200" };
  if (value >= 80) return { letter: "B+", color: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-blue-200" };
  if (value >= 75) return { letter: "B", color: "text-blue-500", bgColor: "bg-blue-50", borderColor: "border-blue-200" };
  if (value >= 70) return { letter: "B-", color: "text-sky-600", bgColor: "bg-sky-50", borderColor: "border-sky-200" };
  if (value >= 65) return { letter: "C+", color: "text-yellow-600", bgColor: "bg-yellow-50", borderColor: "border-yellow-200" };
  if (value >= 60) return { letter: "C", color: "text-yellow-600", bgColor: "bg-yellow-50", borderColor: "border-yellow-200" };
  if (value >= 55) return { letter: "C-", color: "text-orange-500", bgColor: "bg-orange-50", borderColor: "border-orange-200" };
  if (value >= 50) return { letter: "D+", color: "text-orange-600", bgColor: "bg-orange-50", borderColor: "border-orange-200" };
  if (value >= 45) return { letter: "D", color: "text-orange-600", bgColor: "bg-orange-100", borderColor: "border-orange-300" };
  if (value >= 40) return { letter: "D-", color: "text-red-500", bgColor: "bg-red-50", borderColor: "border-red-200" };
  return { letter: "F", color: "text-red-600", bgColor: "bg-red-100", borderColor: "border-red-300" };
}

/**
 * Get grade from a band (low-high range)
 */
function getGradeFromBand(low: number, high: number): {
  letter: string;
  range: string;
  color: string;
  bgColor: string;
  borderColor: string;
} {
  const mid = Math.round((low + high) / 2);
  const grade = getLetterGrade(mid);
  return {
    ...grade,
    range: `${low}-${high}`,
  };
}

/**
 * Format archetype name for display
 */
function formatArchetype(archetype: string): string {
  return archetype
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Get icon for archetype
 */
function getArchetypeIcon(archetype: string) {
  switch (archetype) {
    case "evaluator":
      return Target;
    case "tape_grinder":
      return Brain;
    case "character_coach":
      return Heart;
    case "athletic_analyst":
      return Zap;
    default:
      return User;
  }
}

/**
 * Get personality type display
 */
function getPersonalityDisplay(personalityType?: string): {
  label: string;
  color: string;
} {
  switch (personalityType) {
    case "optimistic":
      return { label: "Optimist", color: "text-green-600" };
    case "pessimistic":
      return { label: "Skeptic", color: "text-red-600" };
    case "cautious":
      return { label: "Cautious", color: "text-yellow-600" };
    case "bold":
      return { label: "Bold", color: "text-purple-600" };
    case "analytical":
      return { label: "Analytical", color: "text-blue-600" };
    case "old_school":
      return { label: "Old School", color: "text-slate-600" };
    default:
      return { label: "Scout", color: "text-slate-500" };
  }
}

export default function ScoutingReportCard({
  prospect,
  report,
  onClose,
  compact = false,
}: ScoutingReportCardProps) {
  const [expandedNotes, setExpandedNotes] = useState(!compact);
  const [expandedTraits, setExpandedTraits] = useState(!compact);

  // Calculate overall grade
  const overallGrade = report.overallEstimate
    ? getLetterGrade(report.overallEstimate)
    : report.overallLow && report.overallHigh
    ? getGradeFromBand(report.overallLow, report.overallHigh)
    : null;

  // Calculate potential grade
  const potentialGrade = report.potentialEstimate
    ? getLetterGrade(report.potentialEstimate)
    : report.potentialLow && report.potentialHigh
    ? getGradeFromBand(report.potentialLow, report.potentialHigh)
    : null;

  // Group traits by category
  const traitCategories = {
    physical: ["speed", "acceleration", "agility", "strength", "athletic_ceiling"],
    technical: ["technique", "footwork", "hand_placement", "mechanics", "release", "route_running"],
    mental: ["awareness", "football_iq", "play_recognition", "instincts", "decision_making"],
    character: ["leadership", "coachability", "work_ethic", "motor", "consistency"],
  };

  if (compact) {
    // Compact card view for list display
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Player info + grades */}
          <div className="flex items-center gap-4">
            {/* Main grade */}
            {overallGrade && (
              <div
                className={`w-16 h-16 rounded-xl ${overallGrade.bgColor} ${overallGrade.borderColor} border-2 flex items-center justify-center`}
              >
                <span className={`text-2xl font-black ${overallGrade.color}`}>
                  {overallGrade.letter}
                </span>
              </div>
            )}

            <div>
              <h4 className="font-bold text-slate-900">{prospect.name}</h4>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="font-semibold text-blue-600">{prospect.position}</span>
                {prospect.college && (
                  <>
                    <span>•</span>
                    <span>{prospect.college}</span>
                  </>
                )}
              </div>

              {/* Confidence + Projection */}
              <div className="flex items-center gap-3 mt-1">
                <div
                  className={`flex items-center gap-1 text-xs font-medium ${
                    report.confidence === "high"
                      ? "text-green-600"
                      : report.confidence === "medium"
                      ? "text-yellow-600"
                      : "text-orange-600"
                  }`}
                >
                  {report.confidence === "high" && <Star className="w-3 h-3" />}
                  {report.confidence === "medium" && <TrendingUp className="w-3 h-3" />}
                  {report.confidence === "low" && <AlertTriangle className="w-3 h-3" />}
                  <span className="uppercase">{report.confidence} Confidence</span>
                </div>
                {report.roundProjection && (
                  <span className="text-xs text-slate-500">
                    Proj: Round {report.roundProjection}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Quick grades */}
          <div className="flex items-center gap-2">
            {potentialGrade && (
              <div className="text-center">
                <div className="text-xs text-slate-500 mb-1">POT</div>
                <div
                  className={`w-10 h-10 rounded-lg ${potentialGrade.bgColor} flex items-center justify-center`}
                >
                  <span className={`text-sm font-bold ${potentialGrade.color}`}>
                    {potentialGrade.letter}
                  </span>
                </div>
              </div>
            )}

            {/* Boom/Bust indicators */}
            {report.boomPotential && (
              <div className="flex items-center gap-1 px-2 py-1 bg-purple-100 rounded text-purple-700">
                <Sparkles className="w-4 h-4" />
                <span className="text-xs font-bold">BOOM</span>
              </div>
            )}
            {report.bustRisk === "high" && (
              <div className="flex items-center gap-1 px-2 py-1 bg-red-100 rounded text-red-700">
                <TrendingDown className="w-4 h-4" />
                <span className="text-xs font-bold">RISK</span>
              </div>
            )}
          </div>
        </div>

        {/* Scout headline preview */}
        {report.scoutNotes && report.scoutNotes.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-start gap-2">
              <MessageSquare className="w-4 h-4 text-slate-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-slate-600 italic line-clamp-1">
                  "{report.scoutNotes[0].note}"
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  — {report.scoutNotes[0].scout.name}, {formatArchetype(report.scoutNotes[0].scout.archetype)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full report card modal/view
  return (
    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-2xl w-full">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-blue-600 text-white text-sm font-bold rounded">
                {prospect.position}
              </span>
              <h2 className="text-2xl font-bold text-white">{prospect.name}</h2>
            </div>
            <div className="flex items-center gap-3 mt-2 text-slate-300 text-sm">
              {prospect.college && <span>{prospect.college}</span>}
              {prospect.age && (
                <>
                  <span>•</span>
                  <span>Age {prospect.age}</span>
                </>
              )}
              {report.roundProjection && (
                <>
                  <span>•</span>
                  <span className="text-yellow-400 font-semibold">
                    Projected Round {report.roundProjection}
                  </span>
                </>
              )}
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Main Grades Section */}
        <div className="grid grid-cols-2 gap-4">
          {/* Overall Grade */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="text-sm font-semibold text-slate-600 mb-2 uppercase tracking-wide">
              Overall Rating
            </div>
            <div className="flex items-center gap-4">
              {overallGrade && (
                <div
                  className={`w-20 h-20 rounded-xl ${overallGrade.bgColor} ${overallGrade.borderColor} border-2 flex items-center justify-center`}
                >
                  <span className={`text-3xl font-black ${overallGrade.color}`}>
                    {overallGrade.letter}
                  </span>
                </div>
              )}
              <div>
                {report.overallEstimate && (
                  <div className="text-3xl font-bold text-slate-900">
                    {report.overallEstimate}
                  </div>
                )}
                {report.overallLow && report.overallHigh && (
                  <div className="text-sm text-slate-500">
                    Range: {report.overallLow} - {report.overallHigh}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Potential Grade */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="text-sm font-semibold text-slate-600 mb-2 uppercase tracking-wide">
              Potential Rating
            </div>
            <div className="flex items-center gap-4">
              {potentialGrade && (
                <div
                  className={`w-20 h-20 rounded-xl ${potentialGrade.bgColor} ${potentialGrade.borderColor} border-2 flex items-center justify-center`}
                >
                  <span className={`text-3xl font-black ${potentialGrade.color}`}>
                    {potentialGrade.letter}
                  </span>
                </div>
              )}
              <div>
                {report.potentialEstimate && (
                  <div className="text-3xl font-bold text-slate-900">
                    {report.potentialEstimate}
                  </div>
                )}
                {report.potentialLow && report.potentialHigh && (
                  <div className="text-sm text-slate-500">
                    Range: {report.potentialLow} - {report.potentialHigh}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Confidence & Risk Section */}
        <div className="flex items-center justify-between bg-slate-50 rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-6">
            {/* Confidence */}
            <div className="flex items-center gap-2">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  report.confidence === "high"
                    ? "bg-green-100"
                    : report.confidence === "medium"
                    ? "bg-yellow-100"
                    : "bg-orange-100"
                }`}
              >
                {report.confidence === "high" && <Star className="w-5 h-5 text-green-600" />}
                {report.confidence === "medium" && <TrendingUp className="w-5 h-5 text-yellow-600" />}
                {report.confidence === "low" && <AlertTriangle className="w-5 h-5 text-orange-600" />}
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase">Confidence</div>
                <div
                  className={`font-bold capitalize ${
                    report.confidence === "high"
                      ? "text-green-600"
                      : report.confidence === "medium"
                      ? "text-yellow-600"
                      : "text-orange-600"
                  }`}
                >
                  {report.confidence}
                  {report.confidenceScore && (
                    <span className="text-slate-400 font-normal ml-1">
                      ({report.confidenceScore}%)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Scheme Fit */}
            {report.schemeFit && (
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase">Scheme Fit</div>
                  <div className="font-bold text-blue-600">{report.schemeFit}</div>
                </div>
              </div>
            )}
          </div>

          {/* Boom/Bust */}
          <div className="flex items-center gap-3">
            {report.boomPotential && (
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-100 rounded-lg">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <div>
                  <div className="text-xs text-purple-500 uppercase">Upside</div>
                  <div className="font-bold text-purple-700">BOOM</div>
                </div>
              </div>
            )}
            {report.bustRisk && report.bustRisk !== "low" && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                  report.bustRisk === "high" ? "bg-red-100" : "bg-yellow-100"
                }`}
              >
                <TrendingDown
                  className={`w-5 h-5 ${
                    report.bustRisk === "high" ? "text-red-600" : "text-yellow-600"
                  }`}
                />
                <div>
                  <div
                    className={`text-xs uppercase ${
                      report.bustRisk === "high" ? "text-red-500" : "text-yellow-500"
                    }`}
                  >
                    Risk Level
                  </div>
                  <div
                    className={`font-bold uppercase ${
                      report.bustRisk === "high" ? "text-red-700" : "text-yellow-700"
                    }`}
                  >
                    {report.bustRisk}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Traits Section */}
        {report.traits && Object.keys(report.traits).length > 0 && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedTraits(!expandedTraits)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-slate-600" />
                <span className="font-semibold text-slate-800">
                  Scouted Attributes ({Object.keys(report.traits).length})
                </span>
              </div>
              {expandedTraits ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </button>

            {expandedTraits && (
              <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(report.traits).map(([key, data]) => {
                  const value =
                    typeof data.value === "number"
                      ? data.value
                      : Math.round((data.value.low + data.value.high) / 2);
                  const grade = getLetterGrade(value);
                  const range =
                    typeof data.value === "object"
                      ? `${data.value.low}-${data.value.high}`
                      : null;

                  return (
                    <div
                      key={key}
                      className={`p-3 rounded-lg border ${grade.borderColor} ${grade.bgColor}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700 capitalize">
                          {key.replace(/_/g, " ")}
                        </span>
                        <span className={`text-lg font-black ${grade.color}`}>
                          {grade.letter}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">
                          {range || value}
                        </span>
                        <span
                          className={`text-xs font-medium capitalize ${
                            data.confidence === "high"
                              ? "text-green-600"
                              : data.confidence === "medium"
                              ? "text-yellow-600"
                              : "text-orange-600"
                          }`}
                        >
                          {data.confidence}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Scout Notes Section */}
        {report.scoutNotes && report.scoutNotes.length > 0 && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedNotes(!expandedNotes)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-slate-600" />
                <span className="font-semibold text-slate-800">
                  Scout Reports ({report.scoutNotes.length})
                </span>
              </div>
              {expandedNotes ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </button>

            {expandedNotes && (
              <div className="divide-y divide-slate-100">
                {report.scoutNotes.map((note, index) => {
                  const Icon = getArchetypeIcon(note.scout.archetype);
                  const personality = getPersonalityDisplay(note.scout.personalityType);

                  return (
                    <div key={index} className="p-4">
                      {/* Scout header */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">
                            {note.scout.name}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500">
                              {formatArchetype(note.scout.archetype)}
                            </span>
                            {note.scout.personalityType && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span className={personality.color}>
                                  {personality.label}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {note.headline && (
                          <div className="ml-auto">
                            <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-semibold rounded-full">
                              {note.headline}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Note content */}
                      <div className="bg-slate-50 rounded-lg p-3 border-l-4 border-blue-400">
                        <p className="text-slate-700 italic">"{note.note}"</p>
                      </div>

                      {note.timestamp && (
                        <div className="mt-2 text-xs text-slate-400">
                          {new Date(note.timestamp).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
