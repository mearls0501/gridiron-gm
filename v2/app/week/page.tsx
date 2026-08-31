"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useGame } from "@/lib/store/game";
import { Button, Card, Empty, Pill, PosBadge, cx } from "@/components/ui";
import { PHASE_LABEL } from "@/components/Shell";
import { buildBriefing } from "@/lib/core/season/briefing";
import { OFFSEASON_STEPS } from "@/lib/core/offseason";

/**
 * The weekly briefing: what just happened, what needs your decision, and
 * what's coming. This is the screen that turns a week of simulation into a
 * week of gameplay — read top to bottom, act on the red items, then play.
 */
export default function WeekPage() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);

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
            <div className="pt-2">
              <Link href="/depth-chart"><Button size="sm">Set the Depth Chart</Button></Link>
            </div>
          </div>
        </Card>
      )}

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
