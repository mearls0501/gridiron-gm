"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ReactNode } from "react";
import { useGame } from "@/lib/store/game";
import {
  PlayerGameStat, SeasonStatLine, Team, TeamGameStats, isHarsh, weatherLabel,
} from "@/lib/core/types";
import { roundLabel } from "@/lib/core/season/playoffs";
import {
  clockString, fgPct, krAverage, passerRating, prAverage, puntAverage, ypc, ypr,
} from "@/lib/core/season/stats";
import { playerMap } from "@/lib/core/select";
import {
  Card, Cell, Empty, Pill, PlayerLink, PosBadge, Row, Stat, Table, TeamMark, cx,
} from "@/components/ui";

/**
 * Full box score for a single game.
 *
 * Everything on this page is read out of `game.boxScore` — the same object the
 * simulation wrote when the game was played — so a recap can never disagree
 * with the season totals that were folded from it.
 */

/** Left-aligned header cell (Table right-aligns everything after column 0). */
function L(label: string) {
  return <span className="block text-left">{label}</span>;
}

/** Clock is stored as seconds remaining in the quarter. */
function clockLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function quarterLabel(q: number): string {
  if (q <= 4) return `Q${q}`;
  return q === 5 ? "OT" : `OT${q - 4}`;
}

/** Rest is only worth mentioning when it is not an ordinary week. */
function restLabel(days: number): string | null {
  if (days >= 13) return "off a bye";
  if (days <= 4) return "short week";
  return null;
}

/**
 * Derived-stat helpers are written against a season line; a single game's line
 * is the same shape minus the season bookkeeping, so widen rather than
 * duplicate the formulas.
 */
function asLine(gs: PlayerGameStat): SeasonStatLine {
  return { ...gs, season: 0, teamId: gs.teamId, games: 1, gamesStarted: gs.started ? 1 : 0 };
}

interface Group {
  key: string;
  label: string;
  head: string[];
  qualifies: (s: PlayerGameStat) => boolean;
  rank: (s: PlayerGameStat) => number;
  cells: (s: PlayerGameStat) => ReactNode;
}

const GROUPS: Group[] = [
  {
    key: "passing",
    label: "Passing",
    head: ["Cmp/Att", "Yds", "TD", "INT", "Lng", "Sk", "Rtg"],
    qualifies: (s) => s.passAtt > 0,
    rank: (s) => s.passYds,
    cells: (s) => (
      <>
        <Cell>{s.passCmp}/{s.passAtt}</Cell>
        <Cell className="font-semibold">{s.passYds}</Cell>
        <Cell>{s.passTd}</Cell>
        <Cell>{s.passInt}</Cell>
        <Cell>{s.passLong > 0 ? s.passLong : "—"}</Cell>
        <Cell>{s.sacked}-{s.sackYds}</Cell>
        <Cell>{passerRating(asLine(s)).toFixed(1)}</Cell>
      </>
    ),
  },
  {
    key: "rushing",
    label: "Rushing",
    head: ["Att", "Yds", "YPC", "TD", "Lng", "Fum/Lost"],
    qualifies: (s) => s.rushAtt > 0,
    rank: (s) => s.rushYds,
    cells: (s) => (
      <>
        <Cell>{s.rushAtt}</Cell>
        <Cell className="font-semibold">{s.rushYds}</Cell>
        <Cell>{ypc(asLine(s)).toFixed(1)}</Cell>
        <Cell>{s.rushTd}</Cell>
        <Cell>{s.rushLong > 0 ? s.rushLong : "—"}</Cell>
        <Cell>{s.fumbles}/{s.fumblesLost}</Cell>
      </>
    ),
  },
  {
    key: "receiving",
    label: "Receiving",
    head: ["Tgt", "Rec", "Yds", "YPR", "TD", "Lng"],
    qualifies: (s) => s.targets > 0,
    rank: (s) => s.recYds,
    cells: (s) => (
      <>
        <Cell>{s.targets}</Cell>
        <Cell>{s.rec}</Cell>
        <Cell className="font-semibold">{s.recYds}</Cell>
        <Cell>{ypr(asLine(s)).toFixed(1)}</Cell>
        <Cell>{s.recTd}</Cell>
        <Cell>{s.recLong > 0 ? s.recLong : "—"}</Cell>
      </>
    ),
  },
  {
    key: "defense",
    label: "Defense",
    head: ["Tkl", "TFL", "Sacks", "INT", "INT Yds", "PD", "FF", "FR", "TD"],
    qualifies: (s) =>
      s.tackles > 0 || s.sacks > 0 || s.ints > 0 || s.tfl > 0 ||
      s.passDef > 0 || s.ff > 0 || s.fr > 0 || s.defTd > 0,
    rank: (s) => s.tackles + s.sacks * 3 + s.ints * 4 + s.defTd * 6,
    cells: (s) => (
      <>
        <Cell className="font-semibold">{s.tackles}</Cell>
        <Cell>{s.tfl}</Cell>
        <Cell>{s.sacks.toFixed(1)}</Cell>
        <Cell>{s.ints}</Cell>
        <Cell>{s.intYds}</Cell>
        <Cell>{s.passDef}</Cell>
        <Cell>{s.ff}</Cell>
        <Cell>{s.fr}</Cell>
        <Cell>{s.defTd}</Cell>
      </>
    ),
  },
  {
    key: "kicking",
    label: "Kicking",
    head: ["FG", "Pct", "Long", "XP"],
    qualifies: (s) => s.fga > 0 || s.xpa > 0,
    rank: (s) => s.fgm * 3 + s.xpm,
    cells: (s) => (
      <>
        <Cell className="font-semibold">{s.fgm}/{s.fga}</Cell>
        <Cell>{s.fga > 0 ? fgPct(asLine(s)).toFixed(1) : "—"}</Cell>
        <Cell>{s.longFg > 0 ? s.longFg : "—"}</Cell>
        <Cell>{s.xpm}/{s.xpa}</Cell>
      </>
    ),
  },
  {
    key: "punting",
    label: "Punting",
    head: ["Punts", "Yds", "Avg", "Lng", "In20"],
    qualifies: (s) => s.punts > 0,
    rank: (s) => s.punts,
    cells: (s) => (
      <>
        <Cell className="font-semibold">{s.punts}</Cell>
        <Cell>{s.puntYds}</Cell>
        <Cell>{puntAverage(asLine(s)).toFixed(1)}</Cell>
        <Cell>{s.puntLong > 0 ? s.puntLong : "—"}</Cell>
        <Cell>{s.puntsInside20}</Cell>
      </>
    ),
  },
  {
    key: "returns",
    label: "Returns",
    head: [
      "KR", "KR Yds", "KR Avg", "KR Lng", "KR TD",
      "PR", "PR Yds", "PR Avg", "PR Lng", "PR TD",
    ],
    qualifies: (s) => s.kr > 0 || s.pr > 0,
    rank: (s) => s.krYds + s.prYds,
    cells: (s) => (
      <>
        <Cell className="font-semibold">{s.kr}</Cell>
        <Cell>{s.krYds}</Cell>
        <Cell>{s.kr > 0 ? krAverage(asLine(s)).toFixed(1) : "—"}</Cell>
        <Cell>{s.krLong > 0 ? s.krLong : "—"}</Cell>
        <Cell>{s.krTd}</Cell>
        <Cell className="font-semibold">{s.pr}</Cell>
        <Cell>{s.prYds}</Cell>
        <Cell>{s.pr > 0 ? prAverage(asLine(s)).toFixed(1) : "—"}</Cell>
        <Cell>{s.prLong > 0 ? s.prLong : "—"}</Cell>
        <Cell>{s.prTd}</Cell>
      </>
    ),
  },
];

interface ComparisonRow {
  label: string;
  value: (t: TeamGameStats) => string | number;
  /** Positive means the away team had the better of it; 0 means neither side. */
  edge: (a: TeamGameStats, h: TeamGameStats) => number;
}

const COMPARISON: ComparisonRow[] = [
  { label: "Total Yards", value: (t) => t.totalYards, edge: (a, h) => a.totalYards - h.totalYards },
  { label: "Passing Yards", value: (t) => t.passYards, edge: (a, h) => a.passYards - h.passYards },
  { label: "Rushing Yards", value: (t) => t.rushYards, edge: (a, h) => a.rushYards - h.rushYards },
  { label: "First Downs", value: (t) => t.firstDowns, edge: (a, h) => a.firstDowns - h.firstDowns },
  {
    label: "— Pass / Rush / Penalty",
    value: (t) => `${t.passFirstDowns}-${t.rushFirstDowns}-${t.penaltyFirstDowns}`,
    edge: () => 0,
  },
  {
    label: "Third Down",
    value: (t) => `${t.thirdDownConv}/${t.thirdDownAtt}`,
    edge: (a, h) => rate(a.thirdDownConv, a.thirdDownAtt) - rate(h.thirdDownConv, h.thirdDownAtt),
  },
  {
    label: "Fourth Down",
    value: (t) => `${t.fourthDownConv}/${t.fourthDownAtt}`,
    edge: (a, h) => rate(a.fourthDownConv, a.fourthDownAtt) - rate(h.fourthDownConv, h.fourthDownAtt),
  },
  {
    label: "Red Zone (TD/Trips)",
    value: (t) => `${t.redZoneTd}/${t.redZoneAtt}`,
    edge: (a, h) => rate(a.redZoneTd, a.redZoneAtt) - rate(h.redZoneTd, h.redZoneAtt),
  },
  {
    label: "Sacks Allowed",
    value: (t) => `${t.sacksAllowed}-${t.sackYardsAllowed}`,
    edge: (a, h) => h.sacksAllowed - a.sacksAllowed,
  },
  { label: "Turnovers", value: (t) => t.turnovers, edge: (a, h) => h.turnovers - a.turnovers },
  { label: "Giveaways", value: (t) => t.giveaways, edge: (a, h) => h.giveaways - a.giveaways },
  { label: "Takeaways", value: (t) => t.takeaways, edge: (a, h) => a.takeaways - h.takeaways },
  { label: "Total Plays", value: (t) => t.plays, edge: (a, h) => a.plays - h.plays },
  { label: "Possessions", value: (t) => t.possessions, edge: () => 0 },
  {
    label: "Time of Possession",
    value: (t) => clockString(t.timeOfPossession),
    edge: (a, h) => a.timeOfPossession - h.timeOfPossession,
  },
  {
    label: "Penalties",
    value: (t) => `${t.penalties}-${t.penaltyYards}`,
    edge: (a, h) => h.penaltyYards - a.penaltyYards,
  },
];

/** Conversion rate guarding against the zero-attempt case. */
function rate(made: number, att: number): number {
  return att === 0 ? 0 : made / att;
}

export default function GamePage() {
  const params = useParams<{ id: string }>();
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);

  if (!state) return null;
  void rev; // re-render on every mutation; GameState is mutated in place

  const raw = params?.id;
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  const game = Number.isFinite(id) ? state.games.find((g) => g.id === id) : undefined;

  if (!game) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Box Score</h1>
        <Card>
          <Empty
            title="That game is not in this franchise."
            hint="Only the current season's games are kept in full. Older results live in the league history."
            action={
              <Link href="/schedule" className="text-xs text-[var(--color-accent)] hover:underline">
                Back to the schedule
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const home = state.teams[game.homeId];
  const away = state.teams[game.awayId];

  if (!game.played || !game.boxScore) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">
          {away.city} {away.name} at {home.city} {home.name}
        </h1>
        <Card>
          <Empty
            title="This game has not been played yet."
            hint={`Scheduled for ${game.playoffRound ? roundLabel(game.playoffRound) : `week ${game.week}`}. Advance the season to play it.`}
            action={
              <Link href="/schedule" className="text-xs text-[var(--color-accent)] hover:underline">
                Back to the schedule
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const box = game.boxScore;
  const conditions = game.conditions;
  const homeRest = conditions ? restLabel(conditions.homeRest) : null;
  const awayRest = conditions ? restLabel(conditions.awayRest) : null;
  const players = playerMap(state);
  const userTeamId = state.userTeamId;
  const homeWon = game.homeScore > game.awayScore;
  const awayWon = game.awayScore > game.homeScore;

  const periods = Math.max(box.quarters.home.length, box.quarters.away.length, 4);
  const periodLabels = Array.from({ length: periods }, (_, i) => quarterLabel(i + 1));

  function teamHeading(t: Team, score: number, won: boolean) {
    return (
      <div className="flex items-center gap-3 min-w-0">
        <TeamMark team={t} size={40} />
        <div className="min-w-0">
          <div
            className={cx(
              "text-sm truncate",
              won && "font-semibold",
              t.id === userTeamId && "text-[var(--color-accent)]"
            )}
          >
            {t.city} {t.name}
          </div>
          <div className="text-[11px] text-[var(--color-faint)] uppercase tracking-wider">
            {t.division}
          </div>
        </div>
        <div className={cx("text-2xl tnum ml-3", won ? "font-semibold" : "text-[var(--color-muted)]")}>
          {score}
        </div>
      </div>
    );
  }

  function TeamPlayerStats({ t }: { t: Team }) {
    const rows = box.players.filter((s) => s.teamId === t.id);
    if (rows.length === 0) {
      return (
        <Card title={`${t.city} ${t.name}`} padded={false}>
          <Empty title="No individual stats were recorded for this team." />
        </Card>
      );
    }
    const sections = GROUPS.map((grp) => ({
      grp,
      rows: rows.filter(grp.qualifies).sort((a, b) => grp.rank(b) - grp.rank(a) || a.playerId - b.playerId),
    })).filter((s) => s.rows.length > 0);

    return (
      <Card
        title={
          <span className="flex items-center gap-2">
            <TeamMark team={t} size={20} />
            {t.city} {t.name}
          </span>
        }
        subtitle={`${rows.length} players with snaps`}
        actions={t.id === userTeamId ? <Pill tone="accent">Your team</Pill> : undefined}
        padded={false}
      >
        {sections.length === 0 ? (
          <Empty title="Nobody recorded a counting stat in this game." />
        ) : (
          sections.map(({ grp, rows: group }) => (
            <div key={grp.key} className="border-b border-[var(--color-line-soft)] last:border-0">
              <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
                {grp.label}
              </div>
              <Table head={[L("Player"), ...grp.head]}>
                {group.map((s) => {
                  const p = players.get(s.playerId);
                  return (
                    <Row key={`${grp.key}-${s.playerId}`}>
                      <Cell align="left">
                        {p ? (
                          <span className="flex items-center gap-2 min-w-0">
                            <PosBadge pos={p.pos} />
                            <PlayerLink p={p} className="min-w-0" />
                            {s.started && <Pill>ST</Pill>}
                            {s.twoPtAtt > 0 && (
                              <Pill tone={s.twoPtMade > 0 ? "good" : "default"}>
                                2PT {s.twoPtMade}/{s.twoPtAtt}
                              </Pill>
                            )}
                          </span>
                        ) : (
                          <span className="text-[var(--color-faint)]">Unknown player</span>
                        )}
                      </Cell>
                      {grp.cells(s)}
                    </Row>
                  );
                })}
              </Table>
            </div>
          ))
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Box Score</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5 tnum">
            {game.season} ·{" "}
            {game.playoffRound ? roundLabel(game.playoffRound) : `Week ${game.week}`} · Final
          </p>
        </div>
        <Link href="/schedule" className="text-xs text-[var(--color-accent)] hover:underline">
          Full schedule
        </Link>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          {teamHeading(away, game.awayScore, awayWon)}
          <span className="text-xs text-[var(--color-faint)] uppercase tracking-wider">at</span>
          {teamHeading(home, game.homeScore, homeWon)}
        </div>
        {conditions && (
          <div className="mt-3 pt-3 border-t border-[var(--color-line-soft)] flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--color-muted)]">
            <span className="tnum">{weatherLabel(conditions.weather)}</span>
            {isHarsh(conditions.weather) && <Pill tone="warn">Tough conditions</Pill>}
            {awayRest && <span>{away.abbr} {awayRest}</span>}
            {homeRest && <span>{home.abbr} {homeRest}</span>}
          </div>
        )}
      </Card>

      <Card title="Linescore" padded={false}>
        <Table head={[L("Team"), ...periodLabels, "T"]}>
          {[
            { t: away, line: box.quarters.away, total: game.awayScore, won: awayWon },
            { t: home, line: box.quarters.home, total: game.homeScore, won: homeWon },
          ].map(({ t, line, total, won }) => (
            <Row key={t.id} highlight={t.id === userTeamId}>
              <Cell align="left">
                <span className="flex items-center gap-2">
                  <TeamMark team={t} size={20} />
                  <span className={cx("truncate", won && "font-semibold")}>{t.abbr}</span>
                </span>
              </Cell>
              {periodLabels.map((_, i) => (
                <Cell key={i}>{line[i] ?? 0}</Cell>
              ))}
              <Cell className={cx(won && "font-semibold")}>{total}</Cell>
            </Row>
          ))}
        </Table>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat
          label="Total Yards"
          value={`${box.away.totalYards} — ${box.home.totalYards}`}
          sub={`${away.abbr} — ${home.abbr}`}
        />
        <Stat
          label="Turnovers"
          value={`${box.away.turnovers} — ${box.home.turnovers}`}
          sub={`${away.abbr} — ${home.abbr}`}
        />
        <Stat
          label="Third Down"
          value={`${box.away.thirdDownConv}/${box.away.thirdDownAtt} — ${box.home.thirdDownConv}/${box.home.thirdDownAtt}`}
          sub={`${away.abbr} — ${home.abbr}`}
        />
        <Stat
          label="Plays"
          value={`${box.away.plays} — ${box.home.plays}`}
          sub={`${away.abbr} — ${home.abbr}`}
        />
        <Stat
          label="Time of Poss."
          value={`${clockString(box.away.timeOfPossession)} — ${clockString(box.home.timeOfPossession)}`}
          sub={`${away.abbr} — ${home.abbr}`}
        />
      </div>

      <Card title="Team Stats" padded={false}>
        <Table head={[L("Stat"), away.abbr, home.abbr]}>
          {COMPARISON.map((c) => {
            const diff = c.edge(box.away, box.home);
            return (
              <Row key={c.label}>
                <Cell align="left" className="text-[var(--color-muted)]">{c.label}</Cell>
                <Cell className={cx(diff > 0 && "font-semibold text-[var(--color-good)]")}>
                  {c.value(box.away)}
                </Cell>
                <Cell className={cx(diff < 0 && "font-semibold text-[var(--color-good)]")}>
                  {c.value(box.home)}
                </Cell>
              </Row>
            );
          })}
        </Table>
      </Card>

      <Card title="Scoring Summary" padded={false}>
        {box.scoringPlays.length === 0 ? (
          <Empty title="Nobody scored in this game." hint="A scoreless final is rare, but it counts." />
        ) : (
          <Table head={[L("Time"), L("Play"), away.abbr, home.abbr]}>
            {box.scoringPlays.map((sp, i) => {
              const t = state.teams[sp.teamId];
              return (
                <Row key={i} highlight={sp.teamId === userTeamId}>
                  <Cell align="left" className="whitespace-nowrap text-[var(--color-muted)]">
                    {quarterLabel(sp.q)} {clockLabel(sp.clock)}
                  </Cell>
                  <Cell align="left">
                    <span className="flex items-center gap-2 min-w-0">
                      <TeamMark team={t} size={20} />
                      <span className="truncate">{sp.desc}</span>
                    </span>
                  </Cell>
                  <Cell className={cx(sp.teamId === away.id && "font-semibold")}>{sp.awayScore}</Cell>
                  <Cell className={cx(sp.teamId === home.id && "font-semibold")}>{sp.homeScore}</Cell>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <TeamPlayerStats t={away} />
        <TeamPlayerStats t={home} />
      </div>
    </div>
  );
}
