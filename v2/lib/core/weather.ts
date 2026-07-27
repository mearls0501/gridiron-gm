import { Rng, clamp } from "./rng";
import { Climate, GameConditions, Weather } from "./types";

/**
 * Game-day conditions.
 *
 * The engine previously had no concept of where or when a game was played: a
 * December night in Buffalo and a dome game in September resolved identically.
 * Conditions are generated once when the schedule is built and stored on the
 * Game, so a box score can always show what the teams were playing in.
 *
 * Effects are deliberately real but modest. Weather matters in the NFL, but far
 * less than fans assume — the biggest measured effects are on the kicking game
 * and the deep passing game, not on scoring as a whole.
 */

interface ClimateProfile {
  /** Mean temperature in week 1 and in week 18. */
  earlyTemp: number;
  lateTemp: number;
  /** Mean wind speed. */
  wind: number;
  /** Probability of precipitation. */
  precip: number;
}

const PROFILES: Record<Climate, ClimateProfile> = {
  dome:      { earlyTemp: 72, lateTemp: 72, wind: 0, precip: 0 },
  cold:      { earlyTemp: 70, lateTemp: 27, wind: 11, precip: 0.26 },
  temperate: { earlyTemp: 76, lateTemp: 45, wind: 8, precip: 0.20 },
  warm:      { earlyTemp: 86, lateTemp: 64, wind: 7, precip: 0.18 },
};

export function generateWeather(climate: Climate, week: number, rng: Rng): Weather {
  const p = PROFILES[climate];
  if (climate === "dome") {
    return { temp: 72, wind: 0, precip: "none", dome: true };
  }

  // Linear cool-down across the season, with real week-to-week variance.
  const t = clamp((week - 1) / 17, 0, 1);
  const meanTemp = p.earlyTemp + (p.lateTemp - p.earlyTemp) * t;
  const temp = Math.round(clamp(rng.normal(meanTemp, 11), -10, 100));

  // Wind is right-skewed: usually calm, occasionally horrible.
  const wind = Math.round(clamp(Math.abs(rng.normal(p.wind, 6)), 0, 42));

  let precip: Weather["precip"] = "none";
  if (rng.chance(p.precip)) precip = temp <= 33 ? "snow" : "rain";

  return { temp, wind, precip, dome: false };
}

export function makeConditions(
  climate: Climate, week: number, homeRest: number, awayRest: number, rng: Rng
): GameConditions {
  return { weather: generateWeather(climate, week, rng), homeRest, awayRest };
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export interface WeatherEffects {
  /** Multiplier on the chance a play is a deep shot. */
  deepPass: number;
  /** Multiplier on completion probability. */
  completion: number;
  /** Additive change to fumble probability. */
  fumble: number;
  /** Multiplier on the chance a play call is a pass. */
  passRate: number;
  /** Yards removed from a kicker's usable range. */
  kickRange: number;
  /** Multiplier on field goal accuracy. */
  kickAccuracy: number;
  /** Multiplier on punt distance. */
  puntDistance: number;
}

export const CLEAR: WeatherEffects = {
  deepPass: 1, completion: 1, fumble: 0, passRate: 1,
  kickRange: 0, kickAccuracy: 1, puntDistance: 1,
};

/**
 * Translate conditions into the handful of multipliers the engine applies.
 *
 * Wind is the dominant factor — it is what actually moves NFL outcomes. Cold
 * mainly shows up in ball security. Precipitation hurts the passing game and
 * pushes teams toward the run.
 */
export function weatherEffects(w: Weather | undefined): WeatherEffects {
  if (!w || w.dome) return CLEAR;

  const e: WeatherEffects = { ...CLEAR };

  // --- Wind ---------------------------------------------------------------
  if (w.wind > 8) {
    const g = (w.wind - 8) / 30; // 0 at 8mph, 1 at 38mph
    e.deepPass *= 1 - g * 0.55;
    e.completion *= 1 - g * 0.10;
    e.kickRange -= g * 12;
    e.kickAccuracy *= 1 - g * 0.16;
    e.puntDistance *= 1 - g * 0.13;
    e.passRate *= 1 - g * 0.14;
  }

  // --- Cold ---------------------------------------------------------------
  if (w.temp < 40) {
    const c = (40 - w.temp) / 55; // 0 at 40F, ~1 at -15F
    e.fumble += c * 0.010;
    e.completion *= 1 - c * 0.055;
    e.kickAccuracy *= 1 - c * 0.07;
    e.passRate *= 1 - c * 0.10;
  }

  // --- Precipitation ------------------------------------------------------
  if (w.precip === "rain") {
    e.completion *= 0.955;
    e.fumble += 0.006;
    e.passRate *= 0.94;
    e.deepPass *= 0.85;
  } else if (w.precip === "snow") {
    e.completion *= 0.925;
    e.fumble += 0.010;
    e.passRate *= 0.88;
    e.deepPass *= 0.72;
    e.kickAccuracy *= 0.93;
    e.kickRange -= 3;
  }

  return e;
}

// ---------------------------------------------------------------------------
// Home field and rest
// ---------------------------------------------------------------------------

/**
 * Home field advantage, applied as separate small effects rather than one
 * invisible fudge factor. The NFL edge is about 2.5 points and 55% of games;
 * crowd noise on the visiting offense is the mechanism most of it runs through.
 */
export const HOME_FIELD = {
  /** Multiplier on the visiting offense's penalty rate (crowd noise). */
  visitorPenalty: 1.30,
  /** Additive bonus to home offensive efficiency. */
  homeCompletion: 1.026,
  /** Multiplier on the visiting kicker's accuracy. */
  visitorKick: 0.968,
  /** Small boost to the home run game. */
  homeRush: 1.045,
};

/** Rest advantage: coming off a bye is worth a little. Returns a multiplier. */
export function restEffect(restDays: number): number {
  if (restDays >= 13) return 1.025; // off a bye
  if (restDays <= 4) return 0.975;  // short week
  return 1;
}
