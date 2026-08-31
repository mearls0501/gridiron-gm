"use client";

import Link from "next/link";
import { GameState } from "@/lib/core/types";
import {
  AwardRow,
  DevelopmentRow,
  LeaderRow,
  RetirementRow,
  SeasonReviewView,
} from "@/lib/view/seasonReview";
import {
  Button, Card, Cell, Empty, PlayerLink, PosBadge, Row, Table, TeamMark, cx,
} from "@/components/ui";

function teamOf(state: GameState, id: number | null) {
  if (id == null) return null;
  return state.teams[id] ?? null;
}

function AwardList({
  state, awards, compact,
}: {
  state: GameState; awards: AwardRow[]; compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      {awards.map((a) => {
        const team = teamOf(state, a.teamId);
        return (
          <div key={a.key} className="flex items-start gap-2 text-sm min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] w-[72px] shrink-0 pt-0.5">
              {a.key === "opoy" ? "OPOY" : a.key === "dpoy" ? "DPOY" : a.key.toUpperCase()}
            </span>
            {a.player ? (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <PosBadge pos={a.player.pos} />
                  <PlayerLink p={a.player} />
                  {team && <TeamMark team={team} size={16} />}
                </div>
                {!compact && a.line && (
                  <div className="text-[11px] text-[var(--color-muted)] tnum mt-0.5">{a.line}</div>
                )}
              </div>
            ) : (
              <span className="text-xs text-[var(--color-faint)]">No winner recorded</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RetirementBlock({
  rows, pendingWrite,
}: {
  rows: RetirementRow[]; pendingWrite: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Empty
        title="No retirements recorded this year."
        hint={
          pendingWrite
            ? "Retirements are written when you continue to free agency. They are not previewed."
            : "Nobody hung it up this offseason."
        }
      />
    );
  }
  const shown = rows.slice(0, 16);
  return (
    <>
      <Table head={["Player", "Age", "OVR"]}>
        {shown.map((r, i) => (
          <Row key={r.player ? r.player.id : `log-${i}`}>
            <Cell align="left">
              {r.player ? (
                <span className="flex items-center gap-2 min-w-0">
                  <PosBadge pos={r.player.pos} />
                  <PlayerLink p={r.player} className="truncate" />
                </span>
              ) : (
                <span className="text-xs text-[var(--color-muted)] truncate">{r.text}</span>
              )}
            </Cell>
            <Cell>{r.age ?? "—"}</Cell>
            <Cell>{r.ovr ?? "—"}</Cell>
          </Row>
        ))}
      </Table>
      {rows.length > shown.length && (
        <div className="px-4 py-2 text-[11px] text-[var(--color-faint)]">
          and {rows.length - shown.length} more on the save
        </div>
      )}
    </>
  );
}

function DevelopmentBlock({
  state, rows, pendingWrite,
}: {
  state: GameState; rows: DevelopmentRow[]; pendingWrite: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Empty
        title="No year-over-year production swings to show."
        hint={
          pendingWrite
            ? "Rating changes land when you continue. This list is derived from season lines, not recorded OVR deltas."
            : "No player on the save has two season lines that moved enough to list."
        }
      />
    );
  }
  return (
    <>
      <Table head={["Player", "Δ prod.", "This year", "Prior year"]}>
        {rows.map((r) => {
          const team = teamOf(state, r.teamId);
          const up = r.delta > 0;
          return (
            <Row key={r.player.id} highlight={r.player.teamId === state.userTeamId || r.teamId === state.userTeamId}>
              <Cell align="left">
                <span className="flex items-center gap-2 min-w-0">
                  <PosBadge pos={r.player.pos} />
                  <PlayerLink p={r.player} className="truncate" />
                  {team && <TeamMark team={team} size={16} />}
                </span>
              </Cell>
              <Cell>
                <span className={cx(up ? "text-[var(--color-good)]" : "text-[var(--color-bad)]")}>
                  {up ? "+" : ""}{r.delta.toFixed(1)}
                </span>
              </Cell>
              <Cell>
                <span className="text-xs text-[var(--color-muted)]">{r.thisLine}</span>
              </Cell>
              <Cell>
                <span className="text-xs text-[var(--color-muted)]">{r.priorLine ?? "—"}</span>
              </Cell>
            </Row>
          );
        })}
      </Table>
    </>
  );
}

function LeadersBlock({
  state, leaders,
}: {
  state: GameState; leaders: LeaderRow[];
}) {
  const any = leaders.some((l) => l.player);
  if (!any) {
    return <Empty title="No statistical leaders recorded." />;
  }
  return (
    <Table head={["Category", "Player", ""]}>
      {leaders.map((l) => {
        const team = teamOf(state, l.teamId);
        return (
          <Row key={l.key}>
            <Cell align="left">
              <span className="text-xs text-[var(--color-muted)]">{l.label}</span>
            </Cell>
            <Cell align="left">
              {l.player ? (
                <span className="flex items-center gap-2 min-w-0">
                  <PosBadge pos={l.player.pos} />
                  <PlayerLink p={l.player} className="truncate" />
                  {team && <TeamMark team={team} size={16} />}
                </span>
              ) : (
                <span className="text-[var(--color-faint)]">—</span>
              )}
            </Cell>
            <Cell>{l.value ?? "—"}</Cell>
          </Row>
        );
      })}
    </Table>
  );
}

/** Compact awards + empties for the hub phase card. */
export function SeasonReviewSummary({
  state, view,
}: {
  state: GameState; view: SeasonReviewView;
}) {
  const champ = teamOf(state, view.championId);
  const runner = teamOf(state, view.runnerUpId);
  return (
    <div className="mt-3 space-y-3">
      {(champ || runner) && (
        <div className="text-xs text-[var(--color-muted)] flex flex-wrap items-center gap-x-3 gap-y-1">
          {champ && (
            <span className="inline-flex items-center gap-1.5">
              <TeamMark team={champ} size={16} />
              <span>Champion · {champ.city} {champ.name}</span>
            </span>
          )}
          {runner && (
            <span className="inline-flex items-center gap-1.5">
              <TeamMark team={runner} size={16} />
              <span>Runner-up · {runner.city} {runner.name}</span>
            </span>
          )}
        </div>
      )}
      <AwardList state={state} awards={view.awards} compact />
      <div className="text-[11px] text-[var(--color-faint)]">
        {view.awardsArchived
          ? "Awards from the season archive."
          : "Awards scored from this season's lines — same formula the archive will write."}
      </div>
      <div className="flex gap-2">
        <Link href="/recap">
          <Button size="sm">Open full recap</Button>
        </Link>
      </div>
    </div>
  );
}

/** Full awards / retirements / development panels. */
export function SeasonReviewPanels({
  state, view,
}: {
  state: GameState; view: SeasonReviewView;
}) {
  const champ = teamOf(state, view.championId);
  const runner = teamOf(state, view.runnerUpId);

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card
          title="Awards"
          subtitle={
            view.awardsArchived
              ? `${view.season} archive`
              : `${view.season} scored from season lines`
          }
        >
          <AwardList state={state} awards={view.awards} />
        </Card>
        <Card title="Statistical Leaders" subtitle={`${view.season} regular season`} padded={false}>
          <LeadersBlock state={state} leaders={view.leaders} />
        </Card>
      </div>

      {(champ || runner) && (
        <Card title="Champion">
          <div className="flex flex-wrap items-center gap-6">
            {champ && (
              <div className="flex items-center gap-3">
                <TeamMark team={champ} size={36} />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)]">Champion</div>
                  <div className="font-semibold">{champ.city} {champ.name}</div>
                </div>
              </div>
            )}
            {runner && (
              <div className="flex items-center gap-3">
                <TeamMark team={runner} size={36} />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)]">Runner-up</div>
                  <div className="font-semibold">{runner.city} {runner.name}</div>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card
        title="Retirements"
        subtitle={
          view.retirements.length === 0
            ? "None on the save for this year"
            : `${view.retirements.length} recorded`
        }
        padded={view.retirements.length === 0}
      >
        <RetirementBlock rows={view.retirements} pendingWrite={view.pendingWrite} />
      </Card>

      <Card
        title="Player development"
        subtitle="Year-over-year production — derived from season lines, not recorded rating changes"
        padded={view.development.length === 0}
      >
        <DevelopmentBlock state={state} rows={view.development} pendingWrite={view.pendingWrite} />
      </Card>
    </div>
  );
}
