"use client";

import { useGame } from "@/lib/store/game";
import { GameState, LogEntry } from "@/lib/core/types";
import { computeRecords, recordString } from "@/lib/core/select";
import { DIVISIONS } from "@/lib/core/names";
import { teamOutlook } from "@/lib/core/frontOffice";
import {
  Card, Cell, Empty, Pill, PlayerLink, Row, Table, TeamMark, cx,
} from "@/components/ui";

/**
 * League overview: every team's shape at a glance, the running transaction log,
 * and the franchise's completed seasons.
 */

const LOG_TONE: Record<LogEntry["kind"], "default" | "good" | "bad" | "warn" | "accent"> = {
  transaction: "accent",
  injury: "bad",
  result: "good",
  milestone: "warn",
  draft: "accent",
  system: "default",
};

const LOG_TEXT: Record<LogEntry["kind"], string> = {
  transaction: "text-[var(--color-accent)]",
  injury: "text-[var(--color-bad)]",
  result: "text-[var(--color-good)]",
  milestone: "text-[var(--color-warn)]",
  draft: "text-[var(--color-accent)]",
  system: "text-[var(--color-muted)]",
};

/** Where the club thinks it is in its own cycle, for the team card. */
function postureLabel(state: GameState, teamId: number): string {
  const { posture } = teamOutlook(state, teamId);
  return posture === "contend" ? "win-now" : posture === "rebuild" ? "rebuilding" : "retooling";
}

export default function LeaguePage() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);

  if (!state) return null;
  void rev; // re-render on every mutation; GameState is mutated in place

  const recs = computeRecords(state);
  const feed = state.log.slice(-40).reverse();
  const history = [...state.history].sort((a, b) => b.season - a.season);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">League</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          {state.season} · 32 teams · {state.players.filter((p) => !p.retired && !p.prospect).length} players
        </p>
      </div>

      <Card title="Teams" subtitle="Record and scoring for all 32 clubs">
        <div className="space-y-5">
          {DIVISIONS.map((div) => (
            <div key={div}>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-2">
                {div}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {state.teams
                  .filter((t) => t.division === div)
                  .map((t) => {
                    const r = recs.get(t.id)!;
                    const d = r.pf - r.pa;
                    return (
                      <div
                        key={t.id}
                        className={cx(
                          "flex items-center gap-3 rounded-lg border px-3 py-2.5",
                          t.id === state.userTeamId
                            ? "border-[var(--color-accent)] bg-[var(--color-accent-dim)]/40"
                            : "border-[var(--color-line-soft)] bg-[var(--color-surface-2)]"
                        )}
                      >
                        <TeamMark team={t} size={30} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">
                            {t.city} {t.name}
                          </div>
                          <div className="text-[11px] text-[var(--color-muted)] tnum">
                            {r.pf} PF · {r.pa} PA ·{" "}
                            <span
                              className={cx(
                                d > 0 && "text-[var(--color-good)]",
                                d < 0 && "text-[var(--color-bad)]"
                              )}
                            >
                              {d > 0 ? "+" : ""}{d}
                            </span>
                          </div>
                          {t.frontOffice && (
                            <div
                              className="text-[10px] text-[var(--color-faint)] truncate"
                              title={t.frontOffice.blurb}
                            >
                              {t.frontOffice.name} · {postureLabel(state, t.id)}
                            </div>
                          )}
                        </div>
                        <div className="text-sm font-semibold tnum shrink-0">{recordString(r)}</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Recent Activity" subtitle="Newest first" padded={false}>
          {feed.length === 0 ? (
            <Empty
              title="Nothing has happened yet."
              hint="Signings, injuries, results and milestones show up here as the season runs."
            />
          ) : (
            <ul className="divide-y divide-[var(--color-line-soft)] max-h-[520px] overflow-y-auto">
              {feed.map((e, i) => (
                <li key={`${e.season}-${e.week}-${i}`} className="flex items-start gap-3 px-4 py-2.5">
                  <Pill tone={LOG_TONE[e.kind]}>{e.kind}</Pill>
                  <span className={cx("text-xs flex-1 min-w-0", LOG_TEXT[e.kind])}>{e.text}</span>
                  <span className="text-[10px] text-[var(--color-faint)] tnum shrink-0">
                    {e.season} W{e.week}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Season History" subtitle="Champions and award winners" padded={false}>
          {history.length === 0 ? (
            <Empty
              title="No seasons in the books."
              hint="Finish a season to start building the record book."
            />
          ) : (
            <Table
              head={[
                "Season",
                <span key="champ" className="block text-left">Champion</span>,
                <span key="run" className="block text-left">Runner-Up</span>,
                <span key="mvp" className="block text-left">MVP</span>,
              ]}
            >
              {history.map((h) => {
                const champ = state.teams[h.championId];
                const runner = state.teams[h.runnerUpId];
                const mvp =
                  h.awards.mvp !== null
                    ? state.players.find((p) => p.id === h.awards.mvp)
                    : undefined;
                return (
                  <Row key={h.season} highlight={h.championId === state.userTeamId}>
                    <Cell align="left">{h.season}</Cell>
                    <Cell align="left">
                      <span className="flex items-center gap-2">
                        {champ && <TeamMark team={champ} size={20} />}
                        <span className="truncate">
                          {champ ? `${champ.city} ${champ.name}` : "—"}
                        </span>
                      </span>
                    </Cell>
                    <Cell align="left">
                      <span className="flex items-center gap-2">
                        {runner && <TeamMark team={runner} size={20} />}
                        <span className="truncate">
                          {runner ? `${runner.city} ${runner.name}` : "—"}
                        </span>
                      </span>
                    </Cell>
                    <Cell align="left">
                      {mvp ? (
                        <PlayerLink p={mvp} />
                      ) : (
                        <span className="text-[var(--color-faint)]">—</span>
                      )}
                    </Cell>
                  </Row>
                );
              })}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
