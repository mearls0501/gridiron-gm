"use client";

import Link from "next/link";
import { useState } from "react";
import { useGame } from "@/lib/store/game";
import { Game, GameState, PlayoffRound, REGULAR_SEASON_WEEKS, weatherLabel } from "@/lib/core/types";
import { computeRecords, recordString } from "@/lib/core/select";
import { weekGames, userNextGame } from "@/lib/core/season/engine";
import {
  Card, Cell, Empty, Pill, Row, Stat, Table, Tabs, TeamMark, cx,
} from "@/components/ui";

/**
 * Schedule: the user's 18-week season on one tab, the full league slate by week
 * on the other. Playoff weeks (19+) are folded into both once they exist.
 */

type Tab = "team" | "league";

const ROUND_LABEL: Record<PlayoffRound, string> = {
  WC: "Wild Card",
  DIV: "Divisional",
  CONF: "Conference",
  SB: "Super Bowl",
};

/** Left-aligned header cell (Table right-aligns everything after column 0). */
function L(label: string) {
  return <span className="block text-left">{label}</span>;
}

interface Side {
  isHome: boolean;
  oppId: number;
  us: number;
  them: number;
  outcome: "W" | "L" | "T";
}

function sideFor(g: Game, teamId: number): Side {
  const isHome = g.homeId === teamId;
  const us = isHome ? g.homeScore : g.awayScore;
  const them = isHome ? g.awayScore : g.homeScore;
  return {
    isHome,
    oppId: isHome ? g.awayId : g.homeId,
    us,
    them,
    outcome: us > them ? "W" : us < them ? "L" : "T",
  };
}

function outcomeTone(o: Side["outcome"]): "good" | "bad" | "warn" {
  return o === "W" ? "good" : o === "L" ? "bad" : "warn";
}

/** Compact forecast for a schedule row; older saves have no conditions. */
function ConditionsNote({ g }: { g: Game }) {
  if (!g.conditions) return null;
  return (
    <span className="text-[11px] text-[var(--color-faint)] tnum shrink-0">
      {weatherLabel(g.conditions.weather)}
    </span>
  );
}

function weekLabel(state: GameState, week: number): string {
  const g = state.games.find(
    (x) => x.season === state.season && x.week === week && x.playoffRound !== null
  );
  return g && g.playoffRound ? ROUND_LABEL[g.playoffRound] : `Week ${week}`;
}

export default function SchedulePage() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const [tab, setTab] = useState<Tab>("team");
  const [week, setWeek] = useState<number | null>(null);

  if (!state) return null;
  void rev; // re-render on every mutation; GameState is mutated in place

  const weekSet = new Set<number>();
  for (const g of state.games) if (g.season === state.season) weekSet.add(g.week);
  const weeks = [...weekSet].sort((a, b) => a - b);

  const teamId = state.userTeamId;
  const team = state.teams[teamId];
  const rec = computeRecords(state).get(teamId)!;
  const next = userNextGame(state);

  const userGames = state.games
    .filter((g) => g.season === state.season && (g.homeId === teamId || g.awayId === teamId))
    .sort((a, b) => a.week - b.week);

  const regularWeeks = Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) => i + 1);
  const userPlayoffGames = userGames.filter((g) => g.playoffRound !== null);

  const activeWeek = week ?? (weeks.includes(state.week) ? state.week : weeks[0] ?? 1);
  const slate = weekGames(state, activeWeek);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Schedule</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {state.season} · {team.city} {team.name}
          </p>
        </div>
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "team", label: "My Team" },
            { value: "league", label: "League" },
          ]}
        />
      </div>

      {tab === "team" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Record" value={recordString(rec)} />
            <Stat label="Points For" value={rec.pf} />
            <Stat label="Points Against" value={rec.pa} />
            <Stat
              label="Point Diff"
              value={`${rec.pf - rec.pa > 0 ? "+" : ""}${rec.pf - rec.pa}`}
              tone={rec.pf - rec.pa > 0 ? "good" : rec.pf - rec.pa < 0 ? "bad" : undefined}
            />
          </div>

          <Card
            title="Regular Season"
            subtitle={
              next
                ? `Next: ${weekLabel(state, next.week)} vs ${
                    state.teams[next.homeId === teamId ? next.awayId : next.homeId].abbr
                  }`
                : "No games remaining"
            }
            padded={false}
          >
            <Table head={["Wk", L("Opponent"), "Result", "Score", ""]}>
              {regularWeeks.map((w) => {
                const g = userGames.find((x) => x.week === w && x.playoffRound === null);
                if (!g) {
                  return (
                    <Row key={`bye-${w}`}>
                      <Cell align="left" className="text-[var(--color-faint)]">{w}</Cell>
                      <Cell align="left" className="text-[var(--color-faint)]">Bye</Cell>
                      <Cell>—</Cell>
                      <Cell>—</Cell>
                      <Cell>{""}</Cell>
                    </Row>
                  );
                }
                const s = sideFor(g, teamId);
                const opp = state.teams[s.oppId];
                return (
                  <Row key={g.id} highlight={next?.id === g.id}>
                    <Cell align="left">{w}</Cell>
                    <Cell align="left">
                      <span className="flex items-center gap-2">
                        <span className="text-[var(--color-faint)] w-5 shrink-0">
                          {s.isHome ? "vs" : "@"}
                        </span>
                        <TeamMark team={opp} size={20} />
                        <span className="truncate">{opp.city} {opp.name}</span>
                        <ConditionsNote g={g} />
                      </span>
                    </Cell>
                    <Cell>
                      {g.played ? <Pill tone={outcomeTone(s.outcome)}>{s.outcome}</Pill> : "—"}
                    </Cell>
                    <Cell>{g.played ? `${s.us}-${s.them}` : "—"}</Cell>
                    <Cell>
                      {g.played ? (
                        <Link
                          href={`/game/${g.id}`}
                          className="text-xs text-[var(--color-accent)] hover:underline"
                        >
                          Recap
                        </Link>
                      ) : (
                        ""
                      )}
                    </Cell>
                  </Row>
                );
              })}
            </Table>
          </Card>

          {userPlayoffGames.length > 0 && (
            <Card title="Postseason" padded={false}>
              <Table head={["Round", L("Opponent"), "Result", "Score", ""]}>
                {userPlayoffGames.map((g) => {
                  const s = sideFor(g, teamId);
                  const opp = state.teams[s.oppId];
                  return (
                    <Row key={g.id}>
                      <Cell align="left">
                        <Pill tone="accent">{g.playoffRound ? ROUND_LABEL[g.playoffRound] : "—"}</Pill>
                      </Cell>
                      <Cell align="left">
                        <span className="flex items-center gap-2">
                          <span className="text-[var(--color-faint)] w-5 shrink-0">
                            {s.isHome ? "vs" : "@"}
                          </span>
                          <TeamMark team={opp} size={20} />
                          <span className="truncate">{opp.city} {opp.name}</span>
                          <ConditionsNote g={g} />
                        </span>
                      </Cell>
                      <Cell>
                        {g.played ? <Pill tone={outcomeTone(s.outcome)}>{s.outcome}</Pill> : "—"}
                      </Cell>
                      <Cell>{g.played ? `${s.us}-${s.them}` : "—"}</Cell>
                      <Cell>
                        {g.played ? (
                          <Link
                            href={`/game/${g.id}`}
                            className="text-xs text-[var(--color-accent)] hover:underline"
                          >
                            Recap
                          </Link>
                        ) : (
                          ""
                        )}
                      </Cell>
                    </Row>
                  );
                })}
              </Table>
            </Card>
          )}
        </div>
      ) : (
        <Card
          title={weeks.length > 0 ? weekLabel(state, activeWeek) : "League Slate"}
          subtitle={`${slate.length} game${slate.length === 1 ? "" : "s"}`}
          padded={false}
        >
          {weeks.length === 0 ? (
            <Empty
              title="The schedule has not been drawn yet."
              hint="Advance out of the preseason to generate this year's slate."
            />
          ) : (
            <>
              <div className="flex gap-1 overflow-x-auto px-3 py-2.5 border-b border-[var(--color-line-soft)]">
                {weeks.map((w) => (
                  <button
                    key={w}
                    onClick={() => setWeek(w)}
                    className={cx(
                      "px-2.5 py-1 rounded-md text-xs font-medium tnum whitespace-nowrap transition-colors cursor-pointer",
                      w === activeWeek
                        ? "bg-[var(--color-surface-3)] text-[var(--color-text)]"
                        : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                    )}
                  >
                    {w > REGULAR_SEASON_WEEKS ? weekLabel(state, w) : w}
                  </button>
                ))}
              </div>

              {slate.length === 0 ? (
                <Empty title="No games this week." />
              ) : (
                <Table head={[L("Away"), "", L("Home"), "", "Status"]}>
                  {slate.map((g) => {
                    const away = state.teams[g.awayId];
                    const home = state.teams[g.homeId];
                    const isUser = g.homeId === teamId || g.awayId === teamId;
                    const awayWon = g.played && g.awayScore > g.homeScore;
                    const homeWon = g.played && g.homeScore > g.awayScore;
                    return (
                      <Row key={g.id} highlight={isUser}>
                        <Cell align="left">
                          <span className="flex items-center gap-2">
                            <TeamMark team={away} size={20} />
                            <span className={cx("truncate", awayWon && "font-semibold")}>
                              {away.city} {away.name}
                            </span>
                          </span>
                        </Cell>
                        <Cell className={cx(awayWon && "font-semibold")}>
                          {g.played ? g.awayScore : "—"}
                        </Cell>
                        <Cell align="left">
                          <span className="flex items-center gap-2">
                            <TeamMark team={home} size={20} />
                            <span className={cx("truncate", homeWon && "font-semibold")}>
                              {home.city} {home.name}
                            </span>
                          </span>
                        </Cell>
                        <Cell className={cx(homeWon && "font-semibold")}>
                          {g.played ? g.homeScore : "—"}
                        </Cell>
                        <Cell>
                          {g.played ? (
                            <Link
                              href={`/game/${g.id}`}
                              className="text-xs text-[var(--color-accent)] hover:underline"
                            >
                              Final
                            </Link>
                          ) : (
                            <span className="text-xs text-[var(--color-faint)]">Scheduled</span>
                          )}
                        </Cell>
                      </Row>
                    );
                  })}
                </Table>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
