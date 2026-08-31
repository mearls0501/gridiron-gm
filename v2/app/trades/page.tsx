"use client";

import { useMemo, useState } from "react";
import { useGame } from "@/lib/store/game";
import { teamOutlook } from "@/lib/core/frontOffice";
import { playerName } from "@/lib/core/ratings";
import {
  acceptOffer,
  assetValue,
  describeAsset,
  executeTrade,
  picksOwnedBy,
  proposeFromUser,
  rejectOffer,
  tradeWindowOpen,
} from "@/lib/core/trades";
import { capHit, formatMoney, rosterCount, teamRoster } from "@/lib/core/select";
import {
  PickOwnership,
  Player,
  ROSTER_LIMIT,
  TRADE_DEADLINE_WEEK,
  TradeAsset,
  TradeOffer,
} from "@/lib/core/types";
import {
  Button,
  Card,
  Cell,
  cx,
  Empty,
  OvrBadge,
  Pill,
  PosBadge,
  Row,
  Stat,
  Table,
  TeamMark,
} from "@/components/ui";

/**
 * The trade market.
 *
 * Nothing here decides whether a deal is legal or whether the other club likes
 * it — `checkTrade` and `evaluateOffer` do, and this screen only reads them.
 * The margin the engine returns is never printed: a GM negotiating with another
 * front office hears "we would need more than that", not a number, so the read
 * is translated into words and scaled against the size of the package rather
 * than against a fixed threshold (being 20 short on a seventh-rounder is a very
 * different conversation from being 20 short on a franchise quarterback).
 */

function assetKey(a: TradeAsset): string {
  return a.kind === "player"
    ? `p:${a.playerId}`
    : `d:${a.season}:${a.round}:${a.originalTeamId}`;
}

function pickAsset(pk: PickOwnership): TradeAsset {
  return { kind: "pick", season: pk.season, round: pk.round, originalTeamId: pk.originalTeamId };
}

function toggle(list: TradeAsset[], a: TradeAsset): TradeAsset[] {
  const k = assetKey(a);
  return list.some((x) => assetKey(x) === k) ? list.filter((x) => assetKey(x) !== k) : [...list, a];
}

/** The other club's read, in the language a GM would actually get on the phone. */
function readOfMargin(margin: number, scale: number): { text: string; tone: "good" | "warn" | "bad" } {
  // Everything is relative to what is on the table. `scale` is the total value
  // of both packages in the other club's currency, so a shortfall is expressed
  // as a share of the deal rather than as an absolute gap.
  const r = scale > 0 ? margin / scale : 0;
  if (margin > 0) {
    if (r >= 0.15) return { text: "They would jump at this.", tone: "good" };
    if (r >= 0.05) return { text: "They like this. It gets done.", tone: "good" };
    return { text: "They would take it, but only just.", tone: "good" };
  }
  if (r >= -0.05) return { text: "Close, but they want a little more.", tone: "warn" };
  if (r >= -0.2) return { text: "Not close yet — they want considerably more.", tone: "bad" };
  return { text: "Not interested. This is nowhere near enough.", tone: "bad" };
}

export default function TradesPage() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const apply = useGame((s) => s.apply);

  const [partner, setPartner] = useState<number | null>(null);
  const [give, setGive] = useState<TradeAsset[]>([]);
  const [get, setGet] = useState<TradeAsset[]>([]);
  const [offerError, setOfferError] = useState<{ id: number; reason: string } | null>(null);

  const partnerId = useMemo(() => {
    if (!state) return null;
    const others = state.teams.filter((t) => t.id !== state.userTeamId);
    if (others.length === 0) return null;
    if (partner !== null && others.some((t) => t.id === partner)) return partner;
    return others[0].id;
  }, [state, partner]);

  const proposal = useMemo(() => {
    if (!state || partnerId === null) return null;
    if (give.length === 0 && get.length === 0) return null;
    return proposeFromUser(state, partnerId, give, get);
    // rev changes on every mutation; the state object itself is mutated in place.
  }, [state, rev, partnerId, give, get]);

  const read = useMemo(() => {
    if (!state || partnerId === null || !proposal || !proposal.check.ok) return null;
    const { posture } = teamOutlook(state, partnerId);
    let scale = 0;
    for (const a of [...give, ...get]) scale += assetValue(state, partnerId, a, posture);
    return readOfMargin(proposal.verdict.margin, scale);
  }, [state, rev, partnerId, proposal, give, get]);

  if (!state) return null;

  const userId = state.userTeamId;
  const userTeam = state.teams[userId];
  const other = partnerId === null ? null : state.teams[partnerId];
  const open = tradeWindowOpen(state);
  const offers: TradeOffer[] = state.tradeOffers ?? [];

  const closedReason =
    state.phase === "playoffs"
      ? "Rosters are frozen for the playoffs. The market reopens once the season is over."
      : state.phase === "regular"
        ? `The deadline passed at the end of Week ${TRADE_DEADLINE_WEEK}. Nothing moves again until the offseason.`
        : "No club is doing business right now.";

  const weeksToDeadline =
    state.phase === "regular" ? TRADE_DEADLINE_WEEK - state.week + 1 : null;

  function resetPartner(id: number) {
    setPartner(id);
    setGive([]);
    setGet([]);
  }

  function accept(offer: TradeOffer) {
    let failed = "";
    apply((s) => {
      const res = acceptOffer(s, offer.id);
      if (!res.ok) {
        failed = res.reason ?? "That trade could not be completed.";
        return failed;
      }
      return `Trade agreed with ${s.teams[offer.fromTeamId].abbr}`;
    });
    setOfferError(failed ? { id: offer.id, reason: failed } : null);
  }

  function reject(offer: TradeOffer) {
    const abbr = state!.teams[offer.fromTeamId].abbr;
    apply((s) => {
      rejectOffer(s, offer.id);
      return `Turned down ${abbr}`;
    });
    setOfferError(null);
  }

  function propose() {
    if (partnerId === null) return;
    const to = partnerId;
    let done = false;
    apply((s) => {
      const fresh = proposeFromUser(s, to, give, get);
      if (!fresh.check.ok) return fresh.check.reason ?? "That trade cannot be made.";
      if (!fresh.verdict.accept) return `${s.teams[to].abbr} turned it down.`;
      const res = executeTrade(s, fresh.offer);
      if (!res.ok) return res.reason ?? "That trade could not be completed.";
      s.nextTradeId = (s.nextTradeId ?? 1) + 1;
      done = true;
      return `Trade completed with ${s.teams[to].abbr}`;
    });
    if (done) {
      setGive([]);
      setGet([]);
    }
  }

  const canPropose =
    open && !!proposal && proposal.check.ok && proposal.verdict.accept;

  return (
    <div className="space-y-4">
      {/* ---- Window ---------------------------------------------------------- */}
      {open ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat
            label="Trade Window"
            value="Open"
            sub={
              weeksToDeadline !== null
                ? weeksToDeadline === 1
                  ? "Deadline is this week"
                  : `${weeksToDeadline} weeks to the deadline`
                : "Deals can be made freely"
            }
            tone="good"
          />
          <Stat
            label="Offers Waiting"
            value={offers.length}
            sub={offers.length === 0 ? "Nobody has called" : "On the table now"}
            tone={offers.length > 0 ? "warn" : undefined}
          />
          <Stat
            label="Roster"
            value={`${rosterCount(state, userId)}/${ROSTER_LIMIT}`}
            sub="Both clubs must stay legal"
          />
          <Stat
            label="Your Picks"
            value={picksOwnedBy(state, userId).length}
            sub="Tradeable draft capital"
          />
        </div>
      ) : (
        <Card title="The trade window is closed">
          <div className="flex items-start gap-3">
            <Pill tone="bad">Closed</Pill>
            <p className="text-sm text-[var(--color-muted)]">
              {closedReason} Nothing on this page can be accepted or proposed until it
              reopens.
            </p>
          </div>
        </Card>
      )}

      {/* ---- Offers on the table --------------------------------------------- */}
      <Card
        title="Offers on the table"
        subtitle={
          offers.length === 0
            ? "Clubs come to you when they need what you have"
            : `${offers.length} club${offers.length === 1 ? "" : "s"} want to do business`
        }
        padded={false}
      >
        {offers.length === 0 ? (
          <Empty
            title="No offers right now"
            hint="Other clubs make offers as the season and the offseason move on. They come looking when they have a hole you can fill."
          />
        ) : (
          <div className="divide-y divide-[var(--color-line-soft)]">
            {offers.map((offer) => {
              const from = state.teams[offer.fromTeamId];
              const err = offerError?.id === offer.id ? offerError.reason : null;
              return (
                <div key={offer.id} className="p-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <TeamMark team={from} size={26} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {from.city} {from.name}
                      </div>
                      <div className="text-[11px] text-[var(--color-muted)] tnum">
                        {offer.season}
                        {offer.week > 0 ? ` · Week ${offer.week}` : ""}
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => accept(offer)}
                        disabled={!open}
                        title={open ? undefined : "The trade window is closed"}
                      >
                        Accept
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => reject(offer)}>
                        Reject
                      </Button>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <AssetPanel
                      label={`${userTeam.abbr} receive`}
                      tone="good"
                      items={offer.give.map((a) => describeAsset(state, a))}
                    />
                    <AssetPanel
                      label={`${from.abbr} receive`}
                      tone="bad"
                      items={offer.get.map((a) => describeAsset(state, a))}
                    />
                  </div>

                  {offer.rationale && (
                    <p className="text-xs text-[var(--color-muted)] mt-3 italic">
                      &ldquo;{offer.rationale}&rdquo; — {from.abbr} front office
                    </p>
                  )}

                  {err && (
                    <p className="text-xs text-[var(--color-bad)] mt-2">{err}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ---- Propose --------------------------------------------------------- */}
      <Card
        title="Propose a trade"
        subtitle={other ? `Talking to ${other.city} ${other.name}` : undefined}
        actions={
          <select
            value={partnerId ?? ""}
            onChange={(e) => resetPartner(Number(e.target.value))}
            disabled={!open}
            className="bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {state.teams
              .filter((t) => t.id !== userId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.city} {t.name}
                </option>
              ))}
          </select>
        }
      >
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <AssetPanel
              label={`${userTeam.abbr} send`}
              tone="bad"
              items={give.map((a) => describeAsset(state, a))}
            />
            <AssetPanel
              label={`${userTeam.abbr} receive`}
              tone="good"
              items={get.map((a) => describeAsset(state, a))}
            />
          </div>

          <div className="bg-[var(--color-surface-2)] border border-[var(--color-line-soft)] rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              {!open ? (
                <span className="text-sm text-[var(--color-muted)]">
                  Nothing can be proposed while the window is shut.
                </span>
              ) : !proposal ? (
                <span className="text-sm text-[var(--color-muted)]">
                  Pick players and picks from either side to put a deal together.
                </span>
              ) : !proposal.check.ok ? (
                <span className="flex items-center gap-2 text-sm">
                  <Pill tone="bad">Illegal</Pill>
                  <span className="text-[var(--color-bad)]">
                    {proposal.check.reason ?? "That deal cannot be made."}
                  </span>
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <Pill tone={proposal.verdict.accept ? "good" : "warn"}>
                    {proposal.verdict.accept ? "They accept" : "They decline"}
                  </Pill>
                  {read && (
                    <span
                      className={cx(
                        read.tone === "good"
                          ? "text-[var(--color-good)]"
                          : read.tone === "warn"
                            ? "text-[var(--color-warn)]"
                            : "text-[var(--color-bad)]"
                      )}
                    >
                      {read.text}
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(give.length > 0 || get.length > 0) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setGive([]);
                    setGet([]);
                  }}
                >
                  Clear
                </Button>
              )}
              <Button
                size="sm"
                variant={canPropose ? "primary" : "default"}
                onClick={propose}
                disabled={!canPropose}
                className={!canPropose ? "opacity-40 cursor-not-allowed" : undefined}
                title={
                  !open
                    ? "The trade window is closed"
                    : !proposal
                      ? "Put a deal together first"
                      : !proposal.check.ok
                        ? proposal.check.reason
                        : !proposal.verdict.accept
                          ? "They would say no — sweeten it"
                          : undefined
                }
              >
                Propose trade
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* ---- The two sides --------------------------------------------------- */}
      <div className="grid lg:grid-cols-2 gap-4">
        <SidePanel
          teamId={userId}
          title={`${userTeam.city} ${userTeam.name} — you send`}
          selected={give}
          onToggle={(a) => setGive((l) => toggle(l, a))}
          disabled={!open}
        />
        {other && partnerId !== null && (
          <SidePanel
            teamId={partnerId}
            title={`${other.city} ${other.name} — you receive`}
            selected={get}
            onToggle={(a) => setGet((l) => toggle(l, a))}
            disabled={!open}
          />
        )}
      </div>

      <p className="text-xs text-[var(--color-faint)] text-center">
        Both clubs price a deal in their own currency, so a trade only happens when the two
        front offices disagree about what something is worth. Whoever sends a contract eats
        what is left of the signing bonus.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AssetPanel({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "good" | "bad";
}) {
  return (
    <div className="bg-[var(--color-surface-2)] border border-[var(--color-line-soft)] rounded-lg px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)]">{label}</div>
      {items.length === 0 ? (
        <div className="text-sm text-[var(--color-faint)] mt-1">Nothing</div>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span
                className={cx(
                  "mt-1.5 w-1.5 h-1.5 rounded-full shrink-0",
                  tone === "good" ? "bg-[var(--color-good)]" : "bg-[var(--color-bad)]"
                )}
              />
              <span className="min-w-0">{t}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SidePanel({
  teamId,
  title,
  selected,
  onToggle,
  disabled,
}: {
  teamId: number;
  title: string;
  selected: TradeAsset[];
  onToggle: (a: TradeAsset) => void;
  disabled: boolean;
}) {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);

  const roster = useMemo<Player[]>(
    () => (state ? teamRoster(state, teamId).slice().sort((a, b) => b.ovr - a.ovr || a.id - b.id) : []),
    // rev changes on every mutation; the state object itself is mutated in place.
    [state, rev, teamId]
  );
  const picks = useMemo<PickOwnership[]>(
    () => (state ? picksOwnedBy(state, teamId) : []),
    [state, rev, teamId]
  );

  if (!state) return null;
  const team = state.teams[teamId];
  const keys = new Set(selected.map(assetKey));
  const chosen = selected.length;

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <TeamMark team={team} size={18} />
          <span className="truncate">{title}</span>
        </span>
      }
      subtitle={`${roster.length} players · ${picks.length} picks${chosen > 0 ? ` · ${chosen} selected` : ""}`}
      padded={false}
    >
      <div className="max-h-[420px] overflow-y-auto">
        <Table head={["Player", "Pos", "Age", "OVR", "Cap Hit"]}>
          {roster.map((p) => {
            const a: TradeAsset = { kind: "player", playerId: p.id };
            const on = keys.has(assetKey(a));
            return (
              <Row key={p.id} highlight={on} onClick={disabled ? undefined : () => onToggle(a)}>
                <Cell align="left">
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={on}
                      readOnly
                      disabled={disabled}
                      tabIndex={-1}
                      className="accent-[var(--color-accent)] shrink-0"
                    />
                    <span className="truncate font-medium">{playerName(p)}</span>
                    {p.injuryWeeks > 0 && <Pill tone="bad">{p.injuryWeeks}w</Pill>}
                  </span>
                </Cell>
                <Cell>
                  <PosBadge pos={p.pos} />
                </Cell>
                <Cell>{p.age}</Cell>
                <Cell>
                  <OvrBadge ovr={p.ovr} size="sm" />
                </Cell>
                <Cell>{p.contract ? formatMoney(capHit(p.contract)) : "—"}</Cell>
              </Row>
            );
          })}
        </Table>

        <div className="px-4 py-2 border-y border-[var(--color-line-soft)] text-[10px] uppercase tracking-wider text-[var(--color-faint)] bg-[var(--color-surface-2)]">
          Draft picks
        </div>

        {picks.length === 0 ? (
          <Empty title="No picks owned" hint="Every selection has been traded away." />
        ) : (
          <Table head={["Pick", "Round", "Slot from"]}>
            {picks.map((pk) => {
              const a = pickAsset(pk);
              const on = keys.has(assetKey(a));
              const origin = state.teams[pk.originalTeamId];
              return (
                <Row
                  key={assetKey(a)}
                  highlight={on}
                  onClick={disabled ? undefined : () => onToggle(a)}
                >
                  <Cell align="left">
                    <span className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={on}
                        readOnly
                        disabled={disabled}
                        tabIndex={-1}
                        className="accent-[var(--color-accent)] shrink-0"
                      />
                      <span className="truncate">{pk.season} Draft</span>
                    </span>
                  </Cell>
                  <Cell>{pk.round}</Cell>
                  <Cell>
                    {pk.originalTeamId === teamId ? (
                      <span className="text-[var(--color-faint)]">Own</span>
                    ) : (
                      origin.abbr
                    )}
                  </Cell>
                </Row>
              );
            })}
          </Table>
        )}
      </div>
    </Card>
  );
}
