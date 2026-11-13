import { declareGamedayInactives } from "./inactives";
import { SnapInfo } from "./callSheet";
import { openGameSim, type LiveSnap, type SimResult } from "./sim/game";
import { buildDrives, lastCalledSnap } from "./sim/events";
import { BoxScore } from "./types";
import { Rng } from "./rng";
import {
  DriveSummary, GameState, PlayEvent, SealedLiveGame, SealedLiveInjury, SnapCall,
} from "./types";

/**
 * Optional Play-the-Game session for the USER game only.
 *
 * Bulk-sim never enters here — it would freeze the league on snap clicks.
 * The kickoff snapshot is cloned once and the sim stays on that clone.
 * Peek returns the last computed view so a re-render does not re-run the game.
 * call() / finishAuto() resume the paused play loop — they do not re-sim from
 * kickoff. Injuries land on the live clone. seal() records that result so
 * Play Week can commit it; the save RNG is not advanced here.
 * Views are built from the engine playLog yielded at each pause — no module
 * listener, so a CPU sim cannot leak plays into an open session.
 * The in-progress list is the user club's callSheet.snaps. resumeLiveGame
 * replays that list on a new generator.
 * finishAuto appends "auto" for each remaining user snap on that same list.
 */

export type LiveView =
  | {
      done: false;
      info: SnapInfo;
      calls: SnapCall[];
      plays: PlayEvent[];
      lastSnap: PlayEvent | null;
      drives: DriveSummary[];
    }
  | {
      done: true;
      result: SimResult;
      calls: SnapCall[];
      plays: PlayEvent[];
      lastSnap: PlayEvent | null;
      drives: DriveSummary[];
    };

/**
 * Kickoff key: FNV-1a over what the user can change between kickoff and a
 * reload that this game reads — both depth charts and leans, who is on
 * each club and hurt, the conditions, and the save RNG. No draw.
 */
export function liveKey(state: GameState, gameId: number): string {
  const g = state.games.find((x) => x.id === gameId);
  if (!g) return "";
  const ids = [g.homeId, g.awayId];
  const json = JSON.stringify({
    rng: state.rngState,
    cond: g.conditions ?? null,
    teams: ids.map((id) => {
      const t = state.teams[id];
      return {
        depth: t.depthChart ?? null,
        lean: t.callSheet?.passLean ?? null,
        agg: t.callSheet?.aggression ?? null,
      };
    }),
    players: state.players
      .filter((p) => p.teamId != null && ids.includes(p.teamId) && !p.retired)
      .map((p) => [p.id, p.teamId, p.injuryWeeks, p.status ?? null]),
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function createLiveGame(state: GameState, gameId: number) {
  const key = liveKey(state, gameId);
  const kickoff = JSON.parse(JSON.stringify(state)) as GameState;
  const game = kickoff.games.find((g) => g.id === gameId);
  if (!game) throw new Error("No such game");
  declareGamedayInactives(kickoff, [game.homeId, game.awayId]);
  const calls: SnapCall[] = [];
  const logAtKickoff = kickoff.log.length;
  const injuryAtKickoff = new Map<number, { weeks: number; desc: string | null }>();
  for (const p of kickoff.players) {
    injuryAtKickoff.set(p.id, { weeks: p.injuryWeeks, desc: p.injuryDesc });
  }
  const gen = openGameSim(kickoff, game, new Rng(kickoff.rngState));
  let step: IteratorResult<LiveSnap, SimResult> = gen.next();
  let cached: LiveView | null = null;

  const seal = (): SealedLiveGame | null => {
    if (!step.done) return null;
    const injuries: SealedLiveInjury[] = [];
    for (const p of kickoff.players) {
      const before = injuryAtKickoff.get(p.id);
      if (!before) continue;
      if (p.injuryWeeks === before.weeks && p.injuryDesc === before.desc) continue;
      injuries.push({
        playerId: p.id,
        injuryWeeks: p.injuryWeeks,
        injuryDesc: p.injuryDesc,
      });
    }
    const result = step.value;
    return {
      gameId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      box: result.box,
      injuries,
      log: kickoff.log.slice(logAtKickoff),
    };
  };

  const pack = (
    log: PlayEvent[],
    extra: { done: false; info: SnapInfo } | { done: true; result: SimResult },
  ): LiveView => {
    const lastSnap = lastCalledSnap(log, state.userTeamId, calls.length);
    const shared = {
      calls: calls.slice(),
      plays: log,
      lastSnap,
      drives: buildDrives(log),
    };
    return extra.done ? { ...extra, ...shared } : { ...extra, ...shared };
  };

  const viewOf = (): LiveView => {
    if (step.done) {
      const result = step.value;
      return pack(result.plays, { done: true, result });
    }
    return pack(step.value.plays, { done: false, info: step.value.info });
  };

  const peek = (): LiveView => {
    if (cached) return cached;
    cached = viewOf();
    return cached;
  };

  return {
    call(choice: SnapCall): LiveView {
      if (step.done) return peek();
      calls.push(choice);
      cached = null;
      step = gen.next(choice);
      return peek();
    },
    finishAuto(): LiveView {
      while (!step.done) {
        calls.push("auto");
        step = gen.next("auto");
      }
      cached = viewOf();
      return cached;
    },
    peek,
    snaps: () => calls.slice(),
    key: () => key,
    seal,
    stale: false,
  };
}

export type LiveSession = ReturnType<typeof createLiveGame>;

/**
 * The finished game already sealed on the save, shown as it was played.
 * Clicks change nothing; the seal is what Play Week commits.
 */
function sealedSession(state: GameState, seal: SealedLiveGame, calls: SnapCall[]): LiveSession {
  const box: BoxScore = seal.box;
  const plays = box.plays ?? [];
  const result: SimResult = {
    homeScore: seal.homeScore, awayScore: seal.awayScore, box, plays,
  };
  const view: LiveView = {
    done: true,
    result,
    calls: calls.slice(),
    plays,
    lastSnap: lastCalledSnap(plays, state.userTeamId, calls.length),
    drives: box.drives ?? buildDrives(plays),
  };
  const key = state.teams[state.userTeamId].callSheet?.snapsKey ?? "";
  return {
    call: () => view,
    finishAuto: () => view,
    peek: () => view,
    snaps: () => calls.slice(),
    key: () => key,
    seal: () => JSON.parse(JSON.stringify(seal)) as SealedLiveGame,
    stale: false,
  };
}

/** Store a finished live game on the save. Replaces any previous seal. */
export function writeSealedLive(state: GameState, seal: SealedLiveGame): void {
  state.sealedLive = JSON.parse(JSON.stringify(seal)) as SealedLiveGame;
}

/**
 * If this game is the sealed live result, copy its box, injuries, and
 * injury log onto the save and consume the seal. Any other game returns
 * null and leaves the seal in place.
 */
export function applySealedLive(state: GameState, gameId: number): SimResult | null {
  const seal = state.sealedLive;
  if (!seal || seal.gameId !== gameId) return null;
  for (const row of seal.injuries) {
    const p = state.players.find((x) => x.id === row.playerId);
    if (!p) continue;
    p.injuryWeeks = row.injuryWeeks;
    p.injuryDesc = row.injuryDesc;
  }
  for (const line of seal.log) state.log.push(line);
  const result: SimResult = {
    homeScore: seal.homeScore,
    awayScore: seal.awayScore,
    box: seal.box,
    plays: seal.box.plays ?? [],
  };
  delete state.sealedLive;
  return result;
}

export function clearSealedLive(state: GameState): void {
  if (state.sealedLive) delete state.sealedLive;
}

/**
 * Replay callSheet.snaps on a fresh live session. Missing snaps (an older
 * save, or a week not yet called) starts at the opening kickoff. A sealed
 * game shows the seal. If the kickoff key no longer matches (a depth-chart,
 * roster or lean edit since kickoff), the called game is void: the session
 * opens at kickoff with `stale` set. Does not write the save and does not
 * draw on the save RNG.
 */
export function resumeLiveGame(state: GameState, gameId: number): LiveSession {
  const sheet = state.teams[state.userTeamId].callSheet;
  const snaps = sheet?.snaps;
  const seal = state.sealedLive;
  if (seal && seal.gameId === gameId) return sealedSession(state, seal, snaps ?? []);
  const live = createLiveGame(state, gameId);
  if (!snaps || snaps.length === 0) return live;
  if (sheet?.snapsKey && sheet.snapsKey !== live.key()) return { ...live, stale: true };
  let view = live.peek();
  for (const choice of snaps) {
    if (view.done) break;
    view = live.call(choice);
  }
  return live;
}
