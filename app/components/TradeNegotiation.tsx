"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  Phone,
  PhoneOff,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  History,
  Calculator,
  Users,
  Zap,
  RotateCcw,
  Send,
  MessageSquare,
  Star,
  Shield,
} from "lucide-react";
import {
  DraftPick,
  TradePackage,
  getPickValue,
  calculateTradeValue,
  evaluateTradeFairness,
  formatPick,
  FAMOUS_TRADES,
  PICK_VALUE_CHART,
} from "@/lib/draft/draft-utils";

// Team interface
interface Team {
  id: string;
  name: string;
  abbreviation: string;
  primaryColor?: string;
  needs?: string[];
  picks: number[];
}

// Trade history item
interface TradeHistoryItem {
  id: string;
  timestamp: Date;
  with: string;
  picksGiven: number[];
  picksReceived: number[];
  status: "accepted" | "rejected" | "countered";
}

// Pick Value Badge
function PickValueBadge({ pick }: { pick: number }) {
  const value = getPickValue(pick);
  const round = Math.ceil(pick / 32);

  const roundColors: Record<number, string> = {
    1: "bg-amber-100 text-amber-800 border-amber-300",
    2: "bg-purple-100 text-purple-800 border-purple-300",
    3: "bg-blue-100 text-blue-800 border-blue-300",
    4: "bg-green-100 text-green-800 border-green-300",
    5: "bg-teal-100 text-teal-800 border-teal-300",
    6: "bg-gray-100 text-gray-800 border-gray-300",
    7: "bg-gray-100 text-gray-700 border-gray-300",
  };

  return (
    <div className={`px-3 py-2 rounded-lg border ${roundColors[round] || roundColors[7]}`}>
      <div className="font-bold">#{pick}</div>
      <div className="text-xs opacity-75">
        Rd {round} • {value} pts
      </div>
    </div>
  );
}

// Selectable Pick Card
function SelectablePickCard({
  pick,
  isSelected,
  onToggle,
  disabled,
}: {
  pick: number;
  isSelected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const value = getPickValue(pick);
  const round = Math.ceil(pick / 32);
  const pickInRound = ((pick - 1) % 32) + 1;

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`p-3 rounded-lg border-2 transition-all ${
        disabled
          ? "opacity-50 cursor-not-allowed bg-gray-100 border-gray-200"
          : isSelected
            ? "bg-blue-50 border-blue-500 shadow-md"
            : "bg-white border-gray-200 hover:border-gray-400"
      }`}
    >
      <div className="text-lg font-bold">#{pick}</div>
      <div className="text-xs text-gray-500">
        R{round}.{pickInRound}
      </div>
      <div className="text-sm font-medium text-gray-700 mt-1">{value} pts</div>
      {isSelected && (
        <div className="mt-1">
          <Check className="w-4 h-4 text-blue-600 mx-auto" />
        </div>
      )}
    </button>
  );
}

// Trade Value Meter
function TradeValueMeter({
  yourValue,
  theirValue,
}: {
  yourValue: number;
  theirValue: number;
}) {
  const totalValue = yourValue + theirValue;
  const yourPercent = totalValue > 0 ? (yourValue / totalValue) * 100 : 50;
  const difference = theirValue - yourValue;
  const { verdict } = evaluateTradeFairness([1], [1]); // Dummy call to get type

  let verdictText: string;
  let verdictColor: string;
  let verdictBg: string;

  if (difference > yourValue * 0.2) {
    verdictText = "STEAL";
    verdictColor = "text-green-600";
    verdictBg = "bg-green-100";
  } else if (difference > yourValue * -0.1) {
    verdictText = "FAIR";
    verdictColor = "text-blue-600";
    verdictBg = "bg-blue-100";
  } else if (difference > yourValue * -0.25) {
    verdictText = "OVERPAY";
    verdictColor = "text-amber-600";
    verdictBg = "bg-amber-100";
  } else {
    verdictText = "BAD DEAL";
    verdictColor = "text-red-600";
    verdictBg = "bg-red-100";
  }

  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-600">Trade Balance</span>
        <span className={`px-3 py-1 rounded-full text-sm font-bold ${verdictColor} ${verdictBg}`}>
          {verdictText}
        </span>
      </div>

      {/* Balance Bar */}
      <div className="h-4 bg-gray-200 rounded-full overflow-hidden flex">
        <div
          className="h-full bg-red-400 transition-all duration-300"
          style={{ width: `${yourPercent}%` }}
        />
        <div
          className="h-full bg-green-400 transition-all duration-300"
          style={{ width: `${100 - yourPercent}%` }}
        />
      </div>

      <div className="flex justify-between mt-2 text-sm">
        <div className="text-red-600">
          You Give: <span className="font-bold">{yourValue}</span>
        </div>
        <div className={`font-bold ${difference >= 0 ? "text-green-600" : "text-red-600"}`}>
          {difference >= 0 ? "+" : ""}{difference}
        </div>
        <div className="text-green-600">
          You Get: <span className="font-bold">{theirValue}</span>
        </div>
      </div>
    </div>
  );
}

// Historical Trade Comparison
function HistoricalComparison({
  yourPicks,
  theirPicks,
}: {
  yourPicks: number[];
  theirPicks: number[];
}) {
  const yourValue = calculateTradeValue(yourPicks);
  const theirValue = calculateTradeValue(theirPicks);
  const tradeDiff = yourValue > 0 ? ((theirValue - yourValue) / yourValue) * 100 : 0;

  // Find similar historical trades
  const similarTrades = useMemo(() => {
    if (yourPicks.length === 0 || theirPicks.length === 0) return [];

    const topPick = Math.min(...yourPicks, ...theirPicks);
    return FAMOUS_TRADES.filter((trade) => {
      const pickDiff = Math.abs(trade.picksMoved - topPick);
      return pickDiff < 15;
    });
  }, [yourPicks, theirPicks]);

  if (similarTrades.length === 0) {
    return null;
  }

  return (
    <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-5 h-5 text-amber-600" />
        <span className="font-medium text-amber-900">Historical Comparisons</span>
      </div>
      <div className="space-y-2">
        {similarTrades.slice(0, 2).map((trade, i) => (
          <div key={i} className="p-3 bg-white rounded-lg border border-amber-100">
            <div className="font-medium text-gray-900">{trade.name}</div>
            <div className="text-sm text-gray-600">{trade.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Trade Urgency Timer
function TradeUrgencyTimer({
  expiresAt,
  onExpire,
}: {
  expiresAt?: Date;
  onExpire?: () => void;
}) {
  const [timeLeft, setTimeLeft] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!expiresAt) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setTimeLeft(diff);

      if (diff === 0 && onExpire) {
        onExpire();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  if (timeLeft === null) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isUrgent = timeLeft < 30;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
        isUrgent ? "bg-red-100 text-red-700 animate-pulse" : "bg-gray-100 text-gray-700"
      }`}
    >
      <Clock className="w-4 h-4" />
      <span className="font-mono font-bold">
        {minutes}:{seconds.toString().padStart(2, "0")}
      </span>
      {isUrgent && <span className="text-xs">DECIDE NOW!</span>}
    </div>
  );
}

// AI Trade Suggestion
function AITradeSuggestion({
  targetPick,
  yourPicks,
  onApply,
}: {
  targetPick: number;
  yourPicks: number[];
  onApply: (picks: number[]) => void;
}) {
  const suggestion = useMemo(() => {
    const targetValue = getPickValue(targetPick);
    const availablePicks = yourPicks.filter((p) => p > targetPick).sort((a, b) => a - b);

    // Find best combination
    let bestCombo: number[] = [];
    let bestDiff = Infinity;

    for (let i = 0; i < availablePicks.length; i++) {
      const value1 = getPickValue(availablePicks[i]);

      if (Math.abs(value1 - targetValue) < bestDiff) {
        bestCombo = [availablePicks[i]];
        bestDiff = Math.abs(value1 - targetValue);
      }

      for (let j = i + 1; j < availablePicks.length; j++) {
        const totalValue = value1 + getPickValue(availablePicks[j]);

        if (Math.abs(totalValue - targetValue) < bestDiff) {
          bestCombo = [availablePicks[i], availablePicks[j]];
          bestDiff = Math.abs(totalValue - targetValue);
        }

        for (let k = j + 1; k < availablePicks.length && bestCombo.length < 3; k++) {
          const threeValue = totalValue + getPickValue(availablePicks[k]);

          if (Math.abs(threeValue - targetValue) < bestDiff) {
            bestCombo = [availablePicks[i], availablePicks[j], availablePicks[k]];
            bestDiff = Math.abs(threeValue - targetValue);
          }
        }
      }
    }

    return bestCombo;
  }, [targetPick, yourPicks]);

  if (suggestion.length === 0) return null;

  const suggestionValue = calculateTradeValue(suggestion);
  const targetValue = getPickValue(targetPick);
  const diff = suggestionValue - targetValue;

  return (
    <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="w-5 h-5 text-blue-600" />
        <span className="font-medium text-blue-900">AI Suggested Offer</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {suggestion.map((pick) => (
          <PickValueBadge key={pick} pick={pick} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-blue-700">
          Total: {suggestionValue} pts ({diff >= 0 ? "+" : ""}{diff} from target)
        </span>
        <button
          onClick={() => onApply(suggestion)}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Apply Suggestion
        </button>
      </div>
    </div>
  );
}

// Counter Offer Builder
function CounterOfferBuilder({
  originalOffer: _originalOffer,
  yourPicks,
  theirPicks,
  onSend,
  onCancel,
}: {
  originalOffer: TradePackage;
  yourPicks: number[];
  theirPicks: number[];
  onSend: (yourOffer: number[], theirOffer: number[], message: string) => void;
  onCancel: () => void;
}) {
  const [selectedYourPicks, setSelectedYourPicks] = useState<number[]>([]);
  const [selectedTheirPicks, setSelectedTheirPicks] = useState<number[]>([]);
  const [message, setMessage] = useState("");

  const yourValue = calculateTradeValue(selectedYourPicks);
  const theirValue = calculateTradeValue(selectedTheirPicks);

  const toggleYourPick = (pick: number) => {
    setSelectedYourPicks((prev) =>
      prev.includes(pick) ? prev.filter((p) => p !== pick) : [...prev, pick]
    );
  };

  const toggleTheirPick = (pick: number) => {
    setSelectedTheirPicks((prev) =>
      prev.includes(pick) ? prev.filter((p) => p !== pick) : [...prev, pick]
    );
  };

  const canSend = selectedYourPicks.length > 0 && selectedTheirPicks.length > 0;

  return (
    <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-900">Build Counter Offer</h3>
        <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-lg">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Your Picks */}
        <div>
          <div className="text-sm font-medium text-gray-700 mb-3">Your Picks to Offer</div>
          <div className="grid grid-cols-3 gap-2">
            {yourPicks.map((pick) => (
              <SelectablePickCard
                key={pick}
                pick={pick}
                isSelected={selectedYourPicks.includes(pick)}
                onToggle={() => toggleYourPick(pick)}
              />
            ))}
          </div>
        </div>

        {/* Their Picks */}
        <div>
          <div className="text-sm font-medium text-gray-700 mb-3">Picks You Want</div>
          <div className="grid grid-cols-3 gap-2">
            {theirPicks.map((pick) => (
              <SelectablePickCard
                key={pick}
                pick={pick}
                isSelected={selectedTheirPicks.includes(pick)}
                onToggle={() => toggleTheirPick(pick)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Value Meter */}
      {(selectedYourPicks.length > 0 || selectedTheirPicks.length > 0) && (
        <TradeValueMeter yourValue={yourValue} theirValue={theirValue} />
      )}

      {/* Message */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Message (optional)
        </label>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add a message to your counter offer..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={() => onSend(selectedYourPicks, selectedTheirPicks, message)}
          disabled={!canSend}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
            canSend
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          <Send className="w-4 h-4" />
          Send Counter
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Main Trade Negotiation Component
interface TradeNegotiationProps {
  yourTeam: Team;
  allTeams: Team[];
  currentPick?: number;
  incomingOffer?: TradePackage | null;
  tradeHistory?: TradeHistoryItem[];
  onProposeTrade: (
    teamId: string,
    picksOffered: number[],
    picksRequested: number[],
    message?: string
  ) => void;
  onAcceptTrade: (tradeId: string) => void;
  onRejectTrade: (tradeId: string) => void;
  onCounterTrade: (
    tradeId: string,
    picksOffered: number[],
    picksRequested: number[],
    message?: string
  ) => void;
  onClose?: () => void;
}

export function TradeNegotiation({
  yourTeam,
  allTeams,
  currentPick,
  incomingOffer,
  tradeHistory = [],
  onProposeTrade,
  onAcceptTrade,
  onRejectTrade,
  onCounterTrade,
  onClose,
}: TradeNegotiationProps) {
  const [mode, setMode] = useState<"propose" | "incoming" | "history">(
    incomingOffer ? "incoming" : "propose"
  );
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedYourPicks, setSelectedYourPicks] = useState<number[]>([]);
  const [selectedTheirPicks, setSelectedTheirPicks] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [showCounterBuilder, setShowCounterBuilder] = useState(false);
  const [showTeamSelector, setShowTeamSelector] = useState(false);

  // Filter out your team
  const otherTeams = allTeams.filter((t) => t.id !== yourTeam.id);

  // Calculate values
  const yourValue = calculateTradeValue(selectedYourPicks);
  const theirValue = calculateTradeValue(selectedTheirPicks);

  const toggleYourPick = (pick: number) => {
    setSelectedYourPicks((prev) =>
      prev.includes(pick) ? prev.filter((p) => p !== pick) : [...prev, pick]
    );
  };

  const toggleTheirPick = (pick: number) => {
    setSelectedTheirPicks((prev) =>
      prev.includes(pick) ? prev.filter((p) => p !== pick) : [...prev, pick]
    );
  };

  const resetProposal = () => {
    setSelectedYourPicks([]);
    setSelectedTheirPicks([]);
    setMessage("");
    setSelectedTeam(null);
  };

  const handlePropose = () => {
    if (!selectedTeam || selectedYourPicks.length === 0 || selectedTheirPicks.length === 0) return;

    onProposeTrade(selectedTeam.id, selectedYourPicks, selectedTheirPicks, message || undefined);
    resetProposal();
  };

  const handleAccept = () => {
    if (incomingOffer) {
      onAcceptTrade(incomingOffer.id);
    }
  };

  const handleReject = () => {
    if (incomingOffer) {
      onRejectTrade(incomingOffer.id);
    }
  };

  const handleCounter = (yourOffer: number[], theirOffer: number[], counterMessage: string) => {
    if (incomingOffer) {
      onCounterTrade(incomingOffer.id, yourOffer, theirOffer, counterMessage || undefined);
      setShowCounterBuilder(false);
    }
  };

  // Apply AI suggestion
  const handleApplySuggestion = (picks: number[]) => {
    setSelectedYourPicks(picks);
  };

  return (
    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-4xl w-full">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <ArrowLeftRight className="w-6 h-6" />
            <h2 className="text-xl font-bold">Trade Center</h2>
            {incomingOffer && (
              <span className="px-3 py-1 bg-amber-500 text-white text-sm font-bold rounded-full animate-pulse">
                INCOMING OFFER
              </span>
            )}
          </div>
          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setMode("propose")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            mode === "propose"
              ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Send className="w-4 h-4" />
            Propose Trade
          </div>
        </button>
        <button
          onClick={() => setMode("incoming")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            mode === "incoming"
              ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Phone className="w-4 h-4" />
            Incoming
            {incomingOffer && (
              <span className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                1
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => setMode("history")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            mode === "history"
              ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <History className="w-4 h-4" />
            History
          </div>
        </button>
      </div>

      {/* Content */}
      <div className="p-6">
        {mode === "propose" && (
          <div className="space-y-6">
            {/* Team Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trade Partner
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowTeamSelector(!showTeamSelector)}
                  className="w-full flex items-center justify-between px-4 py-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
                >
                  {selectedTeam ? (
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs"
                        style={{ backgroundColor: selectedTeam.primaryColor || "#6B7280" }}
                      >
                        {selectedTeam.abbreviation}
                      </div>
                      <span className="font-medium">{selectedTeam.name}</span>
                      <span className="text-sm text-gray-500">
                        ({selectedTeam.picks.length} picks)
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-400">Select a team...</span>
                  )}
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                </button>

                {showTeamSelector && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {otherTeams.map((team) => (
                      <button
                        key={team.id}
                        onClick={() => {
                          setSelectedTeam(team);
                          setShowTeamSelector(false);
                          setSelectedTheirPicks([]);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs"
                          style={{ backgroundColor: team.primaryColor || "#6B7280" }}
                        >
                          {team.abbreviation}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="font-medium">{team.name}</div>
                          <div className="text-xs text-gray-500">
                            Picks: {team.picks.slice(0, 5).join(", ")}
                            {team.picks.length > 5 && "..."}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {selectedTeam && (
              <>
                {/* Pick Selection */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Your Picks */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">Your Picks</span>
                      <span className="text-sm text-gray-500">{yourValue} pts</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {yourTeam.picks.map((pick) => (
                        <SelectablePickCard
                          key={pick}
                          pick={pick}
                          isSelected={selectedYourPicks.includes(pick)}
                          onToggle={() => toggleYourPick(pick)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Their Picks */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">
                        {selectedTeam.name}'s Picks
                      </span>
                      <span className="text-sm text-gray-500">{theirValue} pts</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {selectedTeam.picks.map((pick) => (
                        <SelectablePickCard
                          key={pick}
                          pick={pick}
                          isSelected={selectedTheirPicks.includes(pick)}
                          onToggle={() => toggleTheirPick(pick)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Value Meter */}
                {(selectedYourPicks.length > 0 || selectedTheirPicks.length > 0) && (
                  <TradeValueMeter yourValue={yourValue} theirValue={theirValue} />
                )}

                {/* AI Suggestion */}
                {selectedTheirPicks.length > 0 && selectedTheirPicks.length === 1 && (
                  <AITradeSuggestion
                    targetPick={selectedTheirPicks[0]}
                    yourPicks={yourTeam.picks}
                    onApply={handleApplySuggestion}
                  />
                )}

                {/* Historical Comparison */}
                <HistoricalComparison
                  yourPicks={selectedYourPicks}
                  theirPicks={selectedTheirPicks}
                />

                {/* Message */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message (optional)
                  </label>
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Add a message to your offer..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={handlePropose}
                    disabled={selectedYourPicks.length === 0 || selectedTheirPicks.length === 0}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                      selectedYourPicks.length > 0 && selectedTheirPicks.length > 0
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    <Send className="w-4 h-4" />
                    Propose Trade
                  </button>
                  <button
                    onClick={resetProposal}
                    className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {mode === "incoming" && (
          <div className="space-y-6">
            {incomingOffer ? (
              showCounterBuilder ? (
                <CounterOfferBuilder
                  originalOffer={incomingOffer}
                  yourPicks={yourTeam.picks}
                  theirPicks={
                    allTeams.find((t) => t.id === incomingOffer.offeredBy)?.picks || []
                  }
                  onSend={handleCounter}
                  onCancel={() => setShowCounterBuilder(false)}
                />
              ) : (
                <>
                  {/* Incoming Offer Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                        <Phone className="w-6 h-6 text-amber-600 animate-bounce" />
                      </div>
                      <div>
                        <div className="font-bold text-gray-900">
                          {allTeams.find((t) => t.id === incomingOffer.offeredBy)?.name ||
                            "Unknown Team"}
                        </div>
                        <div className="text-sm text-gray-500">wants to make a deal</div>
                      </div>
                    </div>
                    {incomingOffer.expiresAt && (
                      <TradeUrgencyTimer expiresAt={incomingOffer.expiresAt} />
                    )}
                  </div>

                  {/* Offer Details */}
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                      <div className="text-sm font-medium text-red-700 mb-3">You Give</div>
                      <div className="space-y-2">
                        {incomingOffer.picksRequested.map((pick) => (
                          <PickValueBadge key={pick} pick={pick} />
                        ))}
                      </div>
                      <div className="mt-3 text-sm font-bold text-red-700">
                        Total: {calculateTradeValue(incomingOffer.picksRequested)} pts
                      </div>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                      <div className="text-sm font-medium text-green-700 mb-3">You Get</div>
                      <div className="space-y-2">
                        {incomingOffer.picksOffered.map((pick) => (
                          <PickValueBadge key={pick} pick={pick} />
                        ))}
                      </div>
                      <div className="mt-3 text-sm font-bold text-green-700">
                        Total: {calculateTradeValue(incomingOffer.picksOffered)} pts
                      </div>
                    </div>
                  </div>

                  {/* Value Meter */}
                  <TradeValueMeter
                    yourValue={calculateTradeValue(incomingOffer.picksRequested)}
                    theirValue={calculateTradeValue(incomingOffer.picksOffered)}
                  />

                  {/* Message */}
                  {incomingOffer.message && (
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Their Message</span>
                      </div>
                      <p className="text-gray-600 italic">"{incomingOffer.message}"</p>
                    </div>
                  )}

                  {/* Historical Comparison */}
                  <HistoricalComparison
                    yourPicks={incomingOffer.picksRequested}
                    theirPicks={incomingOffer.picksOffered}
                  />

                  {/* Actions */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleAccept}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      Accept
                    </button>
                    <button
                      onClick={() => setShowCounterBuilder(true)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                      Counter
                    </button>
                    <button
                      onClick={handleReject}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                    >
                      <PhoneOff className="w-4 h-4" />
                      Decline
                    </button>
                  </div>
                </>
              )
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Phone className="w-8 h-8 text-gray-400" />
                </div>
                <div className="text-gray-600 font-medium">No incoming trade offers</div>
                <div className="text-gray-400 text-sm mt-1">
                  Teams will call when they're interested in your picks
                </div>
              </div>
            )}
          </div>
        )}

        {mode === "history" && (
          <div className="space-y-4">
            {tradeHistory.length > 0 ? (
              tradeHistory.map((trade) => (
                <div
                  key={trade.id}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      trade.status === "accepted"
                        ? "bg-green-100"
                        : trade.status === "rejected"
                          ? "bg-red-100"
                          : "bg-amber-100"
                    }`}
                  >
                    {trade.status === "accepted" ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : trade.status === "rejected" ? (
                      <X className="w-5 h-5 text-red-600" />
                    ) : (
                      <ArrowLeftRight className="w-5 h-5 text-amber-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">Trade with {trade.with}</div>
                    <div className="text-sm text-gray-500">
                      Gave: {trade.picksGiven.map((p) => `#${p}`).join(", ")} • Got:{" "}
                      {trade.picksReceived.map((p) => `#${p}`).join(", ")}
                    </div>
                  </div>
                  <div className="text-sm text-gray-400">
                    {new Date(trade.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <History className="w-8 h-8 text-gray-400" />
                </div>
                <div className="text-gray-600 font-medium">No trade history</div>
                <div className="text-gray-400 text-sm mt-1">
                  Completed trades will appear here
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pick Value Reference (collapsed by default) */}
      <PickValueReference />
    </div>
  );
}

// Pick Value Reference Chart (collapsible)
function PickValueReference() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-3 hover:bg-gray-50"
      >
        <span className="text-sm font-medium text-gray-600">Pick Value Chart Reference</span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {isOpen && (
        <div className="px-6 pb-4">
          <div className="grid grid-cols-10 gap-1 text-xs">
            {Object.entries(PICK_VALUE_CHART)
              .slice(0, 50)
              .map(([pick, value]) => (
                <div
                  key={pick}
                  className="p-1 bg-gray-100 rounded text-center"
                  title={`Pick ${pick}: ${value} pts`}
                >
                  <div className="font-bold">{pick}</div>
                  <div className="text-gray-500">{value}</div>
                </div>
              ))}
          </div>
          <div className="text-xs text-gray-400 mt-2 text-center">
            First 50 picks shown • Based on Jimmy Johnson trade value chart
          </div>
        </div>
      )}
    </div>
  );
}

export type { Team, TradeHistoryItem };
