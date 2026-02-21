"use client";

import { useState, useMemo } from "react";
import {
  User,
  Target,
  Brain,
  Heart,
  Zap,
  Star,
  DollarSign,
  MapPin,
  Briefcase,
  TrendingUp,
  Award,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  AlertCircle,
  Sparkles,
  Shield,
} from "lucide-react";

interface Scout {
  id: string;
  name: string;
  archetype: string;
  evaluation: number;
  football_iq: number;
  athletic_analysis: number;
  psych_insight: number;
  medical_read: number;
  analytics: number;
  confidence: number;
  experience: number;
  communication: number;
  salary: number;
  reputation: number;
  loyalty: number;
  personality_type?: string;
  personality_bias?: number;
  personality_risk_tolerance?: number;
  personality_verbosity?: string;
  region?: string;
  qb_specialist?: number;
  wr_specialist?: number;
  ol_specialist?: number;
  dl_specialist?: number;
  db_specialist?: number;
  rb_specialist?: number;
}

interface ScoutWithPriority extends Scout {
  priority?: {
    level: number;
    weekly_points: number;
  };
  availablePoints?: number;
}

interface ScoutManagementProps {
  teamScouts: ScoutWithPriority[];
  availableScouts: Scout[];
  budget: number;
  currentSpend: number;
  onHire: (scoutId: string) => Promise<void>;
  onFire: (scoutId: string) => Promise<void>;
  onSetPriority: (scoutId: string, priority: 1 | 2 | 3 | 4) => Promise<void>;
  maxScouts?: number;
}

const PRIORITY_CONFIG = {
  1: { name: "Primary", points: 25, color: "bg-purple-600", textColor: "text-purple-600", bgLight: "bg-purple-100" },
  2: { name: "Secondary", points: 15, color: "bg-blue-600", textColor: "text-blue-600", bgLight: "bg-blue-100" },
  3: { name: "Tertiary", points: 10, color: "bg-yellow-600", textColor: "text-yellow-600", bgLight: "bg-yellow-100" },
  4: { name: "Quaternary", points: 5, color: "bg-slate-500", textColor: "text-slate-500", bgLight: "bg-slate-100" },
};

const ARCHETYPE_CONFIG: Record<
  string,
  { icon: typeof User; color: string; bgColor: string; description: string }
> = {
  evaluator: {
    icon: Target,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    description: "Strong overall evaluation, analytics-focused",
  },
  tape_grinder: {
    icon: Brain,
    color: "text-purple-600",
    bgColor: "bg-purple-100",
    description: "Film study expert, reveals traits and technique",
  },
  character_coach: {
    icon: Heart,
    color: "text-red-600",
    bgColor: "bg-red-100",
    description: "Psychology specialist, reveals character and medical",
  },
  athletic_analyst: {
    icon: Zap,
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
    description: "Athletic measurables expert, combine specialist",
  },
};

const PERSONALITY_CONFIG: Record<string, { label: string; color: string; description: string }> = {
  optimistic: { label: "Optimist", color: "text-green-600", description: "Sees upside in everyone" },
  pessimistic: { label: "Skeptic", color: "text-red-600", description: "Always finding flaws" },
  cautious: { label: "Cautious", color: "text-yellow-600", description: "Risk-averse evaluations" },
  bold: { label: "Bold", color: "text-purple-600", description: "High-risk, high-reward focus" },
  analytical: { label: "Analytical", color: "text-blue-600", description: "Data-driven approach" },
  old_school: { label: "Old School", color: "text-slate-600", description: "Trusts the eye test" },
};

function formatSalary(salary: number): string {
  if (salary >= 1000000) {
    return `$${(salary / 1000000).toFixed(1)}M`;
  }
  return `$${(salary / 1000).toFixed(0)}K`;
}

function formatArchetype(archetype: string): string {
  return archetype
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getAttributeColor(value: number): string {
  if (value >= 85) return "text-purple-600";
  if (value >= 75) return "text-blue-600";
  if (value >= 65) return "text-green-600";
  if (value >= 55) return "text-yellow-600";
  return "text-slate-500";
}

function AttributeBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-20 truncate">{label}</span>
      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${
            value >= 85
              ? "bg-purple-500"
              : value >= 75
              ? "bg-blue-500"
              : value >= 65
              ? "bg-green-500"
              : value >= 55
              ? "bg-yellow-500"
              : "bg-slate-400"
          }`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${getAttributeColor(value)}`}>
        {value}
      </span>
    </div>
  );
}

function ScoutCard({
  scout,
  isHired,
  priority,
  onHire,
  onFire,
  onSetPriority,
  canHire,
  missingArchetype,
}: {
  scout: ScoutWithPriority;
  isHired: boolean;
  priority?: number;
  onHire?: () => void;
  onFire?: () => void;
  onSetPriority?: (priority: 1 | 2 | 3 | 4) => void;
  canHire: boolean;
  missingArchetype?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);

  const archetypeConfig = ARCHETYPE_CONFIG[scout.archetype] || {
    icon: User,
    color: "text-slate-600",
    bgColor: "bg-slate-100",
    description: "Scout",
  };
  const Icon = archetypeConfig.icon;

  const personalityConfig = scout.personality_type
    ? PERSONALITY_CONFIG[scout.personality_type]
    : null;

  // Get position specialties
  const specialties = [
    { pos: "QB", value: scout.qb_specialist },
    { pos: "WR", value: scout.wr_specialist },
    { pos: "OL", value: scout.ol_specialist },
    { pos: "DL", value: scout.dl_specialist },
    { pos: "DB", value: scout.db_specialist },
    { pos: "RB", value: scout.rb_specialist },
  ].filter((s) => s.value && s.value > 0);

  return (
    <div
      className={`bg-white rounded-xl border-2 transition-all ${
        isHired
          ? "border-blue-300 shadow-md"
          : missingArchetype
          ? "border-green-300 shadow-sm"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar/Icon */}
          <div className={`w-12 h-12 rounded-xl ${archetypeConfig.bgColor} flex items-center justify-center`}>
            <Icon className={`w-6 h-6 ${archetypeConfig.color}`} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 truncate">{scout.name}</h3>
              {isHired && priority && (
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold text-white ${
                    PRIORITY_CONFIG[priority as 1 | 2 | 3 | 4]?.color || "bg-slate-500"
                  }`}
                >
                  P{priority}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={`font-semibold ${archetypeConfig.color}`}>
                {formatArchetype(scout.archetype)}
              </span>
              {personalityConfig && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className={personalityConfig.color}>{personalityConfig.label}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                {formatSalary(scout.salary)}/yr
              </span>
              <span className="flex items-center gap-1">
                <Briefcase className="w-3 h-3" />
                {scout.experience} yrs exp
              </span>
              {scout.region && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {scout.region}
                </span>
              )}
            </div>
          </div>

          {/* Reputation badge */}
          <div className="text-center">
            <div className="text-xs text-slate-500">Rep</div>
            <div
              className={`text-lg font-bold ${
                scout.reputation >= 80
                  ? "text-purple-600"
                  : scout.reputation >= 60
                  ? "text-blue-600"
                  : "text-slate-600"
              }`}
            >
              {scout.reputation}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <div className="text-center p-2 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-500">Eval</div>
            <div className={`font-bold ${getAttributeColor(scout.evaluation)}`}>
              {scout.evaluation}
            </div>
          </div>
          <div className="text-center p-2 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-500">IQ</div>
            <div className={`font-bold ${getAttributeColor(scout.football_iq)}`}>
              {scout.football_iq}
            </div>
          </div>
          <div className="text-center p-2 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-500">Athletic</div>
            <div className={`font-bold ${getAttributeColor(scout.athletic_analysis)}`}>
              {scout.athletic_analysis}
            </div>
          </div>
          <div className="text-center p-2 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-500">Psych</div>
            <div className={`font-bold ${getAttributeColor(scout.psych_insight)}`}>
              {scout.psych_insight}
            </div>
          </div>
        </div>

        {/* Position specialties */}
        {specialties.length > 0 && (
          <div className="mt-2 flex gap-1 flex-wrap">
            {specialties.map(({ pos, value }) => (
              <span
                key={pos}
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  value && value >= 80
                    ? "bg-purple-100 text-purple-700"
                    : value && value >= 60
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {pos} {value}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Expandable section */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 border-t border-slate-100 flex items-center justify-center gap-1 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
      >
        {expanded ? (
          <>
            <ChevronUp className="w-4 h-4" />
            Less Details
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" />
            More Details
          </>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
          <div className="text-sm text-slate-600">{archetypeConfig.description}</div>

          {personalityConfig && (
            <div className="text-sm">
              <span className="font-medium">Personality:</span>{" "}
              <span className={personalityConfig.color}>{personalityConfig.description}</span>
            </div>
          )}

          {/* All attributes */}
          <div className="space-y-1.5">
            <AttributeBar value={scout.evaluation} label="Evaluation" />
            <AttributeBar value={scout.football_iq} label="Football IQ" />
            <AttributeBar value={scout.athletic_analysis} label="Athletic" />
            <AttributeBar value={scout.psych_insight} label="Psych" />
            <AttributeBar value={scout.medical_read} label="Medical" />
            <AttributeBar value={scout.analytics} label="Analytics" />
            <AttributeBar value={scout.communication} label="Communication" />
          </div>

          {/* Loyalty */}
          <div className="flex items-center gap-2 text-sm">
            <Shield className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600">Loyalty:</span>
            <span className="font-bold">{scout.loyalty}%</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl">
        {isHired ? (
          <div className="flex items-center gap-2">
            {/* Priority picker */}
            <div className="relative flex-1">
              <button
                onClick={() => setShowPriorityPicker(!showPriorityPicker)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-between"
              >
                <span>
                  Priority: {priority ? PRIORITY_CONFIG[priority as 1 | 2 | 3 | 4]?.name : "Not Set"}
                </span>
                <ChevronDown className="w-4 h-4" />
              </button>
              {showPriorityPicker && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 overflow-hidden">
                  {([1, 2, 3, 4] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        onSetPriority?.(p);
                        setShowPriorityPicker(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center justify-between ${
                        priority === p ? "bg-blue-50" : ""
                      }`}
                    >
                      <span>
                        <span className="font-medium">{PRIORITY_CONFIG[p].name}</span>
                        <span className="text-slate-500 ml-2">({PRIORITY_CONFIG[p].points} pts/week)</span>
                      </span>
                      {priority === p && <Check className="w-4 h-4 text-blue-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={onFire}
              className="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
            >
              Fire
            </button>
          </div>
        ) : (
          <button
            onClick={onHire}
            disabled={!canHire}
            className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              canHire
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            {canHire ? (
              <>
                <Check className="w-4 h-4" />
                Hire Scout
              </>
            ) : (
              <>
                <X className="w-4 h-4" />
                Cannot Hire
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ScoutManagement({
  teamScouts,
  availableScouts,
  budget,
  currentSpend,
  onHire,
  onFire,
  onSetPriority,
  maxScouts = 4,
}: ScoutManagementProps) {
  const [filter, setFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("reputation");
  const [hiringInProgress, setHiringInProgress] = useState<string | null>(null);

  // Get hired archetypes
  const hiredArchetypes = useMemo(
    () => new Set(teamScouts.map((s) => s.archetype)),
    [teamScouts]
  );

  // Required archetypes
  const allArchetypes = ["evaluator", "tape_grinder", "character_coach", "athletic_analyst"];
  const missingArchetypes = allArchetypes.filter((a) => !hiredArchetypes.has(a));

  // Can hire more?
  const canHireMore = teamScouts.length < maxScouts;
  const remainingBudget = budget - currentSpend;

  // Filter and sort available scouts
  const filteredAvailable = useMemo(() => {
    let scouts = availableScouts.filter((s) => !teamScouts.find((ts) => ts.id === s.id));

    if (filter !== "all") {
      scouts = scouts.filter((s) => s.archetype === filter);
    }

    scouts.sort((a, b) => {
      switch (sortBy) {
        case "reputation":
          return b.reputation - a.reputation;
        case "salary_low":
          return a.salary - b.salary;
        case "salary_high":
          return b.salary - a.salary;
        case "experience":
          return b.experience - a.experience;
        default:
          return 0;
      }
    });

    return scouts;
  }, [availableScouts, teamScouts, filter, sortBy]);

  const handleHire = async (scoutId: string) => {
    setHiringInProgress(scoutId);
    try {
      await onHire(scoutId);
    } finally {
      setHiringInProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Scout Management</h2>
            <p className="text-slate-300 text-sm mt-1">
              Build your scouting department ({teamScouts.length}/{maxScouts} scouts)
            </p>
          </div>
          <div className="flex gap-4">
            <div className="text-center bg-slate-800/50 rounded-lg px-4 py-2">
              <div className="text-xs text-slate-400 uppercase">Budget</div>
              <div className="text-lg font-bold text-white">{formatSalary(budget)}</div>
            </div>
            <div className="text-center bg-slate-800/50 rounded-lg px-4 py-2">
              <div className="text-xs text-slate-400 uppercase">Spent</div>
              <div className="text-lg font-bold text-green-400">{formatSalary(currentSpend)}</div>
            </div>
            <div className="text-center bg-slate-800/50 rounded-lg px-4 py-2">
              <div className="text-xs text-slate-400 uppercase">Remaining</div>
              <div
                className={`text-lg font-bold ${
                  remainingBudget > 0 ? "text-blue-400" : "text-red-400"
                }`}
              >
                {formatSalary(remainingBudget)}
              </div>
            </div>
          </div>
        </div>

        {/* Missing archetypes warning */}
        {missingArchetypes.length > 0 && (
          <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-600/50 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-200 font-medium">Missing Archetypes</p>
              <p className="text-yellow-300/70 text-sm">
                Hire one of each archetype for full scouting capabilities:{" "}
                {missingArchetypes.map(formatArchetype).join(", ")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Your Team Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Award className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-bold text-slate-900">Your Scouting Staff</h3>
          <span className="text-sm text-slate-500">({teamScouts.length} hired)</span>
        </div>

        {teamScouts.length === 0 ? (
          <div className="bg-slate-50 rounded-xl p-8 text-center border-2 border-dashed border-slate-200">
            <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No scouts hired yet</p>
            <p className="text-slate-400 text-sm mt-1">
              Hire scouts below to start building your staff
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teamScouts.map((scout) => (
              <ScoutCard
                key={scout.id}
                scout={scout}
                isHired={true}
                priority={scout.priority?.level}
                onFire={() => onFire(scout.id)}
                onSetPriority={(p) => onSetPriority(scout.id, p)}
                canHire={false}
              />
            ))}
          </div>
        )}
      </div>

      {/* Available Scouts Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-slate-600" />
            <h3 className="text-lg font-bold text-slate-900">Available Scouts</h3>
            <span className="text-sm text-slate-500">({filteredAvailable.length} available)</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter by archetype */}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5"
            >
              <option value="all">All Archetypes</option>
              {allArchetypes.map((a) => (
                <option key={a} value={a}>
                  {formatArchetype(a)}
                  {missingArchetypes.includes(a) ? " *" : ""}
                </option>
              ))}
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5"
            >
              <option value="reputation">Best Reputation</option>
              <option value="salary_low">Lowest Salary</option>
              <option value="salary_high">Highest Salary</option>
              <option value="experience">Most Experience</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAvailable.map((scout) => (
            <ScoutCard
              key={scout.id}
              scout={scout}
              isHired={false}
              onHire={() => handleHire(scout.id)}
              canHire={
                canHireMore &&
                scout.salary <= remainingBudget &&
                !hiredArchetypes.has(scout.archetype)
              }
              missingArchetype={missingArchetypes.includes(scout.archetype)}
            />
          ))}
        </div>

        {filteredAvailable.length === 0 && (
          <div className="bg-slate-50 rounded-xl p-8 text-center">
            <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No scouts available</p>
            <p className="text-slate-400 text-sm mt-1">
              {filter !== "all"
                ? "Try changing your filter"
                : "All scouts have been hired"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
