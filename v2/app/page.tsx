"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "@/lib/store/game";
import { shouldDismissSimMenu } from "@/lib/view/simMenu";
import { PHASE_LABEL } from "@/components/Shell";
import {
  Button, Card, Cell, Empty, OvrBadge, Pill, PlayerLink, PosBadge, Row, Stat, Table, TeamMark, cx,
} from "@/components/ui";
import {
  capHit, computeRecords, formatMoney, irCount, recordString, rosterCount, rosterIssues, teamCap,
} from "@/lib/core/select";
import { userNextGame, isOnBye, injuredPlayers, weekGames } from "@/lib/core/season/engine";
import { divisionStandings, seasonHasResults } from "@/lib/core/season/standings";
import { currentLine } from "@/lib/core/season/stats";
import {
  applyFifthYearOption, applyFranchiseTag, applyTagExtension, clubFranchiseTaggedPlayer,
  declineFifthYearOption, expiringPlayers, fifthYearOptionPlayers, fifthYearOptionSalary,
  franchiseTagSalary, OFFSEASON_STEPS, reconcileRoster,
  skipTagExtension, tagExtensionPlayers, tagExtensionTerms,
} from "@/lib/core/offseason";
import { Rng } from "@/lib/core/rng";
import { describeAsset } from "@/lib/core/trades";
import { REGULAR_SEASON_WEEKS, ROSTER_LIMIT, TRADE_DEADLINE_WEEK, isHarsh, weatherLabel } from "@/lib/core/types";
import { SeasonReviewPanels, SeasonReviewSummary } from "@/components/SeasonReview";
import { presentSeasonReview } from "@/lib/view/seasonReview";
import { hubCampCutdownCopy, rosterCapView } from "@/lib/view/rosterCap";
import { PRIVATE_VISIT_CAP, calendarView } from "@/lib/core/scouting";

/** One row in the Sim dropdown. */
function SimOption({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer"
    >
      <span className="block text-xs font-medium">{label}</span>
      <span className="block text-[11px] text-[var(--color-muted)] mt-0.5">{hint}</span>
    </button>
  );
}

/**
 * The hub.
 *
 * One rule drives this screen: whatever the franchise needs next, the button
 * for it is here. The previous build hid week advancement on an admin page and
 * told users to click a button that did not exist — this is the fix for that.
 */
export default function Hub() {
  const state = useGame((s) => s.state);
  const advance = useGame((s) => s.advance);
  const apply = useGame((s) => s.apply);
  const simTo = useGame((s) => s.simTo);
  const busy = useGame((s) => s.busy);
  const [confirming, setConfirming] = useState(false);
  const [simMenu, setSimMenu] = useState(false);
  const [simming, setSimming] = useState(false);
  const simMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!simMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      const insideControl = !!(
        simMenuRef.current &&
        e.target instanceof Node &&
        simMenuRef.current.contains(e.target)
      );
      if (shouldDismissSimMenu({ type: e.type, insideControl })) setSimMenu(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldDismissSimMenu({ type: e.type, key: e.key, insideControl: true })) {
        setSimMenu(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [simMenu]);

  // The sim runs synchronously in one store apply; the timeout lets the
  // "Simming…" label paint before the main thread goes heads-down.
  const runSim = (target: Parameters<typeof simTo>[0]) => {
    setSimMenu(false);
    setSimming(true);
    setTimeout(() => {
      simTo(target);
      setSimming(false);
    }, 30);
  };

  const derived = useMemo(() => {
    if (!state) return null;
    const team = state.teams[state.userTeamId];
    const recs = computeRecords(state);
    const rec = recs.get(team.id)!;
    const cap = teamCap(state, team.id);
    const next = userNextGame(state);
    const bye = isOnBye(state, team.id);
    const injured = injuredPlayers(state, team.id);
    const onIr = irCount(state, team.id);
    const issues = rosterIssues(state, team.id);
    const clip = rosterCapView(state, team.id);
    const div = divisionStandings(state, team.division);
    const divRank = seasonHasResults(state)
      ? div.findIndex((r) => r.teamId === team.id) + 1
      : 0;
    const roster = state.players.filter(
      (p) => p.teamId === team.id && !p.retired && !p.prospect
    );
    const topPerformers = roster
      .map((p) => ({ p, l: currentLine(p, state.season) }))
      .filter((x) => x.l.games > 0)
      .map((x) => ({
        ...x,
        score:
          x.l.passYds * 0.04 + x.l.passTd * 4 - x.l.passInt * 2 +
          x.l.rushYds * 0.06 + x.l.rushTd * 4 +
          x.l.recYds * 0.055 + x.l.recTd * 4 +
          x.l.sacks * 7 + x.l.ints * 8 + x.l.tackles * 0.4,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const lastResults = weekGames(state, Math.max(1, state.week - 1)).filter((g) => g.played);
    return { team, rec, cap, next, bye, injured, onIr, issues, clip, div, divRank, roster, topPerformers, lastResults };
  }, [state]);

  if (!state || !derived) return null;
  const { team, rec, cap, next, bye, injured, onIr, issues, clip, divRank, roster, topPerformers } = derived;
  const cal = calendarView(state);
  const offers = state.tradeOffers ?? [];

  const isOffseason = state.phase.startsWith("offseason");
  const step = OFFSEASON_STEPS[state.phase];
  const isRecap = state.phase === "offseason-recap";
  const recap = isRecap || state.phase.startsWith("offseason")
    ? presentSeasonReview(state)
    : null;
  const userSeasonGames = recap?.userGames ?? [];

  const primaryLabel = (() => {
    if (state.phase === "preseason") return "Start the Season";
    if (state.phase === "regular") return bye ? `Advance Week ${state.week} (Bye)` : `Play Week ${state.week}`;
    if (state.phase === "playoffs") {
      return state.playoffs?.complete ? "Continue to the Offseason" : `Sim ${state.playoffs?.round ?? ""} Round`;
    }
    return step?.action ?? "Continue";
  })();

  const blocking = issues.filter((i) => i.kind !== "underLimit" || state.phase === "preseason");
  const canAdvance = !(state.phase === "preseason" && blocking.length > 0);

  const doAdvance = () => {
    setConfirming(false);
    advance();
  };

  return (
    <div className="space-y-4">
      {/* ---- Action bar ---------------------------------------------------- */}
      <Card padded={false} className="overflow-visible">
        <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <TeamMark team={team} size={44} />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold truncate">
                {team.city} {team.name}
              </h1>
              <p className="text-xs text-[var(--color-muted)] tnum">
                {state.season} {PHASE_LABEL[state.phase]}
                {state.phase === "regular" && ` · Week ${state.week} of ${REGULAR_SEASON_WEEKS}`}
                {" · "}
                {recordString(rec)} · {divRank > 0 ? `${divRank}${["st", "nd", "rd", "th"][Math.min(divRank - 1, 3)]} in ${team.division}` : team.division}
                {" · "}
                {cal.label} · {cal.visitsRemaining}/{PRIVATE_VISIT_CAP} visits
              </p>
            </div>
          </div>

          <div className="sm:ml-auto flex items-center gap-2">
            {!canAdvance && (
              <span className="text-xs text-[var(--color-warn)] max-w-[220px]">
                Fix your roster before the season starts.
              </span>
            )}
            {confirming ? (
              <>
                <Button variant="primary" size="lg" onClick={doAdvance}>Confirm</Button>
                <Button variant="ghost" size="lg" onClick={() => setConfirming(false)}>Cancel</Button>
              </>
            ) : (
              <>
                {(state.phase === "regular" || state.phase === "playoffs") && (
                  <div className="relative" ref={simMenuRef}>
                    <Button
                      size="lg"
                      disabled={busy || simming}
                      onClick={() => setSimMenu(!simMenu)}
                    >
                      {simming ? "Simming…" : "Sim ▾"}
                    </Button>
                    {simMenu && (
                      <div className="absolute right-0 top-full mt-1 z-30 w-60 bg-[var(--color-surface-3)] border border-[var(--color-line)] rounded-lg shadow-xl overflow-hidden">
                        {state.phase === "regular" && state.week < TRADE_DEADLINE_WEEK && (
                          <SimOption
                            label={`To the Trade Deadline (Wk ${TRADE_DEADLINE_WEEK})`}
                            hint="Stops while you can still make moves"
                            onClick={() => runSim("deadline")}
                          />
                        )}
                        {state.phase === "regular" && (
                          <SimOption
                            label="To End of Regular Season"
                            hint="Lands on the seeded playoff field"
                            onClick={() => runSim("seasonEnd")}
                          />
                        )}
                        <SimOption
                          label="Through the Playoffs"
                          hint="Crowns a champion, stops at the offseason"
                          onClick={() => runSim("champion")}
                        />
                      </div>
                    )}
                  </div>
                )}
                <Button
                  variant="primary"
                  size="lg"
                  disabled={busy || simming || !canAdvance}
                  onClick={() => (isOffseason || state.phase === "preseason" ? setConfirming(true) : doAdvance())}
                >
                  {primaryLabel}
                </Button>
              </>
            )}
          </div>
        </div>

        {isOffseason && step && (
          <div className="px-4 pb-4 -mt-1">
            <div className="bg-[var(--color-surface-2)] border border-[var(--color-line-soft)] rounded-lg px-3 py-2.5">
              <div className="text-xs font-medium">{step.title}</div>
              <div className="text-xs text-[var(--color-muted)] mt-0.5">
                {state.phase === "offseason-final" && issues.some((i) => i.kind === "underLimit")
                  ? "Roster is short of 53. Sign players before the season opens — cutdown is for clubs over the limit."
                  : hubCampCutdownCopy(clip) ?? step.description}
              </div>
              {isRecap && recap && (
                <SeasonReviewSummary state={state} view={recap} />
              )}
              <div className="flex gap-2 mt-2">
                {state.phase === "offseason-tag" && (
                  <span className="text-xs text-[var(--color-muted)]">
                    Tag one name below, or Continue to let the window close.
                  </span>
                )}
                {state.phase === "offseason-final" && (
                  <span className="text-xs text-[var(--color-muted)]">
                    Fifth-year option and tagged-player extension are on the desk below, or Continue.
                  </span>
                )}
                {state.phase === "offseason-fa" && (
                  <Link href="/free-agency"><Button size="sm">Go to Free Agency</Button></Link>
                )}
                {state.phase === "offseason-draft" && (
                  <Link href="/draft"><Button size="sm">Go to the Draft Room</Button></Link>
                )}
                {state.phase === "offseason-final" && (
                  <Link href="/roster"><Button size="sm">Review the Roster</Button></Link>
                )}
                {(state.waivers?.length ?? 0) > 0 && (
                  <Link href="/roster">
                    <Button size="sm" variant="ghost">
                      {state.waivers!.length} on waivers — claim on /roster
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      {state.phase === "offseason-tag" && (() => {
        const taggedPlayer = clubFranchiseTaggedPlayer(state, team.id);
        const names = expiringPlayers(state, team.id)
          .slice()
          .sort((a, b) => b.ovr - a.ovr);
        return (
          <Card
            title="Franchise Tag"
            subtitle="One exclusive tag this year. Tagged player stays on a 1-year tender and is not in that FA wave."
          >
            {taggedPlayer ? (
              <p className="text-sm">
                {taggedPlayer.firstName} {taggedPlayer.lastName} ({taggedPlayer.pos}) is
                tagged — {formatMoney(capHit(taggedPlayer.contract))} this year.
                Continue to open free agency.
              </p>
            ) : names.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">
                Nobody on this club is entering free agency. Continue to open the market.
              </p>
            ) : (
              <Table head={["Player", "Pos", "Age", "Tender", ""]}>
                {names.map((p) => {
                  const tender = franchiseTagSalary(state, p);
                  return (
                    <Row key={p.id}>
                      <Cell align="left"><PlayerLink p={p} /></Cell>
                      <Cell><PosBadge pos={p.pos} /></Cell>
                      <Cell>{p.age}</Cell>
                      <Cell>{formatMoney(tender)}</Cell>
                      <Cell>
                        <Button
                          size="sm"
                          onClick={() =>
                            apply((s) => {
                              const rng = new Rng(s.rngState);
                              const r = applyFranchiseTag(s, s.userTeamId, p.id, rng);
                              s.rngState = rng.state;
                              return r.ok
                                ? `${p.firstName} ${p.lastName} is franchise-tagged`
                                : r.reason;
                            })
                          }
                        >
                          Tag
                        </Button>
                      </Cell>
                    </Row>
                  );
                })}
              </Table>
            )}
          </Card>
        );
      })()}

      {state.phase === "offseason-final" && (() => {
        const tagged = tagExtensionPlayers(state, team.id)
          .slice()
          .sort((a, b) => b.ovr - a.ovr);
        const extended = (state.tagExtensions ?? []).filter(
          (e) => e.season === state.season && e.teamId === team.id && e.extended
        );
        return (
          <Card
            title="Tag Extension"
            subtitle="July 15 window. Convert the 1-year tender to a multi-year deal, or Skip and he plays the tag year."
          >
            {extended.length > 0 && (
              <p className="text-sm mb-2">
                Extended. He is no longer a tag-year rental.
                {tagged.length === 0 ? " Continue to start the season." : ""}
              </p>
            )}
            {tagged.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">
                {extended.length > 0
                  ? "No other tagged player is waiting on an extension."
                  : "Nobody on this club is on a franchise tag. Continue to camp/cutdown."}
              </p>
            ) : (
              <Table head={["Player", "Pos", "Age", "Deal", ""]}>
                {tagged.map((p) => {
                  const terms = tagExtensionTerms(state, team.id, p);
                  return (
                    <Row key={p.id}>
                      <Cell align="left"><PlayerLink p={p} /></Cell>
                      <Cell><PosBadge pos={p.pos} /></Cell>
                      <Cell>{p.age}</Cell>
                      <Cell>{terms.years}yr / {formatMoney(terms.apy)}</Cell>
                      <Cell>
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            onClick={() =>
                              apply((s) => {
                                const rng = new Rng(s.rngState);
                                const r = applyTagExtension(s, s.userTeamId, p.id, rng);
                                s.rngState = rng.state;
                                return r.ok
                                  ? `${p.firstName} ${p.lastName} extended — ${terms.years}yr`
                                  : r.reason;
                              })
                            }
                          >
                            Extend
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              apply((s) => {
                                const r = skipTagExtension(s, s.userTeamId, p.id);
                                return r.ok
                                  ? `${p.firstName} ${p.lastName} plays the tag year`
                                  : r.reason;
                              })
                            }
                          >
                            Skip
                          </Button>
                        </div>
                      </Cell>
                    </Row>
                  );
                })}
              </Table>
            )}
          </Card>
        );
      })()}

      {state.phase === "offseason-final" && (() => {
        const names = fifthYearOptionPlayers(state, team.id)
          .slice()
          .sort((a, b) => b.ovr - a.ovr);
        const picked = (state.fifthYearOptions ?? []).filter(
          (o) => o.season === state.season && o.teamId === team.id && o.pickedUp
        );
        return (
          <Card
            title="Fifth-Year Option"
            subtitle="First-rounders entering year 4 of the rookie deal. Pick up a guaranteed 5th year, or Decline and he hits FA after year 4."
          >
            {picked.length > 0 && (
              <p className="text-sm mb-2">
                {picked.length === 1 ? "Option picked up. " : `${picked.length} options picked up. `}
                They stay through year 5.
                {names.length === 0 ? " Continue to start the season." : ""}
              </p>
            )}
            {names.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">
                {picked.length > 0
                  ? "No other first-rounder is eligible."
                  : "No first-rounder is eligible for a fifth-year option. Continue to camp/cutdown."}
              </p>
            ) : (
              <Table head={["Player", "Pos", "Age", "Tender", ""]}>
                {names.map((p) => {
                  const tender = fifthYearOptionSalary(state, p);
                  return (
                    <Row key={p.id}>
                      <Cell align="left"><PlayerLink p={p} /></Cell>
                      <Cell><PosBadge pos={p.pos} /></Cell>
                      <Cell>{p.age}</Cell>
                      <Cell>{formatMoney(tender)}</Cell>
                      <Cell>
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            onClick={() =>
                              apply((s) => {
                                const r = applyFifthYearOption(s, s.userTeamId, p.id);
                                return r.ok
                                  ? `${p.firstName} ${p.lastName} fifth-year option picked up`
                                  : r.reason;
                              })
                            }
                          >
                            Pick up
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              apply((s) => {
                                const r = declineFifthYearOption(s, s.userTeamId, p.id);
                                return r.ok
                                  ? `${p.firstName} ${p.lastName} fifth-year option declined`
                                  : r.reason;
                              })
                            }
                          >
                            Decline
                          </Button>
                        </div>
                      </Cell>
                    </Row>
                  );
                })}
              </Table>
            )}
          </Card>
        );
      })()}

      {/* ---- Alerts -------------------------------------------------------- */}
      {issues.length > 0 && (
        <Card
          title="Needs attention"
          actions={
            <Button
              size="sm"
              onClick={() =>
                apply((s) => {
                  const rng = new Rng(s.rngState);
                  reconcileRoster(s, s.userTeamId, rng);
                  s.rngState = rng.state;
                  return "Roster and cap brought back into compliance";
                })
              }
              title={
                clip.camp
                  ? `Signs, releases and renegotiates until you are at ${ROSTER_LIMIT}–${clip.cap} players and under the cap`
                  : "Signs, releases and renegotiates until you are at 53 players and under the cap"
              }
            >
              Auto-fix
            </Button>
          }
        >
          <div className="space-y-2">
            {issues.map((i, n) => {
              const shortDuringCutdown =
                i.kind === "underLimit" && state.phase === "offseason-final";
              const nNeed = ROSTER_LIMIT - rosterCount(state, team.id);
              return (
              <div key={n} className="flex items-start gap-2.5 text-sm">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-warn)] shrink-0" />
                <div>
                  <div>
                    {shortDuringCutdown
                      ? `Roster short of 53: ${rosterCount(state, team.id)}/${ROSTER_LIMIT}`
                      : i.message}
                  </div>
                  <div className="text-xs text-[var(--color-muted)]">
                    {shortDuringCutdown
                      ? `Sign ${nNeed} more player${nNeed === 1 ? "" : "s"} before the season opens. Cutdown is for clubs over the limit.`
                      : i.detail}
                  </div>
                </div>
                <Link href={i.kind === "overCap" ? "/finances" : "/roster"} className="ml-auto shrink-0">
                  <Button size="sm" variant="ghost">Fix</Button>
                </Link>
              </div>
              );
            })}
          </div>
        </Card>
      )}

      {(state.waivers?.length ?? 0) > 0 && (
        <Card
          title="Waivers"
          subtitle={`${state.waivers!.length} player${state.waivers!.length === 1 ? "" : "s"} on the wire`}
          actions={
            <Link href="/roster">
              <Button size="sm">Claim on /roster</Button>
            </Link>
          }
        >
          <p className="text-sm text-[var(--color-muted)]">
            Cuts pass waivers before a practice-squad stash or free agency. Inverse
            standings — worse record claims first. No cash bid.
          </p>
        </Card>
      )}

      {offers.length > 0 && (
        <Card
          title="Trade offers"
          subtitle={`${offers.length} club${offers.length === 1 ? "" : "s"} waiting on an answer`}
          actions={
            <Link href="/trades">
              <Button size="sm" title="Read the offers in full and accept or turn them down">
                Review offers
              </Button>
            </Link>
          }
        >
          <div className="space-y-2">
            {offers.map((o) => (
              <div key={o.id} className="flex items-start gap-2.5 text-sm">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shrink-0" />
                <div className="min-w-0">
                  <div>
                    {state.teams[o.fromTeamId].abbr} want{" "}
                    {o.get.map((a) => describeAsset(state, a)).join(", ") || "nothing"}
                  </div>
                  <div className="text-xs text-[var(--color-muted)]">
                    Offering {o.give.map((a) => describeAsset(state, a)).join(", ") || "nothing"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {isRecap && recap && (
        <SeasonReviewPanels state={state} view={recap} />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Record" value={recordString(rec)} sub={`${rec.pf} PF · ${rec.pa} PA`} />
        <Stat
          label="Cap Space"
          value={formatMoney(cap.space)}
          sub={cap.dead > 0 ? `${formatMoney(cap.dead)} dead` : "no dead money"}
          tone={cap.space < 0 ? "bad" : undefined}
        />
        <Stat
          label="Roster"
          value={clip.label}
          sub={clip.cutdown ? clip.sub : `${injured.length} injured`}
          tone={clip.tone === "warn" ? "warn" : undefined}
        />
        <Stat
          label="Point Diff"
          value={`${rec.pf - rec.pa > 0 ? "+" : ""}${rec.pf - rec.pa}`}
          tone={rec.pf - rec.pa >= 0 ? "good" : "bad"}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* ---- Next game / last results ----------------------------------- */}
        <Card
          title={next ? "Next Game" : userSeasonGames.length > 0 ? "Season Recap" : "Season"}
          className="lg:col-span-1"
          padded={!( !next && userSeasonGames.length > 0 )}
          actions={
            !next && userSeasonGames.length > 0 ? (
              <Link href="/recap">
                <Button size="sm" variant="ghost">Full recap</Button>
              </Link>
            ) : undefined
          }
        >
          {next ? (
            (() => {
              const home = next.homeId === team.id;
              const opp = state.teams[home ? next.awayId : next.homeId];
              const oppRec = computeRecords(state).get(opp.id)!;
              const forecast = next.conditions?.weather;
              return (
                <div className="text-center py-2">
                  <div className="text-xs text-[var(--color-muted)]">
                    {next.playoffRound ? next.playoffRound : `Week ${next.week}`} · {home ? "Home" : "Away"}
                  </div>
                  <div className="flex items-center justify-center gap-3 my-3">
                    <TeamMark team={opp} size={40} />
                    <div className="text-left">
                      <div className="font-semibold">{opp.city} {opp.name}</div>
                      <div className="text-xs text-[var(--color-muted)] tnum">{recordString(oppRec)}</div>
                      {forecast && (
                        <div
                          className={cx(
                            "text-xs tnum mt-0.5",
                            isHarsh(forecast) ? "text-[var(--color-warn)]" : "text-[var(--color-faint)]"
                          )}
                        >
                          {weatherLabel(forecast)}
                        </div>
                      )}
                    </div>
                  </div>
                  <Link href="/depth-chart">
                    <Button size="sm" variant="ghost">Check the depth chart</Button>
                  </Link>
                </div>
              );
            })()
          ) : bye && state.phase === "regular" ? (
            <Empty title="Bye week" hint="No game this week. Advance to move on." />
          ) : userSeasonGames.length > 0 ? (
            <Table head={["Wk", "Opp", ""]}>
              {userSeasonGames.slice(-8).map((r) => {
                const opp = state.teams[r.opponentId];
                return (
                  <Row key={r.game.id} highlight={r.won}>
                    <Cell align="left">
                      <span className="text-xs text-[var(--color-muted)]">
                        {r.game.playoffRound ?? r.game.week}
                      </span>
                    </Cell>
                    <Cell align="left">
                      <span className="flex items-center gap-1.5 min-w-0">
                        {opp && <TeamMark team={opp} size={16} />}
                        <span className="truncate text-xs">
                          {r.home ? "vs" : "@"} {opp?.abbr ?? "—"}
                        </span>
                      </span>
                    </Cell>
                    <Cell>
                      <span className={cx(
                        "tnum text-xs",
                        r.won && "text-[var(--color-good)]",
                        !r.won && !r.tied && "text-[var(--color-bad)]"
                      )}>
                        {r.won ? "W" : r.tied ? "T" : "L"} {r.us}–{r.them}
                      </span>
                    </Cell>
                  </Row>
                );
              })}
            </Table>
          ) : (
            <Empty
              title={state.phase === "preseason" ? "Season hasn't started" : "No games scheduled"}
              hint={state.phase === "preseason" ? "Start the season when your roster is set." : undefined}
            />
          )}
        </Card>

        {/* ---- Division ----------------------------------------------------- */}
        <Card title={team.division} className="lg:col-span-1" padded={false}>
          <Table head={["Team", "W", "L", "PCT"]}>
            {derived.div.map((r) => {
              const t = state.teams[r.teamId];
              const g = r.w + r.l + r.t;
              return (
                <Row key={r.teamId} highlight={r.teamId === team.id}>
                  <Cell align="left">
                    <span className="flex items-center gap-2">
                      <TeamMark team={t} size={18} />
                      <span className="truncate">{t.name}</span>
                    </span>
                  </Cell>
                  <Cell>{r.w}</Cell>
                  <Cell>{r.l}</Cell>
                  <Cell>{g === 0 ? "—" : ((r.w + r.t * 0.5) / g).toFixed(3).replace(/^0/, "")}</Cell>
                </Row>
              );
            })}
          </Table>
        </Card>

        {/* ---- Injuries ----------------------------------------------------- */}
        <Card title="Injury Report" subtitle={`${injured.length} out on the 53${onIr ? ` · ${onIr} on IR` : ""}`} className="lg:col-span-1" padded={false}>
          {injured.length === 0 ? (
            <Empty title={onIr > 0 ? `${onIr} on IR` : "Everyone's healthy"} />
          ) : (
            <Table head={["Player", "Injury", "Wks"]}>
              {injured.slice(0, 8).map((p) => (
                <Row key={p.id}>
                  <Cell align="left">
                    <span className="flex items-center gap-2 min-w-0">
                      <PosBadge pos={p.pos} />
                      <PlayerLink p={p} className="truncate" />
                    </span>
                  </Cell>
                  <Cell align="right"><span className="text-xs text-[var(--color-muted)]">{p.injuryDesc}</span></Cell>
                  <Cell>{p.injuryWeeks}</Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ---- Team leaders -------------------------------------------------- */}
        <Card title="Team Leaders" subtitle={`${state.season} season`} padded={false}>
          {topPerformers.length === 0 ? (
            <Empty title="No games played yet" hint="Play a week to see who's producing." />
          ) : (
            <Table head={["Player", "OVR", "Line"]}>
              {topPerformers.map(({ p, l }) => {
                const line =
                  l.passAtt > 0 ? `${l.passYds} yds, ${l.passTd} TD, ${l.passInt} INT`
                  : l.rushAtt > l.rec ? `${l.rushYds} yds, ${l.rushTd} TD`
                  : l.rec > 0 ? `${l.rec} rec, ${l.recYds} yds, ${l.recTd} TD`
                  : `${l.tackles} tkl, ${l.sacks} sk, ${l.ints} INT`;
                return (
                  <Row key={p.id}>
                    <Cell align="left">
                      <span className="flex items-center gap-2 min-w-0">
                        <PosBadge pos={p.pos} />
                        <PlayerLink p={p} className="truncate" />
                      </span>
                    </Cell>
                    <Cell><OvrBadge ovr={p.ovr} size="sm" /></Cell>
                    <Cell><span className="text-xs text-[var(--color-muted)]">{line}</span></Cell>
                  </Row>
                );
              })}
            </Table>
          )}
        </Card>

        {/* ---- Activity ------------------------------------------------------ */}
        <Card title="Around the League" padded={false}>
          {state.log.length === 0 ? (
            <Empty title="Nothing has happened yet" />
          ) : (
            <div className="max-h-[320px] overflow-y-auto divide-y divide-[var(--color-line-soft)]">
              {state.log.slice(-40).reverse().map((e, i) => (
                <div key={i} className="px-4 py-2 flex items-start gap-2.5">
                  <span
                    className={cx(
                      "mt-1.5 w-1.5 h-1.5 rounded-full shrink-0",
                      e.kind === "injury" ? "bg-[var(--color-bad)]"
                      : e.kind === "milestone" ? "bg-[var(--color-elite)]"
                      : e.kind === "transaction" ? "bg-[var(--color-accent)]"
                      : e.kind === "draft" ? "bg-[var(--color-warn)]"
                      : "bg-[var(--color-faint)]"
                    )}
                  />
                  <span className="text-xs leading-relaxed">{e.text}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {roster.length > 0 && (
        <Card
          title="Roster Snapshot"
          subtitle="Your five highest-rated players"
          actions={<Link href="/roster"><Button size="sm" variant="ghost">Full roster</Button></Link>}
          padded={false}
        >
          <Table head={["Player", "Pos", "Age", "OVR", "Cap Hit"]}>
            {roster
              .slice()
              .sort((a, b) => b.ovr - a.ovr)
              .slice(0, 5)
              .map((p) => (
                <Row key={p.id}>
                  <Cell align="left"><PlayerLink p={p} /></Cell>
                  <Cell><PosBadge pos={p.pos} /></Cell>
                  <Cell>{p.age}</Cell>
                  <Cell><OvrBadge ovr={p.ovr} size="sm" /></Cell>
                  <Cell>{formatMoney(p.contract ? (p.contract.baseSalary[0] ?? 0) + (p.contract.bonusProrationYears > 0 ? p.contract.signingBonus / p.contract.bonusProrationYears : 0) : 0)}</Cell>
                </Row>
              ))}
          </Table>
        </Card>
      )}

      {state.phase === "regular" && derived.lastResults.length > 0 && (
        <Card title={`Week ${Math.max(1, state.week - 1)} Results`} padded={false}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--color-line-soft)]">
            {derived.lastResults.map((g) => {
              const h = state.teams[g.homeId];
              const a = state.teams[g.awayId];
              const mine = g.homeId === team.id || g.awayId === team.id;
              return (
                <Link
                  key={g.id}
                  href={`/game/${g.id}`}
                  className={cx(
                    "bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] p-3 transition-colors",
                    mine && "bg-[var(--color-accent-dim)]/30"
                  )}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <TeamMark team={a} size={16} />
                      <span className="truncate">{a.abbr}</span>
                    </span>
                    <span className={cx("tnum", g.awayScore > g.homeScore && "font-semibold")}>{g.awayScore}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <TeamMark team={h} size={16} />
                      <span className="truncate">{h.abbr}</span>
                    </span>
                    <span className={cx("tnum", g.homeScore > g.awayScore && "font-semibold")}>{g.homeScore}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
