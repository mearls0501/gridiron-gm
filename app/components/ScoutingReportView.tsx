"use client";

import { CheckCircle, AlertTriangle, TrendingUp, XCircle } from "lucide-react";

interface ScoutingReport {
  id: string;
  prospect_id: string;
  scouting_method: string;
  overall_min?: number;
  overall_max?: number;
  overall_estimate?: number;
  potential_min?: number;
  potential_max?: number;
  potential_estimate?: number;
  accuracy_percentage: number;
  confidence_level: "high" | "medium" | "low";
  traits_scouted: Record<string, { value: number; confidence: string }>;
  character_assessment?: Record<string, any>;
  injury_risk?: "low" | "medium" | "high";
  scheme_fit?: string;
  scout_notes?: string;
  scouted_at: string;
  prospect?: {
    full_name: string;
    position: string;
    college: string | null;
    age: number;
  };
  scout?: {
    name: string;
    role: string;
  };
}

interface ScoutingReportViewProps {
  report: ScoutingReport;
  onClose: () => void;
}

export default function ScoutingReportView({ report, onClose }: ScoutingReportViewProps) {
  const getConfidenceIcon = (level: string) => {
    switch (level) {
      case "high":
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case "medium":
        return <TrendingUp className="w-5 h-5 text-yellow-600" />;
      case "low":
        return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      default:
        return <XCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getInjuryRiskColor = (risk?: string) => {
    switch (risk) {
      case "low":
        return "text-green-600";
      case "medium":
        return "text-yellow-600";
      case "high":
        return "text-red-600";
      default:
        return "text-gray-400";
    }
  };

  const methodLabels: Record<string, string> = {
    initial: "Initial Scouting",
    tape: "Game Tape Review",
    combine: "NFL Combine",
    pro_day: "Pro Day",
    workout: "Private Workout",
    medical: "Medical Evaluation",
    character: "Team Interview",
    team_interview: "Team Interview",
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-1">
                {report.prospect?.full_name || "Unknown Prospect"}
              </h2>
              <div className="flex items-center gap-4 text-sm text-blue-100 mt-2">
                <span>{report.prospect?.position}</span>
                <span>•</span>
                <span>{report.prospect?.college || "Unknown College"}</span>
                <span>•</span>
                <span>Age {report.prospect?.age}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-blue-200 transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-8 space-y-6">
          {/* Scouting Method */}
          <div className="border-b border-slate-200 pb-4">
            <div className="text-sm text-slate-600 mb-1">Scouting Method</div>
            <div className="text-lg font-semibold text-slate-900">
              {methodLabels[report.scouting_method] || report.scouting_method}
            </div>
            {report.scout && (
              <div className="text-sm text-slate-600 mt-1">
                Scouted by: {report.scout.name} ({report.scout.role})
              </div>
            )}
            <div className="text-xs text-slate-500 mt-1">
              {new Date(report.scouted_at).toLocaleDateString()}
            </div>
          </div>

          {/* Overall Rating */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-sm text-slate-600 mb-2">Overall Rating</div>
              {report.overall_estimate ? (
                <div>
                  <div className="text-3xl font-bold text-slate-900 mb-1">
                    {report.overall_estimate}
                  </div>
                  {report.overall_min && report.overall_max && (
                    <div className="text-sm text-slate-600">
                      Range: {report.overall_min} - {report.overall_max}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-slate-400">Not scouted</div>
              )}
            </div>

            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-sm text-slate-600 mb-2">Potential Rating</div>
              {report.potential_estimate ? (
                <div>
                  <div className="text-3xl font-bold text-slate-900 mb-1">
                    {report.potential_estimate}
                  </div>
                  {report.potential_min && report.potential_max && (
                    <div className="text-sm text-slate-600">
                      Range: {report.potential_min} - {report.potential_max}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-slate-400">Not scouted</div>
              )}
            </div>
          </div>

          {/* Confidence & Accuracy */}
          <div className="grid grid-cols-2 gap-6">
            <div className="flex items-center gap-3">
              <div className="text-sm text-slate-600">Confidence:</div>
              <div className="flex items-center gap-2">
                {getConfidenceIcon(report.confidence_level)}
                <span className="font-semibold capitalize text-slate-900">
                  {report.confidence_level}
                </span>
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-600 mb-1">Accuracy: {report.accuracy_percentage}%</div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${report.accuracy_percentage}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Traits */}
          {Object.keys(report.traits_scouted).length > 0 && (
            <div>
              <div className="text-lg font-semibold text-slate-900 mb-3">Traits</div>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(report.traits_scouted).map(([trait, data]) => (
                  <div key={trait} className="bg-slate-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700 capitalize">
                        {trait.replace(/_/g, " ")}
                      </span>
                      {data.confidence === "high" && (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      )}
                      {data.confidence === "medium" && (
                        <TrendingUp className="w-4 h-4 text-yellow-600" />
                      )}
                      {data.confidence === "low" && (
                        <AlertTriangle className="w-4 h-4 text-orange-600" />
                      )}
                    </div>
                    <div className="text-2xl font-bold text-slate-900">{data.value}</div>
                    <div className="text-xs text-slate-500 capitalize mt-1">
                      {data.confidence} confidence
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Character Assessment */}
          {report.character_assessment && Object.keys(report.character_assessment).length > 0 && (
            <div>
              <div className="text-lg font-semibold text-slate-900 mb-3">Character Assessment</div>
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                {Object.entries(report.character_assessment).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 capitalize">
                      {key.replace(/_/g, " ")}:
                    </span>
                    <span className="text-sm text-slate-900 capitalize">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Injury Risk */}
          {report.injury_risk && (
            <div>
              <div className="text-lg font-semibold text-slate-900 mb-3">Injury Risk</div>
              <div className={`text-xl font-bold capitalize ${getInjuryRiskColor(report.injury_risk)}`}>
                {report.injury_risk}
              </div>
            </div>
          )}

          {/* Scheme Fit */}
          {report.scheme_fit && (
            <div>
              <div className="text-lg font-semibold text-slate-900 mb-2">Scheme Fit</div>
              <div className="text-slate-700">{report.scheme_fit}</div>
            </div>
          )}

          {/* Scout Notes */}
          {report.scout_notes && (
            <div>
              <div className="text-lg font-semibold text-slate-900 mb-3">Scout Notes</div>
              <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded">
                <p className="text-slate-700 whitespace-pre-line">{report.scout_notes}</p>
              </div>
            </div>
          )}

          {/* Close Button */}
          <div className="flex justify-end pt-4 border-t border-slate-200">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

