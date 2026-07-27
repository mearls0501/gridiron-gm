"use client";

import { useMemo, useState } from "react";
import { useGame } from "@/lib/store/game";
import { autoSortDepthChart } from "@/lib/core/generate";
import {
  DEFENSE,
  GameState,
  OFFENSE,
  POSITIONS,
  Player,
  Position,
  SPECIALISTS,
  STARTERS,
  Team,
} from "@/lib/core/types";
import {
  Button,
  Card,
  Cell,
  Empty,
  OvrBadge,
  Pill,
  PlayerLink,
  Row,
  Table,
  Tabs,
} from "@/components/ui";

/**
 * Editable depth chart.
 *
 * The order here is not cosmetic: `buildStarters` in the game simulation walks
 * `team.depthChart[pos]` from the top and takes the first healthy bodies it
 * finds, so whoever sits at the top of each list is who actually plays.
 */

type Side = "all" | "off" | "def" | "st";

const SIDE_OPTIONS: { value: Side; label: string }[] = [
  { value: "all", label: "All" },
  { value: "off", label: "Offense" },
  { value: "def", label: "Defense" },
  { value: "st", label: "Special Teams" },
];

/**
 * The chart as it should be read: stored order first (skipping ids for players
 * who are no longer on the roster), then any rostered player the chart has not
 * heard about yet. Pure and deterministic, so the index a button sees on screen
 * is the same index the mutation resolves.
 */
function orderedFor(state: GameState, team: Team, pos: Position): Player[] {
  const roster = state.players.filter(
    (p) => p.teamId === team.id && !p.retired && !p.prospect && p.pos === pos
  );
  const byId = new Map(roster.map((p) => [p.id, p]));
  const seen = new Set<number>();
  const out: Player[] = [];

  for (const id of team.depthChart[pos] ?? []) {
    const p = byId.get(id);
    if (p && !seen.has(id)) {
      out.push(p);
      seen.add(id);
    }
  }
  for (const p of roster) {
    if (!seen.has(p.id)) out.push(p);
  }
  return out;
}

export default function DepthChartPage() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const apply = useGame((s) => s.apply);

  const [side, setSide] = useState<Side>("all");

  const chart = useMemo<{ pos: Position; players: Player[] }[]>(() => {
    if (!state) return [];
    const team = state.teams[state.userTeamId];
    return POSITIONS.map((pos) => ({ pos, players: orderedFor(state, team, pos) }));
    // rev changes on every mutation; the state object itself is mutated in place.
  }, [state, rev]);

  if (!state) return null;

  const team = state.teams[state.userTeamId];
  const visible: readonly Position[] =
    side === "off" ? OFFENSE : side === "def" ? DEFENSE : side === "st" ? SPECIALISTS : POSITIONS;
  const sections = chart.filter((c) => visible.includes(c.pos));
  const totalPlayers = chart.reduce((n, c) => n + c.players.length, 0);

  function move(pos: Position, index: number, delta: number) {
    apply((s) => {
      const t = s.teams[s.userTeamId];
      const order = orderedFor(s, t, pos).map((p) => p.id);
      const j = index + delta;
      if (index < 0 || index >= order.length || j < 0 || j >= order.length) return;
      const moved = order[index];
      order[index] = order[j];
      order[j] = moved;
      t.depthChart[pos] = order;
      t.depthChartManual = true;
      const p = s.players.find((x) => x.id === moved);
      return p ? `${p.lastName} moved to ${pos}${j + 1}` : `${pos} depth chart updated`;
    });
  }

  function autoSort() {
    apply((s) => {
      const t = s.teams[s.userTeamId];
      autoSortDepthChart(s, t);
      t.depthChartManual = false;
      return "Depth chart auto-sorted by rating";
    });
  }

  return (
    <div className="space-y-4">
      <Card
        title="Depth Chart"
        subtitle={`${team.city} ${team.name} — ${team.depthChartManual ? "manually ordered" : "auto-sorted by rating"}`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={autoSort}
            title="Rank every position by overall rating, dropping injured players to the bottom"
          >
            Auto-sort by rating
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-muted)]">
            This chart drives the simulation. Before each play the engine walks every position list
            from the top and fields the first{" "}
            <span className="text-[var(--color-text)]">{"STARTERS[pos]"}</span> healthy players it
            finds — so the order below is literally who takes the snap. Injured players are skipped
            and the next man up plays; if a list runs short, the best remaining healthy body on the
            roster fills in.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="accent">Starter</Pill>
            <span className="text-xs text-[var(--color-muted)]">
              Highlighted rows are on the field for a normal snap.
            </span>
            {team.depthChartManual && (
              <>
                <Pill tone="warn">Manual</Pill>
                <span className="text-xs text-[var(--color-muted)]">
                  Weekly auto-sorting is off until you auto-sort again.
                </span>
              </>
            )}
          </div>
          <Tabs value={side} onChange={setSide} options={SIDE_OPTIONS} />
        </div>
      </Card>

      {totalPlayers === 0 ? (
        <Card>
          <Empty
            title="No players on the roster"
            hint="Sign or auto-fill players on the Roster page and they will appear here."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map(({ pos, players }) => {
            const starters = STARTERS[pos];
            return (
              <Card
                key={pos}
                title={pos}
                subtitle={`${players.length} player${players.length === 1 ? "" : "s"} · ${starters} start${starters === 1 ? "s" : ""}`}
                padded={false}
              >
                {players.length === 0 ? (
                  <Empty title={`No ${pos} on the roster`} hint="The simulation will borrow the best available body here." />
                ) : (
                  <Table head={["Player", "OVR", ""]}>
                    {players.map((p, i) => (
                      <Row key={p.id} highlight={i < starters}>
                        <Cell align="left">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] text-[var(--color-faint)] tnum w-4 shrink-0">
                              {i + 1}
                            </span>
                            <PlayerLink p={p} className="font-medium" />
                            {i < starters && <Pill tone="accent">ST</Pill>}
                            {p.injuryWeeks > 0 && (
                              <Pill tone="bad">
                                {p.injuryDesc ?? "Injured"} · {p.injuryWeeks}w
                              </Pill>
                            )}
                          </div>
                        </Cell>
                        <Cell>
                          <OvrBadge ovr={p.ovr} size="sm" />
                        </Cell>
                        <Cell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={i === 0}
                              title="Move up"
                              onClick={() => move(pos, i, -1)}
                            >
                              ↑
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={i === players.length - 1}
                              title="Move down"
                              onClick={() => move(pos, i, 1)}
                            >
                              ↓
                            </Button>
                          </div>
                        </Cell>
                      </Row>
                    ))}
                  </Table>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
