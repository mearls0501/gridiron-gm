"use client";

import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";

interface Team {
  id: string;
  name: string;
  abbreviation?: string;
  conference: string;
  division: string;
}

interface Game {
  id: string;
  week: number;
  season: number;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  played: boolean;
  save_game_id?: string | null;
}

interface PlayerGameStat {
  player_id: string;
  full_name: string;
  position: string;
  team_id: string;
  // Offensive stats
  passing_yards?: number;
  passing_tds?: number;
  interceptions?: number;
  completions?: number;
  attempts?: number;
  rushing_yards?: number;
  rushing_tds?: number;
  rushing_attempts?: number;
  receiving_yards?: number;
  receiving_tds?: number;
  receptions?: number;
  targets?: number;
  fumbles?: number;
  // Defensive stats
  tackles?: number;
  solo_tackles?: number;
  sacks?: number;
  defensive_interceptions?: number;
  forced_fumbles?: number;
  fumble_recoveries?: number;
  passes_defended?: number;
  tfl?: number;
  // Special teams
  field_goals_made?: number;
  field_goals_attempted?: number;
  extra_points_made?: number;
  punts?: number;
  punt_yards?: number;
  // Performance
  performance_rating?: number;
  snaps_played?: number;
}

export default function GameBoxScorePage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const { saveGameId } = useGameStore();
  const [game, setGame] = useState<Game | null>(null);
  const [homeTeam, setHomeTeam] = useState<Team | null>(null);
  const [awayTeam, setAwayTeam] = useState<Team | null>(null);
  const [homePlayerStats, setHomePlayerStats] = useState<PlayerGameStat[]>([]);
  const [awayPlayerStats, setAwayPlayerStats] = useState<PlayerGameStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const loadGameData = useCallback(async () => {
    try {
      const resolvedParams = await Promise.resolve(params);
      const gameId = resolvedParams.id;

      // Load game - filter by save_game_id to prevent cross-game data
      let gameQuery = supabase.from("games").select("*").eq("id", gameId);

      if (saveGameId) {
        gameQuery = gameQuery.eq("save_game_id", saveGameId);
      } else {
        gameQuery = gameQuery.is("save_game_id", null);
      }

      const { data: gameData, error: gameError } = await gameQuery.single();

      if (gameError || !gameData) {
        setLoading(false);
        return;
      }

      setGame(gameData);

      // Load teams
      const { data: homeTeamData } = await supabase
        .from("teams")
        .select("*")
        .eq("id", gameData.home_team_id)
        .single();

      const { data: awayTeamData } = await supabase
        .from("teams")
        .select("*")
        .eq("id", gameData.away_team_id)
        .single();

      setHomeTeam(homeTeamData);
      setAwayTeam(awayTeamData);

      // Load player stats for this game - filter by save_game_id
      // NOTE: Can't use JOIN anymore since we removed FK constraint
      interface PlayerStatWithJoin {
        player_id: string;
        team_id: string;
        players?: {
          id: string;
          full_name: string;
          position: string;
        };
        [key: string]: unknown;
      }
      let playerStats: PlayerStatWithJoin[] = [];
      
      let statsQuery = supabase
        .from("player_game_stats")
        .select("*")
        .eq("game_id", gameId);

      if (saveGameId) {
        statsQuery = statsQuery.eq("save_game_id", saveGameId);
      } else {
        statsQuery = statsQuery.is("save_game_id", null);
      }

      const { data: statsData } = await statsQuery;

      if (statsData) {
        interface StatRow {
          player_id: string;
          [key: string]: unknown;
        }
        interface PlayerRow {
          id: string;
          full_name: string;
          position: string;
        }
        const playerIds = [
          ...new Set(statsData.map((s: StatRow) => s.player_id)),
        ];
        
        // Batch queries to avoid "Bad Request" with too many IDs
        const playersMap = new Map();
        const BATCH_SIZE = 100;
        
        // Try players table first
        for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
          const batch = playerIds.slice(i, i + BATCH_SIZE);
          const { data: playersBatch } = await supabase
            .from("players")
            .select("id, full_name, position")
            .in("id", batch);
          (playersBatch || []).forEach((p: PlayerRow) => playersMap.set(p.id, p));
        }
        
        // Get missing IDs from draft_prospects
        const missingIds = playerIds.filter(id => !playersMap.has(id));
        if (missingIds.length > 0) {
          console.log(`[GameStats] ${missingIds.length} player IDs not in players table, checking prospects...`);
          
          for (let i = 0; i < missingIds.length; i += BATCH_SIZE) {
            const batch = missingIds.slice(i, i + BATCH_SIZE);
            const { data: prospectsBatch } = await supabase
              .from("draft_prospects")
              .select("id, full_name, position")
              .in("id", batch);
            (prospectsBatch || []).forEach((p: PlayerRow) => playersMap.set(p.id, p));
          }
          
          console.log(`[GameStats] After checking prospects: ${playersMap.size} total players found`);
          
          const stillMissing = missingIds.filter(id => !playersMap.has(id));
          if (stillMissing.length > 0) {
            console.warn(`[GameStats] ${stillMissing.length} IDs not found in either table!`, stillMissing[0]);
          }
        }

        playerStats = statsData.map((stat: StatRow) => ({
          ...stat,
          players: playersMap.get(stat.player_id) || {
            id: stat.player_id,
            full_name: "Unknown",
            position: "?",
          },
        })) as PlayerStatWithJoin[];
      }

      // Group stats by team
      const homeStats = playerStats.filter(
        (stat) => stat.team_id === gameData.home_team_id
      );
      const awayStats = playerStats.filter(
        (stat) => stat.team_id === gameData.away_team_id
      );

      // Parse player data
      const parsePlayerStat = (stat: PlayerStatWithJoin): PlayerGameStat => {
        const player = stat.players;
        const getNumber = (value: unknown): number => {
          if (typeof value === "number") return value;
          return 0;
        };
        const getOptionalNumber = (value: unknown): number | undefined => {
          if (typeof value === "number") return value;
          return undefined;
        };
        return {
          player_id: stat.player_id,
          full_name: player?.full_name || "Unknown",
          position:
            player?.position ||
            (typeof stat.position === "string" ? stat.position : "?"),
          team_id: stat.team_id,
          passing_yards: getNumber(stat.passing_yards),
          passing_tds: getNumber(stat.passing_tds),
          interceptions: getNumber(stat.interceptions),
          completions: getNumber(stat.completions),
          attempts: getNumber(stat.attempts),
          rushing_yards: getNumber(stat.rushing_yards),
          rushing_tds: getNumber(stat.rushing_tds),
          rushing_attempts: getNumber(stat.rushing_attempts),
          receiving_yards: getNumber(stat.receiving_yards),
          receiving_tds: getNumber(stat.receiving_tds),
          receptions: getNumber(stat.receptions),
          targets: getNumber(stat.targets),
          fumbles: getNumber(stat.fumbles),
          tackles: getNumber(stat.tackles),
          solo_tackles: getNumber(stat.solo_tackles),
          sacks: getNumber(stat.sacks),
          defensive_interceptions: getNumber(stat.defensive_interceptions),
          forced_fumbles: getNumber(stat.forced_fumbles),
          fumble_recoveries: getNumber(stat.fumble_recoveries),
          passes_defended: getNumber(stat.passes_defended),
          tfl: getNumber(stat.tfl),
          field_goals_made: getNumber(stat.field_goals_made),
          field_goals_attempted: getNumber(stat.field_goals_attempted),
          extra_points_made: getNumber(stat.extra_points_made),
          punts: getNumber(stat.punts),
          punt_yards: getNumber(stat.punt_yards),
          performance_rating: getOptionalNumber(stat.performance_rating),
          snaps_played: getNumber(stat.snaps_played),
        };
      };

      setHomePlayerStats(homeStats.map(parsePlayerStat));
      setAwayPlayerStats(awayStats.map(parsePlayerStat));
    } catch (err) {
      console.error("Error loading game data:", err);
    } finally {
      setLoading(false);
    }
  }, [params, saveGameId]);

  useEffect(() => {
    setMounted(true);
    loadGameData();
  }, [loadGameData]);

  if (!mounted || loading) {
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

  if (!game) {
    return (
      <div className="max-w-4xl mx-auto mt-12 p-10">
        <div className="text-red-600">
          <h2 className="text-2xl font-bold mb-2">Game not found</h2>
        </div>
        <Link
          href="/league/schedule"
          className="text-blue-600 underline mt-4 inline-block"
        >
          ← Back to Schedule
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Link
          href="/league/schedule"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Schedule
        </Link>

        {/* Game Header - Modern Sports Style */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-8 py-6">
            <div className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">
              Week {game.week} • {game.season} Season
            </div>
            {game.played &&
            game.home_score !== null &&
            game.away_score !== null ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <div className="text-3xl font-black text-white tracking-tight mb-1">
                      {awayTeam?.abbreviation || awayTeam?.name}
                    </div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">
                      {awayTeam?.name}
                    </div>
                  </div>
                  <div className="text-5xl font-black text-white tabular-nums">
                    {game.away_score}
                  </div>
                </div>
                <div className="text-slate-500 text-xl font-bold">@</div>
                <div className="flex items-center gap-8">
                  <div className="text-5xl font-black text-white tabular-nums">
                    {game.home_score}
                  </div>
                  <div className="text-left">
                    <div className="text-3xl font-black text-white tracking-tight mb-1">
                      {homeTeam?.abbreviation || homeTeam?.name}
                    </div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">
                      {homeTeam?.name}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-2xl font-bold text-white">
                {awayTeam?.name} @ {homeTeam?.name}
              </div>
            )}
          </div>
        </div>

        {/* Box Score - Modern Style */}
        {game.played ? (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-50 to-gray-50 border-b border-slate-200 px-8 py-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                  Box Score
                </h2>
                <TeamFilterWrapper homeTeam={homeTeam} awayTeam={awayTeam} />
              </div>
            </div>
            <div className="p-8">
              <BoxScoreWithFilter
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                homeStats={homePlayerStats}
                awayStats={awayPlayerStats}
                homeScore={game.home_score}
                awayScore={game.away_score}
              />
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
            <p className="text-slate-500 text-lg font-medium">
              This game has not been played yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamFilterWrapper({
  homeTeam,
  awayTeam,
}: {
  homeTeam: Team | null;
  awayTeam: Team | null;
}) {
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Store selected team in a way that BoxScoreWithFilter can access
  useEffect(() => {
    // Use a custom event or context to share the selected team
    window.dispatchEvent(
      new CustomEvent("teamFilterChange", { detail: selectedTeam })
    );
  }, [selectedTeam]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
      >
        {selectedTeam === null
          ? "All Teams"
          : selectedTeam === homeTeam?.id
            ? homeTeam?.abbreviation || homeTeam?.name
            : awayTeam?.abbreviation || awayTeam?.name}
        <span className="text-slate-500">▼</span>
      </button>
      {showDropdown && (
        <div className="absolute right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-50 min-w-[150px]">
          <button
            onClick={() => {
              setSelectedTeam(null);
              setShowDropdown(false);
            }}
            className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm"
          >
            All Teams
          </button>
          <button
            onClick={() => {
              setSelectedTeam(awayTeam?.id ?? null);
              setShowDropdown(false);
            }}
            className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm border-t border-slate-200"
          >
            {awayTeam?.abbreviation || awayTeam?.name}
          </button>
          <button
            onClick={() => {
              setSelectedTeam(homeTeam?.id ?? null);
              setShowDropdown(false);
            }}
            className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm border-t border-slate-200"
          >
            {homeTeam?.abbreviation || homeTeam?.name}
          </button>
        </div>
      )}
    </div>
  );
}

function BoxScoreWithFilter({
  homeTeam,
  awayTeam,
  homeStats,
  awayStats,
  homeScore,
  awayScore,
}: {
  homeTeam: Team | null;
  awayTeam: Team | null;
  homeStats: PlayerGameStat[];
  awayStats: PlayerGameStat[];
  homeScore: number | null;
  awayScore: number | null;
}) {
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  useEffect(() => {
    function handleTeamFilterChange(event: CustomEvent) {
      setSelectedTeam(event.detail);
    }

    window.addEventListener(
      "teamFilterChange",
      handleTeamFilterChange as EventListener
    );
    return () => {
      window.removeEventListener(
        "teamFilterChange",
        handleTeamFilterChange as EventListener
      );
    };
  }, []);

  return (
    <ESPNBoxScore
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      homeStats={homeStats}
      awayStats={awayStats}
      homeScore={homeScore}
      awayScore={awayScore}
      selectedTeam={selectedTeam}
    />
  );
}

function ESPNBoxScore({
  homeTeam,
  awayTeam,
  homeStats,
  awayStats,
  homeScore: _homeScore,
  awayScore: _awayScore,
  selectedTeam,
}: {
  homeTeam: Team | null;
  awayTeam: Team | null;
  homeStats: PlayerGameStat[];
  awayStats: PlayerGameStat[];
  homeScore: number | null;
  awayScore: number | null;
  selectedTeam?: string | null;
}) {
  // Combine all stats
  const allStats = [...awayStats, ...homeStats];

  // Filter stats by selected team
  const filterStats = (stats: PlayerGameStat[], teamId: string | null) => {
    if (teamId === null) return stats;
    return stats.filter((s) => s.team_id === teamId);
  };

  const getTeamAbbreviation = (teamId: string) => {
    if (teamId === homeTeam?.id)
      return homeTeam?.abbreviation || homeTeam?.name;
    if (teamId === awayTeam?.id)
      return awayTeam?.abbreviation || awayTeam?.name;
    return "?";
  };

  // Group stats by position (filtered)
  const filteredStats = filterStats(allStats, selectedTeam ?? null);
  const qbs = filteredStats.filter((s) => s.position === "QB");
  const rbs = filteredStats.filter((s) => s.position === "RB");
  const wrs = filteredStats.filter(
    (s) => s.position === "WR" || s.position === "TE"
  );
  const def = filteredStats.filter((s) =>
    ["DE", "DT", "LB", "CB", "S"].includes(s.position)
  );

  return (
    <div className="space-y-10">
      {/* Passing */}
      {qbs.length > 0 && (
        <div>
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 border-b-2 border-slate-200 pb-2">
            Passing
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    Player
                  </th>
                  <th className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    Team
                  </th>
                  <th className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    C/ATT
                  </th>
                  <th className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    YDS
                  </th>
                  <th className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    TD
                  </th>
                  <th className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    INT
                  </th>
                </tr>
              </thead>
              <tbody>
                {qbs.map((qb) => (
                  <tr
                    key={qb.player_id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {qb.full_name}
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-xs font-medium">
                      {getTeamAbbreviation(qb.team_id)}
                    </td>
                    <td className="text-right py-3 px-4 text-slate-600 tabular-nums">
                      {qb.completions}/{qb.attempts}
                    </td>
                    <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                      {qb.passing_yards ?? 0}
                    </td>
                    <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                      {qb.passing_tds}
                    </td>
                    <td className="text-right py-3 px-4 text-slate-600 tabular-nums">
                      {qb.interceptions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rushing */}
      {rbs.filter((rb) => (rb.rushing_attempts ?? 0) > 0).length > 0 && (
        <div>
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 border-b-2 border-slate-200 pb-2">
            Rushing
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    Player
                  </th>
                  <th className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    Team
                  </th>
                  <th className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    CAR
                  </th>
                  <th className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    YDS
                  </th>
                  <th className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    TD
                  </th>
                </tr>
              </thead>
              <tbody>
                {rbs
                  .filter((rb) => (rb.rushing_attempts ?? 0) > 0)
                  .map((rb) => (
                    <tr
                      key={rb.player_id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {rb.full_name}
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-xs font-medium">
                        {getTeamAbbreviation(rb.team_id)}
                      </td>
                      <td className="text-right py-3 px-4 text-slate-600 tabular-nums">
                        {rb.rushing_attempts ?? 0}
                      </td>
                      <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                        {rb.rushing_yards ?? 0}
                      </td>
                      <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                        {rb.rushing_tds ?? 0}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Receiving */}
      {wrs.filter((wr) => (wr.receptions ?? 0) > 0).length > 0 && (
        <div>
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 border-b-2 border-slate-200 pb-2">
            Receiving
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    Player
                  </th>
                  <th className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    Team
                  </th>
                  <th className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    REC
                  </th>
                  <th className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    YDS
                  </th>
                  <th className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    TD
                  </th>
                </tr>
              </thead>
              <tbody>
                {wrs
                  .filter((wr) => (wr.receptions ?? 0) > 0)
                  .map((wr) => (
                    <tr
                      key={wr.player_id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {wr.full_name}
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-xs font-medium">
                        {getTeamAbbreviation(wr.team_id)}
                      </td>
                      <td className="text-right py-3 px-4 text-slate-600 tabular-nums">
                        {wr.receptions ?? 0}
                      </td>
                      <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                        {wr.receiving_yards ?? 0}
                      </td>
                      <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                        {wr.receiving_tds ?? 0}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Defense */}
      {def.filter(
        (d) =>
          (d.tackles ?? 0) > 0 ||
          (d.sacks ?? 0) > 0 ||
          (d.defensive_interceptions ?? 0) > 0
      ).length > 0 && (
        <div>
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 border-b-2 border-slate-200 pb-2">
            Defense
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    Player
                  </th>
                  <th className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    Team
                  </th>
                  <th className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    TKL
                  </th>
                  <th className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    SCK
                  </th>
                  <th className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                    INT
                  </th>
                </tr>
              </thead>
              <tbody>
                {def
                  .filter(
                    (d) =>
                      (d.tackles ?? 0) > 0 ||
                      (d.sacks ?? 0) > 0 ||
                      (d.defensive_interceptions ?? 0) > 0
                  )
                  .map((d) => (
                    <tr
                      key={d.player_id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {d.full_name}
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-xs font-medium">
                        {getTeamAbbreviation(d.team_id)}
                      </td>
                      <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                        {d.tackles ?? 0}
                      </td>
                      <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                        {d.sacks ?? 0}
                      </td>
                      <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                        {d.defensive_interceptions ?? 0}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
