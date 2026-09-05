import { schemeAttrMultiplier } from "../staff";
import { Rng, clamp } from "../rng";
import {
  BoxScore, CARRY_SHARE, Coach, Game, GameState, PlayEvent, PlayKind, PlayResult,
  Player, PlayerGameStat, Position, ROTATION, ScoringPlay, STARTERS, Team, TeamGameStats,
} from "../types";
import { buildDrives, emitPlay } from "./events";
import { CLEAR, HOME_FIELD, restEffect, weatherEffects } from "../weather";
import { blankPlayerGameStat, blankTeamGameStats } from "../season/stats";
import { isSat } from "../inactives";
import { effectiveCoach, type SimOpts } from "../callSheet";

/**
 * Drive-and-play simulation.
 *
 * The contract that matters: THE BOX SCORE IS THE SCORE. Points are only ever
 * added by a scoring play that also writes the corresponding player stats, so a
 * team's score always equals
 *
 *   6*(passTd + rushTd + defTd + krTd + prTd) + xpm + 2*twoPtMade
 *   + 3*fgm + 2*safeties
 *
 * summed over its players. The verification harness asserts exactly that on
 * every game of every simulated season.
 *
 * Everything is driven by the attributes of the specific players the depth
 * chart puts on the field. Change your depth chart and the results change.
 */

const QUARTER_SECONDS = 900;
const TOUCHBACK_YARDLINE = 25;
const REGULATION_SECONDS = QUARTER_SECONDS * 4;

interface Ctx {
  team: Team;
  coach: Coach;
  starters: Record<Position, Player[]>;
  stats: TeamGameStats;
  quarterPoints: number[];
  /** True once this drive has reached the opponent 20, for red-zone rates. */
  inRedZoneThisDrive: boolean;
  /**
   * Per-game "script": how this particular Sunday deviates from the team's
   * baseline. Without it every player's workload is identical every week, and
   * the league never produces a 200-yard rusher or a 400-yard passer — the
   * averages come out right while the tails collapse.
   */
  script: {
    passLean: number;        // added to the coach's pass bias for this game
    leadBackShare: number;   // share of carries for the RB1 today
    targetBoost: Map<number, number>; // per-receiver hot/cold multiplier
  };
  /**
   * Who is covering whom, decided before the game rather than redrawn at
   * random on every snap. Keyed by receiver id, value is the defender.
   *
   * Without this, a shutdown corner had no more effect on the opponent's best
   * receiver than on his fourth, and a 200-yard afternoon could not be traced
   * to anything. Assignments persist all game, so route running versus coverage
   * becomes a real individual battle.
   */
  coverage: Map<number, Player>;
  /** Whether this defence travelled its best corner with the opposing WR1. */
  shadowing: boolean;
  /**
   * Everyone this team could dress today, best first. Used to find the next man
   * up when somebody goes down mid-game.
   */
  roster: Player[];
  /** Ids that have left this game injured. They never return to a unit. */
  out: Set<number>;
  /**
   * Ids that were in the opening lineup. The `started` flag has to come from
   * this rather than from a player's live index in `starters`, because units
   * now change during the game — without it a backup quarterback who came on in
   * the second quarter would be credited with a start alongside the man he
   * replaced.
   */
  openers: Set<number>;
}

// The row shapes live in `season/stats.ts`, which is the one place the field
// lists are written down — the save codec reconstructs dropped zero fields from
// the same constructors, so the two can never disagree.
const blankTeamStats = blankTeamGameStats;
const blankPlayerStat = blankPlayerGameStat;

/**
 * Pull the players the depth chart actually puts on the field, skipping the
 * injured. Falls back down the chart, then to any healthy player at the
 * position, then to the best healthy body on the roster — a team is never
 * unable to field a unit.
 */
/**
 * Left in roster order, not sorted: `buildStarters` re-sorts the slices it
 * cares about, and pre-sorting here would change its tie-breaking.
 */
function healthyRosterFor(state: GameState, team: Team): Player[] {
  return state.players.filter(
    (p) => p.teamId === team.id && !p.retired && !p.prospect && p.injuryWeeks <= 0 &&
      p.status !== "ir" && p.status !== "ps" && !isSat(team, p.id)
  );
}

function buildStarters(
  state: GameState, team: Team, byId: Map<number, Player>
): Record<Position, Player[]> {
  const out = {} as Record<Position, Player[]>;
  const healthyRoster = healthyRosterFor(state, team);

  for (const posKey of Object.keys(ROTATION) as Position[]) {
    const need = ROTATION[posKey];
    const chosen: Player[] = [];

    for (const id of team.depthChart[posKey] ?? []) {
      const p = byId.get(id);
      if (p && p.teamId === team.id && !p.retired && p.injuryWeeks <= 0 &&
          p.status !== "ir" && p.status !== "ps" && !isSat(team, p.id)) {
        chosen.push(p);
        if (chosen.length >= need) break;
      }
    }
    if (chosen.length < need) {
      for (const p of healthyRoster
        .filter((x) => x.pos === posKey && !chosen.includes(x))
        .sort((a, b) => b.ovr - a.ovr)) {
        chosen.push(p);
        if (chosen.length >= need) break;
      }
    }
    if (chosen.length < need) {
      for (const p of healthyRoster
        .filter((x) => !chosen.includes(x))
        .sort((a, b) => b.ovr - a.ovr)) {
        chosen.push(p);
        if (chosen.length >= need) break;
      }
    }
    out[posKey] = chosen;
  }
  return out;
}

/**
 * Physical attributes decay as snaps pile up, scaled by stamina. A 40-stamina
 * player loses roughly 9% of his speed by the end of a heavy workload; a
 * 90-stamina player loses under 2%. This is what makes `sta` — previously read
 * nowhere despite being generated and displayed — actually matter, and gives
 * rotating your depth a point.
 */
const PHYSICAL: (keyof Player["attrs"])[] = [
  "spd", "acc", "agi", "str", "jmp",
  // Technique degrades with fatigue as well — restricting this to raw
  // athleticism left stamina with almost nothing to affect.
  "pbk", "rbk", "tkl", "prs", "cov", "rte",
];

function fatigueMult(p: Player, snaps: number): number {
  if (snaps <= 25) return 1;
  const wear = Math.min(1, (snaps - 25) / 55);
  const softness = 1 - p.attrs.sta / 100;
  return 1 - wear * softness * 0.22;
}

/**
 * How often each position is the one making the stop. A linebacker is around
 * the ball far more than a nickel corner is, and without this the league's
 * leading tackler finished with numbers a rotational safety could match.
 */
const TACKLE_SHARE: Record<Position, number> = {
  QB: 0.05, RB: 0.05, WR: 0.05, TE: 0.05, OT: 0.05, OG: 0.05, C: 0.05,
  EDGE: 1.00, DT: 0.85, LB: 1.20, CB: 0.85, S: 1.03, K: 0.05, P: 0.05,
};

/**
 * Rotational snap share by depth-chart slot.
 *
 * Snaps used to be incremented at three scattered offensive call sites — the
 * ball carrier, the quarterback, the five linemen and whichever receiver was
 * targeted. Everybody else on the field recorded nothing, so every defender,
 * kicker and punter in the league finished every season with exactly zero
 * snaps. Three things fell out of that: `sta` could not fatigue a defence
 * (`att()` reads this counter), offseason progression handed its playing-time
 * development bonus to offensive linemen and nobody else, and a starter who
 * happened not to record a tackle produced no box-score line at all, so his
 * games-played never incremented.
 *
 * Snaps are now credited once per scrimmage play to BOTH full units. The share
 * is fractional because units rotate: a nickel corner is on the field for most
 * of a game, a fourth defensive tackle for a quarter of it. Each position's
 * shares sum to STARTERS[pos], so a team's credited snaps track the number of
 * men STARTERS says it fields. Totals are rounded once, at box-score assembly.
 *
 * These shares must be kept summing to STARTERS[pos]. Both sides now total
 * eleven (offence QB1 RB1 WR3 TE1 OT2 OG2 C1; defence EDGE2 DT2 LB2 CB3 S2 —
 * nickel, so two linebackers rather than three). If STARTERS changes, retune
 * the matching row here or that position's snap counts silently drift.
 */
export const SNAP_SHARE: Record<Position, number[]> = {
  QB:   [1.00],                          // 1
  RB:   [0.60, 0.28, 0.12],              // 1
  WR:   [0.95, 0.85, 0.62, 0.58],        // 3
  TE:   [0.72, 0.28],                    // 1
  OT:   [1.00, 1.00],                    // 2
  OG:   [1.00, 1.00],                    // 2
  C:    [1.00],                          // 1
  EDGE: [0.82, 0.78, 0.25, 0.15],        // 2
  DT:   [0.72, 0.68, 0.38, 0.22],        // 2
  LB:   [0.88, 0.72, 0.28, 0.12],        // 2
  CB:   [0.95, 0.92, 0.75, 0.38],        // 3
  S:    [0.95, 0.88, 0.17],              // 2
  // Specialists are credited at their own event sites, not on scrimmage plays.
  K:    [],
  P:    [],
};

/**
 * Share of designed non-quarterback runs that go to a receiver rather than a
 * back — the jet sweep and the end-around.
 *
 * Real clubs run 0.94 of them a game (WR 0.83, TE 0.11) out of 22.7 non-QB
 * carries, which is 4.1% (nfl-reference.md §5.6/§5.5). Sized against the sim's
 * post-fix non-QB run count rather than its old one.
 */
const RECEIVER_CARRY_RATE = 0.039;

/**
 * The middle of the starting-quarterback population, and how hard arm quality
 * is levered around it. See `armQuality` in `passPlay` — centring here is what
 * keeps the steepening mean-preserving.
 */
const QB_CENTRE = 70;
const QB_SPREAD = 0.0040;

/**
 * Rushing-skill lever. Old formula centred on 60 (replacement); the starting
 * population's elu/acc/spd/agi blend measures ~78, and it will drift as
 * ratings age. The live centre is the mean of the 32 depth-chart lead backs,
 * recomputed each game — a generation-time freeze would become a level shift
 * by year 10. 70 is only the empty-league fallback (the QB-arm centre, not
 * this blend). Slope is flattened around that centre so an elite back sheds
 * what a replacement back gains. RB carries only; see nfl-reference.md §5.10.
 */
const RB_SKILL_SLOPE = 0.024;
const RB_SKILL_SLOPE_OLD = 0.049;
const RB_CENTRE_FALLBACK = 70;

/**
 * Victory formation. Real quarterbacks kneel 0.761 times a team-game for a
 * mean of -1.09 yards (nfl-reference.md §5.6, nflverse pbp `qb_kneel`), and the
 * engine had no such play — which cost the quarterback about a fifth of his
 * real carries and left every one of them with a back instead.
 */
const KNEEL_CLOCK_SECONDS = 112;

/** The eleven-man units that take a scrimmage snap. */
const OFFENSE_UNITS: Position[] = ["QB", "RB", "WR", "TE", "OT", "OG", "C"];
const DEFENSE_UNITS: Position[] = ["EDGE", "DT", "LB", "CB", "S"];

function unitAvg(players: Player[], key: keyof Player["attrs"]): number {
  if (players.length === 0) return 50;
  let t = 0;
  for (const p of players) t += p.attrs[key];
  return t / players.length;
}

function edge(a: number, b: number, scale = 34): number {
  return 1 / (1 + Math.exp(-(a - b) / scale));
}

export interface SimResult {
  homeScore: number;
  awayScore: number;
  box: BoxScore;
  plays: PlayEvent[];
}

export function simulateGame(state: GameState, game: Game, rng: Rng, opts?: SimOpts): SimResult {
  const byId = new Map<number, Player>();
  for (const p of state.players) byId.set(p.id, p);

  const home = state.teams[game.homeId];
  const away = state.teams[game.awayId];

  const mkCtx = (team: Team): Ctx => {
    const starters = buildStarters(state, team, byId);
    const openers = new Set<number>();
    for (const posKey of Object.keys(starters) as Position[]) {
      for (const p of starters[posKey].slice(0, STARTERS[posKey])) openers.add(p.id);
    }
    const targetBoost = new Map<number, number>();
    for (const p of [...starters.WR, ...starters.TE, ...starters.RB]) {
      // Some weeks a receiver is the whole game plan; some weeks he is a decoy.
      targetBoost.set(p.id, clamp(rng.normal(1, 0.36), 0.28, 2.1));
    }
    for (const p of [...starters.LB, ...starters.S, ...starters.CB, ...starters.EDGE, ...starters.DT]) {
      // Defenders have loud weeks and quiet ones too.
      targetBoost.set(p.id, clamp(rng.normal(1, 0.37), 0.30, 2.3));
    }
    return {
      team,
      coach: effectiveCoach(team),
      starters,
      stats: blankTeamStats(),
      quarterPoints: [0, 0, 0, 0, 0],
      inRedZoneThisDrive: false,
      script: {
        passLean: rng.normal(0, 0.215),
        leadBackShare: clamp(rng.normal(0.645, 0.21), 0.30, 0.93),
        targetBoost,
      },
      coverage: new Map<number, Player>(),
      shadowing: false,
      roster: healthyRosterFor(state, team).sort((a, b) => b.ovr - a.ovr),
      out: new Set<number>(),
      openers,
    };
  };

  const ctxHome = mkCtx(home);
  const ctxAway = mkCtx(away);

  /**
   * A child stream for the play-economy mechanics — receiver carries and
   * kneel-downs. One parent draw seeds it, so however many decisions those
   * mechanics take in a given game, the parent stream advances by exactly one
   * value and everything downstream of it keeps its place. Same pattern as the
   * weekly trade block in `season/engine.ts`, for the same reason.
   */
  const econRng = new Rng(rng.int(1, 0x7ffffffe));

  /**
   * Match the offence's pass catchers against the defenders who will cover
   * them. A defence that shadows puts its best corner on the opponent's best
   * receiver; a defence that plays sides takes whoever lines up across from it,
   * which is why a number one receiver sometimes draws a backup.
   */
  const assignCoverage = (o: Ctx, d: Ctx) => {
    const shadow = rng.chance(d.coach.shadowTendency);
    const cbs = shadow ? d.starters.CB : rng.shuffle(d.starters.CB);
    const safeties = d.starters.S;
    const lbs = d.starters.LB;

    o.starters.WR.forEach((wr, i) => {
      const cover = cbs[i] ?? cbs[cbs.length - 1] ?? safeties[0] ?? lbs[0];
      if (cover) o.coverage.set(wr.id, cover);
    });
    o.starters.TE.forEach((te, i) => {
      // Tight ends draw a safety or a linebacker.
      const cover = safeties[i] ?? lbs[i] ?? safeties[0] ?? lbs[0];
      if (cover) o.coverage.set(te.id, cover);
    });
    o.starters.RB.forEach((rb, i) => {
      const cover = lbs[i] ?? lbs[0] ?? safeties[0];
      if (cover) o.coverage.set(rb.id, cover);
    });
    o.shadowing = shadow;
  };
  assignCoverage(ctxHome, ctxAway);
  assignCoverage(ctxAway, ctxHome);

  const pstats = new Map<number, PlayerGameStat>();
  const statFor = (p: Player, ctx: Ctx): PlayerGameStat => {
    let s = pstats.get(p.id);
    if (!s) {
      s = blankPlayerStat(p.id, ctx.team.id, ctx.openers.has(p.id));
      pstats.set(p.id, s);
    }
    return s;
  };

  /**
   * Every club's scheme lean, resolved once per game rather than per read.
   *
   * `att` is called tens of thousands of times a game, and the lean depends
   * only on the club, the position and the attribute — none of which change
   * between snaps. Resolving it inside `att` would recompute the same lookup
   * on every play for no benefit. It also consumes no randomness, so the play
   * loop's rng stream is byte-identical with or without it.
   */
  const schemeLean = new Map<string, number>();
  const lean = (p: Player, key: keyof Player["attrs"]): number => {
    if (p.teamId === null) return 1;
    const k = `${p.teamId}:${p.pos}:${key}`;
    let v = schemeLean.get(k);
    if (v === undefined) {
      v = schemeAttrMultiplier(state.teams[p.teamId], p.pos, key);
      schemeLean.set(k, v);
    }
    return v;
  };

  /**
   * Scheme lean only, for the reads that deliberately skip the fatigue model.
   *
   * A good number of attribute reads in here bypass `att` — some by design,
   * some by history — and half of what the schemes emphasise (coverage, pass
   * rush, tackling, blocking) lives in exactly those reads. Routing them
   * through `att` would silently apply the fatigue model where it has never
   * applied and move every calibration number for reasons that have nothing to
   * do with schemes. This applies the lean and nothing else.
   */
  const sc = (p: Player, key: keyof Player["attrs"]): number => p.attrs[key] * lean(p, key);

  /** Attribute value for this player right now, after scheme and fatigue. */
  const att = (p: Player, key: keyof Player["attrs"]): number => {
    const raw = p.attrs[key] * lean(p, key);
    if (!PHYSICAL.includes(key)) return raw;
    const snaps = pstats.get(p.id)?.snaps ?? 0;
    return raw * fatigueMult(p, snaps);
  };

  const unitAtt = (players: Player[], key: keyof Player["attrs"]): number => {
    if (players.length === 0) return 50;
    let t = 0;
    for (const p of players) t += att(p, key);
    return t / players.length;
  };

  const rbSkillOf = (p: Player): number =>
    sc(p, "elu") * 0.4 + sc(p, "acc") * 0.25 + sc(p, "spd") * 0.2 + sc(p, "agi") * 0.15;
  let rbCentreSum = 0, rbCentreN = 0;
  for (const team of state.teams) {
    const lead = team.depthChart.RB[0];
    const p = lead != null ? byId.get(lead) : undefined;
    if (!p) continue;
    rbCentreSum += rbSkillOf(p);
    rbCentreN++;
  }
  const rbCentre = rbCentreN > 0 ? rbCentreSum / rbCentreN : RB_CENTRE_FALLBACK;

  /**
   * Put both twenty-two on the field for one scrimmage play.
   *
   * Called once per snap from the main loop, with the units captured BEFORE the
   * play resolved — a pick-six flips possession and kicks off inside the play
   * function, so reading off()/def() afterwards would credit the wrong sides.
   *
   * Consumes no randomness on purpose: the rotation is a fixed share table, so
   * adding this leaves the play loop's rng stream byte-identical.
   */
  const creditSnaps = (o: Ctx, d: Ctx) => {
    for (const pos of OFFENSE_UNITS) {
      const shares = SNAP_SHARE[pos];
      const unit = o.starters[pos] ?? [];
      for (let i = 0; i < unit.length; i++) {
        const share = shares[i] ?? 0;
        if (share > 0) statFor(unit[i], o).snaps += share;
      }
    }
    for (const pos of DEFENSE_UNITS) {
      const shares = SNAP_SHARE[pos];
      const unit = d.starters[pos] ?? [];
      for (let i = 0; i < unit.length; i++) {
        const share = shares[i] ?? 0;
        if (share > 0) statFor(unit[i], d).snaps += share;
      }
    }
  };

  // -------------------------------------------------------------------------
  // In-game injuries
  // -------------------------------------------------------------------------

  /**
   * Who took contact on the play that just ran, and how exposed they were.
   * Rebuilt every snap. Injuries are rolled against this rather than against
   * the roster, so the risk lands on the people actually in the collision: the
   * ball carrier, the quarterback going down under a sack, the man making the
   * tackle, and the two lines grinding on every snap.
   */
  let contact: { p: Player; ctx: Ctx; risk: number }[] = [];
  const hit = (p: Player | null | undefined, ctx: Ctx, risk: number) => {
    if (p && !ctx.out.has(p.id)) contact.push({ p, ctx, risk });
  };
  const hitUnit = (unit: Player[], ctx: Ctx, risk: number) => {
    for (const p of unit) hit(p, ctx, risk);
  };

  /**
   * Per unit of exposure. Tuned so the league produces a little under one
   * in-game injury per team per game; most of them are a player being shaken
   * up and returning the following week.
   */
  const INJURY_PER_RISK = 0.00420;

  const durabilityMult = (p: Player) => clamp(1 + (70 - p.durability) / 100, 0.5, 1.8);

  /** The next healthy body for a position, mirroring buildStarters' fallbacks. */
  const nextAvailable = (ctx: Ctx, pos: Position, unit: Player[]): Player | undefined => {
    const usable = (p: Player | undefined): p is Player =>
      !!p && p.teamId === ctx.team.id && !p.retired && p.injuryWeeks <= 0 &&
      p.status !== "ir" && p.status !== "ps" && !isSat(ctx.team, p.id) &&
      !ctx.out.has(p.id) && !unit.includes(p);

    for (const id of ctx.team.depthChart[pos] ?? []) {
      const p = byId.get(id);
      if (usable(p)) return p;
    }
    for (const p of ctx.roster) if (p.pos === pos && usable(p)) return p;
    for (const p of ctx.roster) if (usable(p)) return p;
    return undefined;
  };

  /**
   * Take a player off the field for good and send in his replacement. Splicing
   * rather than blanking matters: every selection path is index-based, so the
   * man behind him genuinely moves up a slot — snap share, target role bonus
   * and carry share all follow.
   */
  const removeFromUnits = (ctx: Ctx, gone: Player): Player | undefined => {
    let replacement: Player | undefined;
    for (const posKey of Object.keys(ctx.starters) as Position[]) {
      const unit = ctx.starters[posKey];
      const i = unit.indexOf(gone);
      if (i < 0) continue;
      unit.splice(i, 1);
      if (unit.length < ROTATION[posKey]) {
        const rep = nextAvailable(ctx, posKey, unit);
        if (rep) {
          unit.push(rep);
          replacement ??= rep;
        }
      }
    }
    return replacement;
  };

  /** Coverage was assigned pre-snap; re-point anything aimed at a man who is out. */
  const repointCoverage = (gone: Player, rep: Player | undefined) => {
    for (const c of [ctxHome, ctxAway]) {
      for (const [receiverId, defender] of c.coverage) {
        if (defender !== gone) continue;
        if (rep) c.coverage.set(receiverId, rep);
        else c.coverage.delete(receiverId);
      }
    }
  };

  const INJURY_TIERS: { desc: string[]; min: number; max: number }[] = [
    { desc: ["Shaken up", "Had the wind knocked out of him", "Cramping", "Bruised"], min: 0, max: 0 },
    { desc: ["Ankle sprain", "Bruised ribs", "Hip pointer", "Concussion"], min: 1, max: 2 },
    { desc: ["Hamstring strain", "Shoulder sprain", "High ankle sprain", "MCL sprain"], min: 3, max: 6 },
    { desc: ["Broken hand", "Torn hamstring", "Fractured rib", "Dislocated shoulder"], min: 7, max: 12 },
    { desc: ["Torn ACL", "Achilles rupture", "Broken leg"], min: 13, max: 40 },
  ];

  /**
   * A kick is the one snap a specialist is on the field for, and until now it
   * could not hurt him: `contact` is built inside the scrimmage play, so a
   * kicker or punter was the only man in the game who could not go down.
   *
   * The exposure is real and it is small, and it is almost entirely on returns
   * — a punter is the last man between a returner and the end zone, and the
   * kicker is the same on a kickoff. A field goal carries only the pile.
   *
   * No rate here traces to a primary source: nothing in `nfl-reference.md`
   * measures specialist injury frequency, and per the seventh invariant these
   * are therefore sized to be RARE (about three league-wide in-game events a
   * season, over half of which cost no time at all) rather than tuned toward a
   * number. The axis stays ungated. What matters is that the path exists —
   * `removeFromUnits` already promotes an emergency kicker off the roster.
   */
  const kickExposure = (p: Player | undefined, ctx: Ctx, risk: number) => {
    if (!p) return;
    const held = contact;
    contact = [];
    hit(p, ctx, risk);
    rollInGameInjury();
    contact = held;
  };

  const rollInGameInjury = () => {
    if (contact.length === 0) return;

    let total = 0;
    for (const c of contact) total += c.risk * durabilityMult(c.p);
    if (!rng.chance(Math.min(0.20, total * INJURY_PER_RISK))) return;

    const victim = rng.weighted(contact, (c) => c.risk * durabilityMult(c.p));
    if (!victim) return;
    const { p, ctx } = victim;
    if (ctx.out.has(p.id)) return;

    // Out for the rest of the day regardless of how many weeks he ends up
    // missing — "shaken up" still means he is done for this afternoon.
    ctx.out.add(p.id);
    const rep = removeFromUnits(ctx, p);
    repointCoverage(p, rep);

    const r = rng.next();
    const tier =
      r < 0.55 ? INJURY_TIERS[0] :
      r < 0.80 ? INJURY_TIERS[1] :
      r < 0.93 ? INJURY_TIERS[2] :
      r < 0.98 ? INJURY_TIERS[3] : INJURY_TIERS[4];
    const weeks = rng.int(tier.min, tier.max);
    const desc = rng.pick(tier.desc);

    // Never downgrade something worse he is already carrying.
    if (weeks > p.injuryWeeks) {
      p.injuryWeeks = weeks;
      p.injuryDesc = weeks > 0 ? desc : null;
    }

    // Match the reporting convention the weekly roll uses: everything for the
    // user's team, only what costs real time elsewhere.
    if (p.teamId === state.userTeamId || weeks >= 1) {
      state.log.push({
        season: state.season,
        week: game.week,
        kind: "injury",
        text:
          `${p.firstName} ${p.lastName} (${ctx.team.abbr} ${p.pos}) left the game — ${desc}` +
          (weeks >= 1 ? `, out ${weeks} week${weeks === 1 ? "" : "s"}` : ", day-to-day"),
      });
    }
  };

  // Conditions. Older saves have no `conditions`, so this falls back to clear
  // weather and neutral rest rather than breaking them.
  const wx = game.conditions ? weatherEffects(game.conditions.weather) : CLEAR;
  const homeRestMult = restEffect(game.conditions?.homeRest ?? 7);
  const awayRestMult = restEffect(game.conditions?.awayRest ?? 7);
  const restFor = (isHome: boolean) => (isHome ? homeRestMult : awayRestMult);

  const scoringPlays: ScoringPlay[] = [];
  const playLog: PlayEvent[] = [];
  const emit = (
    e: Omit<PlayEvent, "q" | "clock" | "homeScore" | "awayScore"> &
      Partial<Pick<PlayEvent, "q" | "clock" | "homeScore" | "awayScore">>,
  ) => {
    const ev: PlayEvent = {
      q: quarter,
      clock: Math.max(0, Math.round(clock)),
      homeScore,
      awayScore,
      ...e,
    };
    playLog.push(ev);
    emitPlay(ev);
  };
  let homeScore = 0;
  let awayScore = 0;

  let quarter = 1;
  let clock = QUARTER_SECONDS;
  let offenseIsHome = rng.chance(0.5);
  const receivedFirst = offenseIsHome;
  let yardLine = TOUCHBACK_YARDLINE;
  let down = 1;
  let toGo = 10;
  let overtime = false;

  const off = () => (offenseIsHome ? ctxHome : ctxAway);
  const def = () => (offenseIsHome ? ctxAway : ctxHome);

  /** Charge elapsed time to whoever currently has the ball. */
  const burn = (seconds: number) => {
    const t = Math.max(0, seconds);
    clock -= t;
    off().stats.timeOfPossession += t;
  };

  const record = (teamId: number, desc: string) => {
    scoringPlays.push({
      q: quarter, clock: Math.max(0, Math.round(clock)),
      teamId, desc, homeScore, awayScore,
    });
  };

  /** Award points to a specific team — not necessarily the one on offense. */
  const award = (teamId: number, n: number, desc: string) => {
    const q = Math.min(quarter, 5) - 1;
    if (teamId === home.id) {
      homeScore += n;
      ctxHome.stats.points += n;
      ctxHome.quarterPoints[q] += n;
    } else {
      awayScore += n;
      ctxAway.stats.points += n;
      ctxAway.quarterPoints[q] += n;
    }
    record(teamId, desc);
  };

  const scoreDiffFor = (isHome: boolean) =>
    isHome ? homeScore - awayScore : awayScore - homeScore;

  /** Once a game is out of reach the starters come out. */
  const garbageTime = (): boolean => {
    const lead = Math.abs(homeScore - awayScore);
    if (quarter < 4 && !(quarter === 3 && lead >= 31)) return false;
    return lead >= (quarter >= 4 && clock < 600 ? 22 : 29);
  };

  /**
   * A decided game, from the point of view of one side rather than of the
   * scoreboard — which is not the same thing for both clubs.
   *
   * `garbageTime` rests whoever is ahead. Real clubs go to the backup
   * quarterback MORE readily when they are being beaten: 2018-2024, the leading
   * passer takes 91.1% of his club's attempts in a 25-point loss and 93.9% in a
   * 17-24 point loss, against 95.6% in a 25-point win and 98.9% in a one-score
   * win (nfl-reference.md §5.4b). The trailing side is about 86% of all the
   * attempts the league's starters do not take, and it was the half of the
   * effect the engine did not have. The winning side keeps `garbageTime`'s
   * margins; the trailing side comes off sooner.
   *
   * Fitted to §5.4b's within-game share, not to a leaderboard rank: the sim's
   * leading passer now takes 96.6% of his club's attempts in the games he
   * plays against a real 97.0%, in 19.6% of team-games against a real 21.4%.
   */
  const decided = (isWinning: boolean, lead: number): boolean => {
    if (quarter < 4) return quarter === 3 && lead >= 31;
    // Seven minutes, not ten: a relief appearance is SHALLOW in the real data
    // — the 10th percentile of the leader's within-game share is 93.1%, i.e.
    // two or three attempts, not half a game.
    const late = clock < 420;
    return isWinning ? lead >= (late ? 22 : 29) : lead >= (late ? 20 : 27);
  };

  /**
   * The player at `slot` for this position, stepped down the depth chart when
   * the game is decided for his side. Called for the quarterback.
   */
  const onField = (ctx: Ctx, pos: Position, slot = 0): Player | undefined => {
    const unit = ctx.starters[pos] ?? [];
    const diff = scoreDiffFor(ctx.team.id === home.id);
    if (!decided(diff > 0, Math.abs(diff))) return unit[slot];
    return unit[Math.min(slot + 1, unit.length - 1)] ?? unit[slot];
  };

  // -------------------------------------------------------------------------
  // Possession
  // -------------------------------------------------------------------------

  const startDrive = (newYardLine: number) => {
    yardLine = clamp(newYardLine, 1, 99);
    down = 1;
    toGo = Math.min(10, 100 - yardLine);
    off().inRedZoneThisDrive = false;
    off().stats.possessions++;
  };

  const changePossession = (newYardLine: number) => {
    offenseIsHome = !offenseIsHome;
    startDrive(newYardLine);
  };

  const attemptPat = (ctx: Ctx) => {
    const isHome = ctx.team.id === home.id;
    const diff = scoreDiffFor(isHome);
    const late = quarter >= 4 || overtime;
    // Chase the points the scoreboard actually calls for.
    const wantsTwo =
      (late && (diff === -2 || diff === -5 || diff === -10 || diff === 1)) ||
      rng.chance((ctx.coach.aggression / 100) * 0.095);

    if (wantsTwo) {
      const qb = ctx.starters.QB[0];
      const receivers = [...ctx.starters.WR, ...ctx.starters.TE];
      const target = receivers.length ? rng.pick(receivers) : null;
      // Attempt and conversion are credited to the same player — the one who
      // carries it in — so the two can never disagree.
      const converter = target ?? qb;
      if (converter) statFor(converter, ctx).twoPtAtt++;

      const skill = qb ? (att(qb, "tha") + att(qb, "dec")) / 2 : 55;
      if (rng.chance(clamp(0.475 + (skill - 60) * 0.004, 0.33, 0.66))) {
        // Both players are credited with the ATTEMPT, but only the player who
        // takes it into the end zone is credited with the conversion — crediting
        // both counted the two points twice when reconciling the box score.
        if (converter) statFor(converter, ctx).twoPtMade++;
        award(ctx.team.id, 2, "Two-point conversion GOOD");
        emit({
          kind: "two", result: "good", yards: 0, down: 0, toGo: 0, yardLine,
          offenseId: ctx.team.id, playerId: converter?.id,
        });
      } else {
        record(ctx.team.id, "Two-point conversion FAILED");
        emit({
          kind: "two", result: "fail", yards: 0, down: 0, toGo: 0, yardLine,
          offenseId: ctx.team.id, playerId: converter?.id,
        });
      }
      return;
    }

    const k = ctx.starters.K[0];
    if (!k) {
      award(ctx.team.id, 1, "Extra point good");
      emit({ kind: "xp", result: "good", yards: 0, down: 0, toGo: 0, yardLine, offenseId: ctx.team.id });
      return;
    }
    const st = statFor(k, ctx);
    st.xpa++;
    st.snaps++;
    if (rng.chance(clamp(0.86 + (att(k, "kac") - 50) * 0.0022, 0.80, 0.985))) {
      st.xpm++;
      award(ctx.team.id, 1, "Extra point good");
      emit({ kind: "xp", result: "good", yards: 0, down: 0, toGo: 0, yardLine, offenseId: ctx.team.id, playerId: k.id });
    } else {
      record(ctx.team.id, "Extra point MISSED");
      emit({ kind: "xp", result: "miss", yards: 0, down: 0, toGo: 0, yardLine, offenseId: ctx.team.id, playerId: k.id });
    }
  };

  /**
   * Kickoff with a live return. Most are touchbacks, but a return can break for
   * a score — one of the ways points reach the board without the offense ever
   * taking the field.
   */
  const kickoff = () => {
    const receivingIsHome = !offenseIsHome;
    const receiving = receivingIsHome ? ctxHome : ctxAway;
    offenseIsHome = receivingIsHome;

    if (rng.chance(0.62)) {
      startDrive(TOUCHBACK_YARDLINE);
      emit({
        kind: "kickoff", result: "touchback", yards: 0,
        down: 1, toGo: 10, yardLine: TOUCHBACK_YARDLINE, offenseId: receiving.team.id,
      });
      return;
    }

    const pool = [...receiving.starters.WR, ...receiving.starters.RB, ...receiving.starters.CB];
    const returner = pool.length
      ? rng.weighted(pool, (p) => Math.pow(Math.max(1, sc(p, "spd") - 55), 2))
      : null;

    const td = rng.chance(0.0055);
    const ret = td ? 75 : Math.round(clamp(rng.normal(23, 8), 5, 45));

    if (returner) {
      const st = statFor(returner, receiving);
      st.kr++;
      st.krYds += ret;
      st.krLong = Math.max(st.krLong, ret);
      if (td) st.krTd++;
    }

    const kicking = receivingIsHome ? ctxAway : ctxHome;
    kickExposure(kicking.starters.K[0], kicking, 0.25);

    if (td) {
      award(receiving.team.id, 6, `${returner ? returner.lastName : "Returner"} ${ret} yd kickoff return TD`);
      emit({
        kind: "kickoff", result: "td", yards: ret,
        down: 0, toGo: 0, yardLine: TOUCHBACK_YARDLINE, offenseId: receiving.team.id,
        playerId: returner?.id,
      });
      attemptPat(receiving);
      // The team that just scored kicks off; kickoff() hands the ball to the
      // other side.
      offenseIsHome = receivingIsHome;
      kickoff();
      return;
    }

    startDrive(clamp(TOUCHBACK_YARDLINE + (ret - 23), 5, 60));
    emit({
      kind: "kickoff", result: "return", yards: ret,
      down: 1, toGo: Math.min(10, 100 - yardLine), yardLine, offenseId: receiving.team.id,
      playerId: returner?.id,
    });
  };

  const scoreTouchdown = (ctx: Ctx, desc: string, fromRedZone: boolean) => {
    award(ctx.team.id, 6, desc);
    if (fromRedZone) ctx.stats.redZoneTd++;
    attemptPat(ctx);
    kickoff();
  };

  const attemptFieldGoal = () => {
    const ctx = off();
    const k = ctx.starters.K[0];
    if (!k) { punt(); return; }
    const distance = Math.round((100 - yardLine) + 17);
    const st = statFor(k, ctx);
    st.fga++;
    st.snaps++;

    const visitorKick = offenseIsHome ? 1 : HOME_FIELD.visitorKick;
    const p = clamp(
      (1.03 - Math.pow(Math.max(0, distance - 17) / 42, 2.15) * 0.70 +
        (att(k, "kpw") - 50) * 0.0016 + (att(k, "kac") - 50) * 0.0030)
        * wx.kickAccuracy * visitorKick,
      0.01, 0.99
    );

    burn(rng.int(5, 10));
    const good = rng.chance(p);
    // Rolled before the kick resolves, so the make branch is exposed too: it
    // hands off to kickoff(), which never returns to this frame.
    kickExposure(k, ctx, 0.10);
    if (good) {
      st.fgm++;
      st.longFg = Math.max(st.longFg, distance);
      award(ctx.team.id, 3, `${k.lastName} ${distance} yd field goal is GOOD`);
      emit({
        kind: "fg", result: "good", yards: distance,
        down, toGo, yardLine, offenseId: ctx.team.id, playerId: k.id,
      });
      kickoff();
    } else {
      record(ctx.team.id, `${k.lastName} ${distance} yd field goal is NO GOOD`);
      emit({
        kind: "fg", result: "miss", yards: distance,
        down, toGo, yardLine, offenseId: ctx.team.id, playerId: k.id,
      });
      changePossession(clamp(100 - Math.max(yardLine - 8, 20), 1, 99));
    }
  };

  function punt(): void {
    const ctx = off();
    const receiving = offenseIsHome ? ctxAway : ctxHome;
    const p = ctx.starters.P[0];

    const gross = Math.round(clamp((45 + (p ? (att(p, "kpw") - 50) * 0.16 : 0) + rng.normal(0, 7)) * wx.puntDistance, 22, 70));
    const landing = yardLine + gross;
    burn(rng.int(9, 14));

    if (p) {
      const st = statFor(p, ctx);
      st.punts++;
      st.snaps++;
      st.puntYds += Math.round(gross);
      st.puntLong = Math.max(st.puntLong, Math.round(gross));
      if (landing < 100 && landing >= 80) st.puntsInside20++;
    }

    if (landing >= 100) {
      emit({
        kind: "punt", result: "touchback", yards: Math.round(gross),
        down, toGo, yardLine, offenseId: ctx.team.id, playerId: p?.id,
      });
      changePossession(TOUCHBACK_YARDLINE);
      return;
    }

    let spot = clamp(100 - landing, 1, 99);

    if (rng.chance(0.55)) {
      const pool = [...receiving.starters.WR, ...receiving.starters.CB];
      const returner = pool.length
        ? rng.weighted(pool, (x) => Math.pow(Math.max(1, sc(x, "spd") - 55), 2))
        : null;
      const td = rng.chance(0.004);
      const ret = td ? 100 - spot : Math.round(clamp(rng.normal(8, 7), 0, 40));

      if (returner) {
        const st = statFor(returner, receiving);
        st.pr++;
        st.prYds += ret;
        st.prLong = Math.max(st.prLong, ret);
        if (td) st.prTd++;
      }

      kickExposure(p, ctx, 0.30);

      if (td) {
        award(receiving.team.id, 6, `${returner ? returner.lastName : "Returner"} ${ret} yd punt return TD`);
        emit({
          kind: "punt", result: "td", yards: ret,
          down, toGo, yardLine, offenseId: receiving.team.id, playerId: returner?.id,
        });
        attemptPat(receiving);
        offenseIsHome = receiving.team.id === home.id;
        kickoff();
        return;
      }
      spot = clamp(spot + ret, 1, 99);
      emit({
        kind: "punt", result: "return", yards: Math.round(gross),
        down, toGo, yardLine, offenseId: ctx.team.id, playerId: returner?.id,
      });
      changePossession(spot);
      return;
    }

    emit({
      kind: "punt", result: "gain", yards: Math.round(gross),
      down, toGo, yardLine, offenseId: ctx.team.id, playerId: p?.id,
    });
    changePossession(spot);
  }

  /** Interception or fumble returned all the way. */
  const defensiveTd = (defender: Player, defCtx: Ctx, kind: "INT" | "fumble", retYds: number) => {
    const st = statFor(defender, defCtx);
    st.defTd++;
    if (kind === "INT") st.intYds += retYds;
    award(defCtx.team.id, 6, `${defender.lastName} ${retYds} yd ${kind === "INT" ? "interception" : "fumble"} return TD`);
    attemptPat(defCtx);
    offenseIsHome = defCtx.team.id === home.id;
    kickoff();
  };

  // -------------------------------------------------------------------------
  // Plays
  // -------------------------------------------------------------------------

  interface PlayOutcome {
    yards: number;
    timeUsed: number;
    turnover: boolean;
    touchdown: boolean;
    /** A scoring sequence already resolved possession; the loop should skip on. */
    scored: boolean;
    passerId: number | null;
    scorerId: number | null;
    isPass: boolean;
    result?: PlayResult;
    targetId?: number;
  }

  const NO_PLAY = (t: number): PlayOutcome => ({
    yards: 0, timeUsed: t, turnover: false, touchdown: false, scored: false,
    passerId: null, scorerId: null, isPass: false,
  });

  const runPlay = (qbKeeper: boolean): PlayOutcome => {
    const o = off();
    const d = def();

    const ol = [...o.starters.OT, ...o.starters.OG, ...o.starters.C];
    const dl = [...d.starters.EDGE, ...d.starters.DT];
    const lbs = d.starters.LB;

    let carrier: Player | undefined;
    if (qbKeeper) {
      carrier = o.starters.QB[0];
    } else if (econRng.chance(RECEIVER_CARRY_RATE)) {
      // Jet sweep or end-around. Real clubs hand the ball to a receiver 0.83
      // times a game and to a tight end 0.11 (nfl-reference.md §5.6); the
      // engine had no path for it at all, which is most of why its running
      // backs took 87.4% of team carries against a real 80.7%.
      //
      // Who runs it comes off the depth chart the club already set — weighted
      // by speed among the receivers on the field, the same way the kick
      // returner is chosen. Nothing here sorts on overall rating.
      const wr = o.starters.WR;
      const te = o.starters.TE;
      const pool = econRng.chance(0.88) ? wr : te.length ? te : wr;
      carrier = pool.length
        ? econRng.weighted(pool, (p) => Math.pow(Math.max(1, sc(p, "spd") - 55), 2))
        : undefined;
    }
    if (!carrier && !qbKeeper) {
      const backs = o.starters.RB;
      // Today's committee split. The lead back's share is drawn per game, so a
      // hot hand can carry 25 times and a cold one can sit at 8.
      // Inside the five it is the lead back's ball — spreading goal-line work
      // evenly meant nobody ever scored four in a game.
      const goalLine = yardLine >= 93;
      const resting = garbageTime() && scoreDiffFor(offenseIsHome) > 0;
      const lead = resting
        ? 0.15                                    // starter is on the bench
        : goalLine
          ? Math.max(0.89, o.script.leadBackShare)
          : o.script.leadBackShare;
      const rest = 1 - lead;
      const shares = [lead, rest * 0.68, rest * 0.32];
      carrier = backs.length
        ? rng.weighted(backs, (b, i) => {
            const share = shares[i] ?? CARRY_SHARE[i] ?? 0.04;
            const best = backs[0];
            const quality = 1 + (att(b, "elu") + sc(b, "spd") - att(best, "elu") - sc(best, "spd")) * 0.006;
            return Math.max(0.01, share * quality);
          })
        : undefined;
    }
    if (!carrier) return NO_PLAY(30);

    const blockScore = unitAtt(ol, "rbk") * 0.6 + unitAtt(ol, "str") * 0.4;
    // Linebacker pursuit and recognition were doing nothing: `pur` only decided
    // who got credited with the tackle, and `awr` was read nowhere at all.
    // Both now help decide whether the run is stopped.
    const frontScore =
      unitAtt(dl, "pur") * 0.26 + unitAtt(dl, "str") * 0.26 +
      unitAtt(lbs, "tkl") * 0.18 + unitAtt(lbs, "pur") * 0.18 +
      unitAvg(lbs, "awr") * 0.12;
    const advantage = edge(blockScore, frontScore, 26);
    const skill = att(carrier, "elu") * 0.4 + sc(carrier, "acc") * 0.25 +
                  sc(carrier, "spd") * 0.2 + sc(carrier, "agi") * 0.15;

    const rbCarry = carrier.pos === "RB";
    const skillCentre = rbCarry ? rbCentre : 60;
    const skillSlope = rbCarry ? RB_SKILL_SLOPE : RB_SKILL_SLOPE_OLD;
    const skillTerm = (skillCentre - 60) * RB_SKILL_SLOPE_OLD + (skill - skillCentre) * skillSlope;
    const bo1Slope = rbCarry ? 0.0011 * (RB_SKILL_SLOPE / RB_SKILL_SLOPE_OLD) : 0.0011;
    const bo2Slope = rbCarry ? 0.00054 * (RB_SKILL_SLOPE / RB_SKILL_SLOPE_OLD) : 0.00054;

    const goalLineSquash = yardLine >= 88 ? 1.36 : yardLine >= 80 ? 0.72 : 0;
    const homeRun = offenseIsHome ? HOME_FIELD.homeRush : 1;
    // Short yardage on a must-convert down: extra blocker, quarterback sneak,
    // everybody pushing the pile. The defence knows it is coming, but the
    // offence still gets the yard more often than not.
    const shortYardagePush = down >= 3 && toGo <= 2 && yardLine < 88 ? 0.38 : 0;
    let yards = rng.normal(
      (0.93 + shortYardagePush - goalLineSquash + advantage * 3.10 + skillTerm)
        * homeRun * restFor(offenseIsHome),
      3.30
    );
    const breakout = clamp(0.40 + advantage * 1.25, 0.40, 1.70);
    if (rng.chance((0.046 + (skillCentre - 60) * 0.0011 + (skill - skillCentre) * bo1Slope) * breakout)) {
      yards += Math.abs(rng.normal(13, 9));           // through the second level
    }
    if (rng.chance((0.0113 + (skillCentre - 60) * 0.00054 + (skill - skillCentre) * bo2Slope) * breakout)) {
      yards += Math.abs(rng.normal(23, 13.5));          // gone
    }
    yards = Math.round(clamp(yards, -6, 100 - yardLine));

    const cs = statFor(carrier, o);
    cs.rushAtt++;

    // The trenches take contact on every run; the man with the ball takes the
    // most of it.
    hit(carrier, o, 1.00);
    hitUnit(ol, o, 0.18);
    hitUnit(dl, d, 0.15);
    hitUnit(lbs, d, 0.11);

    // Fumble. Recovery is contested — not every fumble is a turnover.
    const fumbleP = clamp(0.0330 - (att(carrier, "car") - 60) * 0.00032 + wx.fumble, 0.010, 0.085);
    if (rng.chance(fumbleP)) {
      cs.fumbles++;
      const forcer = rng.pick([...dl, ...lbs]);
      if (forcer) {
        const fs = statFor(forcer, d);
        fs.ff++;
        fs.tackles++;
      }
      if (rng.chance(0.46)) {
        cs.fumblesLost++;
        o.stats.turnovers++;
        o.stats.giveaways++;
        d.stats.takeaways++;
        const recoverer = rng.pick([...dl, ...lbs, ...d.starters.S]);
        const spot = clamp(yardLine + Math.max(0, Math.min(yards, 3)), 1, 99);
        if (recoverer) {
          statFor(recoverer, d).fr++;
          if (rng.chance(0.12 + (spot < 30 ? 0.08 : 0))) {
            defensiveTd(recoverer, d, "fumble", 100 - spot);
            return { ...NO_PLAY(rng.int(8, 16)), scored: true, result: "fumble", scorerId: carrier.id };
          }
        }
        return {
          yards: Math.max(0, Math.min(yards, 3)), timeUsed: rng.int(25, 40),
          turnover: true, touchdown: false, scored: false,
          passerId: null, scorerId: carrier.id, isPass: false, result: "fumble",
        };
      }
      yards = Math.max(0, Math.min(yards, 2));
    }

    cs.rushYds += yards;
    cs.rushLong = Math.max(cs.rushLong, yards);
    o.stats.rushYards += yards;
    o.stats.totalYards += yards;

    if (yards < 0) {
      const tflPlayer = rng.weighted([...dl, ...lbs], (p) => Math.max(1, att(p, "pur") - 35));
      if (tflPlayer) statFor(tflPlayer, d).tfl++;
    }

    // Tackles were spread too evenly across nineteen defenders, so nobody ever
    // led the league. Real front sevens funnel run tackles to the linebackers,
    // and one player takes close to a fifth of his team's stops.
    const tackler = rng.weighted(
      [...lbs, ...d.starters.S, ...dl, ...d.starters.CB],
      (p) => Math.pow(Math.max(1, att(p, "pur") * 0.6 + sc(p, "tkl") * 0.4 - 38), 1.52)
              * TACKLE_SHARE[p.pos]
              * (d.script.targetBoost.get(p.id) ?? 1)
    );
    if (tackler) statFor(tackler, d).tackles++;
    hit(tackler, d, 0.55);

    return {
      yards, timeUsed: rng.int(25, 40), turnover: false,
      touchdown: yardLine + yards >= 100, scored: false,
      passerId: null, scorerId: carrier.id, isPass: false,
      result: yardLine + yards >= 100 ? "td" : yards < 0 ? "loss" : "gain",
    };
  };

  const passPlay = (): PlayOutcome => {
    const o = off();
    const d = def();

    const qb = onField(o, "QB", 0) ?? o.starters.QB[0];
    if (!qb) return NO_PLAY(6);

    const ol = [...o.starters.OT, ...o.starters.OG, ...o.starters.C];
    const rushers = [...d.starters.EDGE, ...d.starters.DT];
    const cbs = d.starters.CB;
    const safeties = d.starters.S;
    const lbs = d.starters.LB;
    const receivers = [...o.starters.WR, ...o.starters.TE, ...o.starters.RB.slice(0, 1)];

    const qbStat = statFor(qb, o);

    // Pass protection: the lines collide whatever the ball does. The
    // quarterback's own exposure is added below, and only if he is hit.
    hitUnit(ol, o, 0.15);
    hitUnit(rushers, d, 0.13);

    const passBlock = unitAtt(ol, "pbk") * 0.75 + unitAtt(ol, "str") * 0.25;
    const passRush = unitAtt(rushers, "prs") * 0.7 + unitAtt(rushers, "acc") * 0.3;
    // Obvious passing down: the rush knows what is coming.
    const obviousPass = down >= 3 && toGo >= 7;
    const pressure = clamp(
      0.34 * (1 - edge(passBlock, passRush, 24)) * 2 * (obviousPass ? 1.18 : 1),
      0.10, 0.70
    );

    // Awareness is pre-snap: reading the front, identifying the free rusher and
    // getting the ball out. It cuts the sack rate before athleticism ever
    // matters.
    const recognition = clamp(1 - (att(qb, "awr") - 55) * 0.0055, 0.66, 1.30);
    if (rng.chance(pressure * 0.315 * recognition)) {
      const escape = clamp((att(qb, "agi") + att(qb, "acc") + att(qb, "spd")) / 3, 20, 99);
      if (rng.chance(clamp(0.10 + (escape - 55) * 0.011, 0, 0.45))) {
        // Got out of the pocket — this becomes a scramble.
        return runPlay(true);
      }
      const loss = Math.round(clamp(rng.normal(6.8, 2.6), 1, Math.max(1, yardLine - 1)));
      qbStat.sacked++;
      qbStat.sackYds += loss;
      o.stats.sacksAllowed++;
      o.stats.sackYardsAllowed += loss;
      const sacker = rng.weighted(rushers, (p) =>
        Math.pow(Math.max(1, sc(p, "prs") - 38), 1.55)
          * (p.pos === "EDGE" ? 1.28 : 1)
          * (d.script.targetBoost.get(p.id) ?? 1));
      if (sacker) {
        const ss = statFor(sacker, d);
        ss.sacks++;
        ss.tackles++;
        ss.tfl++;
      }
      // Going down under a sack is the single most dangerous thing that happens
      // to a quarterback.
      hit(qb, o, 1.45);
      hit(sacker, d, 0.35);
      o.stats.totalYards -= loss;
      o.stats.passYards -= loss;

      // Strip sack: the quarterback loses it going down.
      if (rng.chance(clamp(0.10 - (att(qb, "car") - 60) * 0.0012, 0.03, 0.20))) {
        qbStat.fumbles++;
        if (sacker) statFor(sacker, d).ff++;
        if (rng.chance(0.58)) {
          qbStat.fumblesLost++;
          o.stats.turnovers++;
          o.stats.giveaways++;
          d.stats.takeaways++;
          const rec = rng.pick(rushers);
          if (rec) statFor(rec, d).fr++;
          return {
            yards: -loss, timeUsed: rng.int(31, 45), turnover: true, touchdown: false,
            scored: false, passerId: qb.id, scorerId: null, isPass: true, result: "fumble",
          };
        }
      }

      return {
        yards: -loss, timeUsed: rng.int(31, 45), turnover: false, touchdown: false,
        scored: false, passerId: qb.id, scorerId: null, isPass: true, result: "sack",
      };
    }

    qbStat.passAtt++;

    /** Separation this receiver generates, and the coverage he is facing. */
    const sepOf = (p: Player) =>
      sc(p, "rte") * 0.55 + att(p, "spd") * 0.25 + att(p, "agi") * 0.20;
    const covOf = (p: Player) => {
      const c = o.coverage.get(p.id);
      return c ? sc(c, "cov") * 0.52 + att(c, "spd") * 0.31 + att(c, "awr") * 0.17 : 55;
    };

    const target = rng.weighted(receivers, (p, i) => {
      const base = sc(p, "rte") * 0.6 + att(p, "cth") * 0.4;
      const roleBonus = i === 0 ? 16 : i === 1 ? 11 : i === 2 ? 5 : 1;
      const boost = o.script.targetBoost.get(p.id) ?? 1;
      // Inside the 20 the ball goes to the players you trust.
      const rzBonus = yardLine >= 80 ? (i === 0 ? 37 : i === 1 ? 18 : i === 2 ? 5 : 0) : 0;
      // Quarterbacks throw away from coverage. A receiver winning his matchup
      // sees more targets; one erased by a shutdown corner sees fewer. This is
      // what makes a big receiving day traceable to a reason rather than to an
      // unconditional random multiplier.
      const matchup = clamp(1 + (sepOf(p) - covOf(p)) / 68, 0.40, 1.75);
      return Math.max(1, (base - 30 + roleBonus + rzBonus) * boost * matchup);
    });
    if (!target) return NO_PLAY(6);

    const tStat = statFor(target, o);
    tStat.targets++;

    // The defender assigned before the snap, not a fresh draw each play.
    const coverPool = target.pos === "WR" ? cbs : [...lbs, ...safeties];
    const defender =
      o.coverage.get(target.id) ??
      (coverPool.length
        ? rng.weighted(coverPool, (p) =>
            Math.pow(Math.max(1, sc(p, "cov") - 30), 1.5) * (d.script.targetBoost.get(p.id) ?? 1))
        : null);
    const coverage = defender
      ? sc(defender, "cov") * 0.52 + att(defender, "spd") * 0.31 + att(defender, "awr") * 0.17
      : 55;
    const separation =
      sc(target, "rte") * 0.55 + att(target, "spd") * 0.25 + att(target, "agi") * 0.20;

    const underPressure = rng.chance(pressure);
    const accuracy = att(qb, "tha") * 0.7 + att(qb, "dec") * 0.3 - (underPressure ? 12 : 0);

    // Compressed field: no room behind the defence once inside the 20.
    const rzBase = yardLine >= 90 ? 0.210 : yardLine >= 80 ? 0.140 : 0;
    const redZonePenalty = rzBase * clamp(
      1 - (att(qb, "tha") * 0.4 + att(qb, "dec") * 0.3 + unitAvg(receivers, "cth") * 0.3 - 66) * 0.011,
      0.70, 1.34
    );
    // Help over the top. Safeties are only assigned to tight ends, so without
    // this a great safety had no effect on throws to anybody else.
    const safetyHelp = safeties.length
      ? (unitAvg(safeties, "awr") * 0.5 + unitAvg(safeties, "cov") * 0.5 - 62) * 0.0045
      : 0;
    const homeEdge = offenseIsHome ? HOME_FIELD.homeCompletion : 1;
    const completionP = clamp(
      (0.533 + edge(separation, coverage, 30) * 0.32 +
        (accuracy - 55) * 0.0050 + (att(target, "cth") - 60) * 0.0020
        - redZonePenalty - clamp(safetyHelp, -0.06, 0.09)
        // Coverage tightens when the defence can sit on the sticks, and loosens
        // in short yardage when it has to respect the run.
        - (obviousPass ? 0.040 : 0) + (down >= 3 && toGo <= 2 ? 0.072 : 0))
        * wx.completion * homeEdge * restFor(offenseIsHome),
      0.15, 0.88
    );
    // Ball skills were missing entirely: interceptions depended only on the
    // quarterback, so no defensive back ever had a ball-hawking season and the
    // league leader topped out around four. Who is covering matters.
    const ballHawk = defender
      ? (sc(defender, "cov") * 0.45 + att(defender, "awr") * 0.40 + sc(defender, "jmp") * 0.15) - 62
      : 0;
    const intP = clamp(
      (0.0166 - (att(qb, "dec") - 60) * 0.00038 + (underPressure ? 0.010 : 0))
        * clamp(1 + ballHawk * 0.030, 0.38, 3.00),
      0.003, 0.060
    );

    // Contested ball: a tight window, or anything close to the goal line where
    // there is no space to work with. Decided in the air rather than by route.
    const tightWindow = separation < coverage + 16;
    const jumpBallSpot = yardLine >= 85;
    const contested = (tightWindow || jumpBallSpot) && rng.chance(0.26);
    if (contested) {
      const up = sc(target, "jmp") * 0.55 + att(target, "cth") * 0.45;
      const challenge = defender
        ? sc(defender, "jmp") * 0.45 + sc(defender, "cov") * 0.35 + att(defender, "spd") * 0.20
        : 55;
      const win = clamp(0.415 + (up - challenge) * 0.011, 0.10, 0.82);

      if (!rng.chance(win)) {
        // Broken up, and occasionally picked off at the catch point.
        if (defender) {
          const ds = statFor(defender, d);
          ds.passDef++;
          if (rng.chance(0.065)) {
            qbStat.passInt++;
            ds.ints++;
            o.stats.turnovers++;
            o.stats.giveaways++;
            d.stats.takeaways++;
            const retYds = Math.round(clamp(rng.normal(10, 10), 0, 99));
            ds.intYds += retYds;
            return {
              yards: 0, timeUsed: rng.int(8, 18), turnover: true, touchdown: false,
              scored: false, passerId: qb.id, scorerId: null, isPass: true,
              result: "int", targetId: target.id,
            };
          }
        }
        return {
          yards: 0, timeUsed: rng.int(3, 7), turnover: false, touchdown: false,
          scored: false, passerId: qb.id, scorerId: null, isPass: true,
          result: "incomplete", targetId: target.id,
        };
      }
      // Won the ball in the air — a catch, but no room to run afterwards.
      const gained = Math.round(clamp(Math.abs(rng.normal(14, 8)), 1, 100 - yardLine));
      qbStat.passCmp++;
      qbStat.passYds += gained;
      qbStat.passLong = Math.max(qbStat.passLong, gained);
      tStat.rec++;
      tStat.recYds += gained;
      tStat.recLong = Math.max(tStat.recLong, gained);
      o.stats.passYards += gained;
      o.stats.totalYards += gained;
      if (defender) statFor(defender, d).tackles++;
      hit(target, o, 0.85);
      hit(defender, d, 0.50);
      return {
        yards: gained, timeUsed: rng.int(25, 39), turnover: false,
        touchdown: yardLine + gained >= 100, scored: false,
        passerId: qb.id, scorerId: target.id, isPass: true,
        result: yardLine + gained >= 100 ? "td" : "complete", targetId: target.id,
      };
    }

    if (rng.chance(intP)) {
      qbStat.passInt++;
      o.stats.turnovers++;
      o.stats.giveaways++;
      d.stats.takeaways++;
      if (defender) {
        const ds = statFor(defender, d);
        ds.ints++;
        ds.passDef++;
        const retYds = Math.round(clamp(rng.normal(12, 12), 0, 99));
        ds.intYds += retYds;
        if (rng.chance(0.15)) {
          defensiveTd(defender, d, "INT", Math.max(retYds, 20));
          return { ...NO_PLAY(rng.int(8, 18)), scored: true, isPass: true, result: "int", passerId: qb.id, targetId: target.id };
        }
      }
      return {
        yards: 0, timeUsed: rng.int(8, 20), turnover: true, touchdown: false,
        scored: false, passerId: qb.id, scorerId: null, isPass: true,
        result: "int", targetId: target.id,
      };
    }

    if (!rng.chance(completionP)) {
      if (defender && rng.chance(0.30)) statFor(defender, d).passDef++;
      return {
        yards: 0, timeUsed: rng.int(3, 7), turnover: false, touchdown: false,
        scored: false, passerId: qb.id, scorerId: null, isPass: true,
        result: "incomplete", targetId: target.id,
      };
    }

    const roll = rng.next();
    const bombP =
      (0.0115 + (att(qb, "thp") - 60) * 0.00035 + (sc(target, "spd") - 60) * 0.0003)
      * wx.deepPass * clamp(1 - safetyHelp, 0.45, 1.6);
    const deepP = bombP + (0.115 + (att(qb, "thp") - 60) * 0.0015) * wx.deepPass * clamp(1 - safetyHelp * 0.5, 0.6, 1.4);
    /**
     * What the passer's arm is worth on this throw.
     *
     * The old form, 0.865 + q/520, spanned about 5% across the ENTIRE
     * quarterback population — a 90-rated arm threw for 5% more air than a
     * 60-rated one — which is why the sim's passing leaderboard was flat at
     * the top while its middle and its attempt counts were already exact
     * (nfl-reference.md §5.7). Real yards per attempt spans 9.3% from the top
     * five passers to ranks 11-20; the sim spanned 4.0%.
     *
     * The extra slope is centred on QB_CENTRE, the middle of the starting
     * population, so it is a REDISTRIBUTION and not a raise: an elite arm
     * gains what a replacement one sheds and the league mean is untouched
     * (`calibrate.passYds`). Same discipline as `sepEdge` below.
     */
    const armQ = att(qb, "tha") * 0.5 + att(qb, "thp") * 0.5;
    const armQuality = 0.865 + armQ / 520 + (armQ - QB_CENTRE) * QB_SPREAD;
    /**
     * How far down the field this receiver gets thrown to, relative to the
     * defender across from him.
     *
     * Air yards depended on the passer's arm and on nothing about the man
     * catching it, so a receiver who beat his corner all afternoon was thrown
     * the same route as one who could not get open — the only edge he carried
     * was catch rate and run-after. That is why the sim's top receivers came in
     * at 8.4 yards a target against a real 9.8 while their TARGET counts were
     * already exact (nfl-reference.md §5.7), and why the passing leaderboard
     * was flat at the top with correct volume underneath it.
     *
     * Centred on a neutral matchup, so a league where separation and coverage
     * are balanced throws for exactly what it threw for before: this widens the
     * gap between an elite pass catcher and a replacement one without moving
     * any league mean.
     */
    const sepEdge = clamp(1 + (separation - coverage) / 180, 0.85, 1.22);
    const air = (
      roll < bombP ? Math.abs(rng.normal(34, 14))     // shot down the field
      : roll < deepP ? Math.abs(rng.normal(16.2, 7.5))  // intermediate
      // Underneath. On a down that has to be converted, the route breaks at
      // the marker instead of wherever it happened to land — the single
      // biggest reason a sim under-converts third down is throwing four-yard
      // routes on third-and-seven.
      : Math.abs(rng.normal(down >= 3 ? Math.min(9.8, Math.max(4.14, toGo * 0.63)) : 4.14, 3.7))
    ) * armQuality * sepEdge;
    // A defender who is where he should be takes the run-after away.
    const tackleLeverage = defender
      ? att(defender, "awr") * 0.36 + sc(defender, "tkl") * 0.34 + att(defender, "spd") * 0.30
      : 55;
    let yac = Math.max(0, rng.normal(
      2.60 + (att(target, "elu") - 55) * 0.043 + (att(target, "spd") - 60) * 0.028
      - (tackleLeverage - 60) * 0.030,
      4.45
    ));
    // Broken tackle in space — how a 12-yard catch becomes a 60-yard gain.
    if (rng.chance(0.012 + (att(target, "elu") - 60) * 0.0004)) {
      yac += Math.abs(rng.normal(16, 9.5));
    }
    const yards = Math.round(clamp(air + yac, -3, 100 - yardLine));

    qbStat.passCmp++;
    qbStat.passYds += yards;
    qbStat.passLong = Math.max(qbStat.passLong, yards);
    tStat.rec++;
    tStat.recYds += yards;
    tStat.recLong = Math.max(tStat.recLong, yards);
    o.stats.passYards += yards;
    o.stats.totalYards += yards;

    const tackler = rng.weighted([...cbs, ...safeties, ...lbs], (p) =>
      Math.pow(Math.max(1, sc(p, "tkl") - 34), 1.54) * TACKLE_SHARE[p.pos]
        * (d.script.targetBoost.get(p.id) ?? 1)
    );
    if (tackler) statFor(tackler, d).tackles++;
    hit(target, o, 0.85);
    hit(tackler, d, 0.50);

    // Fumble after the catch.
    if (rng.chance(clamp(0.010 - (att(target, "car") - 60) * 0.00012, 0.003, 0.022))) {
      tStat.fumbles++;
      if (tackler) statFor(tackler, d).ff++;
      if (rng.chance(0.55)) {
        tStat.fumblesLost++;
        o.stats.turnovers++;
        o.stats.giveaways++;
        d.stats.takeaways++;
        if (tackler) statFor(tackler, d).fr++;
        return {
          yards, timeUsed: rng.int(25, 39), turnover: true, touchdown: false,
          scored: false, passerId: qb.id, scorerId: target.id, isPass: true,
          result: "fumble", targetId: target.id,
        };
      }
    }

    return {
      yards, timeUsed: rng.int(25, 39), turnover: false,
      touchdown: yardLine + yards >= 100, scored: false,
      passerId: qb.id, scorerId: target.id, isPass: true,
      result: yardLine + yards >= 100 ? "td" : "complete", targetId: target.id,
    };
  };

  // -------------------------------------------------------------------------
  // Decisions
  // -------------------------------------------------------------------------

  const goForIt = (): boolean => {
    const distToGoal = 100 - yardLine;
    const diff = scoreDiffFor(offenseIsHome);
    const desperate = quarter >= 4 && diff < 0 && clock < 300;
    const aggression = off().coach.aggression / 100;

    if (distToGoal <= 2 && toGo <= 1) return true;
    if (desperate && distToGoal > 38) return true;
    // Modern fourth-down aggression: short yardage past midfield is a go, and
    // the calculus loosens further when trailing in the second half.
    const trailing = diff < 0 && quarter >= 3;
    if (yardLine >= 46 && toGo <= 1 && rng.chance(0.86 + aggression * 0.13)) return true;
    if (yardLine >= 50 && toGo <= 3 && rng.chance(0.56 + aggression * 0.34)) return true;
    if (yardLine >= 30 && toGo <= 2 && rng.chance(0.50 + aggression * 0.34)) return true;
    // Not from inside comfortable kicking range — real teams take the points.
    if (yardLine >= 60 && yardLine <= 67 && toGo <= 5 && rng.chance(0.30 + aggression * 0.22)) return true;
    if (trailing && toGo <= 5 && yardLine >= 38 && rng.chance(0.52 + aggression * 0.3)) return true;
    if (trailing && quarter === 4 && toGo <= 8 && rng.chance(0.30)) return true;
    return false;
  };

  /**
   * Attempting from anywhere inside 43 yards of the goal line meant a 60-yard
   * try was routine — the sim was making seventeen 60-yarders a season against
   * a real-world rate near one. Range is the kicker's, and only desperation
   * stretches it.
   */
  const inFieldGoalRange = (): boolean => {
    const k = off().starters.K[0];
    const distance = (100 - yardLine) + 17;
    const leg = (k ? 54.5 + (att(k, "kpw") - 50) * 0.16 : 49) + wx.kickRange;
    const endOfHalf = (quarter === 2 || quarter === 4 || overtime) && clock < 30;
    const desperate =
      quarter >= 4 && scoreDiffFor(offenseIsHome) < 0 && clock < 150;
    const maxRange = leg + (endOfHalf || desperate ? 7 : 0);
    return distance <= maxRange;
  };

  const choosePass = (): boolean => {
    const diff = scoreDiffFor(offenseIsHome);
    let p = Math.max(0.40, (0.568 + off().coach.passBias * 0.12 + off().script.passLean * 0.42) * wx.passRate);
    if (down === 3 && toGo >= 5) p += 0.28;
    if (down === 2 && toGo >= 8) p += 0.12;
    if (toGo <= 2) p -= 0.18;
    if (100 - yardLine <= 3) p -= 0.12;
    const qbTha = off().starters.QB[0];
      if (yardLine >= 80) p += clamp((qbTha ? sc(qbTha, "tha") : 60) - 68, -10, 22) * 0.0035;
    if (quarter >= 4) {
      if (diff < -8 && clock < 480) p += 0.24;
      else if (diff > 16) p -= 0.42;
      else if (diff > 8 && clock < 540) p -= 0.30;
    } else if (quarter === 3) {
      if (diff > 17) p -= 0.26;
      else if (diff > 12) p -= 0.16;
    }
    return rng.chance(clamp(p, 0.15, 0.93));
  };

  // -------------------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------------------

  off().stats.possessions++;
  emit({
    kind: "kickoff", result: "touchback", yards: 0,
    down: 1, toGo: 10, yardLine: TOUCHBACK_YARDLINE, offenseId: off().team.id,
  });
  let guard = 0;

  while (guard++ < 500) {
    if (clock <= 0) {
      if (quarter >= 4 && !overtime) {
        if (homeScore !== awayScore) break;
        overtime = true;
        quarter = 5;
        clock = 600;
        kickoff();
      } else if (overtime) {
        if (homeScore !== awayScore) break;
        if (game.playoffRound === null) break;
        clock = 600;
      } else {
        quarter++;
        clock = QUARTER_SECONDS;
        if (quarter === 3) {
          offenseIsHome = !receivedFirst;
          startDrive(TOUCHBACK_YARDLINE);
          emit({
            kind: "kickoff", result: "touchback", yards: 0,
            down: 1, toGo: 10, yardLine: TOUCHBACK_YARDLINE, offenseId: off().team.id,
          });
        }
      }
      continue;
    }
    if (overtime && homeScore !== awayScore) break;

    if (yardLine >= 80 && !off().inRedZoneThisDrive) {
      off().inRedZoneThisDrive = true;
      off().stats.redZoneAtt++;
    }

    // Victory formation, before anything else a club might do with the ball.
    // A lead, the ball, and less time on the clock than three kneels will burn
    // — so the game is already over and nobody risks a snap. Credited as a
    // quarterback rush for real negative yardage, which is what makes it show
    // up in his line the way it does in a real one.
    if (
      quarter >= 4 && !overtime && down <= 3 &&
      clock <= KNEEL_CLOCK_SECONDS && scoreDiffFor(offenseIsHome) > 0
    ) {
      const o = off();
      const qb = o.starters.QB[0];
      if (qb) {
        const st = statFor(qb, o);
        const loss = econRng.int(-2, 0);
        st.rushAtt++;
        st.rushYds += loss;
        o.stats.rushYards += loss;
        o.stats.totalYards += loss;
        o.stats.plays++;
        creditSnaps(o, def());
        yardLine = clamp(yardLine + loss, 1, 99);
        toGo -= loss;
        down++;
        // Measured snap-to-snap on a real kneel: 31.9 seconds (§5.6).
        burn(econRng.int(26, 38));
        emit({
          kind: "kneel", result: loss < 0 ? "loss" : "gain", yards: loss,
          down: down - 1, toGo: toGo + loss, yardLine: yardLine - loss,
          offenseId: o.team.id, playerId: qb.id,
        });
        if (down > 4) {
          emit({
            kind: "downs", result: "downs", yards: 0,
            down: 4, toGo, yardLine, offenseId: o.team.id,
          });
          changePossession(clamp(100 - yardLine, 1, 99));
        }
        continue;
      }
    }

    if (down === 4) {
      if (!goForIt()) {
        if (inFieldGoalRange()) { attemptFieldGoal(); continue; }
        punt();
        continue;
      }
      off().stats.fourthDownAtt++;
    }

    // Penalties, resolved before the snap.
    {
      const o = off();
      const d = def();
      const oUnit = [...o.starters.OT, ...o.starters.OG, ...o.starters.C, ...o.starters.WR];
      // Discipline avoids the foul; awareness (line calls, snap counts) avoids
      // the confusion that causes it.
      const lineUnit = [...o.starters.OT, ...o.starters.OG, ...o.starters.C];
      // Most pre-snap fouls are on the line, so weight it there rather than
      // averaging across the receivers as well.
      const oDisc =
        unitAvg(oUnit, "dsc") * 0.45 +
        unitAvg(lineUnit, "awr") * 0.35 +
        unitAvg(lineUnit, "dsc") * 0.20;
      const dDisc = unitAvg([...d.starters.EDGE, ...d.starters.DT, ...d.starters.CB], "dsc");

      const crowd = offenseIsHome ? 1 : HOME_FIELD.visitorPenalty;
      if (rng.chance(clamp((0.045 - (oDisc - 60) * 0.00042) * crowd, 0.013, 0.11))) {
        const yds = rng.pick([5, 5, 10, 10, 15]);
        o.stats.penalties++;
        o.stats.penaltyYards += yds;
        const spot = yardLine;
        yardLine = clamp(yardLine - yds, 1, 99);
        toGo += yds;
        burn(rng.int(6, 12));
        emit({
          kind: "penalty", result: "accepted", yards: -yds,
          down, toGo: toGo - yds, yardLine: spot, offenseId: o.team.id,
        });
        continue;
      }
      if (rng.chance(clamp(0.040 - (dDisc - 60) * 0.00038, 0.013, 0.08))) {
        const yds = rng.pick([5, 5, 5, 10, 15]);
        d.stats.penalties++;
        d.stats.penaltyYards += yds;
        const spot = yardLine;
        yardLine = clamp(yardLine + yds, 1, 99);
        if (yds >= 10 || yds >= toGo) {
          down = 1;
          toGo = Math.min(10, 100 - yardLine);
          o.stats.firstDowns++;
          o.stats.penaltyFirstDowns++;
        } else {
          toGo = Math.max(1, toGo - yds);
        }
        burn(rng.int(6, 12));
        emit({
          kind: "penalty", result: "accepted", yards: yds,
          down, toGo, yardLine: spot, offenseId: o.team.id,
        });
        continue;
      }
    }

    const isThird = down === 3;
    const isFourth = down === 4;
    if (isThird) off().stats.thirdDownAtt++;

    let call: "run" | "pass" | "auto" = "auto";
    if (opts?.playCaller && off().team.id === state.userTeamId) {
      call = opts.playCaller({
        down, toGo, yardLine, quarter, clock, homeScore, awayScore, offenseIsHome,
      });
    }
    const doPass = call === "pass" ? true : call === "run" ? false : choosePass();
    // Quarterback keeps it: sneaks in short yardage, designed runs for the
    // mobile ones. Without this, quarterbacks finished seasons with 0 carries.
    const qb0 = off().starters.QB[0];
    const mobility = qb0 ? (sc(qb0, "spd") + sc(qb0, "agi")) / 2 : 50;
    const sneak =
      !doPass &&
      ((toGo <= 1 && rng.chance(0.30)) ||
        rng.chance(clamp((mobility - 62) * 0.0055, 0, 0.16)));
    // Capture the units before the snap: a defensive touchdown resolves the
    // score, the PAT and the kickoff inside the play function, so off() and
    // def() have already swapped by the time it returns.
    const snapOff = off();
    const snapDef = def();
    contact = [];
    const snapDown = down;
    const snapToGo = toGo;
    const snapYl = yardLine;
    const outcome = doPass ? passPlay() : runPlay(sneak);
    creditSnaps(snapOff, snapDef);
    // After the snap is credited, so a man who goes down keeps the work he did.
    rollInGameInjury();

    off().stats.plays++;
    burn(outcome.timeUsed);

    {
      const kind: PlayKind = outcome.result === "sack" || (outcome.isPass && outcome.yards < 0 && !outcome.result)
        ? "sack"
        : outcome.isPass ? "pass" : "run";
      const result: PlayResult = outcome.result
        ?? (outcome.touchdown ? "td"
          : outcome.turnover ? (outcome.isPass ? "int" : "fumble")
          : kind === "pass" ? (outcome.yards === 0 ? "incomplete" : "complete")
          : outcome.yards < 0 ? "loss" : "gain");
      emit({
        kind, result, yards: outcome.yards,
        down: snapDown, toGo: snapToGo, yardLine: snapYl,
        offenseId: snapOff.team.id,
        playerId: outcome.passerId ?? outcome.scorerId ?? undefined,
        targetId: outcome.targetId ?? (outcome.isPass ? outcome.scorerId ?? undefined : undefined),
      });
    }

    if (outcome.scored) continue;

    if (outcome.turnover) {
      const spot = clamp(yardLine + Math.max(0, outcome.yards), 1, 99);
      changePossession(clamp(100 - spot, 1, 99));
      continue;
    }

    if (outcome.touchdown) {
      const o = off();
      const scorer = outcome.scorerId != null ? byId.get(outcome.scorerId) : undefined;
      const fromRz = o.inRedZoneThisDrive;
      if (outcome.isPass) {
        const passer = outcome.passerId != null ? byId.get(outcome.passerId) : undefined;
        if (passer) statFor(passer, o).passTd++;
        if (scorer) statFor(scorer, o).recTd++;
        scoreTouchdown(o,
          `${scorer ? scorer.lastName : "Receiver"} ${outcome.yards} yd TD reception from ${passer ? passer.lastName : "QB"}`,
          fromRz);
      } else {
        if (scorer) statFor(scorer, o).rushTd++;
        scoreTouchdown(o, `${scorer ? scorer.lastName : "Runner"} ${outcome.yards} yd TD run`, fromRz);
      }
      continue;
    }

    const newYardLine = yardLine + outcome.yards;

    if (newYardLine <= 0) {
      const d = def();
      const tacklers = [...d.starters.EDGE, ...d.starters.DT, ...d.starters.LB];
      const who = tacklers.length ? rng.pick(tacklers) : null;
      if (who) statFor(who, d).safeties++;
      award(d.team.id, 2, `Safety${who ? ` — tackled by ${who.lastName}` : ""}`);
      emit({
        kind: "safety", result: "safety", yards: outcome.yards,
        down: snapDown, toGo: snapToGo, yardLine: snapYl,
        offenseId: snapOff.team.id, playerId: who?.id,
      });
      changePossession(45);
      continue;
    }

    yardLine = clamp(newYardLine, 1, 99);
    toGo -= outcome.yards;

    if (toGo <= 0) {
      const o = off();
      if (isThird) o.stats.thirdDownConv++;
      if (isFourth) o.stats.fourthDownConv++;
      o.stats.firstDowns++;
      if (outcome.isPass) o.stats.passFirstDowns++;
      else o.stats.rushFirstDowns++;
      down = 1;
      toGo = Math.min(10, 100 - yardLine);
    } else {
      down++;
      if (down > 4) {
        emit({
          kind: "downs", result: "downs", yards: 0,
          down: 4, toGo, yardLine, offenseId: off().team.id,
        });
        changePossession(clamp(100 - yardLine, 1, 99));
      }
    }
  }

  // Time of possession is accumulated per play; normalise so the two sides sum
  // to the length of the game rather than to the plays that happened to be run.
  const played = overtime ? REGULATION_SECONDS + 600 : REGULATION_SECONDS;
  const topTotal = ctxHome.stats.timeOfPossession + ctxAway.stats.timeOfPossession;
  if (topTotal > 0) {
    ctxHome.stats.timeOfPossession = Math.round(
      (ctxHome.stats.timeOfPossession / topTotal) * played
    );
    ctxAway.stats.timeOfPossession = played - ctxHome.stats.timeOfPossession;
  }

  // Snaps accumulate as fractional rotation shares; collapse them to whole
  // snaps exactly once, here, so the season line never sums floats.
  for (const s of pstats.values()) s.snaps = Math.round(s.snaps);

  // Anyone who took a snap gets a line even if he recorded nothing else. That
  // is what makes `games` and `gamesStarted` increment for a defender who
  // played sixty snaps without making a tackle.
  const players = [...pstats.values()].filter(
    (s) =>
      s.snaps > 0 ||
      s.passAtt || s.rushAtt || s.targets || s.tackles || s.sacks || s.ints ||
      s.fga || s.xpa || s.punts || s.passDef || s.ff || s.fr || s.kr || s.pr ||
      s.twoPtAtt || s.safeties
  );

  const inactiveIds = [...(home.inactives ?? []), ...(away.inactives ?? [])];
  const drives = buildDrives(playLog);
  const userIn = game.homeId === state.userTeamId || game.awayId === state.userTeamId;
  return {
    homeScore,
    awayScore,
    plays: playLog,
    box: {
      home: ctxHome.stats,
      away: ctxAway.stats,
      quarters: { home: ctxHome.quarterPoints, away: ctxAway.quarterPoints },
      scoringPlays,
      players,
      drives,
      ...(userIn && playLog.length ? { plays: playLog } : {}),
      ...(inactiveIds.length ? { inactives: inactiveIds } : {}),
    },
  };
}
