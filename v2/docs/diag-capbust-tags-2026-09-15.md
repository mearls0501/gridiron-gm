# Diagnosis: `drift.capBustSeasons` 0.40 on the 748036a panel — 2026-09-15

Claude diagnosis lane (assigned in the Wave 3.9 Packet 1 table). Read-only.
Probe: `v2/capbust-probe.ts` (attached), run at `748036a` on panel seed 3
(`GG_SEED=3` → drift seed `1520852267`), 20 seasons, recording the five
largest cap hits in the league every recap with contract provenance.
Raw output: `capbust-probe-seed3-748036a.txt`.

## The finding, in one line

**Every contract that approaches or crosses 28% of the cap is a CPU club's
third consecutive franchise tag on a quarterback.** The 144% escalator
applied to a tender that was already near the contract ceiling is what
produces 27.7% / 27.8% / 28.0%. Nothing else in the money layer gets near
the line.

## What the probe shows

Top cap hit by season (seed 3, `748036a`):

| season | top hit | who | mechanism |
|---|---:|---|---|
| 2029 | 25.5% | QB 87, DET | tag n2 (120% of a 21% hit) |
| 2029 | 25.0% | QB 88, CHI | tag n3 |
| 2031 | 24.9% | QB 86, GB | tag n1 at a new club, 120% of the n2 tender he carried |
| 2035 | 27.8% | **QB 81**, DEN | tag n3 |
| 2039 | 27.7% | **QB 78**, SF | tag n3 |
| 2041 | 26.7% | QB 81, LV | tag n3 |
| 2045 | **28.0%** | QB 82, KC | tag n3 — the bust season |

96 of the 100 top-five rows over 20 seasons are quarterbacks; 10 of them
are third-consecutive tags. The panel's 0.40 (0/0/2/0/0) is this seed's
27.7–28.0 cluster sitting on the knife edge of the 28% backstop; the probe
reproduces one of the two on a straight re-run, and the other is the same
family — three of the four n3 tags in this run are within 0.3 points of the
line.

Note who is being tagged three times at 28% of the cap: a **78**, an
**81**, an **82**. Not the league's best quarterbacks — its ordinary
starters. That is the tell that this is a pricing leak, not a market.

## Why the price test does not catch it

`runCpuFranchiseTags` (#71) prices a tag three ways: it must fit next
season's headroom, the club must not be a rebuild, and
`surplusExceedsTender` — the player's `evaluate()` surplus must exceed the
tender in trade currency. That last test is the one that leaks. `evaluate()`
multiplies ability-above-replacement by `POSITION_VALUE`, and at QB that is
3.4×, so an 80-OVR starting quarterback's surplus is larger than any tender
the escalator can produce. The test is doing what it says; it is just that
at quarterback the surplus number is always bigger than the money number.

The first-tag formula is the published CBA one (max of the top-five
snapshot or 120% of last year's hit) and is correct. The 120% / 144%
escalators are the published ones and are correct. What real clubs do
differently is not in the code: **no club tags a player above the market
ceiling — it extends him or lets him walk.** The largest franchise tender
in NFL history was 20.7% of the cap (Dak Prescott, 2021, $37.7M on
$182.5M); the second-highest tenders sit at 17–19%. Third consecutive tags
have effectively never been applied, because 144% of a top-of-market
salary is uneconomic — which is exactly the case the CPU is taking here.

## Recommendation (escalate class — Matt signs)

**One rule, one existing authority:** a CPU club does not apply a tag whose
tender exceeds `MAX_CONTRACT_SHARE` (22%) of the cap. Below it, the price
test stands as signed. Above it, the club falls through to the ordinary
`cpuResign` path in the FA open — extend at or under the ceiling, or let
him reach the market. No new constant; the same ceiling that already
governs every other CPU contract (#88). The user's own tag path is not
bound — it is their cap and their choice, and the 28% guard measures CPU
behaviour.

What this does, mechanically: every n3 QB tag disappears (144% of any hit
above 15.3% clears 22%), most n2 QB tags disappear (120% of any hit above
18.3%), and first tags on quarterbacks already at the ceiling disappear —
those clubs extend instead, which is what the reference says they do.
Non-QB tags are untouched: a 22% tender never arises outside QB.

Predicted panel effects, to be read not tuned toward:

- `drift.capBustSeasons` → 0 structurally: the highest CPU cap hit is
  bounded by 22% and cannot reach 28%.
- `drift.topCapPctMean` → ~20–21 from 22.1 (the 25–28% tags leave the mean).
- `drift.franchiseTagsPerSeason` → down from 16.6, probably to the 11–14
  range. This is a consequence of a sourced behaviour rule, not a tune
  toward the band; report it as such.
- `statcheck` / `calibrate` year-0: byte-identical (no tag is applied in
  year 0 before the first recap — verify, do not assume).
- Stream: `runCpuFranchiseTags` already runs on
  `featureChildRng(state, "franchiseTags")`; skipping a club in the loop
  consumes nothing from the parent. Should be byte-identical on the parent
  stream — the packet's gate proves it or it becomes a solo packet + panel.

What I would **not** do: raise the 28% backstop, cap consecutive tags at
two by fiat, or touch the escalators. The escalators are published; the
backstop is the guard that found this; and a two-tag cap is redundant once
the ceiling rule exists (a third tag on anyone worth tagging always clears
22%) while leaving the n2-at-25% case open.

## Packet spec (for Grok, after the post-Phase-4 panel)

BRANCH `<agent>/g-tag-ceiling`. YOU OWN: `lib/core/offseason/contracts.ts`
`runCpuFranchiseTags` (one `continue` before `tenderFitsHeadroom`:
`if (tender > MAX_CONTRACT_SHARE * teamCap(state, t.id).cap) continue;`),
`nfl-reference.md` §4 (add the Prescott 2021 20.7% figure as the largest
real tender and the rule statement), a regression case in the existing
franchise-tag test (plant an 85-OVR QB with a 21% hit expiring; assert the
CPU does not tag him and `cpuResign` extends him at ≤ 22%; plant a 19% WR
and assert the tag still applies). DO NOT TOUCH: `franchiseTagSalary`,
`applyFranchiseTag`, escalators, `MAX_CONTRACT_SHARE`, the user tag path,
`baselines.json`. Gate: fast tier byte-identical on calibrate / statcheck /
careers; `drift 12` showing `capBustSeasons 0` and the tag count; then the
panel. Report `franchiseTagsPerSeason` from that panel with the note above.

## Measurement notes

- Reproduce a panel finding at the panel's SHA and seed, not on `main`:
  three Phase 4 lanes merged since `748036a`; the worktree trick
  (`git worktree add /home/claude/gg-88 748036a`) is what made this a
  20-minute probe instead of a guess.
- A backstop at a round number will read 0/0/2/0/0 when the true
  population sits at 27.7–28.0. The knife edge is the finding; the count is
  noise around it.
