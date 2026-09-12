# Wave 3.6 Packet 2 — trade-death autopsy

Throwaway / do-not-merge. Instrumented `lib/core/trades.ts` behind
`TRADE_AUTOPSY=1`. No volume knobs. No engine fix. No `baselines.json`.

- Tip: `main` @ `7328da1` (#72), `TRADE_AUTOPSY=1 npx tsx scripts/drift.ts 12 12345`
- Control: identical counters on `190cbd0` (2026-08-03 last green panel), same harness
- Raw logs: `v2/docs/autopsy-tip-7328da1.log`, `v2/docs/autopsy-control-190cbd0.log`

## Season flip

**2031 (season 6 of 12) is the first year `drift` prints `trades=0`.**
The CPU market does not stop that year. `executeTrade` still returns ok
**20 times** in the instrumented windows (15 cpu + 5 draft-day).

`drift.ts` series (log count after finalize):

`87 / 47 / 50 / 58 / 45 / 0 / 0 / 0 / 0 / 0 / 0 / 0`

Live `executeTrade` ok (cpu + draft-day + cutdown):

`63 / 24 / 26 / 45 / 40 / 20 / 24 / 33 / 35 / 47 / 48 / 50`

`##M drift.tradesPerSeason 23.92` is the mean of the **log-count** series
(zeros included). The live CPU-window mean is **~38**.

## Exact branch that produces the zero

Not a builder early-return. Not `evaluateOffer`. Not `checkTrade`.

1. `executeTrade` appends `kind: "transaction"` / `text: "Trade: …"`
   (`lib/core/trades.ts`).
2. `finalizeOffseason` increments `state.season`, then
   `runHousekeeping` → `trimLog` (`lib/core/housekeeping.ts`).
3. `trimLog` keeps `season >= state.season - LOG_DETAIL_SEASONS` (2), then
   if `kept.length > LOG_MAX_ENTRIES` (**4000**) drops the **oldest**
   non-milestone rows.
4. `drift.ts` then counts
   `st.log.filter(l => l.season === season && l.text.startsWith("Trade:"))`.

`Trade:` lines are not permanent. On tip, finalize after camp-90 / waivers
appends a flood of later `transaction` rows (cuts, claims, street signings).
Those sit **newer** than the year's trades, so the 4000-ceiling slice
removes the `Trade:` lines. From 2031 on, the count is exactly 0 while
the market is still clearing.

`190cbd0` already has the same `trimLog` / 4000 ceiling. Its finalize
does not flood enough to wipe the **current** year's `Trade:` lines, so
the drift mean stays **27.9** and there is no hard-zero series.

## Funnel tables, seasons 4–7 (7328da1 tip)

Season 4 = 2029. Attempts are constant at 916 (536 cpu + 260 draft-day + 120 cutdown).

| year | drift trades | attempts | swapProp | tradeProp | cutdownProp | accept | exec | failLegal | failIllegal |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2029 | 58 | 916 | 16 | 92 | 30 | 43 | 45 | 12 | 53 |
| 2030 | 45 | 916 | 16 | 63 | 23 | 36 | 40 | 6 | 37 |
| **2031** | **0** | 916 | 8 | 48 | 43 | 20 | **20** | 7 | 29 |
| 2032 | 0 | 916 | 13 | 56 | 37 | 23 | **24** | 11 | 35 |

Window split (exec):

| year | cpu exec (swap+player) | draftDay exec (swap) | cutdown exec |
|---:|---:|---:|---:|
| 2029 | 32 | 11 | 2 |
| 2030 | 25 | 11 | 4 |
| 2031 | 15 | 5 | 0 |
| 2032 | 15 | 8 | 1 |

Dominant builder nulls every year, both sides of the flip:
`trade:proposerValue`, `swap:proposerValue`, `swap:packageShort`,
`cutdown:packageShort`, `trade:packageShort`, `trade:targetFilterEmpty`.

`picksOwnedByEmpty`, `needsOfEmpty`, `mineFilterEmpty`, and `weightedEmpty`
are **not** the death. `needsOfEmpty` is a handful in year 1 and gone later.
`weightedEmpty` is 0 on every window.

Dominant `checkTrade` reject: `cannot_fit_the_contracts` (a few
`would_be_at_54` / `would_be_short_at_*`). These reject some offers.
They do not stop the market.

Recap at the flip (2031, after five prior rollovers):

- `draftOrder(state, season-1)` = **32**, missing = []
- `pickOwners` = 896 at recap / 672 after prune
- picks per CPU club min/med/max = 11/21/37 (recap), 3/13/21 (season-end)
- `zeroLiveClubs` = 0
- horizon `s+1` and `s+2` = 32/32 clubs, 32/32 full 7-round rows
- horizon `s+3` = 0/32 — **by design**. `PICK_HORIZON = 3` only ensures
  `season+0..+2`
- posture 8 contend / 16 retool / 7 rebuild
- `evaluate() > 0` on CPU active rosters = 1511 (rising slowly, not collapsing)

## Funnel tables, seasons 4–7 (190cbd0 control)

`190cbd0` `drift.ts` has no per-season `trades=` progress line. The
harness mean is **27.92**. Live exec never approaches 0.

| year | attempts | swapProp | tradeProp | accept | exec | failLegal | failIllegal |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 2029 | 681 | 10 | 41 | 30 | 30 | 13 | 8 |
| 2030 | 681 | 8 | 49 | 27 | 27 | 12 | 18 |
| 2031 | 681 | 15 | 39 | 36 | 36 | 9 | 9 |
| 2032 | 681 | 13 | 37 | 29 | 29 | 16 | 5 |

No cutdown window on this SHA. Attempts = 421 cpu + 260 draft-day.

Exec every year 2026–2037: `48 / 27 / 35 / 30 / 27 / 36 / 29 / 28 / 27 / 31 / 30 / 41`.

At 2031 recap: `draftOrderPrev=32`, horizon s+1/s+2 full, s+3 empty,
`evalGt0=1536`, posture 9/18/4, `logLen=4429` already over the 4000
ceiling (trim is eating **older** `Trade:` lines; current-year lines
still survive, which is why the drift mean does not hard-zero).

## Answers

### 1. Do proposals stop, or stop clearing?

**Neither.** Attempts stay 916 (tip) / 681 (control) every season.
Builders keep returning non-null offers (`tradeProp` 48–92, `swapProp`
7–16, `cutdownProp` 23–44 on tip). `evaluateOffer` still accepts.
`executeTrade` still returns ok. The printed zero is the **log read
after `trimLog`**, not a dead funnel.

Early-return that does **not** produce the zero:
not `picksOwnedBy` empty, not `needsOf` empty, not target/`mine` filter
empty, not `rng.weighted` over an empty list. The common nulls are
value-test / package-short misses that also dominate year 1.

### 2. Pick inventory / draft order after five rollovers

Does not apply as the death mechanism. Pick swaps still propose and
clear in 2031–2037 (draft-day exec 5–11 on tip). After five rollovers,
at 2031 recap:

- `draftOrder(state, 2030)` still returns **32** clubs
- every club still has `season+1` and `season+2` rows (7 rounds)
- `season+3` rows do not exist (`PICK_HORIZON = 3`)

### 3. If everything is rejected at `checkTrade`, which reason dominates?

Everything is **not** rejected. `cannot_fit_the_contracts` dominates the
reject histogram (then roster-54 / position-short). Those are real
misses and they rise after year 1. They leave `exec` in the 20–50 range
on tip and 27–41 on control. They are not the hard zero.

### 4. Does the 190cbd0 control also die after season 5?

**No.** Say so plainly: the **market** never died on either SHA, and the
**hard-zero drift series is tip-only**. `190cbd0` exec stays 27–41
through season 12. Drift mean **27.9**. The August-3 panel never saw a
hard zero because (a) that SHA's finalize does not flood the log enough
to wipe the current year's `Trade:` lines under the 4000-entry ceiling,
and (b) the trades guard is a 20-season **mean** vs `min: 5`. A
front-loaded-then-zero series still averages ~13 and stays green.

`trimLog` itself **does** predate the roster cluster — it is on
`190cbd0`. What changed after August is log **volume** (camp-90, waivers,
IR/PS, cutdown dump), which makes the existing ceiling start deleting
the current year's `Trade:` rows around season 6.

## What this is not

- Not cap bust as the cause of the zero (cap rejects exist; exec continues).
- Not `needsOf` / camp-90 hiding need (needs still produce targets).
- Not pick-horizon exhaustion.
- Not a volume-knob leftover.
- Not a reason to touch `POSITION_VALUE`, `CONTENDER_PULL`,
  `GUARANTEE_PULL`, `CARRY_SHARE`, `cpuProspectView`, or PR #9.

No fix in this packet.
