/**
 * Domain model.
 *
 * Two rules that the old build broke and this one holds:
 *
 *  1. There is exactly ONE array of people (`players`). A draft prospect is a
 *     Player with `prospect: true`. Drafting flips a flag and sets teamId.
 *     No second namespace, no id that might live in one of two tables.
 *
 *  2. GameState is a single serializable object. A save is one JSON document,
 *     so there is no such thing as a partially-written save, and no query can
 *     leak across saves.
 */

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

export const POSITIONS = [
  "QB", "RB", "WR", "TE", "OT", "OG", "C",
  "EDGE", "DT", "LB", "CB", "S", "K", "P",
] as const;

export type Position = (typeof POSITIONS)[number];

export const OFFENSE: Position[] = ["QB", "RB", "WR", "TE", "OT", "OG", "C"];
export const DEFENSE: Position[] = ["EDGE", "DT", "LB", "CB", "S"];
export const SPECIALISTS: Position[] = ["K", "P"];

export const POSITION_GROUP: Record<Position, string> = {
  QB: "QB", RB: "RB", WR: "WR", TE: "TE",
  OT: "OL", OG: "OL", C: "OL",
  EDGE: "DL", DT: "DL", LB: "LB",
  CB: "DB", S: "DB", K: "ST", P: "ST",
};

/** Minimum live bodies per position for a legal 53. Sums to 45; 8 flex. */
export const POSITION_MIN: Record<Position, number> = {
  QB: 2, RB: 3, WR: 5, TE: 2, OT: 4, OG: 3, C: 2,
  EDGE: 4, DT: 4, LB: 4, CB: 5, S: 3, K: 1, P: 1,
};

/** Target counts used when generating and when the CPU fills a roster. */
export const POSITION_TARGET: Record<Position, number> = {
  QB: 3, RB: 4, WR: 6, TE: 3, OT: 4, OG: 4, C: 2,
  EDGE: 5, DT: 4, LB: 5, CB: 6, S: 4, K: 1, P: 2,
};

/** How many of each position are on the field for a normal snap. */
export const STARTERS: Record<Position, number> = {
  QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1,
  // Nickel is the modern base defence: three corners means two linebackers,
  // not three. At LB 3 the defence fielded twelve men, which ran defensive
  // snap counts ~9% hot and quietly advantaged defenders in progression.
  EDGE: 2, DT: 2, LB: 2, CB: 3, S: 2, K: 1, P: 1,
};

/**
 * How many players at each position the engine actually loads for a game.
 *
 * Wider than STARTERS on purpose. Loading a single running back handed him
 * 100% of carries — one back finished a season with 546 attempts against a
 * real-world record of 416 — because there was literally nobody else to give
 * the ball to. Backfields and receiver rooms rotate; the trenches don't.
 */
export const ROTATION: Record<Position, number> = {
  QB: 2, RB: 3, WR: 4, TE: 2, OT: 2, OG: 2, C: 1,
  EDGE: 4, DT: 4, LB: 4, CB: 4, S: 3, K: 1, P: 1,
};

/** Share of carries by depth-chart position. Roughly an NFL committee split. */
export const CARRY_SHARE = [0.60, 0.27, 0.13];

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

export interface Attributes {
  // Athletic
  spd: number; // speed
  acc: number; // acceleration / burst
  agi: number; // agility / change of direction
  str: number; // strength
  jmp: number; // jumping / contested catch
  sta: number; // stamina

  // Technical — offense
  thp: number; // throw power
  tha: number; // throw accuracy
  rte: number; // route running
  cth: number; // catching / hands
  elu: number; // elusiveness / broken tackles
  car: number; // ball security
  rbk: number; // run blocking
  pbk: number; // pass blocking

  // Technical — defense
  tkl: number; // tackling
  prs: number; // pass rush
  cov: number; // coverage
  pur: number; // pursuit / run defense

  // Special teams
  kpw: number; // kick power
  kac: number; // kick accuracy

  // Mental
  awr: number; // awareness / play recognition
  dec: number; // decision making
  dsc: number; // discipline (penalties)
}

export type AttrKey = keyof Attributes;

export const ATTR_KEYS: AttrKey[] = [
  "spd", "acc", "agi", "str", "jmp", "sta",
  "thp", "tha", "rte", "cth", "elu", "car", "rbk", "pbk",
  "tkl", "prs", "cov", "pur",
  "kpw", "kac",
  "awr", "dec", "dsc",
];

export const ATTR_LABEL: Record<AttrKey, string> = {
  spd: "Speed", acc: "Acceleration", agi: "Agility", str: "Strength",
  jmp: "Jumping", sta: "Stamina", thp: "Throw Power", tha: "Throw Accuracy",
  rte: "Route Running", cth: "Catching", elu: "Elusiveness", car: "Ball Security",
  rbk: "Run Block", pbk: "Pass Block", tkl: "Tackling", prs: "Pass Rush",
  cov: "Coverage", pur: "Pursuit", kpw: "Kick Power", kac: "Kick Accuracy",
  awr: "Awareness", dec: "Decision Making", dsc: "Discipline",
};

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

/**
 * Cap hit for a year = base salary that year + annual proration of the signing
 * bonus. Cutting accelerates all remaining proration into dead money — which is
 * what makes roster building an actual constraint.
 */
export interface Contract {
  years: number;          // total length
  yearsRemaining: number;
  baseSalary: number[];   // per remaining year, index 0 = this season
  signingBonus: number;   // total, prorated over min(years, 5)
  bonusProrationYears: number;
  signedSeason: number;
  guaranteedYears: number; // leading years that cannot be cut without full cost
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export interface SeasonStatLine {
  season: number;
  teamId: number | null;
  games: number;
  gamesStarted: number;

  // Passing
  passAtt: number; passCmp: number; passYds: number; passTd: number; passInt: number;
  sacked: number; sackYds: number; passLong: number;

  // Rushing — quarterbacks scramble, so this is not just running backs
  rushAtt: number; rushYds: number; rushTd: number; rushLong: number;
  fumbles: number; fumblesLost: number;

  // Receiving
  targets: number; rec: number; recYds: number; recTd: number; recLong: number;

  // Defense
  tackles: number; tfl: number; sacks: number; ints: number; intYds: number;
  passDef: number; ff: number; fr: number; defTd: number; safeties: number;

  // Kicking
  fgm: number; fga: number; xpm: number; xpa: number; longFg: number;

  // Punting
  punts: number; puntYds: number; puntLong: number; puntsInside20: number;

  // Returns
  kr: number; krYds: number; krTd: number; krLong: number;
  pr: number; prYds: number; prTd: number; prLong: number;

  // Two-point conversions
  twoPtAtt: number; twoPtMade: number;

  snaps: number;
}

export interface Player {
  id: number;
  firstName: string;
  lastName: string;
  pos: Position;
  age: number;
  teamId: number | null;   // null = free agent (or undrafted prospect)

  attrs: Attributes;
  ovr: number;             // derived from attrs via position weights
  pot: number;             // ceiling, hidden from the user

  // Development
  devSpeed: number;        // 0.5 slow .. 1.5 fast
  peakAge: number;
  /**
   * The rating he will ACTUALLY top out at, as opposed to `pot`, which is the
   * ceiling he projects to. Most players never come close to their projection.
   *
   * Splitting the two is what makes a bust a bust. With growth aimed straight
   * at `pot`, every player reached his ceiling — a standard deviation of 0.9
   * against a mean of about 4 meant potential was destiny, so nothing ever
   * washed out, rosters never turned over, and a seventh-round pick became a
   * multi-year starter 15.8% of the time against a real 5.9%.
   *
   * Never shown, and deliberately not scoutable: this is genuine developmental
   * variance rather than something a club could have known.
   */
  ceiling: number;
  durability: number;      // 0..100, higher = fewer injuries

  contract: Contract | null;
  yearsPro: number;
  retired: boolean;

  // Draft prospect fields
  prospect: boolean;
  draftClassSeason: number | null;
  scouted: number;         // 0..100 scouting effort invested
  scoutedOvrLow: number | null;   // legacy shared band — superseded by state.scouting
  scoutedOvrHigh: number | null;
  draftedRound: number | null;
  draftedPick: number | null;
  /**
   * Who this man is off the rating sheet: school, measurements, testing
   * numbers, and the risk grades a club only learns by doing the work.
   * Optional so every save written before 2026-07-30 still loads.
   */
  profile?: ProspectProfile;

  // Health
  injuryWeeks: number;     // 0 = healthy
  injuryDesc: string | null;

  /**
   * Roster slot. Missing = active, so saves written before IR/PS still load.
   * IR and practice-squad stay on `state.players` (invariant 4) and do not
   * count against 53 or the camp 90.
   */
  status?: "ir" | "ps";
  /** Games spent on the current IR stint. Missing = 0. */
  irGames?: number;
  /** Practice-squad elevations used this season (max 3). Missing = 0. */
  psElevations?: number;

  stats: SeasonStatLine[];
  careerAwards: string[];
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export type Conference = "AFC" | "NFC";

/**
 * A club's front-office philosophy, as numbers.
 *
 * Written once at league creation and stored on the save, so the CPU's
 * personality replays from a seed and costs nothing at runtime. The archetypes
 * themselves live in `lib/core/frontOffice.ts`.
 */
export interface FrontOffice {
  name: string;
  blurb: string;
  /** 0 = build patiently through the draft, 1 = mortgage the future. */
  winNow: number;
  /** Appetite for upside, injury history and unproven youth. */
  risk: number;
  /** How close to the cap they are willing to operate. */
  capAggression: number;
  /** Premium paid to retain their own expiring players. */
  loyalty: number;
  /** How steeply they discount players on the wrong side of thirty. */
  youthPreference: number;
  /** 0 = draft for need, 1 = draft the best player on the board. */
  bpaBias: number;
  /** Multipliers on the league-consensus value of a position. */
  posBias: Partial<Record<Position, number>>;
}

export interface Team {
  id: number;
  city: string;
  name: string;
  abbr: string;
  conference: Conference;
  division: string;        // "AFC East" etc.
  primary: string;         // hex
  secondary: string;

  /** Ordered player ids per position; index 0 is the starter. */
  depthChart: Record<Position, number[]>;
  /** True when the user has hand-edited; disables auto-sort. */
  depthChartManual: boolean;

  coach: Coach;
  /** Optional so saves written before front offices existed still load. */
  frontOffice?: FrontOffice;
  /**
   * Leftover from the retired point-pool spend. New saves omit it. Old saves
   * may still carry a number; `ensureScouting` discards it and starts the
   * calendar honestly (30 visits, window from the current phase).
   */
  scoutingPoints?: number;

  /**
   * How this club splits its staff points across development, scouting,
   * training and scheme. See `lib/core/staff.ts` — every effect there is a
   * deviation from an even split, so an absent budget behaves exactly as the
   * game did before the system existed.
   */
  staff?: StaffBudget;
  /** Up to three players the development staff is built around. */
  devFocus?: number[];
  /** Offensive and defensive identity ids, from `SCHEMES`. */
  offScheme?: string;
  defScheme?: string;
  /** Dead money charged to this season from cuts. Reset at the season rollover. */
  deadCap: number;
  /**
   * IR return designations used this season (max 8). Missing = 0 so older
   * saves start the season with a full allotment.
   */
  irReturnsUsed?: number;
  /**
   * Week-scoped gameday sits (player ids). Missing = nobody sat, so older
   * saves load. Still on the 53; cleared after the game.
   */
  inactives?: number[];
  /**
   * This-week play-calling sheet. Missing = coach passBias / aggression, so
   * older saves load. Cleared after the week. CPU clubs never write one.
   */
  callSheet?: CallSheet;
}

/**
 * The four things a front office can spend its staff points on.
 *
 * Declared here rather than in `staff.ts` because `Team` carries it and
 * `staff.ts` needs `Team` — the type has to live on the side of that
 * dependency that does not create a cycle. The model itself is in `staff.ts`.
 */
export interface StaffBudget {
  development: number;
  scouting: number;
  training: number;
  scheme: number;
}

/** One Play-the-Game snap for the user club. `"auto"` uses choosePass. */
export type SnapCall = "run" | "pass" | "auto";

/**
 * GM this-game overrides. Same units as Coach.passBias / Coach.aggression —
 * not a measured NFL rate. Missing fields leave the coach dials in place.
 */
export interface CallSheet {
  /** -1 run-heavy … +1 pass-heavy. Missing = coach.passBias. */
  passLean?: number;
  /** 0–100. Missing = coach.aggression. */
  aggression?: number;
  /**
   * Optional Play-the-Game list for the user club's offensive snaps.
   * Consumed in order; leftover snaps use choosePass. Missing = Auto.
   */
  snaps?: SnapCall[];
}

export interface Coach {
  name: string;
  offense: number;     // 0..100 — play-calling edge on offense
  defense: number;
  development: number; // affects player progression
  aggression: number;  // 4th down / 2pt tendency
  passBias: number;    // -1 run heavy .. +1 pass heavy
  /**
   * How often this defence travels its best cornerback with the opponent's best
   * receiver, rather than playing sides. 0 = always sides, 1 = always shadow.
   * A shadow coach can erase a number one receiver; a sides coach lets the
   * matchup fall where the formation puts it.
   */
  shadowTendency: number;
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

export interface ScoringPlay {
  q: number;
  clock: number;        // seconds remaining in quarter
  teamId: number;
  desc: string;
  homeScore: number;
  awayScore: number;
}

/** One snap or special-teams act. Display only — never feeds the engine. */
export type PlayKind =
  | "kickoff"
  | "punt"
  | "fg"
  | "xp"
  | "two"
  | "run"
  | "pass"
  | "sack"
  | "kneel"
  | "penalty"
  | "safety"
  | "downs";

export type PlayResult =
  | "touchback"
  | "return"
  | "td"
  | "good"
  | "miss"
  | "fail"
  | "gain"
  | "loss"
  | "complete"
  | "incomplete"
  | "sack"
  | "int"
  | "fumble"
  | "accepted"
  | "safety"
  | "downs";

export interface PlayEvent {
  q: number;
  clock: number;
  down: number;
  toGo: number;
  yardLine: number;
  offenseId: number;
  kind: PlayKind;
  result: PlayResult;
  yards: number;
  playerId?: number;
  targetId?: number;
  homeScore: number;
  awayScore: number;
}

export type DriveResult =
  | "touchdown"
  | "field_goal"
  | "missed_fg"
  | "punt"
  | "turnover"
  | "downs"
  | "safety"
  | "end_half"
  | "end_game"
  | "return_td";

export interface DriveSummary {
  n: number;
  offenseId: number;
  q: number;
  clock: number;
  startYl: number;
  endYl: number;
  plays: number;
  yards: number;
  result: DriveResult;
  /** Inclusive start / exclusive end in `box.plays` (or the in-memory log). */
  from: number;
  to: number;
}

export interface TeamGameStats {
  points: number;
  totalYards: number;
  passYards: number;
  rushYards: number;
  firstDowns: number;
  passFirstDowns: number;
  rushFirstDowns: number;
  penaltyFirstDowns: number;
  turnovers: number;
  giveaways: number;
  takeaways: number;
  plays: number;
  possessions: number;
  thirdDownAtt: number;
  thirdDownConv: number;
  fourthDownAtt: number;
  fourthDownConv: number;
  redZoneAtt: number;
  redZoneTd: number;
  sacksAllowed: number;
  sackYardsAllowed: number;
  penalties: number;
  penaltyYards: number;
  /** Seconds of possession. The two sides sum to the length of the game. */
  timeOfPossession: number;
}

export interface PlayerGameStat extends Omit<SeasonStatLine, "season" | "teamId" | "games" | "gamesStarted"> {
  playerId: number;
  teamId: number;
  started: boolean;
}

export interface Game {
  id: number;
  season: number;
  week: number;
  homeId: number;
  awayId: number;
  played: boolean;
  homeScore: number;
  awayScore: number;
  /** Postseason round, null for regular season. */
  playoffRound: PlayoffRound | null;
  boxScore: BoxScore | null;
  /** Generated when the schedule is built. Older saves may not have it. */
  conditions?: GameConditions;
}

export interface BoxScore {
  home: TeamGameStats;
  away: TeamGameStats;
  quarters: { home: number[]; away: number[] };
  scoringPlays: ScoringPlay[];
  players: PlayerGameStat[];
  /** Declared inactives this game. Missing on older boxes. Not season-stat rows. */
  inactives?: number[];
  /** Snap-by-snap log. User games on this build; missing on older boxes and CPU games. */
  plays?: PlayEvent[];
  /** Drive summaries derived from the play log. Missing on older boxes. */
  drives?: DriveSummary[];
}

export type PlayoffRound = "WC" | "DIV" | "CONF" | "SB";

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/** Climate profile of a home venue, used to generate game-day conditions. */
export type Climate = "dome" | "cold" | "temperate" | "warm";

export interface Weather {
  /** Fahrenheit. */
  temp: number;
  /** Miles per hour. */
  wind: number;
  precip: "none" | "rain" | "snow";
  dome: boolean;
}

export interface GameConditions {
  weather: Weather;
  /** Days of rest for each side; a bye is worth more than a normal week. */
  homeRest: number;
  awayRest: number;
}

export function weatherLabel(w: Weather): string {
  if (w.dome) return "Indoors";
  const bits: string[] = [`${Math.round(w.temp)}°F`];
  if (w.wind >= 12) bits.push(`${Math.round(w.wind)} mph wind`);
  if (w.precip === "rain") bits.push("rain");
  if (w.precip === "snow") bits.push("snow");
  return bits.join(", ");
}

/** True when conditions are bad enough that the game plan should change. */
export function isHarsh(w: Weather): boolean {
  return !w.dome && (w.temp <= 25 || w.wind >= 18 || w.precip !== "none");
}

// ---------------------------------------------------------------------------
// Season phases
// ---------------------------------------------------------------------------

export type Phase =
  | "preseason"
  | "regular"
  | "playoffs"
  | "offseason-recap"   // retirements, progression, awards
  | "offseason-tag"     // exclusive franchise tag, one per club
  | "offseason-fa"      // free agency
  | "offseason-draft"   // scouting + draft
  | "offseason-final";  // roster cleanup before rollover

// ---------------------------------------------------------------------------
// Game settings
// ---------------------------------------------------------------------------

/** Events that can interrupt a bulk sim. More arrive with the owner/media systems. */
export type PauseEvent = "tradeOffer" | "injuredStarter" | "milestone";

/**
 * Player-chosen gameplay options. None of these may alter the simulation
 * itself — a paused-and-resumed sim must produce the identical league to an
 * uninterrupted one, and a franchise with firing off simulates exactly like
 * one with it on. Settings gate what the game DOES ABOUT events, never
 * whether they happen.
 */
export interface GameSettings {
  /** The owner can fire you (bites once the owner model lands). */
  firingEnabled: boolean;
  /** Which events stop a Sim-ahead early. */
  pauseOn: Record<PauseEvent, boolean>;
}

export function defaultSettings(): GameSettings {
  return {
    firingEnabled: true,
    pauseOn: { tradeOffer: true, injuredStarter: true, milestone: false },
  };
}

export interface PlayoffSeed {
  teamId: number;
  seed: number;
  conference: Conference;
}

export interface PlayoffState {
  seeds: PlayoffSeed[];
  round: PlayoffRound;
  complete: boolean;
  championId: number | null;
}

export interface DraftPick {
  round: number;
  pick: number;          // overall
  teamId: number;        // current owner
  originalTeamId: number;
  playerId: number | null;
  /** Set on compensatory slots. Missing = regular, so older saves load. */
  compensatory?: boolean;
}

/**
 * Ownership of a future draft pick.
 *
 * Picks used to exist only inside `DraftState`, built from the draft order the
 * moment the draft opened and thrown away afterwards. Nothing owned a pick
 * before it was made, so nothing could trade one. These rows persist on the
 * save for the next few classes, and the draft reads ownership from here — the
 * ORDER still comes from the standings, but who is holding each slot does not.
 */
export interface PickOwnership {
  season: number;
  round: number;
  /** Whose slot this is — decides where in the round it falls. */
  originalTeamId: number;
  /** Who actually gets to make the pick. */
  teamId: number;
  /** Compensatory award. Missing = regular 32×7 row. */
  compensatory?: boolean;
}

/** How many draft classes ahead are tradeable. */
export const PICK_HORIZON = 3;

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

export type TradeAsset =
  | { kind: "player"; playerId: number }
  | { kind: "pick"; season: number; round: number; originalTeamId: number };

export interface TradeOffer {
  id: number;
  /** The club making the offer. */
  fromTeamId: number;
  toTeamId: number;
  /** Assets leaving `fromTeamId`. */
  give: TradeAsset[];
  /** Assets leaving `toTeamId`. */
  get: TradeAsset[];
  season: number;
  week: number;
  /** Why the proposing club wants this, in its own words. */
  rationale: string;
}

/**
 * The in-season deadline. After this week clubs may only trade in the
 * offseason, which is what makes a deadline a decision rather than a date.
 */
export const TRADE_DEADLINE_WEEK = 9;

export interface DraftState {
  season: number;
  picks: DraftPick[];
  onClock: number;       // index into picks
  complete: boolean;
  /** Set once the post-draft priority-UDFA chase has been resolved. */
  udfaDone?: boolean;
  /** Trades struck ON the clock this draft, for the room's ticker and the cap. */
  clockTrades?: number;
  /** Live trade-down offers for the user's current slot. Cleared on advance. */
  clockOffers?: TradeOffer[];
  /**
   * Child-stream state for compensatory-slot clock trades / CPU picks.
   * Regular slots keep the parent stream. Missing = not started.
   */
  compRngState?: number;
}

// ---------------------------------------------------------------------------
// Scouting — the fog of war over a draft class
// ---------------------------------------------------------------------------

/**
 * Testing numbers. Real scales: forty in seconds, bench in reps, vertical in
 * inches, broad in inches, cones in seconds.
 */
export type CombineMetric =
  | "forty" | "tenSplit" | "bench" | "vertical" | "broad" | "threeCone" | "shortShuttle";

export type RiskGrade = "clean" | "minor" | "moderate" | "major";

/**
 * The public identity of a draft prospect. Measurements and testing numbers
 * are public — every club and the user read the same sheet. The risk grades
 * and coachability are PRIVATE truth: a club learns them only by spending
 * scouting work (medical checks, interviews), and the user's revealed copy
 * lives in `state.scouting`, never here.
 */
export interface ProspectProfile {
  college: string;
  classYear: "SO" | "JR" | "SR" | "RS_SR";
  heightIn: number;
  weightLb: number;
  /** Public testing sheet. Sparse — not every man runs every drill. */
  combine: Partial<Record<CombineMetric, number>>;
  /** Hidden truth, revealed per-club by scouting work. */
  medicalRisk: RiskGrade;
  characterRisk: RiskGrade;
  /** 0..100. How well he takes coaching; visible through interviews. */
  coachability: number;
}

export type ScoutingMethod =
  | "film" | "proDay" | "privateWorkout" | "medical" | "interview";

/**
 * Ordered scouting calendar. Miss a window and that intel kind does not
 * exist this cycle. The scarce currency is 30 private visits, not a point
 * pool.
 */
export const SCOUTING_WINDOWS = [
  "filmFocus",
  "allStar",
  "combine",
  "proDays",
  "privateVisits",
  "udfaPrep",
] as const;

export type ScoutingWindow = (typeof SCOUTING_WINDOWS)[number];

/**
 * What the USER'S department believes about one prospect. Both bands are
 * centred on genuinely wrong estimates that tighten as work is done — the
 * midpoint being unknowably off is the entire game.
 */
export interface UserIntel {
  effort: number;                                  // 0..100 total work invested
  methods: Partial<Record<ScoutingMethod, number>>; // times each method was run
  ovrLow: number;
  ovrHigh: number;
  potLow: number;
  potHigh: number;
  medical: RiskGrade | null;    // null = not yet examined
  character: RiskGrade | null;
}

/** The user's war-room board entry for one prospect. All fields optional. */
export interface BoardNote {
  tier?: 1 | 2 | 3 | 4 | 5;
  watch?: boolean;
  avoid?: boolean;
  note?: string;
}

/**
 * Everything the user's scouting department knows about the CURRENT class.
 * Pruned at the rollover — intel on a spent class is dead weight. CPU clubs
 * hold no rows here: their beliefs are derived deterministically from a stable
 * hash (see `lib/core/scouting.ts`), which gives every club a durable, different
 * opinion at zero save cost.
 */
export interface ScoutingState {
  season: number;
  intel: Record<number, UserIntel>;
  board: Record<number, BoardNote>;
  /** Active window on this save. Availability follows this, not a point pool. */
  window: ScoutingWindow;
  /** Official visits left this cycle. Cap 30; resets at the season rollover. */
  visitsRemaining: number;
  /** Windows that have opened this cycle (including the current one). */
  opened: ScoutingWindow[];
  /** Windows that have closed. A closed window cannot be reopened. */
  closed: ScoutingWindow[];
}

export interface FaBid {
  teamId: number;
  playerId: number;
  years: number;
  totalValue: number;
  apy: number;
  signingBonus: number;
}

export interface FaState {
  round: number;         // bidding rounds within free agency
  maxRounds: number;
  bids: FaBid[];
  complete: boolean;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface TeamRecord {
  teamId: number;
  w: number;
  l: number;
  t: number;
  pf: number;
  pa: number;
  divW: number; divL: number; divT: number;
  confW: number; confL: number; confT: number;
}

export interface SeasonHistory {
  season: number;
  championId: number;
  runnerUpId: number;
  standings: TeamRecord[];
  awards: { mvp: number | null; opoy: number | null; dpoy: number | null; roy: number | null };
  leaders: { passYds: number | null; rushYds: number | null; recYds: number | null; sacks: number | null };
}

export interface LogEntry {
  season: number;
  week: number;
  kind: "transaction" | "injury" | "result" | "milestone" | "draft" | "system";
  text: string;
}

// ---------------------------------------------------------------------------
// Root state
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Record book
// ---------------------------------------------------------------------------

/**
 * Single-game records have to be captured as games finish: box scores only
 * live for the current season, so a leaderboard derived at display time would
 * silently forget every previous year. Season and career records ARE derived
 * on demand from each player's own stat lines, which can never drift.
 */
export interface RecordEntry {
  playerId: number;
  playerName: string;
  pos: Position;
  teamId: number;
  season: number;
  week: number;
  value: number;
  detail: string;
}

export type GameRecordKey =
  | "passYds" | "passTd" | "rushYds" | "rushTd" | "recYds" | "recTd"
  | "rec" | "tackles" | "sacks" | "ints" | "fgm" | "longFg";

export interface TeamRecordEntry {
  teamId: number;
  season: number;
  week: number;
  value: number;
  detail: string;
}

export interface RecordBook {
  /** Top 5 single-game performances per category, best first. */
  game: Record<GameRecordKey, RecordEntry[]>;
  team: {
    mostPoints: TeamRecordEntry[];
    mostYards: TeamRecordEntry[];
    biggestMargin: TeamRecordEntry[];
  };
}

export const GAME_RECORD_KEYS: GameRecordKey[] = [
  "passYds", "passTd", "rushYds", "rushTd", "recYds", "recTd",
  "rec", "tackles", "sacks", "ints", "fgm", "longFg",
];

export const GAME_RECORD_LABEL: Record<GameRecordKey, string> = {
  passYds: "Passing yards", passTd: "Passing touchdowns",
  rushYds: "Rushing yards", rushTd: "Rushing touchdowns",
  recYds: "Receiving yards", recTd: "Receiving touchdowns",
  rec: "Receptions", tackles: "Tackles", sacks: "Sacks",
  ints: "Interceptions", fgm: "Field goals made", longFg: "Longest field goal",
};

/**
 * One waived player awaiting the next claim window. Still on `state.players`
 * with `teamId` null; not a free agent until the window closes unclaimed
 * and the original club cannot stash him on its practice squad.
 */
export interface WaiverClaim {
  playerId: number;
  originalTeamId: number;
  /** Clubs that have submitted a claim. Missing = none. */
  claims?: number[];
}

/**
 * Exclusive franchise tag applied this league year. Missing list = nobody
 * tagged, so older saves load. One per club per `season`.
 */
export interface FranchiseTag {
  season: number;
  teamId: number;
  playerId: number;
}

/**
 * Fifth-year option decision this league year. Missing list = nobody
 * decided, so older saves load. One decision per eligible R1 per window.
 */
export interface FifthYearOption {
  season: number;
  teamId: number;
  playerId: number;
  pickedUp: boolean;
}

/**
 * July 15 tag-year extension decision. Missing list = nobody decided,
 * so older saves load. One attempt per tagged player per window.
 */
export interface TagExtension {
  season: number;
  teamId: number;
  playerId: number;
  extended: boolean;
}

export const STATE_VERSION = 1;

export interface GameState {
  version: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;

  seed: number;
  rngState: number;

  userTeamId: number;
  season: number;
  phase: Phase;
  week: number;          // 1..18 during regular season

  nextPlayerId: number;
  nextGameId: number;

  teams: Team[];
  players: Player[];
  games: Game[];         // current season only; past seasons summarized in history

  playoffs: PlayoffState | null;
  draft: DraftState | null;
  fa: FaState | null;
  /**
   * Players currently on waivers. Missing = nobody, so older saves load.
   * Everyone still lives on `players` (invariant 4); this list is ids +
   * the club that waived them.
   */
  waivers?: WaiverClaim[];
  /**
   * Exclusive franchise tags for a league year. Missing = none, so older
   * saves load. One per club per season; expireContracts skips these.
   */
  franchiseTags?: FranchiseTag[];
  /**
   * Fifth-year option decisions for a league year. Missing = none, so
   * older saves load. One per eligible first-rounder per season.
   */
  fifthYearOptions?: FifthYearOption[];
  /**
   * July 15 tag-year extension decisions. Missing = none, so older
   * saves load. One per tagged player per season.
   */
  tagExtensions?: TagExtension[];

  /** The user's scouting intel + war-room board for the current class. */
  scouting?: ScoutingState;
  /** Future draft pick ownership. Optional so older saves still load. */
  pickOwners?: PickOwnership[];
  /** Offers currently sitting in front of the user. */
  tradeOffers?: TradeOffer[];
  nextTradeId?: number;

  history: SeasonHistory[];
  records: RecordBook;
  log: LogEntry[];

  /** Player-chosen gameplay options. Older saves are backfilled by migrate(). */
  settings?: GameSettings;
}

/**
 * The most any one contract may average against the cap.
 *
 * Lives here rather than in `offseason/contracts.ts` because LEAGUE GENERATION
 * has to honour it too, and that module cannot import from the offseason
 * without a cycle. It didn't honour it: the generator scales every opening
 * contract by up to 3.0x to hit a club's target payroll, which handed one 89
 * OVR quarterback a deal averaging 29% of the cap in the league's first season
 * and tripped the cap guard forever after.
 */
export const MAX_CONTRACT_SHARE = 0.25;

export const SALARY_CAP_BASE = 255_000_000;
export const CAP_GROWTH = 0.06;
export const LEAGUE_MINIMUM = 795_000;
export const ROSTER_LIMIT = 53;
/**
 * Training-camp holding cap. Published NFL camp roster is 90 before the
 * single cut to 53 (`docs/front-office-design-2026-07-28.md`). Not computed
 * from a dataset in `docs/nfl-reference.md` — see §4 and HANDOFF.
 */
export const CAMP_ROSTER_LIMIT = 90;
/**
 * Practice-squad size, IR return designations, IR minimum, and elevations.
 * Published NFL rules from `docs/front-office-design-2026-07-28.md` Part 5,
 * not computed from T/D/S/P. See `docs/nfl-reference.md` §4.
 */
export const PRACTICE_SQUAD_LIMIT = 16;
export const IR_RETURN_DESIGNATIONS = 8;
export const IR_MIN_GAMES = 4;
export const PS_ELEVATIONS_PER_PLAYER = 3;
/**
 * Gameday active cap. Published rule from
 * `docs/front-office-design-2026-07-28.md` Part 5: 47, or 48 with 8 OL
 * (OT/OG/C) on the 53. Not in T/D/S/P — see `docs/nfl-reference.md` §4.
 */
export const GAMEDAY_ACTIVE_LIMIT = 47;
export const GAMEDAY_ACTIVE_LIMIT_EIGHT_OL = 48;
export const GAMEDAY_OL_FOR_EXTRA = 8;
export const REGULAR_SEASON_WEEKS = 18;
export const GAMES_PER_TEAM = 17;

/** Draft weekend through cutdown: clubs may hold a camp roster. */
export function isCampPhase(phase: Phase): boolean {
  return phase === "offseason-draft" || phase === "offseason-final";
}

/** Phase ceiling: 90 in camp, 53 once the season roster is locked. */
export function rosterLimit(phase: Phase): number {
  return isCampPhase(phase) ? CAMP_ROSTER_LIMIT : ROSTER_LIMIT;
}

export function salaryCap(season: number, startSeason: number): number {
  return Math.round(SALARY_CAP_BASE * Math.pow(1 + CAP_GROWTH, season - startSeason));
}
