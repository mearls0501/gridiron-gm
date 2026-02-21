"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Target } from "lucide-react";

interface Prospect {
  id: string;
  full_name: string;
  position: string;
  age: number;
  college: string | null;
  overall: number;
  potential: number;
  traits?: any;
}

interface ScoutedProspect {
  prospect_id: string;
  est_overall_low: number | null;
  est_overall_high: number | null;
  est_potential_low: number | null;
  est_potential_high: number | null;
  trait_reveals: any;
  athletic_bands: any;
  psych_reveals: any;
  confidence: number | null;
}

interface DraftProspectCardProps {
  prospect: Prospect;
  scouted?: ScoutedProspect;
  isUserTurn: boolean;
  canSelect: boolean;
  onSelect: (prospectId: string) => void;
  selecting?: boolean;
}

export default function DraftProspectCard({
  prospect,
  scouted,
  isUserTurn,
  canSelect,
  onSelect,
  selecting = false,
}: DraftProspectCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const getProjectedRound = (overall: number): number => {
    if (overall >= 85) return 1;
    if (overall >= 80) return 2;
    if (overall >= 75) return 3;
    if (overall >= 70) return 4;
    if (overall >= 65) return 5;
    if (overall >= 60) return 6;
    if (overall >= 55) return 7;
    return 8;
  };

  const getRevealedAttribute = (attribute: string): string | number | null => {
    if (!scouted) return null;

    // Check trait_reveals
    if (scouted.trait_reveals && scouted.trait_reveals[attribute]) {
      return scouted.trait_reveals[attribute];
    }

    // Check athletic_bands
    if (scouted.athletic_bands && scouted.athletic_bands[attribute]) {
      const band = scouted.athletic_bands[attribute];
      if (
        typeof band === "object" &&
        band.low !== undefined &&
        band.high !== undefined
      ) {
        return `${band.low}-${band.high}`;
      }
      return band;
    }

    // Check psych_reveals
    if (scouted.psych_reveals && scouted.psych_reveals[attribute]) {
      return scouted.psych_reveals[attribute];
    }

    return null;
  };

  const projectedRound = getProjectedRound(prospect.overall);
  const overallDisplay =
    scouted?.est_overall_low && scouted.est_overall_high
      ? `${scouted.est_overall_low}-${scouted.est_overall_high}`
      : prospect.overall;
  const potentialDisplay =
    scouted?.est_potential_low && scouted.est_potential_high
      ? `${scouted.est_potential_low}-${scouted.est_potential_high}`
      : prospect.potential;

  return (
    <div
      className={`glass-card rounded-lg p-4 transition-all duration-300 ${
        canSelect && isUserTurn
          ? "cursor-pointer hover:neon-glow-cyan hover:scale-[1.02]"
          : "cursor-default"
      } ${isHovered && canSelect ? "neon-glow-cyan" : ""}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => canSelect && !selecting && onSelect(prospect.id)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3
              className="text-lg font-bold"
              style={{
                color: "var(--futuristic-neon-cyan)",
                textShadow:
                  "0 0 10px rgba(0, 240, 255, 0.8), 0 0 20px rgba(0, 240, 255, 0.5)",
              }}
            >
              {prospect.full_name}
            </h3>
            <span
              className="px-2 py-1 text-xs font-semibold rounded"
              style={{
                color: "var(--futuristic-text-primary)",
                backgroundColor: "rgba(168, 85, 247, 0.2)",
                border: "1px solid rgba(168, 85, 247, 0.5)",
              }}
            >
              {prospect.position}
            </span>
            {scouted && (
              <span
                className="px-2 py-1 text-xs font-semibold rounded flex items-center gap-1"
                style={{
                  color: "var(--futuristic-neon-cyan)",
                  backgroundColor: "rgba(0, 240, 255, 0.2)",
                  border: "1px solid rgba(0, 240, 255, 0.5)",
                }}
              >
                <Target className="w-3 h-3" />
                Scouted
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span style={{ color: "var(--futuristic-text-secondary)" }}>
                OVR:{" "}
              </span>
              <span
                className="font-bold"
                style={{ color: "var(--futuristic-neon-cyan)" }}
              >
                {overallDisplay}
              </span>
            </div>
            <div>
              <span style={{ color: "var(--futuristic-text-secondary)" }}>
                POT:{" "}
              </span>
              <span
                className="font-bold"
                style={{ color: "var(--futuristic-electric-blue)" }}
              >
                {potentialDisplay}
              </span>
            </div>
            <div>
              <span style={{ color: "var(--futuristic-text-secondary)" }}>
                Proj:{" "}
              </span>
              <span
                className="font-semibold"
                style={{ color: "var(--futuristic-text-primary)" }}
              >
                Round {projectedRound}
              </span>
            </div>
            {prospect.college && (
              <span
                className="text-xs"
                style={{ color: "var(--futuristic-text-muted)" }}
              >
                {prospect.college}
              </span>
            )}
          </div>
        </div>
        {canSelect && isUserTurn && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!selecting) onSelect(prospect.id);
            }}
            disabled={selecting}
            className="ml-4 px-4 py-2 btn-futuristic-cyan rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {selecting ? "Drafting..." : "Draft"}
          </button>
        )}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div
          className="mt-4 pt-4 slide-in-right"
          style={{ borderTop: "1px solid rgba(0, 240, 255, 0.2)" }}
        >
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <h4
                className="font-semibold mb-2"
                style={{ color: "var(--futuristic-neon-cyan)" }}
              >
                Revealed Attributes
              </h4>
              <div className="space-y-1">
                {[
                  "Speed",
                  "Strength",
                  "Awareness",
                  "Instincts",
                  "Technique",
                  "Leadership",
                ].map((attr) => {
                  const revealed = getRevealedAttribute(attr.toLowerCase());
                  if (!revealed) return null;
                  return (
                    <div key={attr} className="flex justify-between">
                      <span
                        style={{ color: "var(--futuristic-text-secondary)" }}
                      >
                        {attr}:
                      </span>
                      <span
                        className="font-semibold"
                        style={{ color: "var(--futuristic-text-primary)" }}
                      >
                        {String(revealed)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h4
                className="font-semibold mb-2"
                style={{ color: "var(--futuristic-neon-purple)" }}
              >
                Scouting Info
              </h4>
              {scouted ? (
                <div className="space-y-1">
                  {scouted.confidence && (
                    <div className="flex justify-between">
                      <span
                        style={{ color: "var(--futuristic-text-secondary)" }}
                      >
                        Confidence:
                      </span>
                      <span
                        className="font-semibold"
                        style={{ color: "var(--futuristic-text-primary)" }}
                      >
                        {scouted.confidence}%
                      </span>
                    </div>
                  )}
                  <div className="mt-2">
                    <div
                      className="w-full rounded-full h-2"
                      style={{
                        backgroundColor: "var(--futuristic-bg-secondary)",
                      }}
                    >
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${scouted.confidence || 0}%`,
                          background:
                            "linear-gradient(to right, var(--futuristic-neon-cyan), var(--futuristic-neon-purple))",
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <p
                  className="text-xs"
                  style={{ color: "var(--futuristic-text-muted)" }}
                >
                  Not scouted
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expand/Collapse Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}
        className="mt-3 text-xs transition-colors flex items-center gap-1"
        style={{ color: "var(--futuristic-neon-cyan)" }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.color = "var(--futuristic-neon-purple)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.color = "var(--futuristic-neon-cyan)")
        }
      >
        {isExpanded ? (
          <>
            <ChevronUp className="w-3 h-3" />
            Show less
          </>
        ) : (
          <>
            <ChevronDown className="w-3 h-3" />
            Show more
          </>
        )}
      </button>
    </div>
  );
}
