// @ts-nocheck
"use client";

import React, { useState, useMemo } from "react";
import {
  Scale,
  Plus,
  X,
  Search,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  Minus,
  Star,
  AlertTriangle,
  Eye,
  Target,
  TrendingUp,
  Zap,
  Brain,
  Shield,
  Users,
} from "lucide-react";

// Types
interface ProspectAttribute {
  key: string;
  label: string;
  category: "physical" | "skill" | "mental" | "scouting";
}

interface ScoutedData {
  est_overall_low?: number;
  est_overall_high?: number;
  est_potential_low?: number;
  est_potential_high?: number;
  trait_reveals?: Record<string, { low: number; high: number; estimate?: number }>;
  athletic_bands?: Record<string, any>;
  psych_reveals?: Record<string, any>;
  scheme_fit?: string;
  confidence?: number;
  scoutHeadline?: string;
  scoutNote?: string;
}

interface Prospect {
  id: string;
  full_name: string;
  position: string;
  college: string;
  age: number;
  height?: string;
  weight?: number;
  // True attributes (may be hidden)
  overall?: number;
  potential?: number;
  spd?: number;
  acc?: number;
  agi?: number;
  str?: number;
  // Position-specific
  thp?: number;
  sac?: number;
  mac?: number;
  dac?: number;
  rte?: number;
  cth?: number;
  pblk?: number;
  rblk?: number;
  tak?: number;
  mcv?: number;
  zcv?: number;
  // Character/Mental
  football_iq?: number;
  leadership?: number;
  work_ethic?: number;
  coachability?: number;
  // Risk
  bust_probability?: number;
  breakout_probability?: number;
  // Scouted data
  scoutedData?: ScoutedData;
}

// Position-specific attribute configs
const ATTRIBUTE_CONFIGS: Record<string, ProspectAttribute[]> = {
  QB: [
    { key: "thp", label: "Throw Power", category: "skill" },
    { key: "sac", label: "Short Accuracy", category: "skill" },
    { key: "mac", label: "Medium Accuracy", category: "skill" },
    { key: "dac", label: "Deep Accuracy", category: "skill" },
    { key: "spd", label: "Speed", category: "physical" },
    { key: "agi", label: "Agility", category: "physical" },
    { key: "football_iq", label: "Football IQ", category: "mental" },
    { key: "leadership", label: "Leadership", category: "mental" },
  ],
  RB: [
    { key: "spd", label: "Speed", category: "physical" },
    { key: "acc", label: "Acceleration", category: "physical" },
    { key: "agi", label: "Agility", category: "physical" },
    { key: "str", label: "Strength", category: "physical" },
    { key: "btk", label: "Break Tackle", category: "skill" },
    { key: "car", label: "Carrying", category: "skill" },
    { key: "cth", label: "Catching", category: "skill" },
    { key: "football_iq", label: "Football IQ", category: "mental" },
  ],
  WR: [
    { key: "spd", label: "Speed", category: "physical" },
    { key: "acc", label: "Acceleration", category: "physical" },
    { key: "agi", label: "Agility", category: "physical" },
    { key: "rte", label: "Route Running", category: "skill" },
    { key: "cth", label: "Catching", category: "skill" },
    { key: "cit", label: "Catch in Traffic", category: "skill" },
    { key: "rls", label: "Release", category: "skill" },
    { key: "football_iq", label: "Football IQ", category: "mental" },
  ],
  TE: [
    { key: "spd", label: "Speed", category: "physical" },
    { key: "str", label: "Strength", category: "physical" },
    { key: "cth", label: "Catching", category: "skill" },
    { key: "rte", label: "Route Running", category: "skill" },
    { key: "rblk", label: "Run Blocking", category: "skill" },
    { key: "pblk", label: "Pass Blocking", category: "skill" },
    { key: "football_iq", label: "Football IQ", category: "mental" },
    { key: "leadership", label: "Leadership", category: "mental" },
  ],
  OT: [
    { key: "str", label: "Strength", category: "physical" },
    { key: "agi", label: "Agility", category: "physical" },
    { key: "pblk", label: "Pass Blocking", category: "skill" },
    { key: "rblk", label: "Run Blocking", category: "skill" },
    { key: "football_iq", label: "Football IQ", category: "mental" },
    { key: "leadership", label: "Leadership", category: "mental" },
  ],
  DE: [
    { key: "spd", label: "Speed", category: "physical" },
    { key: "str", label: "Strength", category: "physical" },
    { key: "pmv", label: "Power Moves", category: "skill" },
    { key: "fmv", label: "Finesse Moves", category: "skill" },
    { key: "bsh", label: "Block Shedding", category: "skill" },
    { key: "tak", label: "Tackling", category: "skill" },
    { key: "football_iq", label: "Football IQ", category: "mental" },
    { key: "motor", label: "Motor", category: "mental" },
  ],
  LB: [
    { key: "spd", label: "Speed", category: "physical" },
    { key: "str", label: "Strength", category: "physical" },
    { key: "tak", label: "Tackling", category: "skill" },
    { key: "pur", label: "Pursuit", category: "skill" },
    { key: "mcv", label: "Man Coverage", category: "skill" },
    { key: "zcv", label: "Zone Coverage", category: "skill" },
    { key: "football_iq", label: "Football IQ", category: "mental" },
    { key: "leadership", label: "Leadership", category: "mental" },
  ],
  CB: [
    { key: "spd", label: "Speed", category: "physical" },
    { key: "acc", label: "Acceleration", category: "physical" },
    { key: "agi", label: "Agility", category: "physical" },
    { key: "mcv", label: "Man Coverage", category: "skill" },
    { key: "zcv", label: "Zone Coverage", category: "skill" },
    { key: "prs", label: "Press", category: "skill" },
    { key: "football_iq", label: "Football IQ", category: "mental" },
    { key: "leadership", label: "Leadership", category: "mental" },
  ],
  S: [
    { key: "spd", label: "Speed", category: "physical" },
    { key: "str", label: "Strength", category: "physical" },
    { key: "mcv", label: "Man Coverage", category: "skill" },
    { key: "zcv", label: "Zone Coverage", category: "skill" },
    { key: "tak", label: "Tackling", category: "skill" },
    { key: "pur", label: "Pursuit", category: "skill" },
    { key: "football_iq", label: "Football IQ", category: "mental" },
    { key: "leadership", label: "Leadership", category: "mental" },
  ],
};

// Default attributes for unknown positions
const DEFAULT_ATTRIBUTES: ProspectAttribute[] = [
  { key: "spd", label: "Speed", category: "physical" },
  { key: "acc", label: "Acceleration", category: "physical" },
  { key: "str", label: "Strength", category: "physical" },
  { key: "agi", label: "Agility", category: "physical" },
  { key: "football_iq", label: "Football IQ", category: "mental" },
  { key: "leadership", label: "Leadership", category: "mental" },
];

// Helper to get letter grade
function getLetterGrade(value: number): { letter: string; color: string } {
  if (value >= 95) return { letter: "A+", color: "text-emerald-600 bg-emerald-100" };
  if (value >= 90) return { letter: "A", color: "text-emerald-600 bg-emerald-100" };
  if (value >= 85) return { letter: "A-", color: "text-emerald-600 bg-emerald-100" };
  if (value >= 80) return { letter: "B+", color: "text-blue-600 bg-blue-100" };
  if (value >= 75) return { letter: "B", color: "text-blue-600 bg-blue-100" };
  if (value >= 70) return { letter: "B-", color: "text-blue-600 bg-blue-100" };
  if (value >= 65) return { letter: "C+", color: "text-amber-600 bg-amber-100" };
  if (value >= 60) return { letter: "C", color: "text-amber-600 bg-amber-100" };
  if (value >= 55) return { letter: "C-", color: "text-amber-600 bg-amber-100" };
  if (value >= 50) return { letter: "D+", color: "text-orange-600 bg-orange-100" };
  if (value >= 45) return { letter: "D", color: "text-orange-600 bg-orange-100" };
  if (value >= 40) return { letter: "D-", color: "text-orange-600 bg-orange-100" };
  return { letter: "F", color: "text-red-600 bg-red-100" };
}

// Helper to compare values
function getComparisonIndicator(
  value1: number | undefined,
  value2: number | undefined
): { winner: 1 | 2 | 0; diff: number } {
  if (value1 === undefined || value2 === undefined) {
    return { winner: 0, diff: 0 };
  }
  const diff = value1 - value2;
  if (Math.abs(diff) < 3) return { winner: 0, diff: 0 };
  return { winner: diff > 0 ? 1 : 2, diff: Math.abs(diff) };
}

// Get prospect attribute value (scouted or true)
function getAttributeValue(
  prospect: Prospect,
  key: string,
  useScouted: boolean
): { value?: number; range?: { low: number; high: number }; isScouted: boolean } {
  // Check scouted data first
  if (useScouted && prospect.scoutedData?.trait_reveals?.[key]) {
    const trait = prospect.scoutedData.trait_reveals[key];
    return {
      value: trait.estimate,
      range: { low: trait.low, high: trait.high },
      isScouted: true,
    };
  }

  // Check athletic bands
  if (useScouted && prospect.scoutedData?.athletic_bands?.[key]) {
    const band = prospect.scoutedData.athletic_bands[key];
    if (typeof band === "object" && band.low !== undefined) {
      return {
        value: Math.round((band.low + band.high) / 2),
        range: { low: band.low, high: band.high },
        isScouted: true,
      };
    }
  }

  // Fall back to true value
  const trueValue = (prospect as any)[key];
  if (trueValue !== undefined) {
    return { value: trueValue, isScouted: false };
  }

  return { value: undefined, isScouted: false };
}

// Prospect Card for comparison slot
function ProspectSlot({
  prospect,
  index,
  onRemove,
  onSearch,
  useScouted,
}: {
  prospect: Prospect | null;
  index: number;
  onRemove: () => void;
  onSearch: () => void;
  useScouted: boolean;
}) {
  if (!prospect) {
    return (
      <div
        onClick={onSearch}
        className="flex-1 border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
      >
        <Plus className="w-8 h-8 text-gray-400 mb-2" />
        <span className="text-gray-500 font-medium">Add Prospect</span>
        <span className="text-sm text-gray-400">Click to search</span>
      </div>
    );
  }

  // Get overall
  const overallData = useScouted && prospect.scoutedData
    ? {
        value:
          prospect.scoutedData.est_overall_low !== undefined &&
          prospect.scoutedData.est_overall_high !== undefined
            ? Math.round(
                (prospect.scoutedData.est_overall_low + prospect.scoutedData.est_overall_high) / 2
              )
            : prospect.overall,
        range:
          prospect.scoutedData.est_overall_low !== undefined &&
          prospect.scoutedData.est_overall_high !== undefined
            ? {
                low: prospect.scoutedData.est_overall_low,
                high: prospect.scoutedData.est_overall_high,
              }
            : undefined,
        isScouted: true,
      }
    : { value: prospect.overall, isScouted: false };

  const potentialData = useScouted && prospect.scoutedData
    ? {
        value:
          prospect.scoutedData.est_potential_low !== undefined &&
          prospect.scoutedData.est_potential_high !== undefined
            ? Math.round(
                (prospect.scoutedData.est_potential_low +
                  prospect.scoutedData.est_potential_high) /
                  2
              )
            : prospect.potential,
        range:
          prospect.scoutedData.est_potential_low !== undefined &&
          prospect.scoutedData.est_potential_high !== undefined
            ? {
                low: prospect.scoutedData.est_potential_low,
                high: prospect.scoutedData.est_potential_high,
              }
            : undefined,
        isScouted: true,
      }
    : { value: prospect.potential, isScouted: false };

  return (
    <div className="flex-1 border rounded-xl overflow-hidden bg-white shadow">
      {/* Header */}
      <div className={`p-4 ${index === 0 ? "bg-blue-600" : "bg-purple-600"} text-white`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">{prospect.full_name}</h3>
            <p className="text-white/80 text-sm">
              {prospect.position} - {prospect.college}
            </p>
          </div>
          <button
            onClick={onRemove}
            className="p-1 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 border-b">
        <div className="grid grid-cols-2 gap-4">
          {/* Overall */}
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase mb-1">Overall</div>
            <div className="text-3xl font-bold">
              {overallData.value ?? "?"}
              {overallData.range && (
                <span className="text-sm font-normal text-gray-400 ml-1">
                  ({overallData.range.low}-{overallData.range.high})
                </span>
              )}
            </div>
            {overallData.value && (
              <div
                className={`inline-block px-2 py-0.5 rounded text-xs font-medium mt-1 ${
                  getLetterGrade(overallData.value).color
                }`}
              >
                {getLetterGrade(overallData.value).letter}
              </div>
            )}
            {overallData.isScouted && (
              <div className="text-xs text-amber-600 mt-1">Scouted</div>
            )}
          </div>

          {/* Potential */}
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase mb-1">Potential</div>
            <div className="text-3xl font-bold">
              {potentialData.value ?? "?"}
              {potentialData.range && (
                <span className="text-sm font-normal text-gray-400 ml-1">
                  ({potentialData.range.low}-{potentialData.range.high})
                </span>
              )}
            </div>
            {potentialData.value && (
              <div
                className={`inline-block px-2 py-0.5 rounded text-xs font-medium mt-1 ${
                  getLetterGrade(potentialData.value).color
                }`}
              >
                {getLetterGrade(potentialData.value).letter}
              </div>
            )}
            {potentialData.isScouted && (
              <div className="text-xs text-amber-600 mt-1">Scouted</div>
            )}
          </div>
        </div>
      </div>

      {/* Bio */}
      <div className="p-4 text-sm text-gray-600">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <span className="text-gray-400">Age:</span> {prospect.age}
          </div>
          <div>
            <span className="text-gray-400">Ht:</span> {prospect.height || "N/A"}
          </div>
          <div>
            <span className="text-gray-400">Wt:</span> {prospect.weight || "N/A"}
          </div>
        </div>
      </div>

      {/* Scout Report */}
      {prospect.scoutedData?.scoutHeadline && (
        <div className="p-4 bg-gray-50 border-t">
          <div className="text-sm font-medium text-gray-700 mb-1">Scout's Take</div>
          <div className="text-sm italic text-gray-600">
            "{prospect.scoutedData.scoutHeadline}"
          </div>
        </div>
      )}
    </div>
  );
}

// Attribute Comparison Row
function AttributeRow({
  attr,
  prospect1,
  prospect2,
  useScouted,
}: {
  attr: ProspectAttribute;
  prospect1: Prospect | null;
  prospect2: Prospect | null;
  useScouted: boolean;
}) {
  const data1 = prospect1 ? getAttributeValue(prospect1, attr.key, useScouted) : { value: undefined, isScouted: false };
  const data2 = prospect2 ? getAttributeValue(prospect2, attr.key, useScouted) : { value: undefined, isScouted: false };

  const comparison = getComparisonIndicator(data1.value, data2.value);

  const categoryColors = {
    physical: "bg-red-50",
    skill: "bg-blue-50",
    mental: "bg-purple-50",
    scouting: "bg-amber-50",
  };

  return (
    <div className={`grid grid-cols-3 gap-4 p-3 ${categoryColors[attr.category]} rounded-lg`}>
      {/* Prospect 1 Value */}
      <div className="text-center">
        {data1.value !== undefined ? (
          <div className="flex items-center justify-center gap-2">
            <span
              className={`text-lg font-bold ${
                comparison.winner === 1 ? "text-green-600" : ""
              }`}
            >
              {data1.value}
            </span>
            {data1.range && (
              <span className="text-xs text-gray-400">
                ({data1.range.low}-{data1.range.high})
              </span>
            )}
            {comparison.winner === 1 && (
              <ArrowUp className="w-4 h-4 text-green-600" />
            )}
            {comparison.winner === 2 && (
              <ArrowDown className="w-4 h-4 text-red-500" />
            )}
            {data1.isScouted && (
              <Eye className="w-3 h-3 text-amber-500" title="Scouted" />
            )}
          </div>
        ) : (
          <span className="text-gray-400">?</span>
        )}
      </div>

      {/* Attribute Name */}
      <div className="text-center">
        <span className="text-sm font-medium text-gray-700">{attr.label}</span>
        {comparison.diff > 0 && (
          <div className="text-xs text-gray-500">+{comparison.diff} diff</div>
        )}
      </div>

      {/* Prospect 2 Value */}
      <div className="text-center">
        {data2.value !== undefined ? (
          <div className="flex items-center justify-center gap-2">
            {comparison.winner === 2 && (
              <ArrowUp className="w-4 h-4 text-green-600" />
            )}
            {comparison.winner === 1 && (
              <ArrowDown className="w-4 h-4 text-red-500" />
            )}
            <span
              className={`text-lg font-bold ${
                comparison.winner === 2 ? "text-green-600" : ""
              }`}
            >
              {data2.value}
            </span>
            {data2.range && (
              <span className="text-xs text-gray-400">
                ({data2.range.low}-{data2.range.high})
              </span>
            )}
            {data2.isScouted && (
              <Eye className="w-3 h-3 text-amber-500" title="Scouted" />
            )}
          </div>
        ) : (
          <span className="text-gray-400">?</span>
        )}
      </div>
    </div>
  );
}

// Search Modal
function ProspectSearchModal({
  isOpen,
  onClose,
  onSelect,
  allProspects,
  excludeIds,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (prospect: Prospect) => void;
  allProspects: Prospect[];
  excludeIds: string[];
}) {
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("");

  const filteredProspects = useMemo(() => {
    return allProspects
      .filter((p) => !excludeIds.includes(p.id))
      .filter((p) => {
        const matchesSearch =
          search === "" ||
          p.full_name.toLowerCase().includes(search.toLowerCase()) ||
          p.college.toLowerCase().includes(search.toLowerCase());
        const matchesPosition = positionFilter === "" || p.position === positionFilter;
        return matchesSearch && matchesPosition;
      })
      .slice(0, 50);
  }, [allProspects, excludeIds, search, positionFilter]);

  const positions = useMemo(() => {
    const posSet = new Set(allProspects.map((p) => p.position));
    return Array.from(posSet).sort();
  }, [allProspects]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">Select Prospect</h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or college..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Positions</option>
              {positions.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[60vh]">
          {filteredProspects.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No prospects found matching your criteria
            </div>
          ) : (
            <div className="divide-y">
              {filteredProspects.map((prospect) => (
                <div
                  key={prospect.id}
                  onClick={() => {
                    onSelect(prospect);
                    onClose();
                  }}
                  className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{prospect.full_name}</div>
                      <div className="text-sm text-gray-500">
                        {prospect.position} - {prospect.college}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold">{prospect.overall ?? "?"}</div>
                      <div className="text-xs text-gray-400">OVR</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Main Component
interface ProspectComparisonProps {
  allProspects: Prospect[];
  initialProspects?: [Prospect | null, Prospect | null];
  useScouted?: boolean;
  onClose?: () => void;
}

export function ProspectComparison({
  allProspects,
  initialProspects = [null, null],
  useScouted = true,
  onClose,
}: ProspectComparisonProps) {
  const [prospects, setProspects] = useState<[Prospect | null, Prospect | null]>(initialProspects);
  const [searchSlot, setSearchSlot] = useState<0 | 1 | null>(null);
  const [useScoutedData, setUseScoutedData] = useState(useScouted);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(["physical", "skill", "mental"])
  );

  // Get attributes based on positions
  const attributes = useMemo(() => {
    const pos1 = prospects[0]?.position;
    const pos2 = prospects[1]?.position;

    // If same position, use that position's attributes
    if (pos1 && pos1 === pos2) {
      return ATTRIBUTE_CONFIGS[pos1] || DEFAULT_ATTRIBUTES;
    }

    // If different positions, merge unique attributes
    const attrs1 = pos1 ? ATTRIBUTE_CONFIGS[pos1] || DEFAULT_ATTRIBUTES : [];
    const attrs2 = pos2 ? ATTRIBUTE_CONFIGS[pos2] || DEFAULT_ATTRIBUTES : [];

    const merged = new Map<string, ProspectAttribute>();
    [...attrs1, ...attrs2].forEach((attr) => {
      if (!merged.has(attr.key)) {
        merged.set(attr.key, attr);
      }
    });

    return Array.from(merged.values());
  }, [prospects]);

  // Group attributes by category
  const attributesByCategory = useMemo(() => {
    const grouped: Record<string, ProspectAttribute[]> = {
      physical: [],
      skill: [],
      mental: [],
    };

    attributes.forEach((attr) => {
      if (grouped[attr.category]) {
        grouped[attr.category].push(attr);
      }
    });

    return grouped;
  }, [attributes]);

  const handleSelectProspect = (prospect: Prospect) => {
    if (searchSlot !== null) {
      const newProspects: [Prospect | null, Prospect | null] = [...prospects];
      newProspects[searchSlot] = prospect;
      setProspects(newProspects);
      setSearchSlot(null);
    }
  };

  const handleRemoveProspect = (slot: 0 | 1) => {
    const newProspects: [Prospect | null, Prospect | null] = [...prospects];
    newProspects[slot] = null;
    setProspects(newProspects);
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const categoryIcons = {
    physical: <Zap className="w-4 h-4" />,
    skill: <Target className="w-4 h-4" />,
    mental: <Brain className="w-4 h-4" />,
  };

  const categoryColors = {
    physical: "text-red-600 bg-red-100",
    skill: "text-blue-600 bg-blue-100",
    mental: "text-purple-600 bg-purple-100",
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border">
      {/* Header */}
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-100 rounded-xl">
              <Scale className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Prospect Comparison</h2>
              <p className="text-sm text-gray-500">
                Compare two prospects side by side
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useScoutedData}
                onChange={(e) => setUseScoutedData(e.target.checked)}
                className="rounded"
              />
              Use Scouted Data
            </label>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Prospect Slots */}
      <div className="p-6 border-b">
        <div className="flex gap-6">
          <ProspectSlot
            prospect={prospects[0]}
            index={0}
            onRemove={() => handleRemoveProspect(0)}
            onSearch={() => setSearchSlot(0)}
            useScouted={useScoutedData}
          />
          <div className="flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
              <span className="text-lg font-bold text-gray-500">VS</span>
            </div>
          </div>
          <ProspectSlot
            prospect={prospects[1]}
            index={1}
            onRemove={() => handleRemoveProspect(1)}
            onSearch={() => setSearchSlot(1)}
            useScouted={useScoutedData}
          />
        </div>
      </div>

      {/* Attribute Comparison */}
      {prospects[0] || prospects[1] ? (
        <div className="p-6">
          {Object.entries(attributesByCategory).map(([category, attrs]) => {
            if (attrs.length === 0) return null;

            const isExpanded = expandedCategories.has(category);

            return (
              <div key={category} className="mb-4">
                <button
                  onClick={() => toggleCategory(category)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                    categoryColors[category as keyof typeof categoryColors]
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {categoryIcons[category as keyof typeof categoryIcons]}
                    <span className="font-medium capitalize">{category} Attributes</span>
                    <span className="text-xs opacity-70">({attrs.length})</span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </button>

                {isExpanded && (
                  <div className="mt-2 space-y-2">
                    {attrs.map((attr) => (
                      <AttributeRow
                        key={attr.key}
                        attr={attr}
                        prospect1={prospects[0]}
                        prospect2={prospects[1]}
                        useScouted={useScoutedData}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Legend */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Legend</h4>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-1">
                <ArrowUp className="w-4 h-4 text-green-600" />
                <span>Higher value</span>
              </div>
              <div className="flex items-center gap-1">
                <ArrowDown className="w-4 h-4 text-red-500" />
                <span>Lower value</span>
              </div>
              <div className="flex items-center gap-1">
                <Eye className="w-3 h-3 text-amber-500" />
                <span>Scouted (estimated)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-400">?</span>
                <span>Unknown</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center text-gray-500">
          <Scale className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium">Select prospects to compare</p>
          <p className="text-sm">Click the slots above to add prospects</p>
        </div>
      )}

      {/* Search Modal */}
      <ProspectSearchModal
        isOpen={searchSlot !== null}
        onClose={() => setSearchSlot(null)}
        onSelect={handleSelectProspect}
        allProspects={allProspects}
        excludeIds={prospects.filter((p) => p !== null).map((p) => p!.id)}
      />
    </div>
  );
}

export type { Prospect, ScoutedData };
