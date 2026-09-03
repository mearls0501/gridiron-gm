"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useGame } from "@/lib/store/game";
import { Button, Card, Empty, Pill, PosBadge, cx } from "@/components/ui";
import { PHASE_LABEL } from "@/components/Shell";
import { buildBriefing } from "@/lib/core/season/briefing";
import { OFFSEASON_STEPS } from "@/lib/core/offseason";
import { isActiveRoster, teamRoster } from "@/lib/core/select";
import { playerName } from "@/lib/core/ratings";
import { POSITIONS } from "@/lib/core/types";
import {
  activateFromInactive, canSit, gamedayInactiveView, isSat, sitPlayer,
} from "@/lib/core/inactives";
import { isOnBye } from "@/lib/core/season/engine";
import {
  AGGRESSION_AGGRESSIVE, AGGRESSION_CONSERVATIVE, PASS_LEAN_PASS, PASS_LEAN_RUN,
  callSheetView, setCallSheet,
} from "@/lib/core/callSheet";

/**
 * The weekly briefing: what just happened, what needs your decision, and
 * what's coming. This is the screen that turns a week of simulation into a
 * week of gameplay — read top to bottom, act on the red items, then play.
 */
export default function WeekPage() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const apply = useGame((s) => s.apply);
  const advance = useGame((s) => s.advance);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const b = useMemo(() => (state ? buildBriefing(state) : null), [state, rev]);
  if (!state || !b) return null;

  const isOffseason = state.phase.startsWith("offseason");
  const step = isOffseason ? OFFSEASON_STEPS[state.phase] : null;

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-lg font-semibold">This Week</h1>
        <p className="text-xs text-[var(--color-muted)]">
          {state.season} {PHASE_LABEL[state.phase]}
          {state.phase === "regular" && ` · Week ${state.week}`}
        </p>
      </div>

      {/* ---- Needs your decision ------------------------------------------ */}
      <Card
        title="Needs Your Decision"
        subtitle={b.actionItems.length === 0 ? undefined : "Handle these before you play the week."}
        padded={false}
      >
        {b.actionItems.length === 0 ? (
          <Empty title="Nothing needs action" hint="The desk is clear — play the week when you're ready." />
        ) : (
          <div className="divide-y divide-[var(--color-line-soft)]">
            {b.actionItems.map((a, i) => (
              <Link key={i} href={a.href} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-surface-2)] transition-colors">
                <span
                  className={cx(
                    "w-2 h-2 rounded-full shrink-0",
                    a.urgent ? "bg-[var(--color-bad)]" : "bg-[var(--color-warn)]"
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{a.label}</span>
                  <span className="block text-xs text-[var(--color-muted)]">{a.detail}</span>
                </span>
                <span className="text-xs text-[var(--color-faint)] shrink-0">→</span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* ---- Offseason: the current stage is the story --------------------- */}
      {isOffseason && step && (
        <Card title={step.title} subtitle={step.description}>
          <Link href="/"><Button variant="primary">Go to the Hub</Button></Link>
        </Card>
      )}

      {/* ---- The week that was --------------------------------------------- */}
      {b.yourGame && (
        <Card
          title={b.yourGame.won ? "The Week That Was — a win" : "The Week That Was"}
          subtitle={b.yourGame.final}
          actions={
            <Link href={`/game/${b.yourGame.gameId}`} className="text-xs text-[var(--color-accent)]">
              Full box score →
            </Link>
          }
        >
          {b.yourGame.turningPoint && (
            <p className="text-sm mb-3">{b.yourGame.turningPoint}</p>
          )}
          {b.yourGame.stars.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-1.5">Played well</div>
              <div className="space-y-1">
                {b.yourGame.stars.map((s) => (
                  <div key={s.playerId} className="flex items-center gap-2 text-sm">
                    <PosBadge pos={s.pos} />
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-[var(--color-faint)]">{s.teamAbbr}</span>
                    <span className="text-xs text-[var(--color-muted)] tnum ml-auto">{s.line}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {b.yourGame.duds.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-1.5">A week to forget</div>
              <div className="space-y-1">
                {b.yourGame.duds.map((s) => (
                  <div key={s.playerId} className="flex items-center gap-2 text-sm">
                    <PosBadge pos={s.pos} />
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-[var(--color-muted)] tnum ml-auto">{s.line}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ---- Around the league -------------------------------------------- */}
      {b.headlines.length > 0 && (
        <Card title="Around the League" padded={false}>
          <div className="divide-y divide-[var(--color-line-soft)]">
            {b.headlines.map((h, i) => (
              <p key={i} className="px-4 py-2.5 text-sm">{h}</p>
            ))}
          </div>
        </Card>
      )}

      {/* ---- The week ahead ------------------------------------------------ */}
      {state.phase === "preseason" && (
        <Card title="The Season Ahead" subtitle="The schedule drops when the season starts.">
          <p className="text-sm text-[var(--color-muted)] mb-3">
            Camp is where seasons are won: settle the roster, order the depth
            chart, and use the film window before it closes.
          </p>
          <div className="flex gap-2">
            <Link href="/roster"><Button size="sm">Roster</Button></Link>
            <Link href="/depth-chart"><Button size="sm">Depth Chart</Button></Link>
            <Link href="/draft"><Button size="sm">Scout the Class</Button></Link>
          </div>
        </Card>
      )}
      {b.onBye && (
        <Card title="The Week Ahead" subtitle="Bye week — nobody gets hurt, everybody heals.">
          <p className="text-sm text-[var(--color-muted)]">
            A quiet week is a scouting week. The rest of the league plays on.
          </p>
        </Card>
      )}
      {b.opponent && !b.onBye && (
        <Card
          title={`Next Up: ${b.opponent.name}`}
          subtitle={`${b.opponent.record} · ${b.opponent.standing} · ${b.opponent.form} in their last three · ${b.opponent.home ? "your building" : "on the road"}${b.opponent.weather ? ` · ${b.opponent.weather}` : ""}`}
        >
          <div className="space-y-2">
            {b.opponent.edges.map((e, i) => (
              <p key={i} className="text-sm">{e}</p>
            ))}
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-1">Their best</div>
                {b.opponent.stars.map((s) => (
                  <div key={s.name} className="text-sm">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-[var(--color-muted)]"> {s.pos} · {s.ovr} OVR</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-1">They're missing</div>
                {b.opponent.out.length === 0 ? (
                  <div className="text-sm text-[var(--color-muted)]">Fully healthy</div>
                ) : (
                  b.opponent.out.map((s) => (
                    <div key={s.name} className="text-sm">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-[var(--color-muted)]"> {s.pos} · out {s.weeks} wk{s.weeks > 1 ? "s" : ""}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="pt-2 flex flex-wrap gap-2">
              <Link href="/depth-chart"><Button size="sm">Set the Depth Chart</Button></Link>
              <Link href="/play"><Button size="sm">Play the Game</Button></Link>
            </div>
          </div>
        </Card>
      )}

      {/* ---- This week's call sheet --------------------------------------- */}
      {state && (state.phase === "regular" || state.phase === "playoffs") &&
        !isOnBye(state, state.userTeamId) && (() => {
          const sheet = callSheetView(state.teams[state.userTeamId]);
          const lean = sheet.passLean;
          const agg = sheet.aggression;
          return (
            <Card
              title="This Week's Call Sheet"
              subtitle="Honored by Play Week and Auto. CPU games stay auto. Bulk-sim does not wait for snap clicks."
            >
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-1.5">
                    Run / pass lean
                    <span className="ml-2 normal-case tracking-normal">
                      coach {sheet.coachPassBias >= 0 ? "+" : ""}{sheet.coachPassBias.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={lean === PASS_LEAN_RUN ? "primary" : "default"}
                      onClick={() => apply((s) => {
                        setCallSheet(s, { passLean: PASS_LEAN_RUN });
                        return "Call sheet: run-heavy";
                      })}
                    >
                      Run
                    </Button>
                    <Button
                      size="sm"
                      variant={lean == null ? "primary" : "default"}
                      onClick={() => apply((s) => {
                        setCallSheet(s, { passLean: undefined });
                        return "Call sheet: coach mix";
                      })}
                    >
                      Coach
                    </Button>
                    <Button
                      size="sm"
                      variant={lean === PASS_LEAN_PASS ? "primary" : "default"}
                      onClick={() => apply((s) => {
                        setCallSheet(s, { passLean: PASS_LEAN_PASS });
                        return "Call sheet: pass-heavy";
                      })}
                    >
                      Pass
                    </Button>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-1.5">
                    4th-down aggression
                    <span className="ml-2 normal-case tracking-normal">coach {sheet.coachAggression}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={agg === AGGRESSION_CONSERVATIVE ? "primary" : "default"}
                      onClick={() => apply((s) => {
                        setCallSheet(s, { aggression: AGGRESSION_CONSERVATIVE });
                        return "Call sheet: conservative 4th downs";
                      })}
                    >
                      Conservative
                    </Button>
                    <Button
                      size="sm"
                      variant={agg == null ? "primary" : "default"}
                      onClick={() => apply((s) => {
                        setCallSheet(s, { aggression: undefined });
                        return "Call sheet: coach 4th downs";
                      })}
                    >
                      Coach
                    </Button>
                    <Button
                      size="sm"
                      variant={agg === AGGRESSION_AGGRESSIVE ? "primary" : "default"}
                      onClick={() => apply((s) => {
                        setCallSheet(s, { aggression: AGGRESSION_AGGRESSIVE });
                        return "Call sheet: aggressive 4th downs";
                      })}
                    >
                      Aggressive
                    </Button>
                  </div>
                </div>
                <div className="pt-1 flex flex-wrap gap-2">
                  <Link href="/play"><Button size="sm" variant="primary">Play the Game</Button></Link>
                  <Button size="sm" onClick={() => advance()}>Play Week</Button>
                </div>
              </div>
            </Card>
          );
        })()}

      {/* ---- Gameday inactives -------------------------------------------- */}
      {state && (state.phase === "regular" || state.phase === "playoffs") &&
        !isOnBye(state, state.userTeamId) && (() => {
          const gameday = gamedayInactiveView(state, state.userTeamId);
          const team = state.teams[state.userTeamId];
          const actives = teamRoster(state, state.userTeamId)
            .filter(isActiveRoster)
            .sort((a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || b.ovr - a.ovr);
          return (
            <Card
              title="Gameday Inactives"
              subtitle={`${gameday.cap} actives this week${gameday.eightOl ? ` · 8 OL (${gameday.ol})` : ` · ${gameday.ol} OL`} · sit at least ${gameday.need}. Injured on the 53 already count.`}
              padded={false}
            >
              <div className="px-4 py-2.5 text-xs text-[var(--color-muted)] border-b border-[var(--color-line-soft)]">
                {gameday.injured} injured · {gameday.sat} sat · {gameday.credited} of {gameday.need} required
                {gameday.stillNeed > 0
                  ? ` — declare ${gameday.stillNeed} more, or Play Week will scratch extras.`
                  : " — cap met. Sitting more healthy scratches is allowed."}
              </div>
              <div className="divide-y divide-[var(--color-line-soft)]">
                {actives.map((p) => {
                  const sat = isSat(team, p.id);
                  return (
                    <div key={p.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                      <PosBadge pos={p.pos} />
                      <span className="font-medium min-w-0 truncate">{playerName(p)}</span>
                      <span className="text-xs text-[var(--color-faint)] tnum">{p.ovr}</span>
                      {p.injuryWeeks > 0 && <Pill tone="warn">out</Pill>}
                      {sat && <Pill tone="accent">inactive</Pill>}
                      <span className="ml-auto">
                        {sat ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => apply((s) => {
                              const res = activateFromInactive(s, p.id);
                              return res.ok ? `Activated ${playerName(p)}` : (res.reason ?? "Could not activate");
                            })}
                          >
                            Activate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!canSit(state, p) && p.injuryWeeks <= 0}
                            onClick={() => apply((s) => {
                              const res = sitPlayer(s, p.id);
                              return res.ok ? `Sat ${playerName(p)}` : (res.reason ?? "Could not sit");
                            })}
                          >
                            Sit
                          </Button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })()}

      {/* ---- Your injury report -------------------------------------------- */}
      {b.injuries.length > 0 && (
        <Card title="Injury Report" subtitle="Your locker room." padded={false}>
          <div className="divide-y divide-[var(--color-line-soft)]">
            {b.injuries.map((inj) => (
              <div key={inj.name} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                <PosBadge pos={inj.pos} />
                <span className="font-medium">{inj.name}</span>
                {inj.starter && <Pill tone="warn">starter</Pill>}
                <span className="text-xs text-[var(--color-muted)] ml-auto">
                  {inj.desc} · {inj.weeks === 1 ? "back next week" : `${inj.weeks} weeks`}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ---- Worth knowing -------------------------------------------------- */}
      {b.reviewItems.length > 0 && (
        <Card title="Worth Knowing" padded={false}>
          <div className="divide-y divide-[var(--color-line-soft)]">
            {b.reviewItems.map((r, i) => (
              <p key={i} className="px-4 py-2.5 text-sm text-[var(--color-muted)]">{r}</p>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
