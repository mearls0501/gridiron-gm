# Wave 3.6 Packet 2 — trade-death autopsy

Throwaway / do-not-merge. Instrumented copy of `lib/core/trades.ts` behind
`TRADE_AUTOPSY=1`. No volume knobs. No engine fix. No `baselines.json`.

Base: `main` @ `7328da1` (#72). Control: `190cbd0` (2026-08-03 last green panel).
Harness: `TRADE_AUTOPSY=1 npx tsx scripts/drift.ts 12` seed 12345.

## Question order

1. Do proposals stop (null from builders) or stop clearing (accept/execute)?
2. If pick swaps go to zero while player trades still clear: `draftOrder` and
   `pickOwners` after five rollovers.
3. If everything is rejected at `checkTrade`, which reason dominates.
4. Identical instrumented build at `190cbd0` — does the control also die after
   season 5?

## Season flip (7328da1)

_pending run_

## Funnel tables, seasons 4–7 (7328da1 tip)

_pending run_

## Funnel tables, seasons 4–7 (190cbd0 control)

_pending run_

## Answers 1–4

_pending run_

## Exact code branch

_pending run_
