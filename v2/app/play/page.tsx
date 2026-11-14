"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/store/game";
import { Button, Card, Empty, Help, Pill, TeamMark } from "@/components/ui";
import { isOnBye, userNextGame } from "@/lib/core/season/engine";
import {
  AGGRESSION_AGGRESSIVE, AGGRESSION_CONSERVATIVE, PASS_LEAN_PASS, PASS_LEAN_RUN,
  boxAttempts, callSheetView, setCallSheet,
} from "@/lib/core/callSheet";
import { resumeLiveGame, writeSealedLive, type LiveView } from "@/lib/core/liveGame";
import {
  SNAP_INTENT_CHOICES, offenseMargin, resolveSnapIntent, snapSendWord,
} from "@/lib/core/snapIntent";
import { SnapCall } from "@/lib/core/types";
import { playerMap } from "@/lib/core/select";
import { PlayArt } from "@/components/PlayArt";
import {
  clockLabel, downDistance, driveBar, driveResultLabel, driveResultTone,
  formatVisiblePlay, playedResultLine, quarterLabel, spotLabel, visiblePlays, wentToOvertime,
} from "@/lib/view/playByPlay";

/**
 * Play-the-Game: user-club offensive snaps only.
 *
 * CPU games stay auto. Bulk-sim never waits here. Each hand call, and every
 * auto snap from Let the coach finish, is written onto the call sheet
 * immediately; a reload replays that list. A situation call resolves to
 * run, pass, or auto before it is stored. When the game reaches the
 * whistle, that result is sealed. Play Week commits the seal. A week
 * with no seal still sims.
 */
export default function PlayPage() {
  const state = useGame((s) => s.state);
  const apply = useGame((s) => s.apply);
  const advance = useGame((s) => s.advance);

  const [view, setView] = useState<LiveView | null>(null);
  const [session, setSession] = useState<ReturnType<typeof resumeLiveGame> | null>(null);
  const [committed, setCommitted] = useState(false);
  const [boundGameId, setBoundGameId] = useState<number | null>(null);
  const [lastSend, setLastSend] = useState<string | null>(null);
  const [restarted, setRestarted] = useState(false);
  const committedRef = useRef(false);
  const heldFranchise = useRef<string | null>(null);

  const game = state ? userNextGame(state) : undefined;
  const onBye = state ? isOnBye(state, state.userTeamId) : false;
  const canPlay =
    !!state &&
    !!game &&
    !game.played &&
    !onBye &&
    (state.phase === "regular" || state.phase === "playoffs");

  useEffect(() => {
    const s = useGame.getState().state;
    if (!s) return;
    // Play Week advances state.week. Keep the finished game up; the next
    // kickoff is a new visit to this page.
    if (committedRef.current && heldFranchise.current === s.id) return;
    committedRef.current = false;
    if (s.phase !== "regular" && s.phase !== "playoffs") return;
    if (isOnBye(s, s.userTeamId)) return;
    const g = userNextGame(s);
    if (!g || g.played) return;
    const live = resumeLiveGame(s, g.id);
    // A stale called game is void: drop its snaps so Play Week does not
    // replay them on a different game.
    if (live.stale) useGame.getState().apply((x) => { setCallSheet(x, { snaps: [] }); });
    setRestarted(live.stale);
    setBoundGameId(g.id);
    setSession(live);
    setView(live.peek());
    setCommitted(false);
    setLastSend(null);
  }, [state?.id, state?.season, state?.week, state?.phase]);

  if (!state) return null;

  const keepResult = committed && !!view?.done;

  if (onBye && !keepResult) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Card title="Play the Game">
          <Empty title="Bye week" hint="No call sheet and no snaps. The rest of the league plays on." />
          <div className="pt-3">
            <Link href="/week"><Button size="sm">Back to This Week</Button></Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!canPlay && !view?.done) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Card title="Play the Game">
          <Empty title="No game to call" hint="Play-the-Game is the user club's game only, before Play Week." />
          <div className="pt-3">
            <Link href="/week"><Button size="sm">Back to This Week</Button></Link>
          </div>
        </Card>
      </div>
    );
  }

  const bound = boundGameId != null ? state.games.find((g) => g.id === boundGameId) : undefined;
  const liveGame = view?.done && bound ? bound : game;
  const oppId = liveGame
    ? (liveGame.homeId === state.userTeamId ? liveGame.awayId : liveGame.homeId)
    : state.userTeamId;
  const opp = state.teams[oppId];
  const us = state.teams[state.userTeamId];
  const userIsHome = liveGame ? liveGame.homeId === state.userTeamId : true;
  const players = playerMap(state);
  const nameOf = (id: number) => {
    const p = players.get(id);
    return p ? p.lastName : "";
  };
  const playSides = liveGame
    ? {
        abbr: (id: number) => state.teams[id]?.abbr ?? "?",
        homeId: liveGame.homeId,
        awayId: liveGame.awayId,
      }
    : undefined;
  const shownPlays = view ? visiblePlays(view.plays) : [];
  const lastShown = shownPlays.length > 0 ? shownPlays[shownPlays.length - 1] : null;
  const headline = view?.lastSnap
    ? view.lastSnap.kind === "downs" && lastShown
      ? lastShown
      : { event: view.lastSnap, turnoverOnDowns: false as const }
    : null;
  const sheet = callSheetView(us);
  const sheetBits: string[] = [];
  if (sheet.passLean === PASS_LEAN_RUN) sheetBits.push("run-heavy");
  else if (sheet.passLean === PASS_LEAN_PASS) sheetBits.push("pass-heavy");
  if (sheet.aggression === AGGRESSION_CONSERVATIVE) sheetBits.push("conservative on fourth down");
  else if (sheet.aggression === AGGRESSION_AGGRESSIVE) sheetBits.push("aggressive on fourth down");

  const persistSnaps = (calls: SnapCall[]) => {
    const sealed = session?.seal() ?? null;
    apply((s) => {
      setCallSheet(s, { snaps: calls, snapsKey: session?.key() });
      if (sealed) writeSealedLive(s, sealed);
    });
    setRestarted(false);
  };

  const pick = (c: SnapCall, via?: string) => {
    if (!session) return;
    setView(session.call(c));
    persistSnaps(session.snaps());
    setLastSend(via ? `${via} → ${snapSendWord(c)}` : snapSendWord(c));
  };

  const finish = () => {
    if (!session) return;
    setView(session.finishAuto());
    persistSnaps(session.snaps());
  };

  const playWeek = () => {
    if (!session || !view?.done) return;
    const sealed = session.seal();
    apply((s) => {
      setCallSheet(s, { snaps: view.calls, snapsKey: session.key() });
      if (sealed && !s.sealedLive) writeSealedLive(s, sealed);
      return "Play-the-Game calls set";
    });
    committedRef.current = true;
    heldFranchise.current = state.id;
    setCommitted(true);
    advance();
  };

  const resultLine = view?.done && liveGame
    ? playedResultLine({
        homeAbbr: state.teams[liveGame.homeId].abbr,
        awayAbbr: state.teams[liveGame.awayId].abbr,
        homeScore: view.result.homeScore,
        awayScore: view.result.awayScore,
        userIsHome,
        ot: wentToOvertime(view.result.box, view.result.plays),
      })
    : null;

  const hasLog = !!view && (view.drives.length > 0 || shownPlays.length > 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Play the Game</h1>
        <p className="text-xs text-[var(--color-muted)]">
          {us.city} {us.name} vs {opp.city} {opp.name} · your snaps only
        </p>
        {restarted && (
          <p className="text-xs text-[var(--color-warn)] mt-1" data-testid="play-restarted">
            Your depth chart or roster changed after kickoff. The game restarted.
          </p>
        )}
      </div>

      <div className={hasLog ? "grid gap-4 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "max-w-3xl"}>
      <div className="space-y-4 min-w-0">

      {view && !view.done && (
        <Card
          title={`${quarterLabel(view.info.quarter)} · ${clockLabel(view.info.clock)}`}
          subtitle={`${view.info.down} & ${view.info.toGo} · ${spotLabel(view.info.yardLine)}`}
        >
          {(() => {
            const ours = userIsHome ? view.info.homeScore : view.info.awayScore;
            const theirs = userIsHome ? view.info.awayScore : view.info.homeScore;
            const margin = offenseMargin(view.info);
            const yl = Math.max(1, Math.min(99, Math.round(view.info.yardLine)));
            const line = Math.min(100, yl + view.info.toGo);
            return (
              <div className="mb-4">
                <div className="flex items-center gap-3">
                  <TeamMark team={us} size={36} />
                  <div className="min-w-0">
                    <div className="text-xs text-[var(--color-muted)] leading-tight">{us.abbr} · ball</div>
                    <div className="text-3xl font-semibold tnum leading-none mt-0.5">{ours}</div>
                  </div>
                  <div className="flex-1 text-center">
                    <Pill tone={margin === 0 ? "default" : margin > 0 ? "good" : "bad"}>
                      {margin === 0 ? "Tied" : margin > 0 ? `Up ${margin}` : `Down ${-margin}`}
                    </Pill>
                  </div>
                  <div className="min-w-0 text-right">
                    <div className="text-xs text-[var(--color-muted)] leading-tight">{opp.abbr}</div>
                    <div className="text-3xl font-semibold tnum leading-none mt-0.5 text-[var(--color-muted)]">{theirs}</div>
                  </div>
                  <TeamMark team={opp} size={36} />
                </div>
                {/* Field: our goal line on the left, theirs on the right. */}
                <div
                  className="mt-3"
                  role="img"
                  aria-label={`Ball on the ${spotLabel(view.info.yardLine)}, ${view.info.toGo} to go`}
                >
                  <div className="relative h-7 rounded-md overflow-hidden border border-[var(--color-line)] bg-[#12261b]">
                    <div className="absolute inset-y-0 left-0 w-[4%]" style={{ background: us.primary, opacity: 0.9 }} />
                    <div className="absolute inset-y-0 right-0 w-[4%]" style={{ background: opp.primary, opacity: 0.9 }} />
                    {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((m) => (
                      <div
                        key={m}
                        className="absolute inset-y-0 w-px bg-white/15"
                        style={{ left: `${4 + m * 0.92}%` }}
                      />
                    ))}
                    <div
                      className="absolute inset-y-0 bg-[var(--color-warn)]/25"
                      style={{ left: `${4 + yl * 0.92}%`, width: `${(line - yl) * 0.92}%` }}
                    />
                    <div
                      className="absolute inset-y-0 w-0.5 bg-[var(--color-warn)]"
                      style={{ left: `${4 + line * 0.92}%` }}
                    />
                    <div
                      className="absolute top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-[#0c0e12]"
                      style={{ left: `${4 + yl * 0.92}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-[var(--color-faint)] mt-1 tnum">
                    <span>{us.abbr} goal</span>
                    <span>50</span>
                    <span>{opp.abbr} goal</span>
                  </div>
                </div>
              </div>
            );
          })()}
          {view.info.down === 4 && (
            <p className="text-xs text-[var(--color-muted)] mb-3">
              The staff already sent the offense out on fourth down. This desk calls the snap.
            </p>
          )}
          {headline && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-line-soft)]">
              <div className="text-[11px] uppercase tracking-wider text-[var(--color-faint)] mb-0.5">
                Last snap
              </div>
              <p className="text-sm">
                {quarterLabel(headline.event.q)} {clockLabel(headline.event.clock)}
                {" · "}
                {downDistance(headline.event)}
                {" · "}
                {formatVisiblePlay(headline, nameOf, playSides)}
              </p>
              <div className="mt-1.5">
                <PlayArt event={headline.event} leftTeamId={state.userTeamId} />
              </div>
            </div>
          )}
          {!headline && view.plays[0]?.kind === "kickoff" && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-line-soft)]" data-testid="opening-kick">
              <div className="text-[11px] uppercase tracking-wider text-[var(--color-faint)] mb-0.5">
                Opening kickoff
              </div>
              <p className="text-sm">
                {formatVisiblePlay({ event: view.plays[0], turnoverOnDowns: false }, nameOf, playSides)}
                {view.plays[0].kickerId !== undefined && nameOf(view.plays[0].kickerId) && (
                  <span className="text-xs text-[var(--color-muted)]"> · kicked by {nameOf(view.plays[0].kickerId)}</span>
                )}
              </p>
              <div className="mt-1.5">
                <PlayArt event={view.plays[0]} leftTeamId={state.userTeamId} label="Opening kickoff" />
              </div>
            </div>
          )}
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-faint)] mb-1.5">
            Call by situation
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SNAP_INTENT_CHOICES.map((choice) => {
              const resolved = resolveSnapIntent(choice.id, view.info);
              return (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => pick(resolved.call, choice.label)}
                  className="text-left border rounded-lg px-3 py-2 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border-[var(--color-line)] cursor-pointer"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{choice.label}</span>
                    <span className="text-xs text-[var(--color-muted)] shrink-0">
                      sends{" "}
                      <span className="font-semibold text-[var(--color-accent)]">{snapSendWord(resolved.call)}</span>
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">{resolved.because}</p>
                </button>
              );
            })}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-faint)] mt-4 mb-1.5">
            Or call it yourself
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="lg" className="min-w-24" onClick={() => pick("run")}>Run</Button>
            <Button variant="primary" size="lg" className="min-w-24" onClick={() => pick("pass")}>Pass</Button>
            <Button size="lg" onClick={() => pick("auto", "Coach this snap")}>Coach this snap</Button>
            <span className="flex-1" />
            <Button variant="ghost" onClick={finish}>Let the coach finish</Button>
          </div>
          {lastSend && (
            <p className="text-xs mt-3">Last call: {lastSend}</p>
          )}
          <p className="text-xs text-[var(--color-muted)] mt-3 tnum">{snapMix(view.calls)}</p>
          <Help label="What each call does" className="mt-1">
          <ul className="space-y-1.5">
            {SNAP_INTENT_CHOICES.map((choice) => (
              <li key={choice.id}>
                <span className="text-[var(--color-text)]">{choice.label}.</span> {choice.rule}
              </li>
            ))}
          </ul>
          <p>
            Run forces a run. Pass forces a pass. Coach this snap is the staff mix for the down, the distance, the score, and the clock.
            {sheetBits.length > 0 ? ` This week's sheet is ${sheetBits.join(" and ")}, and the coach's snaps follow it.` : ""}
            {" "}Let the coach finish uses that mix for the snaps that are left.
            Formations stay with the engine. A kneel, once the lead and the clock have ended the game, is taken before this desk.
          </p>
          </Help>
        </Card>
      )}

      {view && view.done && resultLine && (
        <Card title={committed ? "Week played" : "Game called"}>
          <p className="text-sm font-medium mb-3">{resultLine}</p>
          {(() => {
            const a = boxAttempts(view.result.box, state.userTeamId);
            return (
              <p className="text-sm mb-3">
                Your box: {a.passAtt} pass attempts · {a.rushAtt} rush attempts
              </p>
            );
          })()}
          {!committed ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={playWeek}>Play Week with these calls</Button>
              <Link href="/week"><Button size="sm">Back to the desk</Button></Link>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Link href={`/game/${liveGame?.id ?? ""}`}><Button variant="primary">Box score</Button></Link>
              <Link href="/week"><Button size="sm">This Week</Button></Link>
            </div>
          )}
        </Card>
      )}

      {view && headline && view.done && (
        <Card title="Last snap">
          <p className="text-sm">{formatVisiblePlay(headline, nameOf, playSides)}</p>
          <div className="mt-1.5">
            <PlayArt event={headline.event} leftTeamId={state.userTeamId} />
          </div>
        </Card>
      )}

      </div>

      {hasLog && (
      <div className="space-y-4 min-w-0">
      {view && view.drives.length > 0 && (
        <Card title="Drive Log" subtitle={`${view.drives.length} possessions`} padded={false}>
          <div className="divide-y divide-[var(--color-line-soft)] max-h-56 overflow-y-auto">
            {view.drives.map((d) => {
              const t = state.teams[d.offenseId];
              const bar = driveBar(d);
              return (
                <div key={d.n} className="px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <TeamMark team={t} size={18} />
                    <span>{t.abbr}</span>
                    <span className="text-xs text-[var(--color-muted)] tnum">
                      {quarterLabel(d.q)} · {spotLabel(d.startYl)}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      <span className="text-xs tnum text-[var(--color-muted)]">
                        {d.plays} · {d.yards > 0 ? "+" : ""}{d.yards}
                      </span>
                      <Pill tone={driveResultTone(d.result)}>{driveResultLabel(d.result)}</Pill>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[var(--color-surface-3)] relative overflow-hidden">
                    <div
                      className="absolute inset-y-0 rounded-full opacity-80"
                      style={{ left: `${bar.left}%`, width: `${bar.width}%`, background: t.primary }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {view && shownPlays.length > 0 && (
        <Card title="Play by Play" subtitle={`${shownPlays.length} snaps`} padded={false}>
          <div className="divide-y divide-[var(--color-line-soft)] max-h-80 lg:max-h-[30rem] overflow-y-auto">
            {shownPlays.map((row, i) => (
              <div
                key={i}
                className={`px-3 py-1.5 text-sm flex gap-3 ${
                  headline && row.event === headline.event ? "bg-[var(--color-accent-dim)]/40" : ""
                }`}
              >
                <span className="text-xs text-[var(--color-faint)] tnum whitespace-nowrap w-16">
                  {quarterLabel(row.event.q)} {clockLabel(row.event.clock)}
                </span>
                <span className="text-xs text-[var(--color-muted)] tnum whitespace-nowrap w-14">
                  {downDistance(row.event)}
                </span>
                <span className="min-w-0 truncate">{formatVisiblePlay(row, nameOf, playSides)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      </div>
      )}
      </div>
    </div>
  );
}

function snapMix(calls: SnapCall[]): string {
  let run = 0, pass = 0, coach = 0;
  for (const c of calls) {
    if (c === "run") run++;
    else if (c === "pass") pass++;
    else coach++;
  }
  const n = calls.length;
  return `${n} snap${n === 1 ? "" : "s"} · ${run} run · ${pass} pass · ${coach} coach`;
}
