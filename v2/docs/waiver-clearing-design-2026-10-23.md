# Waiver clearing and the dead money on a cut — design note (2026-10-23)

Design only. Nothing here is built. Decisions for Matt are at the end.

## The problem in one line

A cut frees a player's whole cap hit at once, but his dead money is booked
only when he clears waivers. If the club has spent the room by then, he goes
back on the wire, every window, with no end. The club never pays it, and a
few hundred players are stuck: no club can sign them as free agents.

## What the NFL does

- **Unclaimed means free agent.** A player who passes through waivers
  unclaimed becomes a free agent. There is no third outcome (NFL Football
  Operations, "NFL Waiver System Overview",
  https://operations.nfl.com/updates/the-players/nfl-waiver-system-overview).
- **The bonus accelerates on the waiving club, claimed or not.** 2020 CBA
  Article 13 §6(b)(ii): a contract assigned by trade *or waivers* on or before
  June 1 has its unamortized signing bonus counted in the assigning club's
  Team Salary for that League Year. A release accelerates the same way
  (Article 13; already the rule this repo uses for retirement and for trades,
  `docs/nfl-reference.md`, "Retirement acceleration" and "Trade cap
  accounting").
- **A claiming club takes the rest of the contract.** Base salary and the
  guarantees on it move; the signing bonus does not (same section of
  `nfl-reference.md`, from #185).
- **Unclaimed: the guarantee stays with the waiving club.** The remaining
  guaranteed base is owed whether or not he signs elsewhere (offset rules
  aside, not modelled).
- **Vested veterans.** From the start of the waiver period to the trade
  deadline, a vested veteran (four accrued seasons) released is not subject
  to waivers at all; after the deadline everyone passes through (same NFL
  overview). Not modelled here: `yearsPro` is not an accrued-season count
  (`nfl-reference.md`, practice-squad note).

## What the sim does today

- `cutPlayer` (`offseason/contracts.ts`) sets `teamId = null`, so the whole
  cap hit leaves the club's books at once. It books **no** dead money and
  puts him on `state.waivers`.
- Claim (`awardClaim`, `waivers.ts`): the claiming club takes the contract
  **as is, signing bonus included**. The waiving club books nothing.
- Unclaimed (`stashOrFreeAgent`): practice squad if the club has a slot and
  room for his hit; else free agent with `deadMoney` booked **if it fits the
  club's space now**; else back on the next window.
- In season, waivers resolve every week; nothing re-checks a CPU club's cap.
  `reconcileRoster` / `enforceCap` run only at the cutdown.
- This leftover path was deliberate (`nfl-reference.md`, "Waiver wire":
  "leftover stays on the desk rather than blowing the books"). The fix below
  keeps the books legal without it.

## Measured on `main` (`d46e132`)

Probe (scratch, not committed): seeds 42 and 11, three seasons each, a
snapshot at week 1 and at the end of each regular season.

| | seed 42 | seed 11 |
|---|---|---|
| limbo at week 1, years 2 / 3 / 4 | 122 / 389 / 269 | 99 / 288 / 245 |
| of those, carried from an earlier season (year 3) | 311 | 227 |
| limbo at 58+ OVR (a usable free agent), week 1 | 31–54 | 27–43 |
| dead money dodged, share of league cap, week 1 | 0.99–1.47% | 0.53–0.79% |
| dead money booked, same snapshots | 2.1–5.3% | 2.4–4.6% |
| worst single club, dodged share of its own cap | 7.8% | 3.9% |

The pile shrinks in season (as clubs gain room) and refills at the cutdown.

Claims, seed 42, three seasons: 1,842 waived, 1,021 claimed, 386 cleared to
free agency. 523 claimed players carried signing-bonus proration: **$177.9M**
of proration moved to claiming clubs instead of accelerating on the waiving
club.

Noticed, not in scope: 1,021 claims on 1,842 waivers is a claim rate of about
55%. That looks high against the NFL's cutdown (about 1,200 players are cut,
32 clubs × 37, and most clear), but there is no primary number in the repo
for the claim share, so it
is a CPU-behaviour question for a separate note, not this one.

## Proposed design

1. **Book the bonus at the cut.** `cutPlayer` books the remaining signing
   bonus proration (`remainingBonusProration`, void years included) on the
   waiving club at once. This is §6(b)(ii) and the same rule trades and
   retirement already use. The cut now frees `capHit − proration`, not the
   whole hit.
2. **Claims carry base and guarantee, not bonus.** `awardClaim` gives the
   claiming club the contract with its proration removed, the same split
   `moveAsset` makes for a trade (#185). The claim check prices the
   incoming hit on that copy.
3. **Unclaimed after one window: free agent, always.** The remaining
   guaranteed base is booked on the waiving club and the player is a free
   agent. The practice-squad stash stays as now (slot open and his hit
   fits). No re-listing, so the limbo path is deleted.
4. **A cut must be affordable.** Because the guarantee lands at clearing,
   a club could still go over the cap then. CPU cut choices
   (`moveWorstSurplus`, `enforceCap`, the claim-cut in `awardClaim`) skip a
   player whose `deadMoney` would not fit after the cut; if no candidate
   fits, the next cheapest affordable one is cut. For the user, the cut
   button names the dead money and refuses a cut the club cannot absorb
   ("Cutting him costs $X of dead money; you have $Y of room"). That is the
   NFL rule: a club cannot make a move that leaves it over the cap.
5. **Backstop.** After each in-season waiver window, any CPU club still
   over the cap runs `enforceCap` (it only cuts players whose cut saves
   room, so it converges). Expected to be rare; a test counts it.
6. **Saves already holding a pile.** On load, anyone in limbo from an
   earlier window is released to free agency with **no** charge to his old
   club: a one-time amnesty, so an old save does not open a season tens of
   millions over the cap. Logged once in the transaction feed.

Not in this packet: vested-veteran waiver exemption, June 1 split (none
anywhere in the sim), offset language, termination pay (left out, Matt
2026-10-20), and the claim rate.

## What it moves

- `drift.deadMoneyPct` rises: the dodged 0.5–1.5% of league cap lands as
  dead money, plus the bonus that used to move with claims. Reference
  ~5–8% (OTC), no band on the metric.
- `drift.medianPayrollPct` (lock 90.602 ±6) may move: dead money counts in
  committed cap, and clubs lose some room they were re-spending.
- Free agency gains the 100–390 players who were stuck; 27–54 of them are
  58+ OVR. Street signings and `careers` survival can move.
- CPU cut choices change where a cut is not affordable, so the cutdown and
  `careers` R6–R7 / UDFA survival can move.
- The seed-42 user-offers canary will very likely move (the waiver path runs
  before the tag and FA steps it reads). It needs a signed re-lock.

So it needs a Studio panel and a signed canary, like the camp nudge.

## Tests it would need

- A cut books the remaining proration on the waiving club at once, claimed
  or not; the claiming club's copy carries no proration (mirrors the trade
  tests in `lib/core/tradeReview.test.ts`).
- Unclaimed after one window: free agent, guarantee booked on the old club,
  and `state.waivers` is empty after settle. No player is ever on the wire
  for two windows.
- A CPU club never ends a waiver window over the cap; the backstop count is
  reported.
- The user cut desk refuses an unaffordable cut and names the dead money.
- An old save with a limbo pile loads with the pile released and no club's
  dead money changed.
- `verify`, `drift` and `careers` run clean; canary re-signed.

## Decisions for Matt

1. **Timing.** Book the bonus at the cut (CBA §6(b)(ii), as above), or keep
   booking everything at clearing but always clear (simpler, still not the
   NFL's timing)?
2. **Claims.** Split the bonus off a claimed contract like a trade (#185),
   or leave claims as they are and fix only clearing?
3. **Unaffordable cuts.** Refuse them (CPU picks another body; the user gets
   a reason), or allow them and let the backstop cut more players?
4. **Old saves.** Release the existing pile with no charge (amnesty), or
   charge it on load?
5. **Claim rate.** Leave the ~55% claim rate for a separate note, as
   proposed, or look at it in the same packet?

## Decided (Matt, 2026-10-23)

All five as recommended: bonus at the cut; claims split like a trade;
unaffordable cuts refused; the existing pile released with no charge; the
claim rate left for a separate note.

## As built

- `cutPlayer` books `remainingBonusProration` on the waiving club and strips
  the bonus from the contract (`signingBonus` and `bonusProrationYears` to 0,
  the same copy `moveAsset` makes for a trade). The entry is written with
  `bookedAtCut: true`.
- `awardClaim`: the claimant takes that copy, base and guarantee only. The
  claim-cut it may make to open a slot now prices that player's dead money.
- `stashOrFreeAgent`: practice squad as before, otherwise free agent always.
  An entry with `bookedAtCut` books what is left (`deadMoney` of the stripped
  copy, the guarantee); an entry without it is the old pile and clears with
  no charge. The re-list path is gone.
- Backstop: at the end of every `resolveWaivers`, a CPU club over the cap
  runs `enforceCap` (cuts only players whose release saves room). The user's
  club is never cut for; an over-cap user still sees the existing roster
  issue.
- `cutAffordable` / `cutRefusal` (`offseason/contracts.ts`): a cut is allowed
  when it saves room or its dead money fits the room left. CPU cut pickers
  (`worstSurplus`, the position ceiling, the QB cap) take the worst
  affordable player and fall back to the worst only when none is affordable,
  so a club can still reach 53; the backstop then covers the cap. The
  `/roster` Release and Place on PS buttons refuse with the reason.
- Not changed: camp. CPU clubs carry 90 in camp and sit over the cap until
  the cut on `main` too (19 of 31 on seed 42); the NFL counts the top 51 in
  the offseason. Separate item.
- Tests: `lib/core/waiverClearing.test.ts` (5 cases), in `package.json` and
  both gate tiers. `waivers`, `proRata` and `retirementDead` cases that
  asserted the old timing now assert the signed one.
