import { SCHEMES, evenBudget } from "./staff";
import { Rng, clamp } from "./rng";

/**
 * How much wider a projected ceiling runs than the growth actually paid out.
 * Paired with a mean realisation of 0.5 in `makePlayer`, so the league's
 * equilibrium is unchanged and only the variance moves.
 */
export const POT_SPREAD = 2.0;
import { makeName, makeCoachName, FRANCHISES } from "./names";
import { computeOvr, relevantAttrs, POSITION_VALUE } from "./ratings";
import { blankRecordBook } from "./season/records";
import { assignFrontOffices } from "./frontOffice";
import {
  Attributes, ATTR_KEYS, Coach, Contract, GameSettings, GameState, LEAGUE_MINIMUM, Player,
  POSITION_TARGET, Position, POSITIONS, ROSTER_LIMIT, STATE_VERSION, Team,
  salaryCap, defaultSettings,
  MAX_CONTRACT_SHARE,
} from "./types";

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

function blankAttrs(): Attributes {
  const a = {} as Attributes;
  for (const k of ATTR_KEYS) a[k] = 50;
  return a;
}

/**
 * Build an attribute set whose computed OVR lands on `target`.
 *
 * Relevant attributes are drawn around the target; irrelevant ones around a
 * league-average 50 so a punter isn't secretly a great cornerback. A single
 * correction pass shifts the relevant attributes to close any residual gap,
 * which keeps computeOvr(attrs) within ~1 of target for every position.
 */
export function generateAttrs(rng: Rng, pos: Position, target: number, spread = 7): Attributes {
  const attrs = blankAttrs();
  const rel = new Set(relevantAttrs(pos));

  for (const k of ATTR_KEYS) {
    if (rel.has(k)) {
      attrs[k] = clamp(Math.round(rng.normal(target, spread)), 20, 99);
    } else {
      // Athletes are athletes: physical traits still track ability a little.
      const base = k === "spd" || k === "acc" || k === "agi" || k === "str" || k === "sta"
        ? 40 + target * 0.35
        : 45;
      attrs[k] = clamp(Math.round(rng.normal(base, 10)), 15, 90);
    }
  }

  // Correction pass so the derived OVR matches the intended target.
  const relKeys = [...rel];
  for (let iter = 0; iter < 4; iter++) {
    const gap = target - computeOvr(attrs, pos);
    if (Math.abs(gap) <= 0) break;
    for (const k of relKeys) {
      attrs[k] = clamp(Math.round(attrs[k] + gap), 20, 99);
    }
  }

  return attrs;
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

/**
 * Market value in dollars per year for a player of this ability, position and
 * age. Convex in OVR — stars cost disproportionately more, which is what makes
 * "three good players or one great one" an actual decision.
 */
export function marketApy(ovr: number, pos: Position, age: number, season: number, startSeason: number): number {
  const cap = salaryCap(season, startSeason);
  const posMult = POSITION_VALUE[pos];

  // 0 at ovr 55, rising sharply past 80.
  const quality = Math.max(0, (ovr - 55) / 40);
  const curve = Math.pow(quality, 2.4);

  // Age discount: peak earning 25-29, steep falloff after 31.
  let ageMult = 1;
  if (age <= 23) ageMult = 0.88;
  else if (age <= 29) ageMult = 1;
  else if (age <= 31) ageMult = 0.88;
  else if (age <= 33) ageMult = 0.7;
  else ageMult = 0.5;

  // The raw convex curve, as a share of the cap.
  const raw = 0.135 * curve * posMult * ageMult;

  // Soft ceiling.
  //
  // The comment this replaces claimed 0.135 was "tuned so an elite QB lands
  // near 20% of the cap". That is true at 85 OVR and nowhere above it: the
  // curve is unbounded, so a 95 wanted 46% of the cap and a 99 wanted 58%, and
  // the highest single hit observed in a twenty-season run was $207M against a
  // $431M cap. No league has ever paid one man half its payroll.
  //
  // Below the knee the price is untouched — the convexity is the point, it is
  // what makes "three good players or one great one" a real decision. Above
  // it, price saturates toward a positional ceiling: ~26% of the cap for a
  // quarterback, ~16% for an edge rusher, ~14% for a receiver.
  const ceiling = 0.26 * Math.pow(posMult / 3.4, 0.7) * ageMult;
  const knee = ceiling * 0.62;
  const frac =
    raw <= knee
      ? raw
      : knee + (ceiling - knee) * (1 - Math.exp(-(raw - knee) / (ceiling - knee)));

  const apy = cap * frac;
  return Math.max(LEAGUE_MINIMUM, Math.round(apy / 50_000) * 50_000);
}

/** Guarantees scale with the size of the deal, not a flat two years. */
export function defaultGuaranteedYears(apy: number, years: number): number {
  const g = apy > 12_000_000 ? 2 : apy > 4_000_000 ? 1 : 0;
  return Math.min(g, years);
}

/**
 * The signing bonus a deal of this size carries.
 *
 * Split out of `makeContract` so free agency can price a BID without building
 * the contract — a bid has to show its guarantee before anyone has agreed to
 * it, and duplicating this formula there would let the two drift apart.
 * Deterministic: no RNG, same inputs always give the same bonus.
 */
export function signingBonusFor(apy: number, years: number): number {
  // Bigger deals carry proportionally more bonus.
  // Capped lower than real NFL megadeals: at 45% a freshly-signed star carried
  // three times his cap hit in dead money, which made him literally un-cuttable
  // and turned one misclick into an unrecoverable franchise.
  const bonusPct = clamp(0.14 + (apy / 30_000_000) * 0.14, 0.12, 0.32);
  return Math.round((apy * years * bonusPct) / 50_000) * 50_000;
}

export function makeContract(
  rng: Rng, apy: number, years: number, season: number, guaranteedYears = 0
): Contract {
  const total = apy * years;
  const signingBonus = signingBonusFor(apy, years);
  const prorationYears = Math.min(years, 5);
  const annualProration = signingBonus / prorationYears;

  const baseTotal = total - signingBonus;
  const baseSalary: number[] = [];
  // Escalating base salaries, normalized to hit baseTotal exactly.
  const weights: number[] = [];
  // Escalation, but gently. At 0.75 + 0.22i the last base of a five-year deal
  // was 27% of the base total, and stacked on the prorated bonus that made the
  // peak season charge 1.28x the average — so a contract at the 25%-of-cap
  // ceiling billed 32% in its final year and tripped the cap guard. Real deals
  // do escalate (it is what makes the back end cuttable), so the shape stays;
  // only the slope changes. Peak is now ~1.06x the average.
  for (let i = 0; i < years; i++) weights.push(0.94 + i * 0.04);
  const wSum = weights.reduce((a, b) => a + b, 0);
  let assigned = 0;
  for (let i = 0; i < years; i++) {
    let v = Math.round((baseTotal * weights[i]) / wSum / 10_000) * 10_000;
    v = Math.max(LEAGUE_MINIMUM, v);
    baseSalary.push(v);
    assigned += v;
  }
  // Absorb rounding drift into the final year.
  const drift = baseTotal - assigned;
  baseSalary[years - 1] = Math.max(LEAGUE_MINIMUM, baseSalary[years - 1] + drift);

  void annualProration;
  void rng;

  return {
    years,
    yearsRemaining: years,
    baseSalary,
    signingBonus,
    bonusProrationYears: prorationYears,
    signedSeason: season,
    guaranteedYears: clamp(guaranteedYears, 0, years),
  };
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export interface MakePlayerOpts {
  pos: Position;
  targetOvr: number;
  age: number;
  season: number;
  prospect?: boolean;
  potBoost?: number;
}

export function makePlayer(rng: Rng, id: number, o: MakePlayerOpts): Player {
  const { firstName, lastName } = makeName(rng);
  const attrs = generateAttrs(rng, o.pos, o.targetOvr);
  const ovr = computeOvr(attrs, o.pos);

  // Younger players have more room; potential is never below current.
  //
  // This number is the single biggest lever on the league's long-run talent
  // level. At 1.6 points of headroom per year to peak, essentially every
  // prospect grew into a starter and the 85+ population grew six-fold over
  // twenty seasons. Most prospects have to fall short of their ceiling for the
  // ceiling to mean anything.
  const yearsToPeak = Math.max(0, 27 - o.age);
  // `pot` is the PROJECTION — the ceiling a scout would put on him — and it is
  // deliberately drawn twice as wide as the growth the league actually pays
  // out. `ceiling` is what he really tops out at: a share of that projection,
  // drawn per player and hidden forever.
  //
  // The two together preserve the league's equilibrium (mean realisation of
  // 0.5 against a doubled projection is the same expected growth as before)
  // while making the SPREAD enormous. Same projected ceiling, two players, and
  // one of them never gets there.
  // Growth scales with talent. It used to be a flat additive, so a 50 OVR camp
  // body was handed the same expected +14 as an 80 OVR blue chip and simply
  // caught up — which is why a seventh-round pick became a multi-year starter
  // 17% of the time against a real 5.9%. A marginal prospect has a low floor
  // AND a low ceiling; that is most of what makes him marginal.
  // Centred so a league-average player (~68 OVR) scales at 1.0 and the league's
  // total growth is unchanged. Centring it at 42/32 instead deflated mean OVR
  // by 1.9 points over 20 seasons and tripped the inflation guard — the SHAPE
  // was right and the LEVEL was wrong, which is a distinction worth keeping in
  // mind for anything that touches progression.
  const talentScale = clamp((ovr - 42) / 26, 0.30, 1.30);
  const rawPot = ovr + rng.normal(
    (yearsToPeak * 1.15 + (o.potBoost ?? 0)) * POT_SPREAD * talentScale,
    5 * POT_SPREAD * talentScale
  );
  const pot = clamp(Math.round(Math.max(ovr, rawPot)), ovr, 99);
  // Capped at 1, not 1.1.
  //
  // `realize` is the share of his projected growth this particular man
  // actually gets, so anything above 1 is a player who beats the ceiling his
  // own projection put on him. At 1.1 it happened to about one player in
  // fifty, by up to two points — invisible while nothing depended on it, and
  // load-bearing now that it does: the whole argument that staff investment
  // cannot manufacture a roster of late-round Pro Bowlers is that `pot` is a
  // wall, and a wall with a hole in it is a suggestion. The spread that makes
  // two identical prospects turn out differently comes from the 0.34 standard
  // deviation, not from the top of the clamp.
  const realize = clamp(rng.normal(0.50, 0.34), 0, 1);
  const ceiling = clamp(Math.round(ovr + (pot - ovr) * realize), ovr, pot);

  return {
    id,
    firstName,
    lastName,
    pos: o.pos,
    age: o.age,
    teamId: null,
    attrs,
    ovr,
    pot,
    // Wide on purpose: a tight distribution meant every player developed at
    // roughly the same rate and therefore every player reached his ceiling.
    // Busts are what make a scouting report worth reading.
    ceiling,
    devSpeed: clamp(rng.normal(0.92, 0.32), 0.30, 1.65),
    peakAge: Math.round(clamp(rng.normal(o.pos === "RB" ? 26 : 28, 1.8), 24, 32)),
    durability: clamp(Math.round(rng.normal(70, 15)), 20, 99),
    contract: null,
    yearsPro: Math.max(0, o.age - 22),
    retired: false,
    prospect: o.prospect ?? false,
    draftClassSeason: o.prospect ? o.season : null,
    scouted: 0,
    scoutedOvrLow: null,
    scoutedOvrHigh: null,
    draftedRound: null,
    draftedPick: null,
    injuryWeeks: 0,
    injuryDesc: null,
    stats: [],
    careerAwards: [],
  };
}

// ---------------------------------------------------------------------------
// Coaches
// ---------------------------------------------------------------------------

export function makeCoach(rng: Rng): Coach {
  return {
    name: makeCoachName(rng),
    offense: clamp(Math.round(rng.normal(60, 14)), 25, 95),
    defense: clamp(Math.round(rng.normal(60, 14)), 25, 95),
    development: clamp(Math.round(rng.normal(60, 14)), 25, 95),
    aggression: clamp(Math.round(rng.normal(50, 18)), 10, 95),
    passBias: clamp(rng.normal(0, 0.125), -0.30, 0.30),
    shadowTendency: clamp(rng.normal(0.42, 0.26), 0, 0.95),
  };
}

// ---------------------------------------------------------------------------
// Roster construction
// ---------------------------------------------------------------------------

/**
 * OVR targets for the Nth-best player at a position on a given team.
 * Produces starters in the 70s-80s, real stars, and replacement-level depth.
 */
function rosterSlotOvr(rng: Rng, pos: Position, depthIndex: number, teamStrength: number): number {
  // teamStrength ~ N(0,1): good franchises get better players.
  // The multiplier controls league parity. At 4.5 the best and worst teams were
  // separated by 15 OVR points at every starting spot, which produced a scoring
  // range of 11-34 per game against a real NFL spread closer to 14-30.
  //
  // The rest of these numbers exist to make season one look like season
  // fifteen. Left alone, a generated league opened with ONE player above 90 and
  // a bench that bottomed out in the 40s, then drifted up three and a half OVR
  // points over twenty seasons as the progression system pulled it toward its
  // own equilibrium. That drift is not the simulation being wrong — it is the
  // starting league being wrong. So the opening roster is generated at the
  // level the league settles at: a slightly fatter star tail, and depth that
  // sits at the replacement level the roster filler actually signs.
  const starterBase = 76.2 + teamStrength * 3.15;
  const decay = pos === "QB" ? 11 : 5.1;
  const base = starterBase - depthIndex * decay;
  // Wider at the top of the chart: stars are the tail of the distribution, and
  // a uniform spread produced a league whose best player was a 92.
  const sd = depthIndex === 0 ? 6.6 : 5.5;
  return clamp(Math.round(rng.normal(base, sd)), 47, 99);
}

function makeRosterForTeam(
  rng: Rng, state: GameState, team: Team, teamStrength: number
): void {
  const created: Player[] = [];

  for (const pos of POSITIONS) {
    const count = POSITION_TARGET[pos];
    for (let i = 0; i < count; i++) {
      const target = rosterSlotOvr(rng, pos, i, teamStrength);
      // Age curve: starters skew prime, depth skews young.
      const age = clamp(Math.round(rng.normal(i === 0 ? 27 : 25.5, 3.2)), 21, 37);
      const p = makePlayer(rng, state.nextPlayerId++, {
        pos, targetOvr: target, age, season: state.season,
      });
      p.teamId = team.id;
      state.players.push(p);
      created.push(p);
    }
  }

  // Paying every player full market value would put every team $100M+ over the
  // cap, and letting the cap-enforcer sort that out afterwards produced teams
  // with anywhere from $1M to $146M of space. Instead, scale the whole roster
  // to a realistic committed payroll up front so every franchise starts in a
  // coherent — but individually varied — cap position.
  const cap = salaryCap(state.season, state.season);
  const targetSpend = cap * rng.float(0.80, 0.94);
  const rawTotal = created.reduce(
    (sum, p) => sum + marketApy(p.ovr, p.pos, p.age, state.season, state.season),
    0
  );
  // Upper bound raised from 1.4: once marketApy gained a soft ceiling the raw
  // sum of market values fell, and a roster full of stars could no longer be
  // scaled UP to its target payroll — one generated club opened at 57% of the
  // cap purely because this clamp bound.
  const scale = rawTotal > 0 ? clamp(targetSpend / rawTotal, 0.2, 3.0) : 1;

  for (const p of created) {
    // Through the same ceiling every negotiation goes through. Without it the
    // payroll scaling (up to 3.0x) could open the league with a contract
    // averaging 29% of the cap, which no in-game negotiation could ever
    // produce and which then sat on the books tripping the cap guard.
    const ceiling = salaryCap(state.season, state.season) * MAX_CONTRACT_SHARE;
    const apy = clamp(
      Math.round((marketApy(p.ovr, p.pos, p.age, state.season, state.season) * scale) / 50_000) * 50_000,
      LEAGUE_MINIMUM,
      Math.round(ceiling)
    );
    const years = clamp(Math.round(rng.normal(3.2, 1.2)), 1, 5);
    // Only genuine money carries guarantees. Handing every contract two
    // guaranteed years made cutting anyone cost more than keeping them, which
    // removed roster churn from the game entirely.
    const guaranteed = apy > 12_000_000 ? 2 : apy > 4_000_000 ? 1 : 0;
    p.contract = makeContract(rng, apy, years, state.season, Math.min(guaranteed, years));

    // Stagger existing deals so they don't all expire in the same offseason.
    const elapsed = rng.int(0, years - 1);
    if (elapsed > 0) {
      p.contract.yearsRemaining = years - elapsed;
      p.contract.baseSalary = p.contract.baseSalary.slice(elapsed);
      p.contract.guaranteedYears = Math.max(0, p.contract.guaranteedYears - elapsed);
    }
  }
}

// ---------------------------------------------------------------------------
// Depth chart
// ---------------------------------------------------------------------------

export function autoSortDepthChart(state: GameState, team: Team): void {
  const byPos: Record<string, Player[]> = {};
  for (const pos of POSITIONS) byPos[pos] = [];

  for (const p of state.players) {
    if (p.teamId === team.id && !p.retired) byPos[p.pos].push(p);
  }

  for (const pos of POSITIONS) {
    byPos[pos].sort((a, b) => {
      // Injured players fall to the bottom but stay on the chart.
      const ai = a.injuryWeeks > 0 ? 1 : 0;
      const bi = b.injuryWeeks > 0 ? 1 : 0;
      if (ai !== bi) return ai - bi;
      if (b.ovr !== a.ovr) return b.ovr - a.ovr;
      return a.id - b.id; // stable
    });
    team.depthChart[pos] = byPos[pos].map((p) => p.id);
  }
}

/** Re-sort every team that hasn't been hand-edited by the user. */
export function refreshDepthCharts(state: GameState, force = false): void {
  for (const t of state.teams) {
    if (force || !t.depthChartManual) autoSortDepthChart(state, t);
  }
}

function emptyDepthChart(): Record<Position, number[]> {
  const d = {} as Record<Position, number[]>;
  for (const pos of POSITIONS) d[pos] = [];
  return d;
}

// ---------------------------------------------------------------------------
// League
// ---------------------------------------------------------------------------

export interface NewGameOptions {
  seed?: number;
  userTeamId?: number;
  startSeason?: number;
  name?: string;
  /** Gameplay options chosen at creation; defaults apply when omitted. */
  settings?: Partial<GameSettings>;
}

export function createNewGame(opts: NewGameOptions = {}): GameState {
  const seed = opts.seed ?? Math.floor(Date.now() % 2147483647);
  const rng = new Rng(seed);
  const season = opts.startSeason ?? 2026;

  const state: GameState = {
    version: STATE_VERSION,
    id: `save-${seed}-${season}`,
    name: opts.name ?? "New Franchise",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    seed,
    rngState: rng.state,
    userTeamId: opts.userTeamId ?? 0,
    season,
    phase: "preseason",
    week: 0,
    nextPlayerId: 1,
    nextGameId: 1,
    teams: [],
    players: [],
    games: [],
    playoffs: null,
    draft: null,
    fa: null,
    settings: { ...defaultSettings(), ...opts.settings },
    history: [],
    records: blankRecordBook(),
    log: [],
  };

  const offices = assignFrontOffices(rng, FRANCHISES.length);

  state.teams = FRANCHISES.map((f, i) => ({
    id: i,
    city: f.city,
    name: f.name,
    abbr: f.abbr,
    conference: f.conference,
    division: f.division,
    primary: f.primary,
    secondary: f.secondary,
    depthChart: emptyDepthChart(),
    depthChartManual: false,
    coach: makeCoach(rng),
    frontOffice: offices[i],
    deadCap: 0,
    // An even split to start. `refreshCpuStaff` gives the CPU clubs their own
    // allocation at the first rollover; the user's stays even until they
    // change it, so nobody is committed to anything on day one.
    staff: evenBudget(),
    devFocus: [],
    offScheme: SCHEMES.filter((s) => s.side === "offense")[
      i % SCHEMES.filter((s) => s.side === "offense").length
    ].id,
    defScheme: SCHEMES.filter((s) => s.side === "defense")[
      (i + 1) % SCHEMES.filter((s) => s.side === "defense").length
    ].id,
  }));

  // Team strength spread, shuffled so franchise order isn't destiny.
  const strengths = rng.shuffle(
    state.teams.map((_, i) => (i - 15.5) / 9.5) // roughly -1.6 .. +1.6
  );

  state.teams.forEach((team, i) => makeRosterForTeam(rng, state, team, strengths[i]));

  // A pool of veteran free agents so rosters can always be filled legally.
  for (let i = 0; i < 140; i++) {
    const pos = rng.weighted(POSITIONS, (p) => POSITION_TARGET[p]);
    const p = makePlayer(rng, state.nextPlayerId++, {
      pos,
      targetOvr: clamp(Math.round(rng.normal(64, 6)), 47, 82),
      age: clamp(Math.round(rng.normal(28, 3.5)), 22, 36),
      season,
    });
    state.players.push(p);
  }

  refreshDepthCharts(state, true);

  state.rngState = rng.state;
  state.log.push({
    season, week: 0, kind: "system",
    text: `New franchise created. You are the GM of the ${state.teams[state.userTeamId].city} ${state.teams[state.userTeamId].name}.`,
  });

  return state;
}

/** Convenience used by roster-filling code. */
export function makeFreeAgent(rng: Rng, state: GameState, pos: Position, ovr: number): Player {
  const p = makePlayer(rng, state.nextPlayerId++, {
    pos,
    targetOvr: ovr,
    age: clamp(Math.round(rng.normal(26, 3)), 21, 34),
    season: state.season,
  });
  state.players.push(p);
  return p;
}

export { ROSTER_LIMIT };
