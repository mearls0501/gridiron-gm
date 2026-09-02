"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame } from "@/lib/store/game";
import { Button, Card, Empty } from "@/components/ui";
import { isOnBye, userNextGame } from "@/lib/core/season/engine";
import { boxAttempts, setCallSheet } from "@/lib/core/callSheet";
import { createLiveGame, type LiveView } from "@/lib/core/liveGame";
import { SnapCall } from "@/lib/core/types";

function clockLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function quarterLabel(q: number): string {
  if (q <= 4) return `Q${q}`;
  return q === 5 ? "OT" : `OT${q - 4}`;
}

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
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => pick("run")}>Run</Button>
            <Button variant="primary" onClick={() => pick("pass")}>Pass</Button>
            <Button onClick={() => pick("auto")}>Coach this snap</Button>
            <Button variant="ghost" onClick={finish}>Let the coach finish</Button>
          </div>
          <p className="text-xs text-[var(--color-muted)] mt-3">
            {view.calls.length} snap{view.calls.length === 1 ? "" : "s"} called. Formations are the engine's — kneel is already in the play loop.
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
    </div>
  );
}
