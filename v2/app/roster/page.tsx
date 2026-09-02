"use client";

import { useMemo, useState } from "react";
import { useGame } from "@/lib/store/game";
import {
  capHit,
  capSavingsFromCut,
  deadMoney,
  formatMoney,
  rosterCount,
  rosterIssues,
  teamCap,
  teamRoster,
} from "@/lib/core/select";
import { cutPlayer, reconcileRoster } from "@/lib/core/offseason/contracts";
import { autoSortDepthChart } from "@/lib/core/generate";
import { Rng } from "@/lib/core/rng";
import { playerName } from "@/lib/core/ratings";
import {
  POSITION_GROUP,
  POSITIONS,
  Player,
} from "@/lib/core/types";
import { rosterCapView } from "@/lib/view/rosterCap";
import {
  Bar,
  Button,
  Card,
  Cell,
  cx,
  Empty,
  OvrBadge,
  Pill,
  PlayerLink,
  PosBadge,
  Row,
  Stat,
  Table,
  Tabs,
} from "@/components/ui";

/**
 * The user's 53-man roster.
 *
 * Every number on this page comes from the same selectors the simulation uses,
 * so what the GM sees when deciding to cut someone is exactly what the cap will
 * charge them for it.
 */

type SortKey = "name" | "pos" | "age" | "ovr" | "pot" | "cap" | "years" | "status";
type SortDir = "asc" | "desc";

const GROUPS: string[] = ["All", ...Array.from(new Set(POSITIONS.map((p) => POSITION_GROUP[p])))];

/** Numeric-ish sort keys default to descending; names and positions to ascending. */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc", pos: "asc", age: "asc",
  ovr: "desc", pot: "desc", cap: "desc", years: "desc", status: "desc",
};

function yearsLeft(p: Player): number {
  return p.contract ? p.contract.yearsRemaining : 0;
}

function compare(a: Player, b: Player, key: SortKey): number {
  switch (key) {
    case "name": return playerName(a).localeCompare(playerName(b));
    case "pos": return POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos);
    case "age": return a.age - b.age;
    case "ovr": return a.ovr - b.ovr;
    case "pot": return a.pot - b.pot;
    case "cap": return capHit(a.contract) - capHit(b.contract);
    case "years": return yearsLeft(a) - yearsLeft(b);
    case "status": return a.injuryWeeks - b.injuryWeeks;
  }
}

export default function RosterPage() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const apply = useGame((s) => s.apply);

  const [group, setGroup] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("ovr");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const roster = useMemo<Player[]>(
    () => (state ? teamRoster(state, state.userTeamId) : []),
    // rev changes on every mutation; the state object itself is mutated in place.
    [state, rev]
  );

  const rows = useMemo<Player[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = roster.filter((p) => {
      if (group !== "All" && POSITION_GROUP[p.pos] !== group) return false;
      if (q && !playerName(p).toLowerCase().includes(q) && !p.pos.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const c = compare(a, b, sortKey);
      return c !== 0 ? c * dir : a.id - b.id;
    });
  }, [roster, group, query, sortKey, sortDir]);

  if (!state) return null;

  const teamId = state.userTeamId;
  const team = state.teams[teamId];
  const cap = teamCap(state, teamId);
  const issues = rosterIssues(state, teamId);
  const clip = rosterCapView(state, teamId);

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(DEFAULT_DIR[k]);
    }
  }

  function release(p: Player) {
    const name = playerName(p);
    apply((s) => {
      const res = cutPlayer(s, p.id);
      if (!res.ok) return res.reason ?? "That player could not be released.";
      const t = s.teams[s.userTeamId];
      if (!t.depthChartManual) autoSortDepthChart(s, t);
      return `Released ${name} — ${formatMoney(res.dead)} dead money, ${formatMoney(res.savings)} saved`;
    });
    setConfirmId(null);
  }

  function autoFill() {
    apply((s) => {
      const before = rosterCount(s, s.userTeamId);
      const rng = new Rng(s.rngState);
      // reconcileRoster, not fillRoster: filling alone signs players without
      // checking the cap and can leave the team over it. reconcile solves the
      // roster count and the cap together.
      reconcileRoster(s, s.userTeamId, rng);
      s.rngState = rng.state;
      const t = s.teams[s.userTeamId];
      if (!t.depthChartManual) autoSortDepthChart(s, t);
      const after = rosterCount(s, s.userTeamId);
      const capNow = rosterCapView(s, s.userTeamId);
      if (after === before) return `Roster already at ${after}/${capNow.cap}`;
      return `Roster filled: ${before} → ${after}/${capNow.cap}`;
    });
    setConfirmId(null);
  }

  const head = [
    <SortHead key="name" label="Player" k="name" active={sortKey} dir={sortDir} onSort={toggleSort} />,
    <SortHead key="pos" label="Pos" k="pos" active={sortKey} dir={sortDir} onSort={toggleSort} />,
    <SortHead key="age" label="Age" k="age" active={sortKey} dir={sortDir} onSort={toggleSort} />,
    <SortHead key="ovr" label="OVR" k="ovr" active={sortKey} dir={sortDir} onSort={toggleSort} />,
    <SortHead key="pot" label="POT" k="pot" active={sortKey} dir={sortDir} onSort={toggleSort} />,
    <SortHead key="cap" label="Cap Hit" k="cap" active={sortKey} dir={sortDir} onSort={toggleSort} />,
    <SortHead key="years" label="Yrs Left" k="years" active={sortKey} dir={sortDir} onSort={toggleSort} />,
    <SortHead key="status" label="Status" k="status" active={sortKey} dir={sortDir} onSort={toggleSort} />,
    "",
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Roster"
          value={clip.label}
          sub={clip.sub}
          tone={clip.tone}
        />
        <Stat
          label="Cap Space"
          value={formatMoney(cap.space)}
          sub={`of ${formatMoney(cap.cap)}`}
          tone={cap.space < 0 ? "bad" : "good"}
        />
        <Stat label="Committed" value={formatMoney(cap.committed)} sub={`${cap.players} under contract`} />
        <Stat
          label="Dead Money"
          value={formatMoney(cap.dead)}
          sub={cap.dead > 0 ? "Charged from cuts" : "None this season"}
          tone={cap.dead > 0 ? "warn" : undefined}
        />
      </div>

      {clip.cutdown && (
        <Card
          title="Cutdown"
          subtitle={`${clip.label} camp roster — cut ${clip.overSeason} to reach the 53-man season roster`}
        >
          <p className="text-sm text-[var(--color-muted)]">
            Training camp may hold up to {clip.cap}. Release players below to cut, or keep them
            through Start the Season — CPU clubs auto-cut then, and leftover extras on this
            club are cut with them. Hub Auto-fix is not required.
          </p>
        </Card>
      )}

      {issues.length > 0 && (
        <Card title="Roster issues" subtitle="These must be resolved before the season can be simulated">
          <ul className="space-y-2">
            {issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Pill tone={issue.kind === "overCap" || issue.kind === "overLimit" ? "bad" : "warn"}>
                  {issue.kind === "overCap" ? "CAP" : "ROSTER"}
                </Pill>
                <span>
                  {issue.message}
                  {issue.detail && (
                    <span className="text-[var(--color-muted)]"> — {issue.detail}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title={`${team.city} ${team.name} Roster`}
        subtitle={`${rows.length} of ${roster.length} players shown`}
        actions={
          <Button variant="primary" size="sm" onClick={autoFill} title="Sign the best available free agents until the roster is legal">
            Auto-fill roster
          </Button>
        }
        padded={false}
      >
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[var(--color-line-soft)]">
          <Tabs
            value={group}
            onChange={setGroup}
            options={GROUPS.map((g) => ({ value: g, label: g }))}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or position…"
            className="bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-lg px-3 py-1.5 text-sm placeholder:text-[var(--color-faint)] outline-none focus:border-[var(--color-accent)] transition-colors min-w-[200px]"
          />
          {(query || group !== "All") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setQuery("");
                setGroup("All");
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {roster.length === 0 ? (
          <Empty
            title="No players on the roster"
            hint="Every player has been released or the franchise has not been stocked yet. Auto-fill signs the best available free agents up to the 53-man limit."
            action={<Button variant="primary" onClick={autoFill}>Auto-fill roster</Button>}
          />
        ) : rows.length === 0 ? (
          <Empty
            title="No players match those filters"
            hint="Try a different position group or clear the search."
            action={
              <Button
                onClick={() => {
                  setQuery("");
                  setGroup("All");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <Table head={head}>
            {rows.map((p) => {
              const dead = deadMoney(p.contract);
              const savings = capSavingsFromCut(p.contract);
              const confirming = confirmId === p.id;
              return (
                <Row key={p.id} highlight={confirming}>
                  <Cell align="left">
                    <PlayerLink p={p} className="font-medium" />
                  </Cell>
                  <Cell>
                    <PosBadge pos={p.pos} />
                  </Cell>
                  <Cell>{p.age}</Cell>
                  <Cell>
                    <OvrBadge ovr={p.ovr} size="sm" />
                  </Cell>
                  <Cell>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[var(--color-muted)]">{p.pot}</span>
                      <span className="w-12 shrink-0">
                        <Bar value={p.pot} tone={p.pot > p.ovr + 6 ? "good" : "accent"} />
                      </span>
                    </div>
                  </Cell>
                  <Cell>{p.contract ? formatMoney(capHit(p.contract)) : "—"}</Cell>
                  <Cell>{p.contract ? yearsLeft(p) : "—"}</Cell>
                  <Cell>
                    {p.injuryWeeks > 0 ? (
                      <Pill tone="bad">
                        {p.injuryDesc ?? "Injured"} · {p.injuryWeeks}w
                      </Pill>
                    ) : (
                      <span className="text-[var(--color-faint)]">Healthy</span>
                    )}
                  </Cell>
                  <Cell>
                    {confirming ? (
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <span className="text-[11px] text-[var(--color-muted)]">
                          Dead <span className="text-[var(--color-bad)]">{formatMoney(dead)}</span>
                          {" · "}
                          Save{" "}
                          <span className={cx(savings >= 0 ? "text-[var(--color-good)]" : "text-[var(--color-bad)]")}>
                            {formatMoney(savings)}
                          </span>
                        </span>
                        <Button size="sm" variant="danger" onClick={() => release(p)}>
                          Confirm
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmId(p.id)}>
                        Release
                      </Button>
                    )}
                  </Cell>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}

function SortHead({
  label, k, active, dir, onSort,
}: {
  label: string; k: SortKey; active: SortKey; dir: SortDir; onSort: (k: SortKey) => void;
}) {
  const isActive = active === k;
  return (
    <button
      onClick={() => onSort(k)}
      className={cx(
        "cursor-pointer transition-colors hover:text-[var(--color-text)]",
        isActive && "text-[var(--color-text)]"
      )}
    >
      {label}
      {isActive && <span className="ml-0.5">{dir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}
