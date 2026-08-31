"use client";

import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/lib/store/game";
import { Rng } from "@/lib/core/rng";
import { playerName } from "@/lib/core/ratings";
import { askingPrice, signPlayer, suggestedYears } from "@/lib/core/offseason/contracts";
import {
  FA_ROUNDS, faPool, faPoolFor, liveBids, placeUserBid, userBids, withdrawUserBid,
} from "@/lib/core/offseason/freeAgency";
import { openFaBidding, runFaWave } from "@/lib/core/offseason";
import { formatMoney, rosterCount, teamCap } from "@/lib/core/select";
import { FaBid, POSITIONS, Player, Position, ROSTER_LIMIT } from "@/lib/core/types";
import {
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
} from "@/components/ui";

/**
 * The free agent market.
 *
 * Offers are validated by `placeUserBid` (open market) or `signPlayer`
 * (street free agents), not by this screen — the roster limit, the cap and the
 * player's own asking price are all enforced in core, and the rejection reason
 * it returns is surfaced verbatim as the toast. The UI can prefill a sensible
 * offer, but it cannot talk a player into a bad one.
 */

type SortKey = "ovr" | "price" | "age";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "ovr", label: "OVR" },
  { value: "price", label: "Asking price" },
  { value: "age", label: "Age" },
];

const POS_OPTIONS: { value: Position | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  ...POSITIONS.map((p) => ({ value: p as Position | "ALL", label: p })),
];

interface Offer {
  playerId: number;
  years: string;
  apyM: string;
}

interface WaveSigning {
  key: number;
  name: string;
  pos: Position;
  ovr: number;
  team: string;
  years: number;
  apy: number;
}

export default function FreeAgencyPage() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const apply = useGame((s) => s.apply);
  const setToast = useGame((s) => s.setToast);

  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("ovr");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [lastWave, setLastWave] = useState<
    { round: number; signings: WaveSigning[]; won: WaveSigning[]; lost: WaveSigning[] } | null
  >(null);

  const pool = useMemo<Player[]>(
    () => (state ? faPool(state) : []),
    // rev changes on every mutation; the state object itself is mutated in place.
    [state, rev]
  );

  const rows = useMemo<Player[]>(() => {
    if (!state) return [];
    const q = query.trim().toLowerCase();
    const filtered = faPoolFor(state, pos).filter(
      (p) => !q || playerName(p).toLowerCase().includes(q)
    );
    return filtered.sort((a, b) => {
      switch (sortKey) {
        case "ovr":
          return b.ovr - a.ovr || a.id - b.id;
        case "price":
          return askingPrice(state, b) - askingPrice(state, a) || b.ovr - a.ovr;
        case "age":
          return a.age - b.age || b.ovr - a.ovr;
      }
    });
  }, [state, rev, pos, sortKey, query]);

  const cpuBids = useMemo<FaBid[]>(
    () => (state ? liveBids(state).filter((b) => b.teamId !== state.userTeamId) : []),
    [state, rev]
  );
  const myBids = useMemo<FaBid[]>(
    () => (state ? userBids(state) : []),
    [state, rev]
  );

  useEffect(() => {
    if (!state || state.phase !== "offseason-fa") return;
    if (state.fa?.complete) return;
    if (state.fa && (state.fa.bids.length > 0 || state.fa.round >= 1)) return;
    apply((s) => {
      openFaBidding(s);
    });
  }, [state, rev, apply]);

  if (!state) return null;

  const teamId = state.userTeamId;
  const team = state.teams[teamId];
  const cap = teamCap(state, teamId);
  const count = rosterCount(state, teamId);
  const rosterFull = count >= ROSTER_LIMIT;
  const faPhase = state.phase === "offseason-fa";
  const marketRound = state.fa?.round ?? 1;
  const marketMax = state.fa?.maxRounds ?? FA_ROUNDS;
  const marketDone = !!state.fa?.complete;
  const best = pool[0] ?? null;
  const visible = showAll ? rows : rows.slice(0, 40);
  const playerById = new Map<number, Player>();
  for (const p of state.players) playerById.set(p.id, p);
  const bidBoard = cpuBids
    .slice()
    .sort((a, b) => b.apy - a.apy || a.playerId - b.playerId)
    .slice(0, 16);

  /** Prefill the editor with the deal core would consider fair. */
  function startOffer(p: Player, asking: number) {
    setOffer({
      playerId: p.id,
      years: String(suggestedYears(p)),
      apyM: (asking / 1_000_000).toFixed(2),
    });
  }

  function submitOffer(p: Player) {
    if (!offer) return;
    const years = Math.round(Number(offer.years));
    const apyM = Number(offer.apyM);
    if (!Number.isFinite(years) || years < 1 || years > 6) {
      setToast("Contracts run 1 to 6 years.");
      return;
    }
    if (!Number.isFinite(apyM) || apyM <= 0) {
      setToast("Enter a salary greater than zero.");
      return;
    }
    const apy = Math.round(apyM * 1_000_000);
    const name = playerName(p);
    let ok = false;
    apply((s) => {
      // While the market is open an offer is a BID, not a signing. Rival clubs
      // get to answer it when the wave resolves. Outside the market — a midseason
      // street free agent, say — it is still an immediate signing.
      if (s.fa && !s.fa.complete && s.phase === "offseason-fa") {
        const res = placeUserBid(s, p.id, years, apy);
        ok = res.ok;
        if (!res.ok) return res.reason ?? "That bid was rejected.";
        return `Bid submitted for ${name} — ${years}yr at ${formatMoney(apy)}. Advance the market to see if it holds.`;
      }
      const rng = new Rng(s.rngState);
      const res = signPlayer(s, p.id, s.userTeamId, years, apy, rng);
      s.rngState = rng.state;
      ok = res.ok;
      if (!res.ok) return res.reason ?? "That offer was turned down.";
      return `Signed ${name} — ${years} year${years === 1 ? "" : "s"} at ${formatMoney(apy)} per year`;
    });
    if (ok) setOffer(null);
  }

  function cancelBid(playerId: number, name: string) {
    apply((s) => {
      withdrawUserBid(s, playerId);
      return `Withdrew the bid for ${name}`;
    });
  }

  function advanceMarket() {
    const round = state?.fa?.round ?? 1;
    let captured: WaveSigning[] = [];
    let won: WaveSigning[] = [];
    let lost: WaveSigning[] = [];
    apply((s) => {
      const outcome = runFaWave(s, s.fa?.round ?? round);
      const toRow = (sg: { player: Player; teamId: number; years: number; apy: number }, i: number) => ({
        key: i,
        name: `${sg.player.firstName} ${sg.player.lastName}`,
        pos: sg.player.pos,
        ovr: sg.player.ovr,
        team: s.teams[sg.teamId].abbr,
        years: sg.years,
        apy: sg.apy,
      });
      captured = outcome.signings.map(toRow);
      won = outcome.won.map(toRow);
      lost = outcome.lost.map(toRow);

      // The headline is whatever happened to the user's own bids. Losing a
      // player you bid on is the thing worth telling him about; the rest of the
      // market moving is background.
      if (lost.length > 0) {
        const first = lost[0];
        return lost.length === 1
          ? `${first.name} signed with ${first.team} — you were outbid`
          : `You were outbid on ${lost.length} players`;
      }
      if (won.length > 0) {
        return won.length === 1
          ? `You won the bidding for ${won[0].name}`
          : `You won ${won.length} bids`;
      }
      if (captured.length === 0) return `Wave ${round}: nobody moved — the market is quiet`;
      return `Wave ${round}: ${captured.length} free agent${captured.length === 1 ? "" : "s"} signed elsewhere`;
    });
    setLastWave({ round, signings: captured, won, lost });
    setOffer(null);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Cap Space"
          value={formatMoney(cap.space)}
          sub={`of ${formatMoney(cap.cap)}`}
          tone={cap.space < 0 ? "bad" : "good"}
        />
        <Stat
          label="Roster"
          value={`${count}/${ROSTER_LIMIT}`}
          sub={
            count > ROSTER_LIMIT
              ? `${count - ROSTER_LIMIT} over the limit`
              : count === ROSTER_LIMIT
                ? "Full — release someone to sign"
                : `Room for ${ROSTER_LIMIT - count} more`
          }
          tone={count >= ROSTER_LIMIT ? "warn" : "good"}
        />
        <Stat
          label="Free Agents"
          value={pool.length}
          sub={best ? `Best available: ${playerName(best)} (${best.pos})` : "Market is empty"}
        />
        <Stat
          label="Market Wave"
          value={marketDone ? `${marketMax} / ${marketMax}` : `${Math.min(marketRound, marketMax)} / ${marketMax}`}
          sub={
            marketDone
              ? "Bargain bin — prices at their floor"
              : cpuBids.length > 0
                ? `${cpuBids.length} CPU bid${cpuBids.length === 1 ? "" : "s"} on the board`
                : "Prices soften each wave"
          }
        />
      </div>

      {!faPhase && (
        <Card title="The market is thinner outside free agency">
          <p className="text-sm text-[var(--color-muted)]">
            It is not the offseason signing period, so most of the league is under contract
            and what is left here is depth, camp bodies and players nobody wanted. You can
            still sign anyone available — teams sign free agents in-season too — and the same
            cap and roster rules apply.
          </p>
        </Card>
      )}

      {rosterFull && (
        <Card title="Your roster is full">
          <p className="text-sm text-[var(--color-muted)]">
            You are at the {ROSTER_LIMIT}-man limit. Any offer will be refused until you
            release someone from the roster page.
          </p>
        </Card>
      )}

      {faPhase && myBids.length > 0 && (
        <Card
          title="Your outstanding bids"
          subtitle="Rival clubs answer these when you advance the market. Nothing is signed until then."
          padded={false}
        >
          <Table head={["Player", "Pos", "OVR", "Years", "Per Year", "Guarantee", ""]}>
            {myBids.map((b) => {
              const p = playerById.get(b.playerId);
              if (!p) return null;
              return (
                <Row key={b.playerId}>
                  <Cell align="left" className="font-medium">
                    <PlayerLink p={p} />
                  </Cell>
                  <Cell>
                    <PosBadge pos={p.pos} />
                  </Cell>
                  <Cell>
                    <OvrBadge ovr={p.ovr} size="sm" />
                  </Cell>
                  <Cell>{b.years}</Cell>
                  <Cell>{formatMoney(b.apy)}</Cell>
                  <Cell>{formatMoney(b.signingBonus)}</Cell>
                  <Cell align="right">
                    <Button size="sm" onClick={() => cancelBid(b.playerId, playerName(p))}>
                      Withdraw
                    </Button>
                  </Cell>
                </Row>
              );
            })}
          </Table>
        </Card>
      )}

      {faPhase && cpuBids.length > 0 && (
        <Card
          title="CPU bids on the board"
          subtitle={`${cpuBids.length} outstanding — bid now to contest a player before the wave lands`}
          padded={false}
        >
          <Table head={["Player", "Pos", "OVR", "Club", "Years", "Per Year"]}>
            {bidBoard.map((b) => {
              const p = playerById.get(b.playerId);
              if (!p) return null;
              return (
                <Row key={`${b.teamId}-${b.playerId}`}>
                  <Cell align="left" className="font-medium">
                    <PlayerLink p={p} />
                  </Cell>
                  <Cell>
                    <PosBadge pos={p.pos} />
                  </Cell>
                  <Cell>
                    <OvrBadge ovr={p.ovr} size="sm" />
                  </Cell>
                  <Cell>{state.teams[b.teamId]?.abbr ?? b.teamId}</Cell>
                  <Cell>{b.years}</Cell>
                  <Cell>{formatMoney(b.apy)}</Cell>
                </Row>
              );
            })}
          </Table>
        </Card>
      )}

      {lastWave && lastWave.won.length > 0 && (
        <Card
          title="You won the bidding"
          subtitle="These players chose your offer."
          padded={false}
        >
          <Table head={["Player", "Pos", "OVR", "Years", "Per Year"]}>
            {lastWave.won.map((sg) => (
              <Row key={`won-${sg.key}`}>
                <Cell align="left" className="font-medium">{sg.name}</Cell>
                <Cell>
                  <PosBadge pos={sg.pos} />
                </Cell>
                <Cell>
                  <OvrBadge ovr={sg.ovr} size="sm" />
                </Cell>
                <Cell>{sg.years}</Cell>
                <Cell>{formatMoney(sg.apy)}</Cell>
              </Row>
            ))}
          </Table>
        </Card>
      )}

      {lastWave && lastWave.lost.length > 0 && (
        <Card
          title="You were outbid"
          subtitle="These players chose somewhere else. Money is not the only thing they weigh."
          padded={false}
        >
          <Table head={["Player", "Pos", "OVR", "Signed with", "Years", "Per Year"]}>
            {lastWave.lost.map((sg) => (
              <Row key={`lost-${sg.key}`}>
                <Cell align="left" className="font-medium">{sg.name}</Cell>
                <Cell>
                  <PosBadge pos={sg.pos} />
                </Cell>
                <Cell>
                  <OvrBadge ovr={sg.ovr} size="sm" />
                </Cell>
                <Cell className="font-medium">{sg.team}</Cell>
                <Cell>{sg.years}</Cell>
                <Cell>{formatMoney(sg.apy)}</Cell>
              </Row>
            ))}
          </Table>
        </Card>
      )}

      {lastWave && (
        <Card
          title={`Wave ${lastWave.round} results`}
          subtitle={
            lastWave.signings.length > 0
              ? `${lastWave.signings.length} player${lastWave.signings.length === 1 ? "" : "s"} came off the board`
              : undefined
          }
          padded={false}
        >
          {lastWave.signings.length === 0 ? (
            <Empty
              title="No signings in that wave"
              hint="Either the CPU teams are out of cap space and roster spots, or there is nobody left worth signing."
            />
          ) : (
            <Table head={["Player", "Pos", "OVR", "Signed by", "Years", "Per Year"]}>
              {lastWave.signings.map((sg) => (
                <Row key={sg.key}>
                  <Cell align="left" className="font-medium">
                    {sg.name}
                  </Cell>
                  <Cell>
                    <PosBadge pos={sg.pos} />
                  </Cell>
                  <Cell>
                    <OvrBadge ovr={sg.ovr} size="sm" />
                  </Cell>
                  <Cell>{sg.team}</Cell>
                  <Cell>{sg.years}</Cell>
                  <Cell>{formatMoney(sg.apy)}</Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>
      )}

      <Card
        title={`Free agents — ${team.abbr}`}
        subtitle={`${rows.length} of ${pool.length} available${offer ? " · finish or cancel your offer to sign someone else" : ""}`}
        actions={
          <Button
            size="sm"
            variant="primary"
            onClick={advanceMarket}
            disabled={pool.length === 0 || marketDone}
            title={
              pool.length === 0
                ? "There is nobody left to sign"
                : marketDone
                  ? "CPU bidding is over — remaining players are yours to sign"
                  : "Resolve the bids on the board — players you want may come off it"
            }
          >
            Advance free agency
          </Button>
        }
        padded={false}
      >
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[var(--color-line-soft)]">
          <Tabs value={pos} onChange={setPos} options={POS_OPTIONS} />
          <Tabs value={sortKey} onChange={setSortKey} options={SORTS} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search free agents…"
            className="bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-lg px-3 py-1.5 text-sm placeholder:text-[var(--color-faint)] outline-none focus:border-[var(--color-accent)] transition-colors min-w-[180px]"
          />
          {(query || pos !== "ALL" || sortKey !== "ovr") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setQuery("");
                setPos("ALL");
                setSortKey("ovr");
              }}
            >
              Reset
            </Button>
          )}
        </div>

        {pool.length === 0 ? (
          <Empty
            title="No free agents available"
            hint="Every unsigned player has been claimed. More will hit the market when contracts expire at the start of the offseason."
          />
        ) : rows.length === 0 ? (
          <Empty
            title="No free agents match those filters"
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
          <Table head={["Player", "Pos", "Age", "OVR", "Asking", "CPU bid", "Sug. Yrs", ""]}>
            {visible.map((p) => {
              const asking = askingPrice(state, p);
              const bid = cpuBids
                .filter((b) => b.playerId === p.id)
                .sort((a, b) => b.apy - a.apy || a.teamId - b.teamId)[0];
              const mine = myBids.find((b) => b.playerId === p.id);
              const editing = offer?.playerId === p.id;
              const total = editing
                ? Math.round(Number(offer.apyM) * 1_000_000) * Math.round(Number(offer.years))
                : 0;
              return (
                <Row key={p.id} highlight={editing}>
                  <Cell align="left">
                    <PlayerLink p={p} className="font-medium" />
                  </Cell>
                  <Cell>
                    <PosBadge pos={p.pos} />
                  </Cell>
                  <Cell>{p.age}</Cell>
                  <Cell>
                    <OvrBadge ovr={p.ovr} size="sm" />
                  </Cell>
                  <Cell className={cx(asking > cap.space && "text-[var(--color-bad)]")}>
                    {formatMoney(asking)}
                  </Cell>
                  <Cell className={bid ? "text-[var(--color-accent)]" : "text-[var(--color-faint)]"}>
                    {bid
                      ? `${state.teams[bid.teamId]?.abbr ?? "CPU"} ${formatMoney(bid.apy)}`
                      : "—"}
                  </Cell>
                  <Cell className="text-[var(--color-muted)]">{suggestedYears(p)}</Cell>
                  <Cell>
                    {editing ? (
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <label className="text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
                          Yrs
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={6}
                          step={1}
                          value={offer.years}
                          onChange={(e) =>
                            setOffer({ ...offer, years: e.target.value })
                          }
                          className="w-14 bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-lg px-2 py-1 text-sm tnum text-right outline-none focus:border-[var(--color-accent)] transition-colors"
                        />
                        <label className="text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
                          $M / yr
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.25}
                          value={offer.apyM}
                          onChange={(e) => setOffer({ ...offer, apyM: e.target.value })}
                          className="w-24 bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-lg px-2 py-1 text-sm tnum text-right outline-none focus:border-[var(--color-accent)] transition-colors"
                        />
                        <span className="text-[11px] text-[var(--color-muted)] tnum">
                          {Number.isFinite(total) && total > 0 ? formatMoney(total) : "—"} total
                        </span>
                        <Button size="sm" variant="primary" onClick={() => submitOffer(p)}>
                          Offer
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setOffer(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" onClick={() => startOffer(p, asking)}>
                        {faPhase && !marketDone ? (mine ? "Revise" : "Bid") : "Sign"}
                      </Button>
                    )}
                  </Cell>
                </Row>
              );
            })}
          </Table>
        )}

        {rows.length > visible.length && (
          <div className="px-4 py-3 border-t border-[var(--color-line-soft)] text-center">
            <Button size="sm" onClick={() => setShowAll(true)}>
              Show all {rows.length} free agents
            </Button>
          </div>
        )}
        {showAll && rows.length > 40 && (
          <div className="px-4 py-3 border-t border-[var(--color-line-soft)] text-center">
            <Button size="sm" variant="ghost" onClick={() => setShowAll(false)}>
              Show top 40 only
            </Button>
          </div>
        )}
      </Card>

      <p className="text-xs text-[var(--color-faint)] text-center">
        Offers below about 92% of a player&apos;s asking price are refused, and no deal can
        put you over the cap or past {ROSTER_LIMIT} players.{" "}
        {faPhase ? (
          <>
            Place a bid and advance the market — rival clubs answer, and the player
            picks. CPU clubs have already bid. Your club is never auto-bid for.
          </>
        ) : (
          <Pill>Regular market</Pill>
        )}
      </p>
    </div>
  );
}
