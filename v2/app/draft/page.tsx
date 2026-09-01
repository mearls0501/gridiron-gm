"use client";

import { useMemo, useState } from "react";
import { useGame } from "@/lib/store/game";
import { Rng } from "@/lib/core/rng";
import { displayedOvr, playerName, POSITION_VALUE } from "@/lib/core/ratings";
import {
  UDFA_SIGNINGS_MAX,
  acceptClockOffer,
  acceptMoveUp,
  availableProspects,
  draftBoard,
  isUserOnClock,
  makePick,
  positionsOfNeed,
  quoteMoveUp,
  rookieContract,
  runUdfaChase,
  signUdfa,
  udfaSignedCount,
  userPicks,
} from "@/lib/core/offseason/draft";
import {
  METHOD_LABEL,
  PRIVATE_VISIT_CAP,
  WINDOW_LABEL,
  advanceScoutingWindow,
  calendarView,
  canAdvanceScoutingWindow,
  ensureScouting,
  boardNote,
  getIntel,
  methodsForWindow,
  runScoutingMethod,
  scoutingBlockReason,
  setBoardNote,
} from "@/lib/core/scouting";
import { describeAsset } from "@/lib/core/trades";
import { boardGrade, consensusGrade, gradeContext, prospectReports, prospectTraits } from "@/lib/core/scouting-reports";
import { enterDraft, simEntireDraft, simToUserPick } from "@/lib/core/offseason";
import { capHit, formatMoney, playerMap, rosterCount } from "@/lib/core/select";
import { simEntireDraftToast } from "@/lib/view/draftToast";
import { POSITIONS, Player, Position, ROSTER_LIMIT, ScoutingMethod } from "@/lib/core/types";
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
 * estimate that tightens as work is done inside the open window. Showing the
 * real number anywhere would delete the entire draft game.
 */

type SortKey = "board" | "band" | "age" | "scouted" | "pos";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "board", label: "Board" },
  { value: "band", label: "Your Grade" },
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
  const [focusId, setFocusId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [moveUpQuote, setMoveUpQuote] = useState<string | null>(null);

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

  // Grade context ranks every estimate against the whole class's consensus —
  // built from the unfiltered pool so filters never move anyone's grade.
  const ctx = useMemo(() => gradeContext(state!, pool), [state, pool, rev]);

  const rows = useMemo<Player[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = pool.filter((p) => {
      if (pos !== "ALL" && p.pos !== pos) return false;
      if (q && !playerName(p).toLowerCase().includes(q)) return false;
      return true;
    });
    if (sortKey === "board") return filtered;
    // "Your Grade" sorts by YOUR board's opinion (grade slot), not the
    // public band — that's the whole point of doing the work.
    const slot = (p: Player) => boardGrade(state!, p, ctx).slot;
    return filtered.slice().sort((a, b) => {
      switch (sortKey) {
        case "band":
          return slot(a) - slot(b) || a.id - b.id;
        case "age":
          return a.age - b.age || slot(a) - slot(b);
        case "scouted":
          return b.scouted - a.scouted || slot(a) - slot(b);
        case "pos":
          return (
            POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) ||
            slot(a) - slot(b)
          );
      }
    });
  }, [pool, pos, sortKey, query, state, ctx, rev]);

  const byId = useMemo(
    () => (state ? playerMap(state) : new Map<number, Player>()),
    [state, rev]
  );

  if (!state) return null;

  const teamId = state.userTeamId;
  const cal = calendarView(state);
  const windowMethods = methodsForWindow(cal.window);
  const defaultMethod = windowMethods[0] ?? "film";
  const canCloseWindow = canAdvanceScoutingWindow(state);
  const d = state.draft;
  const onClock = d && !d.complete ? d.picks[d.onClock] ?? null : null;
  const onClockTeam = onClock ? state.teams[onClock.teamId] : null;
  const myTurn = isUserOnClock(state);
  const needs = positionsOfNeed(state, teamId);
  const remaining = d ? availableProspects(state, d.season).length : pool.length;
  const udfaTaken = udfaSignedCount(state, teamId);
  const udfaFull = udfaTaken >= UDFA_SIGNINGS_MAX;

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

  function scout(p: Player, method: ScoutingMethod = "film") {
    const name = playerName(p);
    apply((s) => {
      const blocked = scoutingBlockReason(s, method);
      if (blocked) return blocked;
      const rng = new Rng(s.rngState);
      const ok = runScoutingMethod(s, p.id, method, rng);
      s.rngState = rng.state;
      if (!ok) return `Could not run ${METHOD_LABEL[method].toLowerCase()}.`;
      const updated = s.players.find((x) => x.id === p.id);
      const grade = updated ? boardGrade(s, updated, gradeContext(s, pool)).label : "?";
      const cal = ensureScouting(s);
      return `${METHOD_LABEL[method]}: ${name} — board grade ${grade} · ${WINDOW_LABEL[cal.window]}`;
    });
  }

  function closeWindow() {
    apply((s) => {
      const before = ensureScouting(s).window;
      const ok = advanceScoutingWindow(s);
      if (!ok) return "That window cannot close yet.";
      return `${WINDOW_LABEL[before]} is closed. ${WINDOW_LABEL[ensureScouting(s).window]} is open.`;
    });
  }

  function setNote(p: Player, patch: Parameters<typeof setBoardNote>[2]) {
    apply((s) => {
      setBoardNote(s, p.id, patch);
      return null as unknown as string;
    });
  }

  function acceptOffer(offerId: number) {
    apply((s) => {
      const rng = new Rng(s.rngState);
      const ok = acceptClockOffer(s, offerId, rng);
      s.rngState = rng.state;
      if (!ok) return "That offer fell through.";
      const live = s.draft;
      if (live && !live.complete && live.picks[live.onClock]?.teamId === s.userTeamId) {
        return "Trade done — you are still on the clock at your new slot.";
      }
      return "Trade done — you moved down. The room rolls on to your next pick.";
    });
  }

  function declineOffers() {
    apply((s) => {
      if (s.draft) s.draft.clockOffers = [];
      return "Offers declined. Your pick.";
    });
  }

  function getMoveUpQuote() {
    if (!state) return;
    const bundle = quoteMoveUp(state);
    if (!bundle) {
      setMoveUpQuote("NO_DEAL");
      return;
    }
    setMoveUpQuote(bundle.map((a) => describeAsset(state, a)).join(" + "));
  }

  function doMoveUp() {
    setMoveUpQuote(null);
    apply((s) => {
      const ok = acceptMoveUp(s);
      if (!ok) return "The club on the clock walked away.";
      const slot = s.draft ? s.draft.picks[s.draft.onClock] : null;
      return `You are on the clock at pick ${slot?.pick ?? "?"}.`;
    });
  }

  function signPriority(p: Player) {
    const name = playerName(p);
    apply((s) => {
      const rng = new Rng(s.rngState);
      const ok = signUdfa(s, s.userTeamId, p.id, rng);
      s.rngState = rng.state;
      return ok ? `${name} signed as a priority free agent.` : `${name} is off the market.`;
    });
  }

  function finishUdfa() {
    apply((s) => {
      const rng = new Rng(s.rngState);
      const n = runUdfaChase(s, rng);
      s.rngState = rng.state;
      return `The league chases the rest — ${n} priority free agents signed around the league.`;
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
      simEntireDraft(s);
      return simEntireDraftToast(live.picks, s.userTeamId);
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
    "Your Board",
    "Consensus",
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
              label="Scouting window"
              value={WINDOW_LABEL[cal.window]}
              sub={`${cal.visitsRemaining} of ${PRIVATE_VISIT_CAP} visits left`}
              tone={cal.visitsRemaining === 0 ? "warn" : undefined}
            />
          </>
        ) : (
          <>
            <Stat label="Class Size" value={pool.length} sub={`${state.season} draft class`} />
            <Stat
              label="Scouting window"
              value={WINDOW_LABEL[cal.window]}
              sub={`${cal.visitsRemaining} of ${PRIVATE_VISIT_CAP} visits left`}
              tone={cal.visitsRemaining === 0 ? "warn" : undefined}
            />
            <Stat
              label="Roster"
              value={`${rosterCount(state, teamId)}/${ROSTER_LIMIT}`}
              sub="Rookies count against the limit"
            />
            <Stat
              label="Draft Opens"
              value="Offseason"
              sub="Miss a window and that look is gone"
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
            is a scouting board. You will never see a rating — only your department&apos;s
            round grade, its conviction, and what your people wrote. An unworked prospect
            grades wherever the market has him; the work is what earns you a different
            opinion, and the market is sometimes wrong.
          </p>
          <p className="text-xs text-[var(--color-faint)] mt-2">
            {WINDOW_LABEL[cal.window]} is open. Miss a window and that information does not
            exist this cycle. {cal.visitsRemaining} of {PRIVATE_VISIT_CAP} private visits remain.
          </p>
          {canCloseWindow && (
            <div className="mt-3">
              <Button size="sm" variant="ghost" onClick={closeWindow}>
                Close {WINDOW_LABEL[cal.window]}
              </Button>
            </div>
          )}
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

      {d && !d.complete && myTurn && (d.clockOffers?.length ?? 0) > 0 && (
        <Card
          title="The phones are ringing"
          subtitle="Clubs below you want this pick. Accepting moves you down and hands them the slot."
          actions={
            <Button size="sm" variant="ghost" onClick={declineOffers}>
              Decline all
            </Button>
          }
        >
          <div className="space-y-2">
            {(d.clockOffers ?? []).map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-line-soft)] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <TeamMark team={state.teams[o.fromTeamId]} size={20} />
                    {state.teams[o.fromTeamId].city} {state.teams[o.fromTeamId].name}
                  </div>
                  <div className="text-xs text-[var(--color-muted)] mt-0.5">
                    They send: {o.give.map((a) => describeAsset(state, a)).join(" + ")} · for
                    your pick #{onClock?.pick}
                  </div>
                  <div className="text-[10px] text-[var(--color-faint)] mt-0.5">{o.rationale}</div>
                </div>
                <Button size="sm" variant="primary" onClick={() => acceptOffer(o.id)}>
                  Accept and move down
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {d && !d.complete && !myTurn && myUpcoming.length > 0 && (
        <Card
          title="Work the phones"
          subtitle={`${onClockTeam?.abbr ?? ""} are on the clock at #${onClock?.pick ?? ""}. You can call about moving up.`}
        >
          {moveUpQuote === null ? (
            <Button size="sm" onClick={getMoveUpQuote}>
              Ask their price
            </Button>
          ) : moveUpQuote === "NO_DEAL" ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-[var(--color-muted)]">
                No deal — you cannot cover their price for this slot.
              </span>
              <Button size="sm" variant="ghost" onClick={() => setMoveUpQuote(null)}>
                OK
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">
                They want: <span className="font-medium">{moveUpQuote}</span>
              </span>
              <Button size="sm" variant="primary" onClick={doMoveUp}>
                Do it — move up to #{onClock?.pick}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMoveUpQuote(null)}>
                Walk away
              </Button>
            </div>
          )}
        </Card>
      )}

      {d && d.complete && !d.udfaDone && (
        <Card
          title={`Priority free agency — ${udfaTaken}/${UDFA_SIGNINGS_MAX}`}
          subtitle={`The draft is over. ${remaining} undrafted men are taking calls — sign up to ${UDFA_SIGNINGS_MAX} before the league picks the pool clean.`}
          actions={
            <Button size="sm" variant="primary" onClick={finishUdfa}>
              Finish — let the league chase the rest
            </Button>
          }
        >
          <p className="text-xs text-[var(--color-faint)] mb-1">
            Three-year league-minimum deals. Your board notes and scouting reads apply below —
            sign from the big board, then finish the chase.
          </p>
        </Card>
      )}

      {(() => {
        const focus = focusId !== null ? byId.get(focusId) : undefined;
        if (!focus || !focus.prospect || !focus.profile) return null;
        const intel = getIntel(state, focus);
        const note = boardNote(state, focus.id);
        const pr = focus.profile;
        const ft = (n: number) => `${Math.floor(n / 12)}'${n % 12}"`;
        const c = pr.combine;
        const measurables: [string, string][] = [
          ["Ht / Wt", `${ft(pr.heightIn)} · ${pr.weightLb} lb`],
          ["40-yard", c.forty != null ? `${c.forty.toFixed(2)}s` : "—"],
          ["10-yd split", c.tenSplit != null ? `${c.tenSplit.toFixed(2)}s` : "—"],
          ["Vertical", c.vertical != null ? `${c.vertical}"` : "—"],
          ["Broad", c.broad != null ? ft(Math.round(c.broad)) : "—"],
          ["3-cone", c.threeCone != null ? `${c.threeCone.toFixed(2)}s` : "—"],
          ["Shuttle", c.shortShuttle != null ? `${c.shortShuttle.toFixed(2)}s` : "—"],
          ["Bench", c.bench != null ? `${c.bench} reps` : "—"],
        ];
        const methods: ScoutingMethod[] = ["film", "proDay", "privateWorkout", "medical", "interview"];
        return (
          <Card
            title={`War Room — ${playerName(focus)}`}
            subtitle={`${focus.pos} · ${pr.college} · ${pr.classYear.replace("RS_", "RS ")} · age ${focus.age}`}
            actions={
              <Button size="sm" variant="ghost" onClick={() => setFocusId(null)}>
                Close
              </Button>
            }
          >
            <div className="grid gap-5 lg:grid-cols-4 sm:grid-cols-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-2">
                  Testing — public
                </div>
                <div className="space-y-1">
                  {measurables.map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-[var(--color-faint)]">{k}</span>
                      <span className="tnum">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-2">
                  Your department&apos;s read
                </div>
                {(() => {
                  const g = boardGrade(state, focus, ctx);
                  const m = consensusGrade(state, focus, ctx);
                  return (
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[var(--color-faint)]">Board grade</span>
                        <span className="font-medium">{g.label}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--color-faint)]">Conviction</span>
                        <span
                          className={
                            g.conviction === "high"
                              ? "text-[var(--color-good)]"
                              : g.conviction === "medium"
                                ? "text-[var(--color-warn)]"
                                : "text-[var(--color-faint)]"
                          }
                        >
                          {g.conviction}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--color-faint)]">Consensus</span>
                        <span className="text-[var(--color-muted)]">{m.label}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--color-faint)]">Work invested</span>
                        <span className="tnum">{intel.effort}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--color-faint)]">Medical</span>
                        <span className={intel.medical && intel.medical !== "clean" ? "text-[var(--color-warn)]" : ""}>
                          {intel.medical ?? "unknown"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--color-faint)]">Character</span>
                        <span className={intel.character && intel.character !== "clean" ? "text-[var(--color-warn)]" : ""}>
                          {intel.character ?? "unknown"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--color-faint)]">Coachability</span>
                        <span>
                          {(intel.methods.proDay ?? 0) > 0
                            ? pr.coachability >= 80
                              ? "sponge"
                              : pr.coachability >= 60
                                ? "receptive"
                                : pr.coachability >= 40
                                  ? "his own way"
                                  : "uncoachable"
                            : "unknown"}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-2">
                  {WINDOW_LABEL[cal.window]}
                </div>
                <div className="flex flex-col gap-1.5">
                  {methods.map((m) => {
                    const done = intel.methods[m] ?? 0;
                    const revealed =
                      (m === "medical" && intel.medical !== null) ||
                      (m === "interview" && intel.character !== null);
                    const open = windowMethods.includes(m);
                    const noVisits = m === "privateWorkout" && cal.visitsRemaining <= 0;
                    return (
                      <Button
                        key={m}
                        size="sm"
                        variant="ghost"
                        onClick={() => scout(focus, m)}
                        disabled={!open || noVisits || revealed}
                        title={
                          revealed
                            ? "Already on file"
                            : !open
                              ? `Not this window — ${WINDOW_LABEL[cal.window]}`
                              : noVisits
                                ? `No private visits remaining (${PRIVATE_VISIT_CAP} per season)`
                                : METHOD_LABEL[m]
                        }
                      >
                        {METHOD_LABEL[m]}
                        {!open ? " · closed" : noVisits ? " · no visits" : ""}
                        {done > 0 && !revealed ? ` (×${done})` : ""}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-2">
                  Board call
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {([1, 2, 3, 4, 5] as const).map((t) => (
                    <Button
                      key={t}
                      size="sm"
                      variant={note.tier === t ? "primary" : "ghost"}
                      onClick={() => setNote(focus, { tier: note.tier === t ? undefined : t })}
                    >
                      T{t}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <Button
                    size="sm"
                    variant={note.watch ? "primary" : "ghost"}
                    onClick={() => setNote(focus, { watch: !note.watch })}
                  >
                    {note.watch ? "★ Watching" : "☆ Watch"}
                  </Button>
                  <Button
                    size="sm"
                    variant={note.avoid ? "primary" : "ghost"}
                    onClick={() => setNote(focus, { avoid: !note.avoid })}
                  >
                    {note.avoid ? "✕ Do not draft" : "Do not draft"}
                  </Button>
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder={note.note ?? "Scout's note…"}
                    className="bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-lg px-2 py-1 text-xs placeholder:text-[var(--color-faint)] outline-none focus:border-[var(--color-accent)] w-full"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      setNote(focus, { note: noteDraft || undefined });
                      setNoteDraft("");
                    }}
                  >
                    Save
                  </Button>
                </div>
                {note.note && (
                  <div className="text-xs text-[var(--color-muted)] mt-2 italic">“{note.note}”</div>
                )}
              </div>
            </div>

            {/* ---- The file: what your people wrote ------------------------- */}
            <div className="mt-5 pt-4 border-t border-[var(--color-line-soft)]">
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-2">
                The File
              </div>
              <div className="space-y-2.5">
                {prospectReports(state, focus, ctx).map((r, i) => (
                  <div key={i} className="text-sm">
                    <p>{r.text}</p>
                    <p className="text-xs text-[var(--color-faint)] mt-0.5">
                      — {r.source.name}, {r.source.role}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                {prospectTraits(state, focus).map((t) => (
                  <span key={t.key} className="text-xs whitespace-nowrap">
                    <span className="text-[var(--color-faint)]">{t.label}:</span>{" "}
                    <span
                      className={cx(
                        t.verdict === "elite"
                          ? "text-[var(--color-good)] font-medium"
                          : t.verdict === "limited"
                            ? "text-[var(--color-warn)]"
                            : ""
                      )}
                    >
                      {t.verdict}
                      {!t.certain && "?"}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </Card>
        );
      })()}

      <Card
        title={d ? "Big board" : `${state.season} draft class`}
        subtitle={`${rows.length} of ${pool.length} prospects · grades are your department's opinion, not the truth`}
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
            hint={`Next year's class is generated when the season rolls over. Once it exists, every player here carries a round grade and a file instead of a rating.`}
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
              const windowOpen = windowMethods.includes(defaultMethod)
                && (defaultMethod !== "privateWorkout" || cal.visitsRemaining > 0);
              const note = boardNote(state, p.id);
              const intel = getIntel(state, p);
              return (
                <Row key={p.id} highlight={myTurn && needs.includes(p.pos)}>
                  <Cell align="left">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <PlayerLink p={p} className="font-medium" />
                      {note.tier && <Pill tone="accent">T{note.tier}</Pill>}
                      {note.watch && <span title="Watchlist">★</span>}
                      {note.avoid && (
                        <span className="text-[var(--color-warn)]" title="Do not draft">
                          ✕
                        </span>
                      )}
                    </span>
                  </Cell>
                  <Cell>
                    <PosBadge pos={p.pos} />
                  </Cell>
                  <Cell>{p.age}</Cell>
                  <Cell>
                    {(() => {
                      const g = boardGrade(state, p, ctx);
                      return (
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          <span
                            className={cx(
                              "w-1.5 h-1.5 rounded-full shrink-0",
                              g.conviction === "high"
                                ? "bg-[var(--color-good)]"
                                : g.conviction === "medium"
                                  ? "bg-[var(--color-warn)]"
                                  : "bg-[var(--color-faint)]"
                            )}
                            title={`${g.conviction} conviction`}
                          />
                          <span className="text-xs font-medium">{g.label}</span>
                        </div>
                      );
                    })()}
                  </Cell>
                  <Cell>
                    <span className="text-xs text-[var(--color-muted)] whitespace-nowrap">
                      {consensusGrade(state, p, ctx).label}
                    </span>
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
                        onClick={() => scout(p, defaultMethod)}
                        disabled={!windowOpen || p.scouted >= 100}
                        title={
                          p.scouted >= 100
                            ? "Fully scouted"
                            : windowOpen
                              ? `${METHOD_LABEL[defaultMethod]} — ${WINDOW_LABEL[cal.window]}. Open the war room for the full toolkit.`
                              : `${METHOD_LABEL[defaultMethod]} is not available during ${WINDOW_LABEL[cal.window]}`
                        }
                      >
                        Scout
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setFocusId(p.id);
                          setNoteDraft("");
                        }}
                        title="Open the war room on this prospect"
                      >
                        Room
                      </Button>
                      {d && !d.complete && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => draftProspect(p)}
                          disabled={!myTurn}
                          title={
                            myTurn
                              ? `Select ${playerName(p)} at pick ${onClock?.pick ?? ""}`
                              : "You are not on the clock"
                          }
                        >
                          Draft
                        </Button>
                      )}
                      {d && d.complete && !d.udfaDone && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => signPriority(p)}
                          disabled={udfaFull}
                          title={
                            udfaFull
                              ? `Priority UDFA cap reached (${udfaTaken}/${UDFA_SIGNINGS_MAX})`
                              : `Sign ${playerName(p)} to a three-year minimum deal (${udfaTaken}/${UDFA_SIGNINGS_MAX})`
                          }
                        >
                          Sign
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
