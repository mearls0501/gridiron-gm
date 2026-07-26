"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Star,
  Sparkles,
  AlertTriangle,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Filter,
  Search,
  Download,
  Plus,
  Trash2,
  Eye,
  MoreHorizontal,
  Layers,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

export interface BigBoardProspect {
  id: string;
  rank: number;
  name: string;
  position: string;
  college?: string;
  overallEstimate?: number;
  overallRange?: { low: number; high: number };
  potentialEstimate?: number;
  potentialRange?: { low: number; high: number };
  confidence: "high" | "medium" | "low";
  tier?: number;
  notes?: string;
  tags?: string[];
  isScouted: boolean;
  boomPotential?: boolean;
  bustRisk?: "low" | "medium" | "high";
}

interface BigBoardTier {
  id: number;
  name: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const DEFAULT_TIERS: BigBoardTier[] = [
  { id: 1, name: "Elite", color: "text-purple-700", bgColor: "bg-purple-50", borderColor: "border-purple-300" },
  { id: 2, name: "Day 1 Starters", color: "text-blue-700", bgColor: "bg-blue-50", borderColor: "border-blue-300" },
  { id: 3, name: "Day 2 Value", color: "text-green-700", bgColor: "bg-green-50", borderColor: "border-green-300" },
  { id: 4, name: "Day 3 Picks", color: "text-yellow-700", bgColor: "bg-yellow-50", borderColor: "border-yellow-300" },
  { id: 5, name: "Priority UDFAs", color: "text-orange-700", bgColor: "bg-orange-50", borderColor: "border-orange-300" },
];

interface ProspectRowProps {
  prospect: BigBoardProspect;
  tier?: BigBoardTier;
  onRemove?: (id: string) => void;
  onView?: (id: string) => void;
  onNoteChange?: (id: string, note: string) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  onSetTier?: (id: string, tierId: number) => void;
  isFirst?: boolean;
  isLast?: boolean;
  tiers?: BigBoardTier[];
}

function ProspectRow({
  prospect,
  tier,
  onRemove,
  onView,
  onNoteChange,
  onMoveUp,
  onMoveDown,
  onSetTier,
  isFirst,
  isLast,
  tiers = DEFAULT_TIERS,
}: ProspectRowProps) {
  const [showNotes, setShowNotes] = useState(false);
  const [noteText, setNoteText] = useState(prospect.notes || "");
  const [showTierPicker, setShowTierPicker] = useState(false);

  return (
    <div className="group bg-white border border-slate-200 rounded-lg mb-2 hover:shadow-md transition-all">
      <div className="flex items-center p-3 gap-3">
        {/* Move buttons */}
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => onMoveUp?.(prospect.id)}
            disabled={isFirst}
            className={`p-1 rounded ${
              isFirst
                ? "text-slate-200 cursor-not-allowed"
                : "text-slate-400 hover:text-blue-600 hover:bg-blue-50"
            }`}
            title="Move up"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => onMoveDown?.(prospect.id)}
            disabled={isLast}
            className={`p-1 rounded ${
              isLast
                ? "text-slate-200 cursor-not-allowed"
                : "text-slate-400 hover:text-blue-600 hover:bg-blue-50"
            }`}
            title="Move down"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        </div>

        {/* Rank */}
        <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
          {prospect.rank}
        </div>

        {/* Player info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 truncate">{prospect.name}</span>
            {prospect.boomPotential && (
              <span title="Boom potential">
                <Sparkles className="w-4 h-4 text-purple-500" />
              </span>
            )}
            {prospect.bustRisk === "high" && (
              <span title="High bust risk">
                <TrendingDown className="w-4 h-4 text-red-500" />
              </span>
            )}
            {!prospect.isScouted && (
              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-xs rounded">
                Unscouted
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="font-semibold text-blue-600">{prospect.position}</span>
            {prospect.college && (
              <>
                <span>•</span>
                <span className="truncate">{prospect.college}</span>
              </>
            )}
          </div>
        </div>

        {/* Overall rating */}
        <div className="text-center min-w-[60px]">
          <div className="text-xs text-slate-500 uppercase">OVR</div>
          {prospect.overallEstimate ? (
            <div className="font-bold text-lg text-slate-900">
              {prospect.overallEstimate}
            </div>
          ) : prospect.overallRange ? (
            <div className="text-sm font-medium text-slate-600">
              {prospect.overallRange.low}-{prospect.overallRange.high}
            </div>
          ) : (
            <div className="text-slate-400">??</div>
          )}
        </div>

        {/* Potential rating */}
        <div className="text-center min-w-[60px]">
          <div className="text-xs text-slate-500 uppercase">POT</div>
          {prospect.potentialEstimate ? (
            <div className="font-bold text-lg text-slate-900">
              {prospect.potentialEstimate}
            </div>
          ) : prospect.potentialRange ? (
            <div className="text-sm font-medium text-slate-600">
              {prospect.potentialRange.low}-{prospect.potentialRange.high}
            </div>
          ) : (
            <div className="text-slate-400">??</div>
          )}
        </div>

        {/* Confidence */}
        <div
          className={`px-2 py-1 rounded text-xs font-bold uppercase ${
            prospect.confidence === "high"
              ? "bg-green-100 text-green-700"
              : prospect.confidence === "medium"
              ? "bg-yellow-100 text-yellow-700"
              : "bg-orange-100 text-orange-700"
          }`}
        >
          {prospect.confidence}
        </div>

        {/* Tier badge / picker */}
        <div className="relative">
          <button
            onClick={() => setShowTierPicker(!showTierPicker)}
            className={`px-2 py-1 rounded text-xs font-semibold border transition-colors ${
              tier
                ? `${tier.bgColor} ${tier.color} ${tier.borderColor}`
                : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
            }`}
          >
            {tier ? `T${tier.id}` : "Tier"}
          </button>
          {showTierPicker && (
            <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 overflow-hidden min-w-[140px]">
              {tiers.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onSetTier?.(prospect.id, t.id);
                    setShowTierPicker(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center justify-between ${
                    prospect.tier === t.id ? "bg-blue-50" : ""
                  }`}
                >
                  <span className={`font-medium ${t.color}`}>{t.name}</span>
                </button>
              ))}
              <button
                onClick={() => {
                  onSetTier?.(prospect.id, 0);
                  setShowTierPicker(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 text-slate-500 border-t border-slate-100"
              >
                No Tier
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
            title="Notes"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {onView && (
            <button
              onClick={() => onView(prospect.id)}
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
              title="View details"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          {onRemove && (
            <button
              onClick={() => onRemove(prospect.id)}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
              title="Remove from board"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expandable notes */}
      {showNotes && (
        <div className="px-3 pb-3 border-t border-slate-100 mt-1 pt-3">
          <textarea
            value={noteText}
            onChange={(e) => {
              setNoteText(e.target.value);
              onNoteChange?.(prospect.id, e.target.value);
            }}
            placeholder="Add notes about this prospect..."
            className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            rows={2}
          />
          {prospect.tags && prospect.tags.length > 0 && (
            <div className="flex gap-1 mt-2">
              {prospect.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface BigBoardProps {
  prospects: BigBoardProspect[];
  onBoardChange?: (prospects: BigBoardProspect[]) => void;
  onProspectView?: (id: string) => void;
  onSave?: (board: BigBoardProspect[]) => void;
  availableProspects?: BigBoardProspect[];
  onAddProspect?: (id: string) => void;
  tiers?: BigBoardTier[];
}

export default function BigBoard({
  prospects: initialProspects,
  onBoardChange,
  onProspectView,
  onSave,
  availableProspects = [],
  onAddProspect,
  tiers = DEFAULT_TIERS,
}: BigBoardProps) {
  const [prospects, setProspects] = useState<BigBoardProspect[]>(initialProspects);
  const [filterPosition, setFilterPosition] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showTiers, setShowTiers] = useState(true);
  const [showAddPanel, setShowAddPanel] = useState(false);

  // Get unique positions for filter
  const positions = useMemo(() => {
    const posSet = new Set(prospects.map((p) => p.position));
    return Array.from(posSet).sort();
  }, [prospects]);

  // Filter and search prospects
  const filteredProspects = useMemo(() => {
    return prospects.filter((p) => {
      const matchesPosition = filterPosition === "all" || p.position === filterPosition;
      const matchesSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.college?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesPosition && matchesSearch;
    });
  }, [prospects, filterPosition, searchQuery]);

  // Group by tier if enabled
  const prospectsByTier = useMemo<Record<number, BigBoardProspect[]>>(() => {
    if (!showTiers) return { 0: filteredProspects };

    const grouped: Record<number, BigBoardProspect[]> = {};
    tiers.forEach((tier) => {
      grouped[tier.id] = [];
    });
    grouped[0] = []; // Untiered

    filteredProspects.forEach((p) => {
      const tierId = p.tier || 0;
      if (grouped[tierId]) {
        grouped[tierId].push(p);
      } else {
        grouped[0].push(p);
      }
    });

    return grouped;
  }, [filteredProspects, showTiers, tiers]);

  const moveProspect = useCallback((id: string, direction: "up" | "down") => {
    setProspects((items) => {
      const index = items.findIndex((p) => p.id === id);
      if (index === -1) return items;

      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= items.length) return items;

      const newItems = [...items];
      [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];

      // Update ranks
      const rankedItems = newItems.map((item, idx) => ({
        ...item,
        rank: idx + 1,
      }));

      onBoardChange?.(rankedItems);
      return rankedItems;
    });
  }, [onBoardChange]);

  const handleRemoveProspect = (id: string) => {
    setProspects((items) => {
      const newItems = items.filter((p) => p.id !== id);
      const rankedItems = newItems.map((item, index) => ({
        ...item,
        rank: index + 1,
      }));
      onBoardChange?.(rankedItems);
      return rankedItems;
    });
  };

  const handleNoteChange = (id: string, note: string) => {
    setProspects((items) => {
      const newItems = items.map((p) =>
        p.id === id ? { ...p, notes: note } : p
      );
      onBoardChange?.(newItems);
      return newItems;
    });
  };

  const handleSetTier = (id: string, tierId: number) => {
    setProspects((items) => {
      const newItems = items.map((p) =>
        p.id === id ? { ...p, tier: tierId || undefined } : p
      );
      onBoardChange?.(newItems);
      return newItems;
    });
  };

  const handleAddToBoardFromAvailable = (id: string) => {
    const prospectToAdd = availableProspects.find((p) => p.id === id);
    if (prospectToAdd) {
      const newProspect = {
        ...prospectToAdd,
        rank: prospects.length + 1,
      };
      const newProspects = [...prospects, newProspect];
      setProspects(newProspects);
      onBoardChange?.(newProspects);
      onAddProspect?.(id);
    }
  };

  const renderProspectList = (prospectList: BigBoardProspect[], tier?: BigBoardTier) => {
    return prospectList.map((prospect, index) => (
      <ProspectRow
        key={prospect.id}
        prospect={prospect}
        tier={tier}
        onRemove={handleRemoveProspect}
        onView={onProspectView}
        onNoteChange={handleNoteChange}
        onMoveUp={(id) => moveProspect(id, "up")}
        onMoveDown={(id) => moveProspect(id, "down")}
        onSetTier={handleSetTier}
        isFirst={index === 0}
        isLast={index === prospectList.length - 1}
        tiers={tiers}
      />
    ));
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layers className="w-6 h-6 text-white" />
            <div>
              <h2 className="text-xl font-bold text-white">Draft Big Board</h2>
              <p className="text-slate-300 text-sm">
                {prospects.length} prospects ranked
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTiers(!showTiers)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                showTiers
                  ? "bg-blue-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              Tiers {showTiers ? "On" : "Off"}
            </button>
            {onSave && (
              <button
                onClick={() => onSave(prospects)}
                className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1"
              >
                <Download className="w-4 h-4" />
                Save
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-4 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search prospects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Position filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={filterPosition}
            onChange={(e) => setFilterPosition(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Positions</option>
            {positions.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
        </div>

        {/* Add prospect button */}
        {availableProspects.length > 0 && (
          <button
            onClick={() => setShowAddPanel(!showAddPanel)}
            className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Prospect
          </button>
        )}
      </div>

      {/* Add Prospect Panel */}
      {showAddPanel && availableProspects.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-200 bg-blue-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-800">
              Add to Board ({availableProspects.length} available)
            </h3>
            <button
              onClick={() => setShowAddPanel(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-2 flex-wrap max-h-[150px] overflow-y-auto">
            {availableProspects.slice(0, 20).map((p) => (
              <button
                key={p.id}
                onClick={() => handleAddToBoardFromAvailable(p.id)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm hover:border-blue-400 hover:bg-blue-50 transition-colors flex items-center gap-2"
              >
                <span className="font-semibold text-blue-600">{p.position}</span>
                <span className="text-slate-700">{p.name}</span>
                {p.overallEstimate && (
                  <span className="text-slate-500">({p.overallEstimate})</span>
                )}
              </button>
            ))}
            {availableProspects.length > 20 && (
              <span className="text-sm text-slate-500 self-center">
                +{availableProspects.length - 20} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Board Content */}
      <div className="p-4">
        {showTiers ? (
          // Tiered view
          <div className="space-y-6">
            {tiers.map((tier) => {
              const tierProspects = prospectsByTier[tier.id] || [];
              if (tierProspects.length === 0 && filterPosition !== "all") return null;

              return (
                <div key={tier.id}>
                  <div
                    className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg ${tier.bgColor} border ${tier.borderColor}`}
                  >
                    <span className={`font-bold ${tier.color}`}>
                      Tier {tier.id}: {tier.name}
                    </span>
                    <span className="text-sm text-slate-500">
                      ({tierProspects.length} prospects)
                    </span>
                  </div>
                  {tierProspects.length > 0 ? (
                    renderProspectList(tierProspects, tier)
                  ) : (
                    <div className="text-center py-4 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-lg">
                      Set tier for prospects to add them here
                    </div>
                  )}
                </div>
              );
            })}

            {/* Untiered */}
            {(prospectsByTier[0]?.length || 0) > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-slate-100 border border-slate-300">
                  <span className="font-bold text-slate-700">Untiered</span>
                  <span className="text-sm text-slate-500">
                    ({prospectsByTier[0].length} prospects)
                  </span>
                </div>
                {renderProspectList(prospectsByTier[0])}
              </div>
            )}
          </div>
        ) : (
          // Flat list view
          renderProspectList(filteredProspects)
        )}

        {filteredProspects.length === 0 && (
          <div className="text-center py-12">
            <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No prospects on your board</p>
            <p className="text-slate-400 text-sm mt-1">
              {searchQuery || filterPosition !== "all"
                ? "Try adjusting your filters"
                : "Add prospects to start building your rankings"}
            </p>
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-sm text-slate-600">
        <div className="flex items-center gap-4">
          <span>
            <strong>{filteredProspects.length}</strong> prospects showing
          </span>
          {filterPosition !== "all" && (
            <span className="text-blue-600">Filtered: {filterPosition}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <Star className="w-4 h-4 text-green-500" />
            <span>High confidence: {prospects.filter((p) => p.confidence === "high").length}</span>
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <span>Low confidence: {prospects.filter((p) => p.confidence === "low").length}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
