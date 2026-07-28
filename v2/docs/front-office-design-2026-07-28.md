# The front office: scouting, the draft, and the season

North-star design for the ten systems Matt specified on 2026-07-28, grounded in research
done the same day. This document exists so the ten stay coherent as they get built one at a
time over months. Sources are cited inline; where the research contradicted an assumption
we were building on, that is called out explicitly rather than quietly corrected.

---

## Part 1 — What the research changed

### 1.1 The flat scouting budget premise is wrong

The working assumption was: *because the NFL has a salary cap, every team has roughly the
same scouting budget, so the interesting decision is how you allocate it.*

**The cap covers players only.** There is no CBA provision or league rule limiting spend on
scouting, analytics, coaching or facilities. The cap is computed as ~48% of league-wide
Average Revenue minus player benefits, divided by 32 — a formula that by construction
touches nothing but player compensation ([NFLPA, NFL Economics 101](https://nflpa.com/posts/nfl-economics-101)).
Coaching contracts are typically *fully guaranteed*, unlike most player deals, precisely
because no cap forces thrift.

The real variance is large and well documented:

| | Well-funded | Threadbare |
|---|---|---|
| Scouting | Browns, 17 scouts and scouting assistants | Bengals — deliberately minimal, coach-centric, scouts expected to "mold their opinions to coaches" |
| Analytics | Cowboys added a director + 4 full-time + 2 fellows in one 2023 push; Ravens run a VP-led department | Buccaneers employed **exactly one** full-time analytics staffer — "a one-woman army" |

Sources: [Succeed in Football scouting models](https://succeedinfootball.com/2019/06/04/a-look-at-modern-nfl-scouting-department-models/),
[ESPN 2024 analytics survey](https://www.espn.com/nfl/story/_/id/41328710/nfl-analytics-survey-2024-most-least-analytically-inclined-teams-predictions-stats).

A typical department is 18–24 people (mean ~20.3): area scouts 3–8 (mean 5.75), 1 scouting
coordinator, 1–5 regional/national scouts (mean 2.03), 1–3 directors, 1–5 pro scouts (mean
3.06), plus 2–6 analytics staff (mean 2.91) — from a five-team study of well-regarded
drafting organizations, so read it as directional, not a census.

**The design correction is small and makes the game better, not worse.** Keep the allocation
mechanic exactly as specified — it is the interesting decision. Change only where the budget
number comes from: **the owner sets the size, you decide the split.** That is what OOTP
does, which was the original reference anyway, and it turns owner wealth and temperament
into a real franchise-identity axis instead of flavour text. Taking a job with a cheap owner
means doing more with less; it is a legitimate difficulty setting the player chooses by
accepting a job.

Departments worth making allocable, from the real org chart: **college scouting, pro
scouting, analytics, sports science/medical, coaching staff size**. College vs pro is the
sharpest trade-off because it is directly draft-vs-roster.

### 1.2 The pick-value curve in `trades.ts` is already right

`ROUND_BASE = [0, 90, 40, 22, 13, 8, 5, 3]` with a ±25% slot adjustment prices pick 1 at
about **2.25×** the first pick of round 2.

- Jimmy Johnson chart: **5.2:1** — built in 1990 from trade feel, not data, and wrong.
- Every performance-based chart: **1.8–2.8:1**. Chase Stuart's AV chart, PFF's WAR chart and
  Baldwin's non-QB surplus chart all converge there
  ([Football Perspective](https://www.footballperspective.com/draft-value-chart/),
  [PFF, Revisiting the Loser's Curse](https://www.pff.com/news/nfl-revisiting-the-losers-curse-the-surplus-value-of-draft-picks),
  [Open Source Football](https://opensourcefootball.com/posts/2023-02-23-nfl-draft-value-chart/)).

No refit needed. One addition worth making later: **surplus** value (production per
rookie-contract dollar) peaks around picks **20–45**, not at the top — replicated three
times, originally Massey–Thaler's "loser's curse". Modelling surplus separately from
absolute value is what would make an analytics-forward CPU club trade *down* out of the top
five, which is a real and currently missing behaviour.

### 1.3 The GM career ladder is real, and the data is better than the design

The firing-and-rehiring system specified — fail badly and your next offer is a scouting job,
build back up — is not a game convention. It is what actually happens.

- **88% of GM hires are first-time GMs. 72% of sitting GMs came from scouting backgrounds**,
  rising to 78% among recent hires. 66% are hired from outside the organization
  ([Sportico/Sportsology](https://www.sportico.com/leagues/football/2023/nfl-owners-front-office-hiring-1234699871/)).
- **Mean GM tenure is ~2.1 years — the lowest of the five major US leagues.** 53% of
  franchises changed their top football-ops executive within a five-year window. 70% of
  terminations and 91% of hires happen in December–January, so the cycle is brutally
  compressed.
- **Head coach tenure runs 3.2–3.9 years**, heavy-tailed rather than normal: 32 one-and-done
  coaches since the 1970 merger, against a handful of 15–28 year tenures. 60% of coaches
  fired within their first three years were gone inside two.
- **The ladder, from a completed real career** — Adam Peters to the Commanders job: football
  ops assistant → scouting assistant → area scout (4 yrs) → regional/national scout (6 yrs)
  → assistant director of college scouting → director of college scouting → VP of player
  personnel (5 yrs) → assistant GM → GM. **22 years, eight rungs, three organizations.**
- **The demotion-and-return path exists too.** Trent Baalke: fired as 49ers GM (2016) →
  hired by Jacksonville as *Director of Player Personnel*, a title demotion (2019) →
  promoted back to GM (2021) → fired again (2025). Scot McCloughan went from Washington GM
  to Browns draft consultant. Rick Spielman went fired → media → informal advisor → Jets
  senior advisor over about three years.
- **Retreads are worse, and it is not close.** Of 469 head-coach hires since 1960, 30% were
  retreads. First-timers won a playoff game 30.5% of the time and a championship 11.6%;
  retreads managed 12.8% and 5.7% — **roughly half the title rate**. 38 of 46 championship
  coaches won it with their first team
  ([The Cap Is Fake](https://thecapisfake.com/2023/07/13/should-nfl-teams-hire-retread-head-coaches/)).

**Design implication:** the job market should be a real market with the above as its
generative model, and the reputation that gets you hired should be *separable from wins* —
which brings us to the case that validates the whole relationship system.

### 1.4 Record does not protect you — the case that proves the relationship model

In January 2026 the Vikings fired GM Kwesi Adofo-Mensah **with the fifth-best record in the
NFL**, eight months after signing him to an extension. The stated reason was a four-year
draft audit: one clear hit among eight top-100 picks, plus a shaky verdict on the quarterback
he chose after letting Sam Darnold walk — Darnold then took another team to the Super Bowl
([CBS Sports](https://www.cbssports.com/nfl/news/vikings-lack-of-draft-success-kwesi-adofo-mensah-surprise-firing/)).

This is the single best argument for the specified design: **the owner evaluates you on his
own model, not on your record.** A meddling owner who wanted a quarterback and watched you
take a linebacker is running exactly the evaluation the Vikings ran. Ownership should
maintain its own running assessment — draft record, cap health, the quarterback question,
promises kept — and wins should be only one input.

Structural finding worth building in: across 175 GM/HC pairings (2002–2025), pairs **hired
together** averaged 4.89 years and survived 3+ years 76.9% of the time; where the coach was
hired *before* the GM, the average was 2.21 years and 52.2% were gone inside two
([Scouting Academy](https://scoutingacademy.com/nfl-gm-search-data/)). Inheriting someone
else's coach should be a visible, mechanical handicap.

---

## Part 2 — The four structural decisions

The ten items are not ten features. They are consequences of four decisions. Get these
right and the rest is additive; get them wrong and each item is a rewrite.

### D1. Belief is a universal layer — `(evaluator, player) → estimate`

Not `(team, prospect)`. Scouting spans prospects, active players and free agents, so belief
is a permanent layer over the whole population, and **`evaluate()` takes a belief, never a
`Player`.** Today it reads `p.ovr` and `p.pot` directly, for re-signings, free agency *and*
trades — so imperfect information is a league-wide change, not a draft feature.

Real front offices already work this way. Pro scouts maintain a running colour-coded grade
on **their own roster** — blue = Pro Bowler, red = starter, purple = backup, orange =
marginal — and full evaluation databases on all 31 other rosters
([The Ringer](https://www.theringer.com/nfl/2017/8/24/16195480/life-of-pro-scouts)). Three
information regimes fall out naturally:

| Population | Regime |
|---|---|
| Your own roster | Near-exact — you see them every day |
| Other clubs' players | Coarse, sharpened by pro scouting spend |
| Draft prospects | Public consensus, overridden by what you scouted |

The public-consensus layer matters: teams do not start blind, they start from a shared board
and pay to disagree with it. And they genuinely do disagree — *"No two Draft Boards are
alike. One club's first-round-graded player may be graded as a third-round prospect by
another club"* ([Windy City Gridiron](https://www.windycitygridiron.com/2022/10/22/23416414/how-nfl-teams-create-their-draft-board-misconceptions-that-process-scout-gm-ncaa-college-prospect)).

The Eagles took DK Metcalf off their board before day three over a neck fusion; Seattle drafted
him 64th and got a star. Medical divergence between clubs is real, not a game contrivance.

### D2. Every evaluator is the same function with different parameters

This is the decision that saves the most work. Give the owner, head coach, coordinators,
scouting director and star players each their own accuracy, positional bias, scheme
preference and risk appetite, and then:

- **Recommendations emerge.** "The owner loves this quarterback" is not a feature — it is the
  owner's evaluator ranking that quarterback first.
- **Pros and cons emerge.** Each recommender's stated case is just the terms of their own
  evaluation, printed.
- **The relationship hit emerges.** conviction × influence × distance-from-their-board.

Items 5 and 6 cost maybe a fifth of what they look like — but only if this is built once as
a parameterised function rather than four bespoke systems.

Note that evaluator *accuracy* and evaluator *bias* are different dials, and both are real:
a scout can be well-calibrated but scheme-blinkered, or sharp-eyed but reckless.

### D3. Scheme fit is an input to evaluation, not a modifier on a rating

The zone-read back in a West Coast offense has to reach four places: depth-chart selection,
progression rate, morale, and *each evaluator's valuation* — which is what makes the same
player a steal to one club and a reach to another. Bolted on later as a rating multiplier,
none of that works.

**Stubbed for now** at a neutral 1.0, per Matt — but the parameter must be in the evaluation
signature from day one so it can be switched on without touching every call site. v1 wrote
2,761 lines of scheme fit and wired none of it; the lesson is that the plumbing, not the
matrix, is the hard part.

### D4. Events are structured data, not log text

`state.log` was trimmed on 2026-07-27 to what it actually is: a 40-line news feed. Media,
fan reaction, draft grades, "remember when you passed on him" callbacks and the buildup to
draft day all need subject / type / sentiment / actors — a queryable event stream. Do not
build item 4 on the log.

---

## Part 3 — The ten items

| # | Item | Falls out of | Notes |
|---|---|---|---|
| 1 | Unified ratings across prospects / actives / FAs | **D1** | Scale is *already* aligned — `generateDraftClass` calls the same `makePlayer` as the veteran generator with a `targetOvr`. The work is belief, not ratings. |
| 2 | Structured scouting department and front office | **D1 + D2** | Department *sizes* become the allocation decision (§1.1); staff skills become evaluator parameters. |
| 3 | Scheme fit drives progression, playing time, morale, evaluation | **D3** | Stubbed. Signature only. |
| 4 | Media, buildup, fan reaction, draft grades | **D4** | Needs the event stream first. |
| 5 | Relationships, owner meddling, termination | **D2** | Owner runs his own evaluation; see §1.4. Firing is a toggle. |
| 6 | Pros/cons and multi-source recommendations | **D2** | Emergent — near-free once D2 exists. |
| 7 | Multi-year big board | **D1** | Generate 3 classes deep. `pickOwners` already carries a 3-season horizon, so future-pick value can respond to perceived class strength — which is the point. |
| 8 | Draft day as a robust event | D1+D2+D4 | Depends on everything. Build last. |
| 9 | Post-draft calendar and rookie progression matched to real outcomes | calibration | See Part 4. |
| 10 | UDFAs, likewise calibrated | calibration | See Part 4. |

---

## Part 4 — Calibration targets

These are the numbers items 9 and 10 must hit. Tiering: **A** = replicated across independent
studies, **B** = single study with clear methodology, **C** = one analyst's estimate, verify
before hard-coding.

### 4.1 Draft outcomes by round

Definition matters enormously — "reached two-thirds of a full-time starter's snap share in
four years" and "signed a second contract with the drafting club" produce different
rankings. Both are useful; pick one per guard and say which.

| Round | Second contract with drafting team | Tier |
|---|---|---|
| 1 | 40–47% | **A** — two independent studies |
| 2 | 10–15% | **A** |
| 3 | ~14% | B |
| 4–6 | ~9% | B |
| 6–7 | ~1.5% | B |

Round 1 bust rate (average AV/yr < 5): **~50%**, and it has never exceeded 55% in any single
class. Round 1 "upper tier" (AV/yr ≥ 7): ~30%, never above 40%.

### 4.2 Hit rate by position — round 1, snap-share definition (Tier B)

| Pos | R1 | R2 | Δ |
|---|---|---|---|
| TE | 73.3% | 32.6% | −41 |
| OT | 73.0% | 33.8% | −39 |
| S | 71.4% | 43.8% | −28 |
| iOL | 70.0% | 48.6% | −21 |
| QB | 63.3% | **12.8%** | **−51** |
| DI | 63.2% | 20.7% | −43 |
| RB | 60.6% | 35.3% | −25 |
| LB | 57.9% | 30.3% | −28 |
| WR | 56.9% | 26.3% | −31 |
| CB | 50.0% | 24.1% | −26 |
| EDGE | 49.3% | 18.2% | −31 |

Two things to implement from this. **Quarterback has by far the steepest cliff** — a
first-round quarterback is a coin flip with good odds; a second-round quarterback is close to
a lottery ticket. And **interior offensive line barely cares about round**, which is why
guards should be cheap to acquire and boring to draft early.

**Running backs at the top of round 1 bust at 50–56%** — the worst of any position, and Tier
**A**: three independent samples spanning 1986–2010, 2001–2010 and 2000–2024 all agree.

### 4.3 Positional value (PFF WAR, top 10 per position)

QB 2.513 · WR 0.701 · S 0.604 · CB 0.517 · TE 0.343 · iOL 0.321 · OT 0.297 · EDGE 0.278 ·
LB 0.276 · RB 0.217 · DI 0.187.

**Quarterbacks generate roughly 3× the value of any other position.** Note this conflicts
with the popular "QB, edge, tackle" hierarchy — WAR-based measures put corner and safety
*above* edge and tackle. That is a genuine disagreement in the literature, not an error;
`POSITION_VALUE` should pick a side deliberately and the doc should say which.

### 4.4 UDFAs (item 10)

- ~**20%** make an opening 53-man roster or IR; ~**40%** are still with a club after cutdowns
  including the practice squad. So roughly **60% are gone within a year.**
- Games started per season, tracked over a decade: **round 1 = 10.0, round 7 = 1.87, UDFA =
  1.80.** A seventh-round pick and a good undrafted free agent are, empirically, the same
  thing.
- Over 2019–2023, **429 UDFAs reached starting lineups — more than round 4 produced.**
- **44% of UDFA Pro Bowlers were special teamers**, against under 1% of drafted Pro Bowlers.
  If the game ever values special teams, this is where it pays off.
- Contracts: three years at minimum, with a **team-wide UDFA signing-bonus pool of ~$172k**
  and individual guarantees topping out around $255–300k. The bidding is over guarantees,
  not salary, and it happens within minutes of the draft ending.

### 4.5 Age and development

- **Age at draft is a real negative signal**, strongest where processing and explosiveness
  matter: a 24-year-old prospect is worth roughly −36% (QB), −29% (WR), −24% (RB), −17%
  (EDGE), against −5% (iOL) and −9% (CB/LB). Tier **C** — one source, verify before
  hard-coding, but the direction is consistent with the wider breakout-age literature.
  Prospects are currently generated at age 21–23, so the hook exists.
- **Peak ages:** RB 26 with the steepest decline of any position (~65% of peak by 30); WR
  26–28, steep by 32–33; TE minimal decline until 31; QB flattest.
- **Do not build one global aging curve.** At age 36+, quarterbacks are 34% of all
  200+-snap players against 3.8% of the population — any aggregate curve is dominated by
  surviving elite quarterbacks. Position-specific, survivorship-corrected, or it is wrong.
- **Sitting a rookie quarterback does not help.** Adjusted for draft position, QBs who played
  immediately outperformed those who sat (fifth-year option rates 73.3% vs 43.8% vs 16.7%
  for played / sat-then-started / sat all year). The apparent benefit is selection bias —
  the sitters were drafted onto better teams.

### 4.6 Gaps — do not invent numbers here

No sourced base rate exists for **when a bust becomes identifiable** (year 1 vs 2–3), for
**late-bloomer prevalence**, or for a clean **round × position rookie snap-share matrix**.
Team-level scouting and analytics budgets are not publicly disclosed anywhere; the one
public estimate ($2–3M/yr per club on scouting) is a single former agent's figure. Treat all
of these as tunable model parameters, flagged as such, not as facts.

---

## Part 5 — The calendar (items 3, 8, 9)

The real calendar supplies the gates. The design principle from the domain brief holds:
**every phase owes the player one or two hard decisions, not a screen to visit.**

| Phase | Real constraint | The decision |
|---|---|---|
| Season ends | Offseason unlocks by elimination week — staggered ~5 weeks | — |
| Coach/GM hiring | Playoff-team candidates unavailable until eliminated; Super Bowl blackout; Rooney Rule floor of 2 external diverse candidates for HC/GM | Fire or retain; move early for the pool or wait for a better candidate |
| Franchise tag | ~Feb 17 – Mar 3. Exclusive / non-exclusive / transition, one per club per year. Extension deadline July 15 | Tag, extend, or let him walk |
| Combine | Late Feb, ~319 invited. **45 formal interviews of 18 minutes each** — a hard, scarce budget | Which 45 prospects get a sit-down |
| Pro days / visits | **30 top-30 visits**, local prospects exempt | Allocate 30 slots — and teams really do burn slots as misdirection |
| Legal tampering | 2-day window before the league year | Non-binding handshakes before the cap gate |
| Free agency | Cap compliance at 4pm on league-year day. Comp-pick formula keys off signings before the Monday after the draft | Every signing silently moves next year's comp picks |
| Draft | 3 days. **R1 clock cut to 8 minutes for 2026**, R2 7, R3–6 5, R7 4. Trades must be phoned in before the clock hits zero | The board; trade up or down under a real clock |
| Post-draft | UDFA signing starts instantly; rookie minicamp; fifth-year option by May 1 of year 4 | The UDFA sprint; the option bet |
| Offseason program | 9 weeks, 3 CBA phases, 10 OTA days, mandatory minicamp. Phase 1 has no footballs | Attendance risk; injury risk scales by phase |
| Camp → cutdown | 90 → 53 in a **single cut**; everyone cut passes through waivers before you can stash him | The highest-stakes roster decision of the year |
| Practice squad | 16 (+1 international), max 6 vested veterans, **3 elevations per player**, unlimited in playoffs | A real per-season resource to budget |
| Regular season | 17 games / 18 weeks. **47 actives, or 48 with 8 offensive linemen.** IR: 8 return designations, min 4 games missed | Weekly legality; IR triage — burn a return slot or bury him |
| Trade deadline | ~Week 9–10 | Buy or sell |

Scouting runs weekly through all of it, per the decision on 2026-07-27. The real scout year
supports this exactly: training-camp visits in August, live games September–November,
regional top-30 presentations in December, then **cross-check** rotation where scouts grade
players *outside* their own territory, all-star games in January, combine and pro days in
February–March, board locked in April.

---

## Part 6 — Build order

Ordered by what unblocks the most, not by what is most fun.

1. **The belief layer (D1).** `evaluate()` takes a belief. Consensus board on the player,
   private beliefs on the team, three information regimes. Scouted potential alongside
   scouted OVR, and `cpuBoardValue` stops reading true `p.pot`. Guards: scouting reduces
   error; boards differ across clubs; scouting one player leaks to nobody; draft outcomes
   land in the §4.1 bands.
2. **Weekly scouting economy.** Points accrue in `advance()`; CPU clubs spend by archetype
   and posture. Department allocation, owner-set budget. Close the attribute-panel leak on
   the player page.
3. **The evaluator function (D2).** One parameterised evaluator; owner, coach and scouting
   director instantiated from it. Recommendations printed from their own terms.
4. **Relationships and the job market.** Owner assessment separate from record. Firing as a
   toggle. The ladder from §1.3 as the rehiring model.
5. **Multi-year boards.** Three classes deep; class strength feeds future-pick value.
6. **Structured events (D4).** Then media, fan reaction, draft grades on top.
7. **Draft day.** The clock, in-draft trades, the war room.
8. **Calendar depth.** Combine interviews, top-30 visits, the offseason program, practice
   squad and elevations.
9. **Scheme fit.** Switch on the stub.

Rule carried over from the v1 post-mortem, which is the single most useful thing in it:
**nothing new gets written until the thing it depends on is reachable from a page.** v1
produced roughly 30,000 lines of finished, documented, unreachable subsystems — scheme fit,
progression, relationships, pro scouting, the cap engine, CPU scouting — and that, not a
shortage of features, is why it had to be rebuilt.
