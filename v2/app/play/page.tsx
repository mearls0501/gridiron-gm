"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame } from "@/lib/store/game";
import { Button, Card, Empty, Pill, TeamMark } from "@/components/ui";
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
import {
  clockLabel, downDistance, driveBar, driveResultLabel, driveResultTone,
  formatPlay, quarterLabel, spotLabel,
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
  const [lastSend, setLastSend] = useState<string | null>(null);

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
    if (s.phase !== "regular" && s.phase !== "playoffs") return;
    if (isOnBye(s, s.userTeamId)) return;
    const g = userNextGame(s);
    if (!g || g.played) return;
    const live = resumeLiveGame(s, g.id);
    setSession(live);
    setView(live.peek());
    setCommitted(false);
    setLastSend(null);
  }, [state?.id, state?.season, state?.week, state?.phase]);

  if (!state) return null;

  if (onBye) {
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

  const liveGame = game ?? (view?.done ? state.games.find((g) => g.played && (g.homeId === state.userTeamId || g.awayId === state.userTeamId) && g.week === state.week - 1) : undefined);
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
  const sheet = callSheetView(us);
  const sheetBits: string[] = [];
  if (sheet.passLean === PASS_LEAN_RUN) sheetBits.push("run-heavy");
  else if (sheet.passLean === PASS_LEAN_PASS) sheetBits.push("pass-heavy");
  if (sheet.aggression === AGGRESSION_CONSERVATIVE) sheetBits.push("conservative on fourth down");
  else if (sheet.aggression === AGGRESSION_AGGRESSIVE) sheetBits.push("aggressive on fourth down");

  const persistSnaps = (calls: SnapCall[]) => {
    const sealed = session?.seal() ?? null;
    apply((s) => {
      setCallSheet(s, { snaps: calls });
      if (sealed) writeSealedLive(s, sealed);
    });
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
      setCallSheet(s, { snaps: view.calls });
      if (sealed && !s.sealedLive) writeSealedLive(s, sealed);
      return "Play-the-Game calls set";
    });
    advance();
    setCommitted(true);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold">Play the Game</h1>
        <p className="text-xs text-[var(--color-muted)]">
          {us.city} {us.name} vs {opp.city} {opp.name} · your snaps only
        </p>
      </div>

      {view && !view.done && (
        <Card
          title={`${quarterLabel(view.info.quarter)} · ${clockLabel(view.info.clock)}`}
          subtitle={`${view.info.down} & ${view.info.toGo} · ${spotLabel(view.info.yardLine)}`}
        >
          <p className="text-sm mb-3 tnum">
            {us.abbr} {userIsHome ? view.info.homeScore : view.info.awayScore}
            {" — "}
            {opp.abbr} {userIsHome ? view.info.awayScore : view.info.homeScore}
            <span className="text-[var(--color-muted)]">
              {" · "}
              {(() => {
                const margin = offenseMargin(view.info);
                if (margin === 0) return "Tied";
                return margin > 0 ? `Up ${margin}` : `Down ${-margin}`;
              })()}
            </span>
          </p>
          {view.info.down === 4 && (
            <p className="text-xs text-[var(--color-muted)] mb-3">
              The staff already sent the offense out on fourth down. This desk calls the snap.
            </p>
          )}
          {view.lastSnap && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-line-soft)]">
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-0.5">
                Last snap
              </div>
              <p className="text-sm">
                {quarterLabel(view.lastSnap.q)} {clockLabel(view.lastSnap.clock)}
                {" · "}
                {downDistance(view.lastSnap)}
                {" · "}
                {formatPlay(view.lastSnap, nameOf)}
              </p>
            </div>
          )}
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-1.5">
            The call
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
                    <span className="text-[11px] font-semibold text-[var(--color-accent)] shrink-0">
                      {snapSendWord(resolved.call)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{resolved.because}</p>
                </button>
              );
            })}
          </div>
          <ul className="mt-3 space-y-1.5 text-[11px] text-[var(--color-muted)]">
            {SNAP_INTENT_CHOICES.map((choice) => (
              <li key={choice.id}>
                <span className="text-[var(--color-text)]">{choice.label}.</span> {choice.rule}
              </li>
            ))}
          </ul>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mt-4 mb-1.5">
            This snap
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => pick("run")}>Run</Button>
            <Button variant="primary" onClick={() => pick("pass")}>Pass</Button>
            <Button onClick={() => pick("auto", "Coach this snap")}>Coach this snap</Button>
            <Button variant="ghost" onClick={finish}>Let the coach finish</Button>
          </div>
          {lastSend && (
            <p className="text-xs mt-3">Last call: {lastSend}</p>
          )}
          <p className="text-xs text-[var(--color-muted)] mt-2">
            {snapMix(view.calls)}.
            {" "}Run forces a run. Pass forces a pass. Coach this snap is the staff mix for the down, the distance, the score, and the clock.
            {sheetBits.length > 0 ? ` This week's sheet is ${sheetBits.join(" and ")}, and the coach's snaps follow it.` : ""}
            {" "}Let the coach finish uses that mix for the snaps that are left.
            Formations stay with the engine. A kneel, once the lead and the clock have ended the game, is taken before this desk.
          </p>
        </Card>
      )}

      {view && view.done && (
        <Card
          title={committed ? "Week played" : "Game called"}
          subtitle={`${view.result.homeScore}–${view.result.awayScore}`}
        >
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

      {view && view.lastSnap && view.done && (
        <Card title="Last snap">
          <p className="text-sm">{formatPlay(view.lastSnap, nameOf)}</p>
        </Card>
      )}

      {view && view.drives.length > 0 && (
        <Card title="Drive Log" subtitle={`${view.drives.length} possessions`} padded={false}>
          <div className="divide-y divide-[var(--color-line-soft)] max-h-72 overflow-y-auto">
            {view.drives.map((d) => {
              const t = state.teams[d.offenseId];
              const bar = driveBar(d);
              return (
                <div key={d.n} className="px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <TeamMark team={t} size={18} />
                    <span>{t.abbr}</span>
                    <span className="text-[11px] text-[var(--color-muted)] tnum">
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

      {view && view.plays.length > 0 && (
        <Card title="Play by Play" subtitle={`${view.plays.length} snaps`} padded={false}>
          <div className="divide-y divide-[var(--color-line-soft)] max-h-80 overflow-y-auto">
            {view.plays.map((e, i) => (
              <div
                key={i}
                className={`px-3 py-1.5 text-sm flex gap-3 ${
                  view.lastSnap && e === view.lastSnap ? "bg-[var(--color-accent-dim)]/40" : ""
                }`}
              >
                <span className="text-[11px] text-[var(--color-faint)] tnum whitespace-nowrap w-16">
                  {quarterLabel(e.q)} {clockLabel(e.clock)}
                </span>
                <span className="text-[11px] text-[var(--color-muted)] tnum whitespace-nowrap w-14">
                  {downDistance(e)}
                </span>
                <span className="min-w-0 truncate">{formatPlay(e, nameOf)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
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
