import { GameState } from "../core/types";
import { Rng } from "../core/rng";
import {
  DRAFT_UNTIL_USER_LIMIT,
  FULL_DRAFT_PICK_GUARD,
  stepDraftUntilUser,
  stepFullDraft,
} from "../core/offseason/draft";
import { dropSpentInboxOffers } from "../core/trades";
import { simEntireDraftToast } from "../view/draftToast";
import {
  DraftTapeItem,
  draftStepEvents,
  snapDraft,
  tapeLabel,
} from "../view/draftNight";

export type DraftNightMode = "until" | "full";

export type DraftNightStep =
  | { done: false; label: string; events: DraftTapeItem[] }
  | { done: true; message: string; events: DraftTapeItem[] };

/**
 * One pick of "Sim to my pick" or "Sim entire draft".
 *
 * The same `stepDraftUntilUser` / `stepFullDraft` calls the instant buttons
 * already used. Waiting between picks is the store's job. This function
 * does not read a clock and does not draw an RNG of its own.
 */

function untilMessage(s: GameState, started: number): string {
  const live = s.draft;
  if (!live) return "There is no draft in progress.";
  const made = live.onClock - started;
  if (live.complete) return `Draft complete — ${made} more pick${made === 1 ? "" : "s"} made`;
  if (made === 0) return "You are already on the clock.";
  const slot = live.picks[live.onClock];
  return `${made} pick${made === 1 ? "" : "s"} made — you are on the clock at pick ${slot?.pick ?? ""}`;
}

export function draftNightStepper(s: GameState, mode: DraftNightMode): () => DraftNightStep {
  const rng = new Rng(s.rngState);
  const started = s.draft?.onClock ?? 0;
  let guard = 0;
  let finished: DraftNightStep | null = null;

  const finish = (message: string, events: DraftTapeItem[] = []): DraftNightStep => {
    s.rngState = rng.state;
    finished = { done: true, message, events };
    return finished;
  };

  return () => {
    if (finished) return finished;
    const d = s.draft;
    if (!d) return finish("There is no draft in progress.");

    if (mode === "until") {
      if (d.complete || guard >= DRAFT_UNTIL_USER_LIMIT) return finish(untilMessage(s, started));
      guard += 1;
      const before = snapDraft(s);
      const outcome = stepDraftUntilUser(s, rng);
      if (outcome !== "picked") return finish(untilMessage(s, started));
      s.rngState = rng.state;
      const events = draftStepEvents(s, before);
      const label = events.length ? tapeLabel(events[events.length - 1]) : "Simming… Draft";
      return { done: false, label, events };
    }

    if (d.complete || guard >= FULL_DRAFT_PICK_GUARD) {
      d.complete = true;
      dropSpentInboxOffers(s);
      return finish(simEntireDraftToast(d.picks, s.userTeamId));
    }
    guard += 1;
    const before = snapDraft(s);
    const ok = stepFullDraft(s, rng);
    s.rngState = rng.state;
    const events = ok ? draftStepEvents(s, before) : [];
    const live = s.draft;
    if (!ok || !live || live.complete) {
      if (live) live.complete = true;
      dropSpentInboxOffers(s);
      const picks = s.draft?.picks ?? d.picks;
      return finish(simEntireDraftToast(picks, s.userTeamId), events);
    }
    const label = events.length ? tapeLabel(events[events.length - 1]) : "Simming… Draft";
    return { done: false, label, events };
  };
}

export function drainDraftNight(
  s: GameState,
  mode: DraftNightMode,
): { message: string; events: DraftTapeItem[] } {
  const step = draftNightStepper(s, mode);
  const events: DraftTapeItem[] = [];
  let result = step();
  while (!result.done) {
    events.push(...result.events);
    result = step();
  }
  events.push(...result.events);
  return { message: result.message, events };
}
