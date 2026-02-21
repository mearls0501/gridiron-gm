"use client";

import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import { useState, useEffect, useMemo } from "react";
import { formatCurrency } from "@/lib/utils/format";
import {
  ArrowLeftRight,
  UserPlus,
  UserMinus,
  Trophy,
  Filter,
  Calendar,
  Users,
} from "lucide-react";

interface Transaction {
  id: string;
  type: "trade" | "signing" | "release" | "draft_pick_trade";
  player_id?: string;
  prospect_id?: string;
  player_name?: string;
  player_position?: string;
  from_team_id?: string;
  from_team_name?: string;
  from_team_abbreviation?: string;
  to_team_id?: string;
  to_team_name?: string;
  to_team_abbreviation?: string;
  season: number;
  week?: number;
  occurred_at: string;
  details?: string;
  trade_items?: {
    from_team: Array<{
      type: "player" | "draft_pick";
      player_name?: string;
      player_position?: string;
      draft_pick_season?: number;
      draft_pick_round?: number;
      draft_pick_overall?: number;
    }>;
    to_team: Array<{
      type: "player" | "draft_pick";
      player_name?: string;
      player_position?: string;
      draft_pick_season?: number;
      draft_pick_round?: number;
      draft_pick_overall?: number;
    }>;
  };
}

export default function TransactionsPage() {
  const { currentSeason, currentWeek, saveGameId } = useGameStore();
  const [season, setSeason] = useState<number>(currentSeason);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTeam, setFilterTeam] = useState<string>("all");

  useEffect(() => {
    setMounted(true);
    setSeason(currentSeason);
  }, [currentSeason]);

  useEffect(() => {
    if (mounted) {
      loadTransactions();
    }
  }, [season, mounted, saveGameId]);

  async function loadTransactions() {
    setLoading(true);
    try {
      console.log("[Transactions] Loading for season:", season, "saveGameId:", saveGameId);
      const allTransactions: Transaction[] = [];

      // 1. Load trades
      let tradesQuery = supabase
        .from("trades")
        .select(
          `
          *,
          from_team:teams!trades_from_team_id_fkey (id, name, abbreviation),
          to_team:teams!trades_to_team_id_fkey (id, name, abbreviation)
        `
        )
        .eq("season", season)
        .in("status", ["executed", "accepted"]);
      
      if (saveGameId) {
        tradesQuery = tradesQuery.eq("save_game_id", saveGameId);
      } else {
        tradesQuery = tradesQuery.is("save_game_id", null);
      }
      
      const { data: trades, error: tradesError } = await tradesQuery
        .order("executed_at", { ascending: false })
        .order("proposed_at", { ascending: false });

      console.log("[Transactions] Loaded trades:", trades?.length || 0, "error:", tradesError);

      if (!tradesError && trades) {
        for (const trade of trades) {
          // Get trade items
          const { data: tradeItems } = await supabase
            .from("trade_items")
            .select(
              `
              *,
              player:players (id, full_name, position),
              draft_pick:draft_picks (id, season, round, pick_overall)
            `
            )
            .eq("trade_id", trade.id);

          // Organize items by which team is giving them
          const itemsFromTeam = (tradeItems || [])
            .filter((item) => item.from_team_id === trade.from_team_id)
            .map((item) => {
              if (item.item_type === "player" && item.player) {
                return {
                  type: "player" as const,
                  player_name: item.player.full_name,
                  player_position: item.player.position,
                };
              } else if (item.item_type === "draft_pick" && item.draft_pick) {
                return {
                  type: "draft_pick" as const,
                  draft_pick_season: item.draft_pick.season,
                  draft_pick_round: item.draft_pick.round,
                  draft_pick_overall: item.draft_pick.pick_overall,
                };
              }
              return null;
            })
            .filter(Boolean) as NonNullable<Transaction["trade_items"]>["from_team"];

          const itemsToTeam = (tradeItems || [])
            .filter((item) => item.from_team_id === trade.to_team_id)
            .map((item) => {
              if (item.item_type === "player" && item.player) {
                return {
                  type: "player" as const,
                  player_name: item.player.full_name,
                  player_position: item.player.position,
                };
              } else if (item.item_type === "draft_pick" && item.draft_pick) {
                return {
                  type: "draft_pick" as const,
                  draft_pick_season: item.draft_pick.season,
                  draft_pick_round: item.draft_pick.round,
                  draft_pick_overall: item.draft_pick.pick_overall,
                };
              }
              return null;
            })
            .filter(Boolean) as NonNullable<Transaction["trade_items"]>["to_team"];

          allTransactions.push({
            id: trade.id,
            type: "trade",
            from_team_id: trade.from_team_id,
            from_team_name: trade.from_team?.name,
            from_team_abbreviation: trade.from_team?.abbreviation,
            to_team_id: trade.to_team_id,
            to_team_name: trade.to_team?.name,
            to_team_abbreviation: trade.to_team?.abbreviation,
            season: trade.season,
            week: trade.week || undefined,
            occurred_at: trade.executed_at || trade.proposed_at,
            details: trade.notes || undefined,
            trade_items: {
              from_team: itemsFromTeam,
              to_team: itemsToTeam,
            },
          });
        }
      }

      // 2. Load general transactions (signings, releases, etc.)
      let transactionsQuery = supabase
        .from("transactions")
        .select(
          `
          *,
          player:players (id, full_name, position),
          prospect:draft_prospects (id, full_name, position),
          from_team:teams!transactions_from_team_id_fkey (id, name, abbreviation),
          to_team:teams!transactions_to_team_id_fkey (id, name, abbreviation)
        `
        )
        .eq("season", season);
      
      if (saveGameId) {
        transactionsQuery = transactionsQuery.eq("save_game_id", saveGameId);
      } else {
        transactionsQuery = transactionsQuery.is("save_game_id", null);
      }
      
      const { data: generalTransactions, error: transError } = await transactionsQuery
        .order("occurred_at", { ascending: false });

      console.log("[Transactions] Loaded general transactions:", generalTransactions?.length || 0, "error:", transError);

      if (!transError && generalTransactions) {
        for (const trans of generalTransactions) {
          const transactionType = trans.transaction_type;
          
          // Map transaction types
          let type: Transaction["type"] = "signing";
          if (transactionType === "release" || transactionType === "released" || transactionType === "waived") {
            type = "release";
          } else if (transactionType === "trade") {
            // Skip trades already loaded from trades table
            continue;
          } else if (transactionType === "signing" || transactionType === "signed") {
            type = "signing";
          }

          // Get player name from either player or prospect
          const playerData = trans.player || trans.prospect;
          const playerName = playerData?.full_name;
          const playerPosition = playerData?.position;

          allTransactions.push({
            id: trans.id,
            type,
            player_id: trans.player_id,
            prospect_id: trans.prospect_id,
            player_name: playerName,
            player_position: playerPosition,
            from_team_id: trans.from_team_id || undefined,
            from_team_name: trans.from_team?.name,
            from_team_abbreviation: trans.from_team?.abbreviation,
            to_team_id: trans.to_team_id || undefined,
            to_team_name: trans.to_team?.name,
            to_team_abbreviation: trans.to_team?.abbreviation,
            season: trans.season || season,
            week: trans.week || undefined,
            occurred_at: trans.occurred_at,
            details: trans.details || undefined,
          });
        }
      }

      // Sort by date (most recent first)
      allTransactions.sort((a, b) => {
        const dateA = new Date(a.occurred_at).getTime();
        const dateB = new Date(b.occurred_at).getTime();
        return dateB - dateA;
      });

      console.log("[Transactions] Total transactions loaded:", allTransactions.length);
      setTransactions(allTransactions);
    } catch (err) {
      console.error("Error loading transactions:", err);
    } finally {
      setLoading(false);
    }
  }

  // Get unique teams for filter
  const teams = useMemo(() => {
    const teamSet = new Set<string>();
    transactions.forEach((t) => {
      if (t.from_team_id) teamSet.add(t.from_team_id);
      if (t.to_team_id) teamSet.add(t.to_team_id);
    });
    return Array.from(teamSet)
      .map((id) => {
        const trans = transactions.find(
          (t) => t.from_team_id === id || t.to_team_id === id
        );
        return {
          id,
          name: trans?.from_team_id === id ? trans.from_team_name : trans?.to_team_name,
          abbreviation:
            trans?.from_team_id === id
              ? trans.from_team_abbreviation
              : trans?.to_team_abbreviation,
        };
      })
      .filter((t) => t.name)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [transactions]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const typeMatch = filterType === "all" || t.type === filterType;
      const teamMatch =
        filterTeam === "all" ||
        t.from_team_id === filterTeam ||
        t.to_team_id === filterTeam;
      return typeMatch && teamMatch;
    });
  }, [transactions, filterType, filterTeam]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <p className="text-slate-500">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-8 py-6">
            <h1 className="text-3xl font-black text-white tracking-tight mb-2">
              League Transactions
            </h1>
            <div className="flex items-center gap-4 mt-4">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider block mb-1">
                  Season
                </label>
                <input
                  type="number"
                  value={season}
                  onChange={(e) => setSeason(parseInt(e.target.value) || 2025)}
                  className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6 p-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">Filters:</span>
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="trade">Trades</option>
              <option value="signing">Signings</option>
              <option value="release">Releases</option>
            </select>
            <select
              value={filterTeam}
              onChange={(e) => setFilterTeam(e.target.value)}
              className="px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.abbreviation || team.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Transactions List */}
        {loading ? (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
            <p className="text-slate-500 text-lg">Loading transactions...</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
            <p className="text-slate-500 text-lg">
              No transactions found for {season}.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTransactions.map((transaction) => (
              <TransactionCard key={transaction.id} transaction={transaction} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionCard({ transaction }: { transaction: Transaction }) {
  const getTypeIcon = () => {
    switch (transaction.type) {
      case "trade":
        return <ArrowLeftRight className="w-5 h-5" />;
      case "signing":
        return <UserPlus className="w-5 h-5" />;
      case "release":
        return <UserMinus className="w-5 h-5" />;
      default:
        return <Users className="w-5 h-5" />;
    }
  };

  const getTypeColor = () => {
    switch (transaction.type) {
      case "trade":
        return "bg-blue-50 border-blue-200";
      case "signing":
        return "bg-green-50 border-green-200";
      case "release":
        return "bg-red-50 border-red-200";
      default:
        return "bg-slate-50 border-slate-200";
    }
  };

  const getTypeLabel = () => {
    switch (transaction.type) {
      case "trade":
        return "Trade";
      case "signing":
        return "Free Agent Signing";
      case "release":
        return "Player Released";
      default:
        return "Transaction";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div
      className={`bg-white rounded-xl shadow-lg border-2 p-6 ${getTypeColor()}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              transaction.type === "trade"
                ? "bg-blue-100 text-blue-700"
                : transaction.type === "signing"
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {getTypeIcon()}
          </div>
          <div>
            <div className="font-bold text-slate-900 text-lg">
              {getTypeLabel()}
            </div>
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {formatDate(transaction.occurred_at)}
              {transaction.week && (
                <span className="text-slate-500">
                  • Week {transaction.week}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500 uppercase tracking-wider">
            Season {transaction.season}
          </div>
        </div>
      </div>

      {/* Trade Details */}
      {transaction.type === "trade" && transaction.trade_items && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-4">
            {/* From Team */}
            <div className="bg-white rounded-lg p-4 border border-slate-200">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                {transaction.from_team_abbreviation || transaction.from_team_name} Gives
              </div>
              <div className="space-y-2">
                {transaction.trade_items.from_team.length === 0 ? (
                  <div className="text-sm text-slate-400 italic">No items</div>
                ) : (
                  transaction.trade_items.from_team.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      {item.type === "player" ? (
                        <>
                          <Users className="w-4 h-4 text-slate-400" />
                          <span className="font-semibold">
                            {item.player_name} ({item.player_position})
                          </span>
                        </>
                      ) : (
                        <>
                          <Trophy className="w-4 h-4 text-yellow-500" />
                          <span className="font-semibold">
                            {item.draft_pick_season} Round {item.draft_pick_round} • Pick #
                            {item.draft_pick_overall}
                          </span>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* To Team */}
            <div className="bg-white rounded-lg p-4 border border-slate-200">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                {transaction.to_team_abbreviation || transaction.to_team_name} Gives
              </div>
              <div className="space-y-2">
                {transaction.trade_items.to_team.length === 0 ? (
                  <div className="text-sm text-slate-400 italic">No items</div>
                ) : (
                  transaction.trade_items.to_team.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      {item.type === "player" ? (
                        <>
                          <Users className="w-4 h-4 text-slate-400" />
                          <span className="font-semibold">
                            {item.player_name} ({item.player_position})
                          </span>
                        </>
                      ) : (
                        <>
                          <Trophy className="w-4 h-4 text-yellow-500" />
                          <span className="font-semibold">
                            {item.draft_pick_season} Round {item.draft_pick_round} • Pick #
                            {item.draft_pick_overall}
                          </span>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signing/Release Details */}
      {(transaction.type === "signing" || transaction.type === "release") && (
        <div className="mt-4">
          <div className="bg-white rounded-lg p-4 border border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-slate-600">
                    {transaction.player_position}
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">
                    {transaction.player_name}
                  </div>
                  <div className="text-sm text-slate-600">
                    {transaction.player_position}
                  </div>
                </div>
              </div>
              <div className="text-right">
                {transaction.type === "signing" && transaction.to_team_abbreviation && (
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider">
                      Signed to
                    </div>
                    <div className="font-bold text-slate-900">
                      {transaction.to_team_abbreviation}
                    </div>
                  </div>
                )}
                {transaction.type === "release" && transaction.from_team_abbreviation && (
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider">
                      Released from
                    </div>
                    <div className="font-bold text-slate-900">
                      {transaction.from_team_abbreviation}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {transaction.details && (() => {
              try {
                const detailsObj = JSON.parse(transaction.details);
                return (
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <div className="grid grid-cols-2 gap-4">
                      {detailsObj.overall && (
                        <div>
                          <div className="text-xs text-slate-500">Overall</div>
                          <div className="font-semibold text-slate-900">{detailsObj.overall}</div>
                        </div>
                      )}
                      {detailsObj.salary_freed && (
                        <div>
                          <div className="text-xs text-slate-500">Cap Savings</div>
                          <div className="font-semibold text-green-600">
                            ${(detailsObj.salary_freed / 1000000).toFixed(1)}M
                          </div>
                        </div>
                      )}
                      {detailsObj.contract_value && (
                        <div>
                          <div className="text-xs text-slate-500">Contract Value</div>
                          <div className="font-semibold text-slate-900">
                            ${(detailsObj.contract_value / 1000000).toFixed(1)}M
                          </div>
                        </div>
                      )}
                      {detailsObj.reason && (
                        <div className="col-span-2">
                          <div className="text-xs text-slate-500">Reason</div>
                          <div className="text-sm text-slate-700">
                            {detailsObj.reason === "salary_cap_cut" 
                              ? "Released for salary cap compliance" 
                              : detailsObj.reason.replace(/_/g, " ")}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              } catch (e) {
                // If details is not JSON, just display as text
                return (
                  <div className="mt-3 text-sm text-slate-600 border-t border-slate-200 pt-3">
                    {transaction.details}
                  </div>
                );
              }
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

