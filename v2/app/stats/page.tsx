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
  const [teamFilter, setTeamFilter] = useState<number | "ALL">("ALL");
  const [limit, setLimit] = useState<number>(10);
  const [pSort, setPSort] = useState<number | null>(null); // column index into COLS
  const [pDir, setPDir] = useState<SortDir>("desc");

  if (!state) return null;
  void rev; // re-render on every mutation; GameState is mutated in place

  const userTeam = state.teams[state.userTeamId];
  const playerTab: PlayerTab | null = tab === "team" ? null : tab;
  const cat = playerTab ? CATEGORY[playerTab] : null;

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

  // Every column carries its own accessor so any header can sort the table.
  const COLS: Record<PlayerTab, { label: string; get: (l: SeasonStatLine) => number }[]> = {
    passing: [
      { label: "Cmp/Att", get: (l) => l.passCmp },
      { label: "Pct", get: cmpPct },
      { label: "Yds", get: (l) => l.passYds },
      { label: "TD", get: (l) => l.passTd },
      { label: "INT", get: (l) => l.passInt },
      { label: "Lng", get: (l) => l.passLong },
      { label: "Rating", get: passerRating },
    ],
    rushing: [
      { label: "Att", get: (l) => l.rushAtt },
      { label: "Yds", get: (l) => l.rushYds },
      { label: "YPC", get: ypc },
      { label: "TD", get: (l) => l.rushTd },
      { label: "Lng", get: (l) => l.rushLong },
    ],
    receiving: [
      { label: "Tgt", get: (l) => l.targets },
      { label: "Rec", get: (l) => l.rec },
      { label: "Yds", get: (l) => l.recYds },
      { label: "YPR", get: ypr },
      { label: "TD", get: (l) => l.recTd },
      { label: "Lng", get: (l) => l.recLong },
    ],
    defense: [
      { label: "Tkl", get: (l) => l.tackles },
      { label: "TFL", get: (l) => l.tfl },
      { label: "Sacks", get: (l) => l.sacks },
      { label: "INT", get: (l) => l.ints },
      { label: "PD", get: (l) => l.passDef },
      { label: "FF", get: (l) => l.ff },
    ],
    kicking: [
      { label: "FGM/FGA", get: (l) => l.fgm },
      { label: "Pct", get: fgPct },
      { label: "Long", get: (l) => l.longFg },
      { label: "XPM/XPA", get: (l) => l.xpm },
    ],
    returns: [
      { label: "KR", get: (l) => l.kr },
      { label: "KR Yds", get: (l) => l.krYds },
      { label: "KR Avg", get: krAverage },
      { label: "KR Lng", get: (l) => l.krLong },
      { label: "KR TD", get: (l) => l.krTd },
      { label: "PR", get: (l) => l.pr },
      { label: "PR Yds", get: (l) => l.prYds },
      { label: "PR Avg", get: prAverage },
      { label: "PR Lng", get: (l) => l.prLong },
      { label: "PR TD", get: (l) => l.prTd },
    ],
  };

  // Full-league rows: qualify by the category's own stat, then let any
  // column re-sort, any team filter, any depth. `derive` handles all of it.
  const rows: StatRow[] = (() => {
    if (cat === null) return [];
    const base = derive(state, cat.sortBy, {
      teamId: mine ? state.userTeamId : teamFilter === "ALL" ? undefined : teamFilter,
      limit: 100000,
    });
    const sortCols = COLS[playerTab!];
    const sorted =
      pSort !== null && sortCols[pSort]
        ? base.slice().sort((a, b) => {
            const d = sortCols[pSort].get(b.line) - sortCols[pSort].get(a.line);
            return (pDir === "desc" ? d : -d) || a.player.id - b.player.id;
          })
        : base;
    return limit > 0 ? sorted.slice(0, limit) : sorted;
  })();

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
            onChange={(t) => {
              setTab(t);
              setPSort(null); // a new category sorts by its own headline stat
            }}
            options={[
              ...PLAYER_TABS.map((k) => ({ value: k as Tab, label: CATEGORY[k].label })),
              { value: "team" as Tab, label: "Team" },
            ]}
          />
          {tab !== "team" && (
            <>
              <Button
                variant={mine ? "primary" : "default"}
                size="sm"
                onClick={() => {
                  setMine(!mine);
                  setTeamFilter("ALL");
                }}
                title="Show only players on your roster"
              >
                My Team
              </Button>
              <select
                value={teamFilter === "ALL" ? "ALL" : String(teamFilter)}
                onChange={(e) => {
                  setMine(false);
                  setTeamFilter(e.target.value === "ALL" ? "ALL" : Number(e.target.value));
                }}
                className="bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)] cursor-pointer"
                title="Filter by team"
              >
                <option value="ALL">All teams</option>
                {state.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.city} {t.name}
                  </option>
                ))}
              </select>
              <Tabs
                value={String(limit)}
                onChange={(v) => setLimit(Number(v))}
                options={[
                  { value: "10", label: "Top 10" },
                  { value: "50", label: "Top 50" },
                  { value: "0", label: "All" },
                ]}
              />
            </>
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
              <Table
                head={[
                  "Rk",
                  L("Player"),
                  "GP",
                  ...COLS[playerTab!].map((c, ci) => (
                    <button
                      key={c.label}
                      onClick={() => {
                        if (pSort === ci) setPDir(pDir === "desc" ? "asc" : "desc");
                        else {
                          setPSort(ci);
                          setPDir("desc");
                        }
                      }}
                      className={cx(
                        "uppercase tracking-wider cursor-pointer hover:text-[var(--color-text)]",
                        pSort === ci ? "text-[var(--color-accent)]" : ""
                      )}
                      title={`Sort by ${c.label}`}
                    >
                      {c.label}
                      {pSort === ci ? (pDir === "desc" ? " ↓" : " ↑") : ""}
                    </button>
                  )),
                ]}
              >
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
