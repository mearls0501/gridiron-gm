"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame } from "@/lib/store/game";
import { Button, Card, Empty, Pill, TeamMark } from "@/components/ui";
import { isOnBye, userNextGame } from "@/lib/core/season/engine";
import { boxAttempts, setCallSheet } from "@/lib/core/callSheet";
import { createLiveGame, type LiveView } from "@/lib/core/liveGame";
import { SnapCall } from "@/lib/core/types";
import { playerMap } from "@/lib/core/select";
import {
  clockLabel, downDistance, driveBar, driveResultLabel, driveResultTone,
  formatPlay, quarterLabel, spotLabel,
} from "@/lib/view/playByPlay";

/**
 * Play-the-Game: user-club offensive snaps only.
 *
 * CPU games stay auto. Bulk-sim never waits here. The snap list is written
 * onto the call sheet; Play Week / advance replays it through simulateGame.
 */
export default function PlayPage() {
  const state = useGame((s) => s.state);
  const apply = useGame((s) => s.apply);
  const advance = useGame((s) => s.advance);

  const [view, setView] = useState<LiveView | null>(null);
  const [session, setSession] = useState<ReturnType<typeof createLiveGame> | null>(null);
  const [committed, setCommitted] = useState(false);

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
    const live = createLiveGame(s, g.id);
    setSession(live);
    setView(live.peek());
    setCommitted(false);
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

  const pick = (c: SnapCall) => {
    if (!session) return;
    setView(session.call(c));
  };

  const finish = () => {
    if (!session) return;
    setView(session.finishAuto());
  };

  const playWeek = () => {
    if (!session || !view?.done) return;
    apply((s) => {
      setCallSheet(s, { snaps: view.calls });
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
          subtitle={`${view.info.down} & ${view.info.toGo} · ball on the ${view.info.yardLine}`}
        >
          <p className="text-sm mb-3 tnum">
            {us.abbr} {userIsHome ? view.info.homeScore : view.info.awayScore}
            {" — "}
            {opp.abbr} {userIsHome ? view.info.awayScore : view.info.homeScore}
          </p>
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
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => pick("run")}>Run</Button>
            <Button variant="primary" onClick={() => pick("pass")}>Pass</Button>
            <Button onClick={() => pick("auto")}>Coach this snap</Button>
            <Button variant="ghost" onClick={finish}>Let the coach finish</Button>
          </div>
          <p className="text-xs text-[var(--color-muted)] mt-3">
            {view.calls.length} snap{view.calls.length === 1 ? "" : "s"} called. Formations are the engine&apos;s — kneel is already in the play loop.
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
