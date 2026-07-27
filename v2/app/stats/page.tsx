"use client";

import { ReactNode, useState } from "react";
import { useGame } from "@/lib/store/game";
import { GameState, Player, SeasonStatLine, Team } from "@/lib/core/types";
import {
  leaders, LeaderKey, currentLine, passerRating, ypc, ypr, cmpPct, fgPct,
  krAverage, prAverage, clockString,
} from "@/lib/core/season/stats";
import {
  teamSeasonStats, TeamSeasonStats, perGame, pct, rankOf,
} from "@/lib/core/season/records";
import {
  Button, Card, Cell, Empty, Pill, PlayerLink, PosBadge, Row, Stat, Table, Tabs, TeamMark, cx,
} from "@/components/ui";

/**
 * League leaders by category, with a toggle that narrows the same tables to the
 * user's own roster. League-wide views go through `leaders()`; the filtered and
 * kicking views derive from season lines with the same ordering rules.
 *
 * The Team tab is a different animal: it sums the box scores of games actually
 * played via `teamSeasonStats()`, so it can never disagree with the games it
 * came from. Read-only — this page never calls apply().
 */

type PlayerTab = "passing" | "rushing" | "receiving" | "defense" | "kicking" | "returns";
type Tab = PlayerTab | "team";

interface StatRow {
  player: Player;
  line: SeasonStatLine;
  value: number;
}

/** Mirrors `leaders()` semantics for cases it does not cover. */
function derive(
  state: GameState,
  value: (l: SeasonStatLine) => number,
  opts: { teamId?: number; limit?: number } = {}
): StatRow[] {
  const rows: StatRow[] = [];
  for (const p of state.players) {
    if (p.prospect) continue;
    if (opts.teamId !== undefined && p.teamId !== opts.teamId) continue;
    const line = p.stats.find((s) => s.season === state.season);
    if (!line) continue;
    const v = value(line);
    if (v <= 0) continue;
    rows.push({ player: p, line, value: v });
  }
  rows.sort((a, b) => b.value - a.value || a.player.id - b.player.id);
  return rows.slice(0, opts.limit ?? 10);
}

function fromLeaders(state: GameState, key: LeaderKey): StatRow[] {
  return leaders(state, key, state.season, 10).map((r) => ({
    player: r.player,
    line: r.line,
    value: r.value,
  }));
}

function L(label: string) {
  return <span className="block text-left">{label}</span>;
}

function ordinal(n: number): string {
  if (n <= 0) return "—";
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

const CATEGORY: Record<
  PlayerTab,
  { label: string; key: LeaderKey | null; sortBy: (l: SeasonStatLine) => number }
> = {
  passing: { label: "Passing", key: "passYds", sortBy: (l) => l.passYds },
  rushing: { label: "Rushing", key: "rushYds", sortBy: (l) => l.rushYds },
  receiving: { label: "Receiving", key: "recYds", sortBy: (l) => l.recYds },
  defense: { label: "Defense", key: "tackles", sortBy: (l) => l.tackles },
  // No LeaderKey for field goals or return yards — derived below.
  kicking: { label: "Kicking", key: null, sortBy: (l) => l.fgm },
  returns: { label: "Returns", key: null, sortBy: (l) => l.krYds + l.prYds },
};

const PLAYER_TABS = Object.keys(CATEGORY) as PlayerTab[];

// ---------------------------------------------------------------------------
// Team tab
// ---------------------------------------------------------------------------

type SortDir = "asc" | "desc";

interface TeamCol {
  key: string;
  label: string;
  /** Ascending comparator; the table applies the direction. */
  cmp: (a: TeamSeasonStats, b: TeamSeasonStats) => number;
  /** Which end of the column is the good end — drives the default direction. */
  better: "high" | "low" | "none";
  render: (s: TeamSeasonStats) => ReactNode;
}

function teamColumns(teams: Team[]): TeamCol[] {
  const num = (pick: (s: TeamSeasonStats) => number) =>
    (a: TeamSeasonStats, b: TeamSeasonStats) => pick(a) - pick(b);

  const avg = (pick: (s: TeamSeasonStats) => number) =>
    (s: TeamSeasonStats) => perGame(pick(s), s.games).toFixed(1);

  return [
    {
      key: "team",
      label: "Team",
      better: "none",
      cmp: (a, b) => teams[a.teamId].abbr.localeCompare(teams[b.teamId].abbr),
      render: (s) => {
        const t = teams[s.teamId];
        return (
          <span className="flex items-center gap-2 min-w-0">
            <TeamMark team={t} size={20} />
            <span className="truncate">{t.city} {t.name}</span>
          </span>
        );
      },
    },
    { key: "games", label: "G", better: "high", cmp: num((s) => s.games), render: (s) => s.games },
    {
      key: "pf", label: "PF/G", better: "high",
      cmp: num((s) => perGame(s.pointsFor, s.games)),
      render: avg((s) => s.pointsFor),
    },
    {
      key: "pa", label: "PA/G", better: "low",
      cmp: num((s) => perGame(s.pointsAgainst, s.games)),
      render: avg((s) => s.pointsAgainst),
    },
    {
      key: "yds", label: "Yds/G", better: "high",
      cmp: num((s) => perGame(s.totalYards, s.games)),
      render: avg((s) => s.totalYards),
    },
    {
      key: "pass", label: "Pass/G", better: "high",
      cmp: num((s) => perGame(s.passYards, s.games)),
      render: avg((s) => s.passYards),
    },
    {
      key: "rush", label: "Rush/G", better: "high",
      cmp: num((s) => perGame(s.rushYards, s.games)),
      render: avg((s) => s.rushYards),
    },
    {
      key: "ydsA", label: "Yds All/G", better: "low",
      cmp: num((s) => perGame(s.yardsAllowed, s.games)),
      render: avg((s) => s.yardsAllowed),
    },
    {
      key: "takeaways", label: "Take", better: "high",
      cmp: num((s) => s.takeaways), render: (s) => s.takeaways,
    },
    {
      key: "giveaways", label: "Give", better: "low",
      cmp: num((s) => s.turnovers), render: (s) => s.turnovers,
    },
    {
      key: "sacks", label: "Sacks", better: "high",
      cmp: num((s) => s.sacks), render: (s) => s.sacks,
    },
    {
      key: "third", label: "3rd %", better: "high",
      cmp: num((s) => pct(s.thirdDownConv, s.thirdDownAtt)),
      render: (s) => (s.thirdDownAtt === 0 ? "—" : `${pct(s.thirdDownConv, s.thirdDownAtt).toFixed(1)}`),
    },
    {
      key: "rz", label: "RZ %", better: "high",
      cmp: num((s) => pct(s.redZoneTd, s.redZoneAtt)),
      render: (s) => (s.redZoneAtt === 0 ? "—" : `${pct(s.redZoneTd, s.redZoneAtt).toFixed(1)}`),
    },
    {
      key: "top", label: "ToP/G", better: "high",
      cmp: num((s) => (s.games === 0 ? 0 : s.timeOfPossession / s.games)),
      render: (s) => (s.games === 0 ? "—" : clockString(s.timeOfPossession / s.games)),
    },
  ];
}

function SortHead({
  col, active, dir, onSort,
}: {
  col: TeamCol; active: string; dir: SortDir; onSort: (c: TeamCol) => void;
}) {
  const isActive = active === col.key;
  return (
    <button
      onClick={() => onSort(col)}
      className={cx(
        "cursor-pointer transition-colors hover:text-[var(--color-text)]",
        isActive && "text-[var(--color-text)]"
      )}
    >
      {col.label}
      {isActive && <span className="ml-0.5">{dir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------

export default function StatsPage() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const [tab, setTab] = useState<Tab>("passing");
  const [mine, setMine] = useState(false);
  const [sortKey, setSortKey] = useState("pf");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  if (!state) return null;
  void rev; // re-render on every mutation; GameState is mutated in place

  const userTeam = state.teams[state.userTeamId];
  const playerTab: PlayerTab | null = tab === "team" ? null : tab;
  const cat = playerTab ? CATEGORY[playerTab] : null;

  // `leaders()` covers the unfiltered, key-backed categories exactly.
  const rows: StatRow[] =
    cat === null
      ? []
      : !mine && cat.key !== null
        ? fromLeaders(state, cat.key)
        : derive(state, cat.sortBy, mine ? { teamId: state.userTeamId } : {});

  function nameCell(p: Player, line: SeasonStatLine) {
    const teamId = line.teamId ?? p.teamId;
    const team = teamId !== null ? state!.teams[teamId] : null;
    return (
      <span className="flex items-center gap-2 min-w-0">
        {team ? <TeamMark team={team} size={20} /> : <Pill>FA</Pill>}
        <PosBadge pos={p.pos} />
        <PlayerLink p={p} className="min-w-0" />
      </span>
    );
  }

  const head: Record<PlayerTab, string[]> = {
    passing: ["Cmp/Att", "Pct", "Yds", "TD", "INT", "Lng", "Rating"],
    rushing: ["Att", "Yds", "YPC", "TD", "Lng"],
    receiving: ["Tgt", "Rec", "Yds", "YPR", "TD", "Lng"],
    defense: ["Tkl", "TFL", "Sacks", "INT", "PD", "FF"],
    kicking: ["FGM/FGA", "Pct", "Long", "XPM/XPA"],
    returns: ["KR", "KR Yds", "KR Avg", "KR Lng", "KR TD", "PR", "PR Yds", "PR Avg", "PR Lng", "PR TD"],
  };

  function statCells(l: SeasonStatLine, t: PlayerTab) {
    switch (t) {
      case "passing":
        return (
          <>
            <Cell>{l.passCmp}/{l.passAtt}</Cell>
            <Cell>{cmpPct(l).toFixed(1)}</Cell>
            <Cell className="font-semibold">{l.passYds}</Cell>
            <Cell>{l.passTd}</Cell>
            <Cell>{l.passInt}</Cell>
            <Cell>{l.passLong > 0 ? l.passLong : "—"}</Cell>
            <Cell>{passerRating(l).toFixed(1)}</Cell>
          </>
        );
      case "rushing":
        return (
          <>
            <Cell>{l.rushAtt}</Cell>
            <Cell className="font-semibold">{l.rushYds}</Cell>
            <Cell>{ypc(l).toFixed(1)}</Cell>
            <Cell>{l.rushTd}</Cell>
            <Cell>{l.rushLong > 0 ? l.rushLong : "—"}</Cell>
          </>
        );
      case "receiving":
        return (
          <>
            <Cell>{l.targets}</Cell>
            <Cell>{l.rec}</Cell>
            <Cell className="font-semibold">{l.recYds}</Cell>
            <Cell>{ypr(l).toFixed(1)}</Cell>
            <Cell>{l.recTd}</Cell>
            <Cell>{l.recLong > 0 ? l.recLong : "—"}</Cell>
          </>
        );
      case "defense":
        return (
          <>
            <Cell className="font-semibold">{l.tackles}</Cell>
            <Cell>{l.tfl}</Cell>
            <Cell>{l.sacks.toFixed(1)}</Cell>
            <Cell>{l.ints}</Cell>
            <Cell>{l.passDef}</Cell>
            <Cell>{l.ff}</Cell>
          </>
        );
      case "kicking":
        return (
          <>
            <Cell className="font-semibold">{l.fgm}/{l.fga}</Cell>
            <Cell>{fgPct(l).toFixed(1)}</Cell>
            <Cell>{l.longFg > 0 ? l.longFg : "—"}</Cell>
            <Cell>{l.xpm}/{l.xpa}</Cell>
          </>
        );
      case "returns":
        return (
          <>
            <Cell className="font-semibold">{l.kr}</Cell>
            <Cell>{l.krYds}</Cell>
            <Cell>{l.kr > 0 ? krAverage(l).toFixed(1) : "—"}</Cell>
            <Cell>{l.krLong > 0 ? l.krLong : "—"}</Cell>
            <Cell>{l.krTd}</Cell>
            <Cell className="font-semibold">{l.pr}</Cell>
            <Cell>{l.prYds}</Cell>
            <Cell>{l.pr > 0 ? prAverage(l).toFixed(1) : "—"}</Cell>
            <Cell>{l.prLong > 0 ? l.prLong : "—"}</Cell>
            <Cell>{l.prTd}</Cell>
          </>
        );
    }
  }

  // Team-level totals for the user's roster, shown alongside the leaderboard.
  const roster = state.players.filter(
    (p) => p.teamId === state.userTeamId && !p.retired && !p.prospect
  );
  const teamTotals = roster.reduce(
    (acc, p) => {
      const l = currentLine(p, state.season);
      acc.passYds += l.passYds;
      acc.rushYds += l.rushYds;
      acc.recYds += l.recYds;
      acc.sacks += l.sacks;
      acc.ints += l.ints;
      return acc;
    },
    { passYds: 0, rushYds: 0, recYds: 0, sacks: 0, ints: 0 }
  );

  // Team tab data.
  const teamStats = teamSeasonStats(state);
  const cols = teamColumns(state.teams);
  const sortCol = cols.find((c) => c.key === sortKey) ?? cols[2];
  const teamRows = [...teamStats.values()].sort((a, b) => {
    const c = sortCol.cmp(a, b);
    return (sortDir === "asc" ? c : -c) || a.teamId - b.teamId;
  });
  const anyPlayed = teamRows.some((s) => s.games > 0);
  const userStats = teamStats.get(state.userTeamId);

  function sortTeams(c: TeamCol) {
    if (c.key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(c.key);
      setSortDir(c.better === "low" || c.better === "none" ? "asc" : "desc");
    }
  }

  const headlines: { label: string; value: string; rank: number }[] = userStats
    ? [
        {
          label: "Points / G",
          value: perGame(userStats.pointsFor, userStats.games).toFixed(1),
          rank: rankOf(teamStats, userStats.teamId, (s) => perGame(s.pointsFor, s.games)),
        },
        {
          label: "Points All / G",
          value: perGame(userStats.pointsAgainst, userStats.games).toFixed(1),
          rank: rankOf(teamStats, userStats.teamId, (s) => perGame(s.pointsAgainst, s.games), true),
        },
        {
          label: "Yards / G",
          value: perGame(userStats.totalYards, userStats.games).toFixed(1),
          rank: rankOf(teamStats, userStats.teamId, (s) => perGame(s.totalYards, s.games)),
        },
        {
          label: "Yards All / G",
          value: perGame(userStats.yardsAllowed, userStats.games).toFixed(1),
          rank: rankOf(teamStats, userStats.teamId, (s) => perGame(s.yardsAllowed, s.games), true),
        },
        {
          label: "Takeaways",
          value: String(userStats.takeaways),
          rank: rankOf(teamStats, userStats.teamId, (s) => s.takeaways),
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Statistics</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {state.season} season{" "}
            {tab === "team"
              ? "· team by team"
              : mine
                ? `· ${userTeam.city} ${userTeam.name}`
                : "· league leaders"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            options={[
              ...PLAYER_TABS.map((k) => ({ value: k as Tab, label: CATEGORY[k].label })),
              { value: "team" as Tab, label: "Team" },
            ]}
          />
          {tab !== "team" && (
            <Button
              variant={mine ? "primary" : "default"}
              size="sm"
              onClick={() => setMine(!mine)}
              title="Show only players on your roster"
            >
              My Team
            </Button>
          )}
        </div>
      </div>

      {tab === "team" ? (
        <>
          {headlines.length > 0 && anyPlayed && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {headlines.map((h) => (
                <Stat
                  key={h.label}
                  label={h.label}
                  value={h.value}
                  sub={`${ordinal(h.rank)} of ${state.teams.length} · ${userTeam.abbr}`}
                />
              ))}
            </div>
          )}

          <Card
            title="Team stats"
            subtitle={`${state.season} · summed from every box score played`}
            padded={false}
          >
            {!anyPlayed ? (
              <Empty
                title="No team stats yet."
                hint="These totals come from finished box scores. Play a week to fill the table."
              />
            ) : (
              <Table
                head={cols.map((c, i) => {
                  const btn = (
                    <SortHead key={c.key} col={c} active={sortCol.key} dir={sortDir} onSort={sortTeams} />
                  );
                  return i === 0 ? <span className="block text-left">{btn}</span> : btn;
                })}
              >
                {teamRows.map((s) => (
                  <Row key={s.teamId} highlight={s.teamId === state.userTeamId}>
                    {cols.map((c, i) => (
                      <Cell
                        key={c.key}
                        align={i === 0 ? "left" : "right"}
                        className={c.key === sortCol.key && i > 0 ? "font-semibold" : undefined}
                      >
                        {c.render(s)}
                      </Cell>
                    ))}
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Stat label="Team Pass Yds" value={teamTotals.passYds} sub={`${userTeam.abbr} offense`} />
            <Stat label="Team Rush Yds" value={teamTotals.rushYds} sub={`${userTeam.abbr} offense`} />
            <Stat label="Team Rec Yds" value={teamTotals.recYds} sub={`${userTeam.abbr} offense`} />
            <Stat label="Team Sacks" value={teamTotals.sacks.toFixed(1)} sub={`${userTeam.abbr} defense`} />
            <Stat label="Team INTs" value={teamTotals.ints} sub={`${userTeam.abbr} defense`} />
          </div>

          <Card
            title={`${cat!.label} — ${mine ? `${userTeam.abbr} leaders` : "league leaders"}`}
            subtitle={rows.length > 0 ? `Top ${rows.length}` : undefined}
            padded={false}
          >
            {rows.length === 0 ? (
              <Empty
                title="No stats yet."
                hint={
                  mine
                    ? "Play a game to see your players on this board."
                    : "Advance the season to start filling the leaderboard."
                }
              />
            ) : (
              <Table head={["Rk", L("Player"), "GP", ...head[playerTab!]]}>
                {rows.map((r, i) => (
                  <Row key={r.player.id} highlight={r.player.teamId === state.userTeamId}>
                    <Cell align="left" className="text-[var(--color-faint)]">{i + 1}</Cell>
                    <Cell align="left">{nameCell(r.player, r.line)}</Cell>
                    <Cell>{r.line.games}</Cell>
                    {statCells(r.line, playerTab!)}
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
