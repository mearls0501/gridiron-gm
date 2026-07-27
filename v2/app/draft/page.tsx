"use client";

import { useMemo, useState } from "react";
import { useGame } from "@/lib/store/game";
import { Rng } from "@/lib/core/rng";
import { displayedOvr, playerName, POSITION_VALUE } from "@/lib/core/ratings";
import {
  SCOUT_COST,
  availableProspects,
  canScout,
  draftBoard,
  isUserOnClock,
  makePick,
  positionsOfNeed,
  rookieContract,
  spendScouting,
  userPicks,
} from "@/lib/core/offseason/draft";
import { enterDraft, simEntireDraft, simToUserPick } from "@/lib/core/offseason";
import { capHit, formatMoney, playerMap, rosterCount } from "@/lib/core/select";
import { POSITIONS, Player, Position, ROSTER_LIMIT } from "@/lib/core/types";
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
  TeamMark,
} from "@/components/ui";

/**
 * The draft room.
 *
 * The one rule this screen holds absolutely: a prospect's true `ovr` and `pot`
 * never reach the DOM. Everything the user sees about an undrafted player comes
 * from `displayedOvr`, which reads the scouted band — a deliberately wrong
 * estimate that tightens as scouting is spent. Showing the real number anywhere
 * would delete the entire draft game.
 */

type SortKey = "board" | "band" | "age" | "scouted" | "pos";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "board", label: "Board" },
  { value: "band", label: "Proj. OVR" },
  { value: "age", label: "Age" },
  { value: "scouted", label: "Scouting" },
  { value: "pos", label: "Position" },
];

const POS_OPTIONS: { value: Position | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  ...POSITIONS.map((p) => ({ value: p as Position | "ALL", label: p })),
];

/** Midpoint of the scouted band. Never falls back to the true rating. */
function bandMid(p: Player): number {
  if (p.scoutedOvrLow == null || p.scoutedOvrHigh == null) return 0;
  return (p.scoutedOvrLow + p.scoutedOvrHigh) / 2;
}

function bandWidth(p: Player): number {
  if (p.scoutedOvrLow == null || p.scoutedOvrHigh == null) return 99;
  return p.scoutedOvrHigh - p.scoutedOvrLow;
}

export default function DraftPage() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const apply = useGame((s) => s.apply);

  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("board");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Board source: the live draft pool when a draft exists, otherwise the class
  // that is currently being scouted ahead of the offseason.
  const pool = useMemo<Player[]>(() => {
    if (!state) return [];
    if (state.draft) return draftBoard(state, "board");
    return state.players
      .filter(
        (p) =>
          p.prospect &&
          p.draftClassSeason === state.season &&
          p.teamId === null &&
          !p.retired
      )
      .sort(
        (a, b) =>
          bandMid(b) * POSITION_VALUE[b.pos] - bandMid(a) * POSITION_VALUE[a.pos]
      );
    // rev changes on every mutation; the state object itself is mutated in place.
  }, [state, rev]);

  const rows = useMemo<Player[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = pool.filter((p) => {
      if (pos !== "ALL" && p.pos !== pos) return false;
      if (q && !playerName(p).toLowerCase().includes(q)) return false;
      return true;
    });
    if (sortKey === "board") return filtered;
    return filtered.slice().sort((a, b) => {
      switch (sortKey) {
        case "band":
          return bandMid(b) - bandMid(a) || a.id - b.id;
        case "age":
          return a.age - b.age || bandMid(b) - bandMid(a);
        case "scouted":
          return b.scouted - a.scouted || bandMid(b) - bandMid(a);
        case "pos":
          return (
            POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) ||
            bandMid(b) - bandMid(a)
          );
      }
    });
  }, [pool, pos, sortKey, query]);

  const byId = useMemo(
    () => (state ? playerMap(state) : new Map<number, Player>()),
    [state, rev]
  );

  if (!state) return null;

  const teamId = state.userTeamId;
  const team = state.teams[teamId];
  const d = state.draft;
  const onClock = d && !d.complete ? d.picks[d.onClock] ?? null : null;
  const onClockTeam = onClock ? state.teams[onClock.teamId] : null;
  const myTurn = isUserOnClock(state);
  const needs = positionsOfNeed(state, teamId);
  const remaining = d ? availableProspects(state, d.season).length : pool.length;

  const mine = userPicks(state);
  const myUpcoming = mine.filter((p) => p.playerId === null);
  const myMade = mine.filter((p) => p.playerId !== null);
  const nextMine = myUpcoming[0] ?? null;
  const picksAway =
    nextMine && onClock ? Math.max(0, nextMine.pick - onClock.pick) : 0;

  // Preview only — the Rng is constructed from a copy of the seed and never
  // written back, so rendering this cannot advance the league's random stream.
  const rookieCost = nextMine
    ? capHit(rookieContract(state, nextMine.round, new Rng(state.rngState)))
    : null;

  const recent = d
    ? d.picks.filter((p) => p.playerId !== null).slice(-15).reverse()
    : [];

  const visible = showAll ? rows : rows.slice(0, 60);

  function scout(p: Player) {
    const name = playerName(p);
    apply((s) => {
      const rng = new Rng(s.rngState);
      const ok = spendScouting(s, s.userTeamId, p.id, rng);
      s.rngState = rng.state;
      if (!ok) {
        return `Not enough scouting points — ${SCOUT_COST} required.`;
      }
      const updated = s.players.find((x) => x.id === p.id);
      const band = updated ? displayedOvr(updated) : "?";
      return `Scouted ${name} — now projected ${band} · ${s.teams[s.userTeamId].scoutingPoints} points left`;
    });
  }

  function draftProspect(p: Player) {
    const name = playerName(p);
    const position = p.pos;
    apply((s) => {
      if (!isUserOnClock(s)) return "You are not on the clock.";
      const slot = s.draft ? s.draft.picks[s.draft.onClock] ?? null : null;
      const rng = new Rng(s.rngState);
      const ok = makePick(s, p.id, rng);
      s.rngState = rng.state;
      if (!ok) return `${name} is no longer available.`;
      return `Round ${slot?.round ?? "?"}, pick ${slot?.pick ?? "?"} — you select ${name} (${position})`;
    });
  }

  function simToMe() {
    apply((s) => {
      const live = s.draft;
      if (!live) return "There is no draft in progress.";
      const before = live.onClock;
      simToUserPick(s);
      const made = live.onClock - before;
      if (live.complete) return `Draft complete — ${made} more pick${made === 1 ? "" : "s"} made`;
      if (made === 0) return "You are already on the clock.";
      const slot = live.picks[live.onClock];
      return `${made} pick${made === 1 ? "" : "s"} made — you are on the clock at pick ${slot?.pick ?? ""}`;
    });
  }

  function simAll() {
    apply((s) => {
      const live = s.draft;
      if (!live) return "There is no draft in progress.";
      const before = live.picks.filter((p) => p.playerId !== null).length;
      simEntireDraft(s);
      const after = live.picks.filter((p) => p.playerId !== null).length;
      const classSize = live.picks.filter(
        (p) => p.teamId === s.userTeamId && p.playerId !== null
      ).length;
      const made = after - before;
      return `Draft complete — ${made} pick${made === 1 ? "" : "s"} made, ${classSize} in your class`;
    });
  }

  function openDraftRoom() {
    apply((s) => {
      enterDraft(s);
      const live = s.draft;
      const slot = live ? live.picks[live.onClock] : undefined;
      return slot
        ? `The draft is open — ${s.teams[slot.teamId].abbr} on the clock at pick ${slot.pick}`
        : "The draft is open.";
    });
  }

  const boardHead = [
    "Prospect",
    "Pos",
    "Age",
    "Proj. OVR",
    "Scouting",
    "",
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {d ? (
          <>
            <Stat
              label="On the Clock"
              value={onClockTeam ? onClockTeam.abbr : "—"}
              sub={
                onClock
                  ? `Round ${onClock.round}, pick ${onClock.pick} of ${d.picks.length}`
                  : "Draft complete"
              }
              tone={myTurn ? "good" : undefined}
            />
            <Stat
              label="Your Next Pick"
              value={nextMine ? `#${nextMine.pick}` : "—"}
              sub={
                nextMine
                  ? myTurn
                    ? "You are on the clock"
                    : `Round ${nextMine.round} · ${picksAway} pick${picksAway === 1 ? "" : "s"} away`
                  : "No picks left"
              }
            />
            <Stat
              label="Prospects Left"
              value={remaining}
              sub={`${d.picks.filter((p) => p.playerId !== null).length} of ${d.picks.length} picks made`}
            />
            <Stat
              label="Scouting Points"
              value={team.scoutingPoints}
              sub={`${SCOUT_COST} per look · ${Math.floor(team.scoutingPoints / SCOUT_COST)} left`}
              tone={team.scoutingPoints < SCOUT_COST ? "warn" : undefined}
            />
          </>
        ) : (
          <>
            <Stat label="Class Size" value={pool.length} sub={`${state.season} draft class`} />
            <Stat
              label="Scouting Points"
              value={team.scoutingPoints}
              sub={`${SCOUT_COST} per look · ${Math.floor(team.scoutingPoints / SCOUT_COST)} left`}
              tone={team.scoutingPoints < SCOUT_COST ? "warn" : undefined}
            />
            <Stat
              label="Roster"
              value={`${rosterCount(state, teamId)}/${ROSTER_LIMIT}`}
              sub="Rookies count against the limit"
            />
            <Stat
              label="Draft Opens"
              value="Offseason"
              sub="Scout now — points do not carry over"
            />
          </>
        )}
      </div>

      {!d && (
        <Card
          title="The draft is not open yet"
          subtitle={`Scouting the ${state.season} class`}
          actions={
            state.phase === "offseason-draft" ? (
              <Button variant="primary" size="sm" onClick={openDraftRoom}>
                Open the draft room
              </Button>
            ) : undefined
          }
        >
          <p className="text-sm text-[var(--color-muted)]">
            The draft runs during the offseason, after free agency closes. Until then this
            is a scouting board: spend points to sharpen your read on a prospect, because
            the only thing you will ever see is a projected range — and at low scouting
            that range is centred on the wrong number.
          </p>
          <p className="text-xs text-[var(--color-faint)] mt-2">
            Scouting points reset each offseason, so anything you do not spend is wasted.
          </p>
        </Card>
      )}

      {d && (
        <Card
          title={
            d.complete
              ? "The draft is over"
              : myTurn
                ? "You are on the clock"
                : `${onClockTeam?.city ?? ""} ${onClockTeam?.name ?? ""} are on the clock`
          }
          subtitle={
            d.complete
              ? `${d.picks.filter((p) => p.playerId !== null).length} picks made`
              : onClock
                ? `Round ${onClock.round}, pick ${onClock.pick}`
                : undefined
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={simToMe}
                disabled={d.complete || myTurn || myUpcoming.length === 0}
                title={
                  d.complete
                    ? "The draft is complete"
                    : myTurn
                      ? "You are already on the clock"
                      : myUpcoming.length === 0
                        ? "You have no picks left"
                        : "Run CPU picks until your next selection"
                }
              >
                Sim to my pick
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={simAll}
                disabled={d.complete}
                title={
                  d.complete
                    ? "The draft is complete"
                    : "Auto-pick the rest of the draft, including your remaining selections"
                }
              >
                Sim entire draft
              </Button>
            </div>
          }
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-1.5">
                Your remaining picks
              </div>
              {myUpcoming.length === 0 ? (
                <span className="text-xs text-[var(--color-muted)]">
                  {myMade.length > 0
                    ? `All ${myMade.length} of your picks are in.`
                    : "You have no picks in this draft."}
                </span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {myUpcoming.map((p) => (
                    <Pill key={p.pick} tone={p.pick === onClock?.pick ? "accent" : "default"}>
                      R{p.round} · #{p.pick}
                    </Pill>
                  ))}
                </div>
              )}
            </div>

            {rookieCost !== null && nextMine && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-1.5">
                  Round {nextMine.round} rookie deal
                </div>
                <span className="text-xs tnum text-[var(--color-muted)]">
                  about {formatMoney(rookieCost)} against this year&apos;s cap · 4 years
                </span>
              </div>
            )}

            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-1.5">
                Positions of need
              </div>
              {needs.length === 0 ? (
                <span className="text-xs text-[var(--color-muted)]">
                  Every position is at its target count — take the best player available.
                </span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {needs.slice(0, 8).map((n) => (
                    <Pill key={n} tone="warn">
                      {n}
                    </Pill>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {!d && needs.length > 0 && (
        <Card title="Positions of need" subtitle="Below the target count on your roster right now">
          <div className="flex flex-wrap gap-1.5">
            {needs.map((n) => (
              <Pill key={n} tone="warn">
                {n}
              </Pill>
            ))}
          </div>
        </Card>
      )}

      <Card
        title={d ? "Big board" : `${state.season} draft class`}
        subtitle={`${rows.length} of ${pool.length} prospects · projections are scouting estimates, not ratings`}
        padded={false}
      >
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[var(--color-line-soft)]">
          <Tabs value={pos} onChange={setPos} options={POS_OPTIONS} />
          <Tabs value={sortKey} onChange={setSortKey} options={SORTS} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search prospects…"
            className="bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-lg px-3 py-1.5 text-sm placeholder:text-[var(--color-faint)] outline-none focus:border-[var(--color-accent)] transition-colors min-w-[180px]"
          />
          {(query || pos !== "ALL" || sortKey !== "board") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setQuery("");
                setPos("ALL");
                setSortKey("board");
              }}
            >
              Reset
            </Button>
          )}
        </div>

        {pool.length === 0 ? (
          <Empty
            title="No prospects to scout"
            hint={`Next year's class is generated when the season rolls over. Once it exists, every player here shows a projected range instead of a rating.`}
          />
        ) : rows.length === 0 ? (
          <Empty
            title="No prospects match those filters"
            hint="Try a different position or clear the search."
            action={
              <Button
                onClick={() => {
                  setQuery("");
                  setPos("ALL");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <Table head={boardHead}>
            {visible.map((p) => {
              const width = bandWidth(p);
              const affordable = canScout(state, teamId);
              return (
                <Row key={p.id} highlight={myTurn && needs.includes(p.pos)}>
                  <Cell align="left">
                    <PlayerLink p={p} className="font-medium" />
                  </Cell>
                  <Cell>
                    <PosBadge pos={p.pos} />
                  </Cell>
                  <Cell>{p.age}</Cell>
                  <Cell>
                    <div className="flex items-center justify-end gap-2">
                      <OvrBadge ovr={displayedOvr(p)} size="sm" />
                      <span
                        className={cx(
                          "text-[10px] w-14 text-left",
                          width <= 4
                            ? "text-[var(--color-good)]"
                            : width <= 10
                              ? "text-[var(--color-warn)]"
                              : "text-[var(--color-faint)]"
                        )}
                      >
                        {width <= 4 ? "tight read" : width <= 10 ? "rough read" : "wild guess"}
                      </span>
                    </div>
                  </Cell>
                  <Cell>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[var(--color-muted)] text-xs">{p.scouted}%</span>
                      <span className="w-12 shrink-0">
                        <Bar value={p.scouted} max={100} tone={p.scouted >= 70 ? "good" : "accent"} />
                      </span>
                    </div>
                  </Cell>
                  <Cell>
                    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => scout(p)}
                        disabled={!affordable || p.scouted >= 100}
                        title={
                          p.scouted >= 100
                            ? "Fully scouted"
                            : affordable
                              ? `Spend ${SCOUT_COST} scouting points on a sharper read`
                              : `Not enough scouting points (${SCOUT_COST} needed)`
                        }
                      >
                        Scout
                      </Button>
                      {d && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => draftProspect(p)}
                          disabled={!myTurn}
                          title={
                            myTurn
                              ? `Select ${playerName(p)} at pick ${onClock?.pick ?? ""}`
                              : d.complete
                                ? "The draft is complete"
                                : "You are not on the clock"
                          }
                        >
                          Draft
                        </Button>
                      )}
                    </div>
                  </Cell>
                </Row>
              );
            })}
          </Table>
        )}

        {rows.length > visible.length && (
          <div className="px-4 py-3 border-t border-[var(--color-line-soft)] text-center">
            <Button size="sm" onClick={() => setShowAll(true)}>
              Show all {rows.length} prospects
            </Button>
          </div>
        )}
        {showAll && rows.length > 60 && (
          <div className="px-4 py-3 border-t border-[var(--color-line-soft)] text-center">
            <Button size="sm" variant="ghost" onClick={() => setShowAll(false)}>
              Show top 60 only
            </Button>
          </div>
        )}
      </Card>

      {d && (
        <Card
          title="Recent picks"
          subtitle={
            recent.length > 0
              ? `Last ${recent.length} selections, newest first`
              : undefined
          }
          padded={false}
        >
          {recent.length === 0 ? (
            <Empty
              title="No picks have been made yet"
              hint="Selections appear here as they happen. Use “Sim to my pick” to let the CPU run its board."
            />
          ) : (
            <Table head={["Rd", "Pick", "Team", "Player", "Pos", "OVR"]}>
              {recent.map((pick) => {
                const p = pick.playerId !== null ? byId.get(pick.playerId) : undefined;
                const pickTeam = state.teams[pick.teamId];
                return (
                  <Row key={pick.pick} highlight={pick.teamId === teamId}>
                    <Cell align="left">{pick.round}</Cell>
                    <Cell>#{pick.pick}</Cell>
                    <Cell>
                      <div className="flex items-center justify-end gap-2">
                        <TeamMark team={pickTeam} size={20} />
                        <span className="text-xs">{pickTeam.abbr}</span>
                      </div>
                    </Cell>
                    <Cell>
                      {p ? (
                        <PlayerLink p={p} className="font-medium" />
                      ) : (
                        <span className="text-[var(--color-faint)]">Pick forfeited</span>
                      )}
                    </Cell>
                    <Cell>{p ? <PosBadge pos={p.pos} /> : "—"}</Cell>
                    {/* Drafted players are no longer prospects, so displayedOvr
                        returns their real rating — and if one somehow still is,
                        it returns the band rather than leaking the truth. */}
                    <Cell>{p ? <OvrBadge ovr={displayedOvr(p)} size="sm" /> : "—"}</Cell>
                  </Row>
                );
              })}
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
