# Start the Season freezes as the franchise ages — playtest 1029, M3

**UNSIGNED.** This note is the measurement and a proposed fix. It does not change the sim, a test, a dial, or `docs/baselines.json`. Matt signs any fix. No re-lock.

Source: 30-season playtest on production `main` `8747e25` (same code as `ddc62bd`), save `GM Playtest career30 1029`. Report section M3. The click is Confirm on Roster Cutdown, after the three preseason weeks, until the next Preseason paints. Hand timings there run from about 35s (2030) to about 190s (2055). A second Start the Season, once Preseason is already on screen, was 4–25s from 2041 on.

Measured here on `0679a1a` (Node v22.23.4, one thread, seed 42). That commit is #213, which skips cap releases and the one-year minimum rewrite on the user seat. CPU `reconcileRoster` is the playtest path. Nothing in this run was executed on the Mac Studio. The timers sat on the live calls for the run and are not in this branch.

## Root cause

The click is synchronous. Confirm calls `advance` (`app/page.tsx` 170–172). Cutdown is not free agency or the draft, so it does not take the yielding continue path. `apply` runs `advanceOffseason` to completion on the main thread (`lib/store/game.ts` 353–373, 392–398), then `saveGame` builds the document with `JSON.parse(JSON.stringify(encodeSave(state)))` before that write awaits (`lib/store/save.ts` 102–109).

Once the three preseason weeks are done, `advanceOffseason` calls `finalizeOffseason` (`lib/core/offseason/index.ts` 400–405). The button label is `OFFSEASON_STEPS["offseason-final"].action`, "Start the Season" (`index.ts` 68–72).

`finalizeOffseason` legalizes every CPU club before it rolls the calendar (`index.ts` 263–276): `reconcileRoster(..., 53, true)`, then `spendToFloor`, `upgradeRoster`, then `reconcileRoster` again. The first of those reconciles is the camp cut. Rosters are still up at the camp ceiling. `fillRoster` trims them to 53 one body at a time (`lib/core/offseason/contracts.ts` 1345–1352), and each cut sorts the club through `worstSurplus`.

`worstSurplus` (`contracts.ts` 1648–1657) does two full walks of `state.players` per candidate, then sorts:

- `positionCount` (`lib/core/select.ts` 78–83) scans every player to decide whether that body is above the position minimum.
- The comparator calls `surplusWorth` (`contracts.ts` 1642–1646) on both sides. `surplusWorth` calls `teamOutlook` (`lib/core/frontOffice.ts` 210–241) to read posture, then `evaluate`. Posture does not change during the sort. It is recomputed anyway.
- `quarterbackKeepWorth` (`contracts.ts` 1427–1430) does the same `teamOutlook` call inside the quarterback cap that runs at the end of the same trim.

`teamOutlook` filters the entire player array (`teamRoster`, `select.ts` 30–32) and rebuilds the season table (`computeRecords`, `select.ts` 330–338). During this click the phase is still `offseason-final`, so the season on the books is the one just played, and `state.games` still holds it. `computeRecords` walks those games. It does not walk `state.history`. The history row, the record book, and the log are not on this path. Games are emptied later in the same function, after the trim.

`select.ts` 6–11 says these scans are fine because a league is about 1,900 players and one scan is sub-millisecond. One scan still is. The trim does it hundreds of thousands of times, and the array the scan walks keeps every retired player who ever recorded a stat. That retention is deliberate (`docs/save-size-2026-07-27.md`): season and career records are derived from those lines. The cutdown pays for it on every comparison.

The second CPU reconcile, after the clubs are already at 53, does not run that sort. It stays under a quarter second through 2055. `spendToFloor` stays under 0.2s. The freeze is the 90-to-53 sort, repeated for 31 clubs.

## How it was timed

`newGame({ seed: 42 })`, then the headless season loop: play the year, walk the offseason, and time the `advanceOffseason` whose phase is `offseason-final` and whose preseason weeks left are 0. That call is `finalizeOffseason` plus `runPsychology`. After it returned, the same tail the click runs was timed on its own: jersey numbers, Hall number retirement, `encodeSave`, `JSON.stringify`, `JSON.parse`, and the hub's `teamCap` / `rosterIssues` / `teamLeaders`.

The year in the tables is the preseason the button creates (`state.season` after the increment inside `finalizeOffseason`). The cutdown header the GM is looking at still shows the year before. The playtest's "2030" and "2055" are read as that landing preseason. Opening 2055 is the last Start the Season the playtest pressed. Opening 2056 is one year past where that save stopped.

Wall seconds are this process. They sit above the playtest's hand timings (2030: 59s here, about 35s there; 2055: 363s here, about 190s there). 2030 to 2055 is 6.1× here and about 5.4× there. The hand series is noisier (2034–39 was written down as 60–90s after 2033 had already been 85–95s). The shape is the same climb.

A `teamOutlook` wrapper is a pair of timer reads around a function that walks thousands of players. Call count inside the CPU trim stays between 737k and 804k from the 2030 click on, while the seconds keep rising, so the wrapper is not the slope.

## The button, by the preseason it opens

"CPU trim" is the first `reconcileRoster` on the 31 CPU clubs. "Outlook" is `teamOutlook` inside that trim. "Standings" is `computeRecords` inside those outlook calls, so it is already inside the outlook column. "Pos scans" is `positionCount` inside that same trim, and it is not inside outlook.

| Opens | Button s | CPU trim s | Outlook calls | Outlook s | Standings s | Pos scans s | Players | Retired | Rostered | Stat rows |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2027 | 9.0 | 8.1 | 206,472 | 7.2 | 3.4 | 0.7 | 3,022 | 118 | 2,211 | 1,588 |
| 2028 | 19.3 | 17.7 | 350,752 | 16.1 | 6.1 | 1.2 | 3,691 | 455 | 2,454 | 3,142 |
| 2029 | 34.8 | 32.4 | 544,666 | 29.5 | 9.4 | 2.1 | 4,175 | 789 | 2,700 | 4,675 |
| 2030 | 59.1 | 56.0 | 760,484 | 50.8 | 13.7 | 3.9 | 4,595 | 1,058 | 2,998 | 6,222 |
| 2031 | 75.3 | 71.6 | 764,170 | 64.8 | 14.7 | 5.3 | 4,947 | 1,314 | 2,984 | 7,758 |
| 2032 | 79.1 | 74.6 | 752,830 | 67.5 | 14.6 | 5.5 | 5,257 | 1,615 | 2,946 | 9,308 |
| 2033 | 89.9 | 85.5 | 736,996 | 76.9 | 15.3 | 6.9 | 5,486 | 1,789 | 2,962 | 10,858 |
| 2034 | 103.4 | 98.1 | 752,788 | 88.1 | 16.0 | 8.0 | 5,809 | 2,090 | 2,995 | 12,410 |
| 2035 | 107.6 | 102.5 | 769,050 | 92.0 | 15.7 | 8.6 | 6,085 | 2,367 | 3,017 | 13,949 |
| 2036 | 119.9 | 114.0 | 754,254 | 102.2 | 16.3 | 9.6 | 6,326 | 2,651 | 2,990 | 15,476 |
| 2037 | 133.6 | 127.5 | 779,678 | 114.4 | 17.2 | 10.7 | 6,540 | 2,841 | 2,993 | 17,027 |
| 2038 | 138.3 | 131.3 | 778,508 | 117.3 | 17.0 | 11.5 | 6,837 | 3,131 | 3,018 | 18,569 |
| 2039 | 149.7 | 141.9 | 763,754 | 126.4 | 18.2 | 12.7 | 7,129 | 3,397 | 3,012 | 20,121 |
| 2040 | 167.1 | 158.5 | 799,308 | 141.6 | 18.1 | 14.0 | 7,378 | 3,644 | 3,051 | 21,655 |
| 2041 | 179.5 | 170.9 | 792,668 | 152.3 | 18.1 | 15.5 | 7,677 | 3,912 | 3,059 | 23,214 |
| 2042 | 182.1 | 172.0 | 772,058 | 153.1 | 17.9 | 15.8 | 7,935 | 4,158 | 3,041 | 24,753 |
| 2043 | 207.8 | 196.5 | 797,660 | 174.7 | 19.9 | 18.3 | 8,202 | 4,377 | 3,048 | 26,287 |
| 2044 | 217.2 | 204.7 | 770,762 | 182.0 | 18.5 | 19.3 | 8,513 | 4,737 | 3,033 | 27,843 |
| 2045 | 231.6 | 217.2 | 788,322 | 193.1 | 19.6 | 20.4 | 8,760 | 4,982 | 3,036 | 29,388 |
| 2046 | 235.2 | 222.2 | 776,470 | 197.0 | 19.3 | 21.4 | 9,041 | 5,201 | 3,028 | 30,937 |
| 2047 | 236.2 | 222.6 | 769,804 | 197.6 | 18.5 | 21.4 | 9,356 | 5,548 | 3,037 | 32,493 |
| 2048 | 272.2 | 257.6 | 792,612 | 229.5 | 29.7 | 23.8 | 9,594 | 5,750 | 3,037 | 34,047 |
| 2049 | 275.5 | 259.5 | 787,276 | 229.7 | 20.0 | 25.7 | 9,887 | 6,065 | 3,020 | 35,586 |
| 2050 | 276.0 | 260.8 | 777,260 | 229.3 | 19.6 | 27.4 | 10,078 | 6,305 | 3,035 | 37,119 |
| 2051 | 305.8 | 289.4 | 791,710 | 256.5 | 23.1 | 28.4 | 10,355 | 6,561 | 3,046 | 38,660 |
| 2052 | 322.1 | 305.4 | 789,584 | 268.8 | 20.8 | 31.8 | 10,611 | 6,851 | 3,058 | 40,187 |
| 2053 | 318.8 | 301.3 | 804,060 | 265.7 | 20.6 | 31.0 | 10,842 | 7,080 | 3,060 | 41,731 |
| 2054 | 332.4 | 312.8 | 775,368 | 276.6 | 28.5 | 31.6 | 11,141 | 7,339 | 3,022 | 43,280 |
| 2055 | 363.2 | 344.4 | 787,078 | 304.7 | 20.7 | 34.7 | 11,420 | 7,603 | 3,050 | 44,847 |
| 2056 | 348.2 | 328.8 | 782,450 | 290.9 | 20.0 | 33.1 | 11,668 | 7,865 | 3,049 | 46,393 |

Players, retired, rostered, and stat rows are the pool at the start of the click, which is the pool the trim scans. Rostered counts every non-prospect on a club, including IR and the practice squad. Prospects stay near 500 (494–527 the whole way). Free agents bounce between 24 and 304. `state.games` is 285 at every one of these clicks. History length is the "Opens" year minus 2026 (1 at the 2027 click, 29 at the 2055 click).

From 2030 to 2055 the outlook call count goes from 760,484 to 787,078. The player array goes from 4,595 to 11,420. Visits are calls times players: 3.49 billion to 8.99 billion, 2.57×. Time inside outlook goes from 50.8s to 304.7s, 6.00×. The missing factor is the cost of one visit: 14.5 ns in 2030, 33.9 ns in 2055. Those two ratios multiply to the 6.0×. Over the same span, season stat rows on that array go from 6,222 to 44,847. The visit gets more expensive as the objects get heavier. This run did not separate that from the machine sitting at one core for three hours, and 2048's standings cell (29.7s) is a spike against a band that otherwise sits at 18–23s. The visit arithmetic still closes on the endpoints.

What the array is made of, once camps are full: rostered stays at about 3,000 from the 2030 click on. The bodies added after that are retirees. 1,058 retired at the 2030 click, 7,603 at the 2055 click. Player growth from 4,595 to 11,420 is +6,825, and retired growth is +6,545.

## Where the 363 seconds go (opening 2055)

| Step | 2027 | 2030 | 2040 | 2055 |
|---|---:|---:|---:|---:|
| First CPU reconcile (the 90-to-53 trim) | 8.14 | 55.97 | 158.50 | 344.40 |
| User reconcile, same trim, one club | 0.29 | 1.78 | 4.28 | 9.02 |
| Refill after waivers | 0.10 | 0.33 | 1.91 | 5.26 |
| Prep (undrafted conversion, prune picks) | 0.15 | 0.26 | 0.66 | 1.63 |
| Settle waivers | 0.21 | 0.46 | 1.05 | 1.29 |
| Upgrade roster | 0.06 | 0.11 | 0.34 | 0.85 |
| Second CPU reconcile (already at 53) | 0.01 | 0.04 | 0.10 | 0.23 |
| Depth charts | 0.02 | 0.03 | 0.10 | 0.21 |
| Spend to the floor | 0.00 | 0.03 | 0.05 | 0.13 |
| Housekeeping (log trim, never-played, profiles) | 0.00 | 0.00 | 0.01 | 0.02 |
| Calendar, scouting, staff, draft class, picks, carryover | <0.05 | <0.05 | <0.05 | <0.10 |

The user's own club is the same sort as one CPU club (344s / 31 ≈ 11s, and the user trim is 9.0s). The freeze is the 31 CPU trims. #213 did not take the user trim off this click. It took cap releases and the minimum rewrite off the user seat. The sort still runs.

Inside the 2055 CPU trim, outlook is 304.7s of the 344.4s. Standings, nested in that, is 20.7s. Position scans are another 34.7s. Standings walks the same 285 games on every outlook call. After the call count flattens, that cell settles near 20s (18–23s from 2039 on), with two spikes at 29.7s (2048) and 28.5s (2054). The growing piece is the player-array filter inside `teamOutlook`.

Call count climbs only while the camps fill. Rostered goes 2,211 → 2,998 from the 2027 click to the 2030 click, and outlook calls go 206k → 760k, because each extra camp body is another cut and a longer sort. After that, rostered is flat and the call count is flat. A sort of a few dozen candidates is hundreds of comparisons, two `surplusWorth` calls each, times ~37 cuts, times 31 clubs. That product is the ~780,000.

## What else the click does

These were timed on the same clicks. None of them is the freeze.

| | 2027 | 2030 | 2040 | 2055 |
|---|---:|---:|---:|---:|
| `runPsychology` after the rollover | 0.002s | — | — | 0.012s |
| Jersey numbers + Hall retirement | 0.002s | 0.004s | 0.009s | 0.025s |
| Hub derive (`teamCap`, roster issues, team leaders) | 0.001s | 0.001s | 0.002s | 0.003s |
| `encodeSave` | 0.018s | 0.057s | 0.184s | 0.440s |
| `JSON.stringify` of that document | 0.024s | 0.034s | 0.084s | 0.177s |
| `JSON.parse` of that document | 0.013s | 0.020s | 0.041s | 0.081s |
| Encoded document | 4.07 MB | 5.99 MB | 11.27 MB | 19.23 MB |

The encoded save at this click grows by about 0.54 MB per year (4.07 MB opening 2027 to 19.23 MB opening 2055). Box scores are already gone: `finalizeOffseason` clears `state.games` before the write. The write is under a second at 19 MB. Log length at the 2055 click is 26,774, and housekeeping that trims it is 0.02s. Hall of Fame entries at that click: 156. History rows: 29.

Play Preseason Week is a different click (`preseasonWeeksLeft > 0`). The slowest one in this run was 1.09s, the first preseason week of the 2054 camp. They do not become the multi-minute freeze.

## The second Start the Season

After this click, the phase is `preseason` and the button reads Start the Season again. That one is `advanceSeason` → `startRegularSeason` (`lib/core/season/engine.ts` 40–51, and 185–189): close waivers, build the schedule, refresh depth charts, fill IR holes. It is not `finalizeOffseason`.

| Opens | 2026 | 2030 | 2041 | 2050 | 2055 |
|---|---:|---:|---:|---:|---:|
| Second click | 0.11s | 0.92s | 4.6s | 6.7s | 10.2s |

2041 at 4.6s and 2055 at 10.2s sit in the playtest's 4–25s band for that second round. It grows, and it is a different function. This note does not propose a change to it.

The week loop ("Through the Playoffs") also got slower in this run: 6.9s for 2026, 26.6s for 2030, 72s for 2040, 165s for 2055. `teamOutlook` calls during the whole regular season plus playoffs stay around 40–47k, so that growth is not the cutdown's call-count story. The week was not split into game simulation versus roster scans. It is recorded here and left alone.

## Proposed fix — UNSIGNED

Compute posture once per sort, and count positions once per sort. Both values are constant for the length of that sort, because the sort does not cut anyone until it returns.

1. `surplusWorth` and `quarterbackKeepWorth` take a posture. `worstSurplus`, `cutWorstActiveAt`, and `cutWorstActiveQuarterback` call `teamOutlook` once, then the comparator only calls `evaluate`, `draftCapitalHold`, and `campNudge`. Same posture on every comparison, so the order is the same, the body that is cut is the same, and the RNG draws after the cut are the same.
2. The candidate filter in `worstSurplus` and `cutWorstActiveAt` stops calling `positionCount`. The roster array those functions already built is enough to tally the fifteen positions once. Same minimum check, no walk of the retired pool.

Do this once per sort, not once per club for the whole 37-cut trim. Posture depends on who is still on the roster. A single outlook for every cut of the afternoon can flip contend / retool / rebuild between the first cut and the last, and then the later cuts and their RNG draws move. Once per sort does not.

Do not store the tally or the outlook on `GameState`. Do not drop retired players or old stat rows. The record book is those rows.

At the 2055 click that removes the 304.7s of outlook and the 34.7s of position scans inside the CPU trim, and the same pattern inside the user's 9.0s trim. `refillCpuRostersAfterWaivers` (`contracts.ts` 1529–1541) still calls `positionCount` itself and was 5.3s at that click. If that call site keeps walking `state.players`, it is the new ceiling, and it wants the same one-tally treatment. It is not another algorithm.

Yielding between the 31 clubs, the way Hub sim yields between weeks, would paint 31 times and still sit for about 11s on each club in 2055. The scan is the cost. A spinner does not remove it.
