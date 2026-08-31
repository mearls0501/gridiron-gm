import { GameState, STATE_VERSION, defaultSettings } from "../core/types";
import { blankRecordBook } from "../core/season/records";
import { SCHEMES, evenBudget } from "../core/staff";
import { ensureScouting } from "../core/scouting";
import { decodeSave, encodeSave, EncodedSave } from "./codec";

/**
 * Save persistence.
 *
 * IndexedDB, not localStorage: a mid-season save is ~6.7MB with box scores,
 * comfortably past localStorage's 5MB ceiling. Hitting that limit would throw
 * QuotaExceededError on save and silently lose the franchise.
 *
 * Everything written here goes through `codec.ts`, which drops the zero fields
 * out of stat rows on the way out and puts them back on the way in. A
 * 20-season franchise is 12 MB on disk instead of 34 MB. Nothing above this
 * module ever sees an encoded save: `loadGame`, `listSaves` and `importSave`
 * all hand back a fully rehydrated `GameState`.
 */

const DB_NAME = "gridiron-gm";
const DB_VERSION = 1;
const STORE = "saves";
const META = "meta";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open the save database."));
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Save operation failed."));
        t.oncomplete = () => db.close();
      })
  );
}

export interface SaveSummary {
  id: string;
  name: string;
  season: number;
  phase: string;
  teamAbbr: string;
  record: string;
  updatedAt: number;
}

export async function saveGame(state: GameState): Promise<void> {
  state.updatedAt = Date.now();
  // The JSON round trip is still here on purpose: it strips anything the
  // structured-clone algorithm would choke on before it reaches the store.
  await tx(STORE, "readwrite", (s) => s.put(JSON.parse(JSON.stringify(encodeSave(state)))));
  await tx(META, "readwrite", (s) => s.put(state.id, "lastSaveId"));
}

export async function loadGame(id: string): Promise<GameState | null> {
  const raw = await tx<EncodedSave | undefined>(STORE, "readonly", (s) => s.get(id));
  if (!raw) return null;
  return migrate(decodeSave(raw));
}

export async function listSaves(): Promise<GameState[]> {
  const all = await tx<EncodedSave[]>(STORE, "readonly", (s) => s.getAll());
  return (all ?? [])
    .map(decodeSave)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteSave(id: string): Promise<void> {
  await tx(STORE, "readwrite", (s) => s.delete(id));
}

export async function lastSaveId(): Promise<string | null> {
  try {
    const id = await tx<string | undefined>(META, "readonly", (s) => s.get("lastSaveId"));
    return id ?? null;
  } catch {
    return null;
  }
}

/**
 * Forward-migrate an older save. Right now there is only one version, but the
 * hook exists so a future change can't strand someone's franchise.
 */
function migrate(state: GameState): GameState {
  // Structural backfills run regardless of version so a save written by an
  // earlier build never lands in the UI missing a field it now reads.
  if (!state.records) state.records = blankRecordBook();
  // Trades arrived after the first saves were written.
  if (!state.pickOwners) state.pickOwners = [];
  if (!state.tradeOffers) state.tradeOffers = [];
  if (typeof state.nextTradeId !== "number") state.nextTradeId = 1;
  // Settings arrived with the weekly-loop work. An existing franchise
  // migrates with firing OFF — nobody gets retroactively fired by an update.
  if (!state.settings) state.settings = { ...defaultSettings(), firingEnabled: false };
  // `ceiling` arrived with the development failure model. An older save has
  // players without it, and undefined would poison every growth calculation.
  // Backfilling to `pot` preserves those careers exactly as they were.
  for (const p of state.players) {
    if (typeof p.ceiling !== "number") p.ceiling = p.pot;
  }
  for (const t of state.teams) {
    if (typeof t.deadCap !== "number") t.deadCap = 0;
    if (t.coach && typeof t.coach.shadowTendency !== "number") t.coach.shadowTendency = 0.42;
    // Staff budgets arrived after these saves were written. An even split is
    // the neutral point of the whole model — every multiplier in `staff.ts` is
    // exactly 1 there — so an old franchise carries on playing identically
    // until its owner decides to specialise.
    if (!t.staff) t.staff = evenBudget();
    if (!Array.isArray(t.devFocus)) t.devFocus = [];
    if (!t.offScheme) t.offScheme = SCHEMES.find((s) => s.side === "offense")!.id;
    if (!t.defScheme) t.defScheme = SCHEMES.find((s) => s.side === "defense")!.id;
  }
  // Point-pool leftovers become a real calendar; does not crash old saves.
  ensureScouting(state);

  if (state.version === STATE_VERSION) return state;
  state.version = STATE_VERSION;
  return state;
}

// ---------------------------------------------------------------------------
// Export / import — a franchise should never be trapped in one browser.
// ---------------------------------------------------------------------------

export function exportSave(state: GameState): void {
  const blob = new Blob([JSON.stringify(encodeSave(state))], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${state.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${state.season}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importSave(file: File): Promise<GameState> {
  const text = await file.text();
  const parsed = JSON.parse(text) as EncodedSave;
  if (!parsed || !Array.isArray(parsed.teams) || !Array.isArray(parsed.players)) {
    throw new Error("That file is not a Gridiron GM save.");
  }
  // A file exported before the codec landed is dense, which decodes to itself.
  const state = migrate(decodeSave(parsed));
  // Give the import a fresh id so it can't clobber an existing franchise.
  state.id = `${state.id}-import-${Date.now().toString(36)}`;
  await saveGame(state);
  return state;
}
