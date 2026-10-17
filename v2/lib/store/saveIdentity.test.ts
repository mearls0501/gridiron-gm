import assert from "node:assert/strict";
import { newGame } from "../core/newGame";
import { createSave, importSave, listSaves, loadGame, saveGame } from "./save";

// The storage contract used here is also exercised against real IndexedDB in the browser.
const stores = new Map<string, Map<IDBValidKey, unknown>>([
  ["saves", new Map()], ["meta", new Map()],
]);
const originalDb = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
const originalClock = Date.now;
const originalUuid = crypto.randomUUID;
function request(action: () => unknown): IDBRequest {
  const req = {} as IDBRequest;
  queueMicrotask(() => {
    try {
      Object.assign(req, { result: action() });
      req.onsuccess?.call(req, new Event("success"));
    } catch (error) {
      Object.assign(req, { error });
      req.onerror?.call(req, new Event("error"));
    }
  });
  return req;
}
const db = {
  close() {},
  transaction(name: string) {
    const data = stores.get(name)!;
    return {
      objectStore() {
        const keyOf = (value: { id?: string }, key?: IDBValidKey) => key ?? value.id!;
        return {
          get: (key: IDBValidKey) => request(() => structuredClone(data.get(key))),
          getAllKeys: () => request(() => [...data.keys()]),
          put: (value: { id?: string }, key?: IDBValidKey) => request(() => {
            const id = keyOf(value, key);
            data.set(id, structuredClone(value));
            return id;
          }),
          add: (value: { id?: string }) => request(() => {
            const id = keyOf(value);
            if (data.has(id)) throw new DOMException("Key already exists", "ConstraintError");
            data.set(id, structuredClone(value));
            return id;
          }),
        };
      },
    };
  },
};
Object.defineProperty(globalThis, "indexedDB", {
  configurable: true, value: { open: () => request(() => db) },
});
Date.now = () => 1_760_000_000_000;

async function main() {
  const first = newGame({ seed: 424242, name: "Boston", userTeamId: 0 });
  const second = newGame({ seed: 424242, name: "Detroit", userTeamId: 22 });
  assert.equal(first.id, second.id, "the core league remains deterministic");
  const firstRng = first.rngState;
  await Promise.all([createSave(first), createSave(second)]);
  assert.notEqual(first.id, second.id, "same-seed franchises get distinct storage identities");
  assert.equal(first.rngState, firstRng, "save identity consumes no game RNG");
  first.week = 7;
  const firstId = first.id;
  await saveGame(first);
  assert.equal(first.id, firstId, "autosaving keeps the franchise identity");
  assert.equal((await loadGame(first.id))?.week, 7);
  assert.equal((await loadGame(second.id))?.userTeamId, 22);
  assert.equal((await listSaves()).length, 2);

  const file = new File([JSON.stringify(first)], "franchise.json", { type: "application/json" });
  const [copyA, copyB] = await Promise.all([importSave(file), importSave(file)]);
  assert.equal(new Set([first.id, second.id, copyA.id, copyB.id]).size, 4,
    "concurrent imports at the same clock instant cannot replace a save");
  assert.equal((await listSaves()).length, 4);

  Object.defineProperty(crypto, "randomUUID", {
    configurable: true, value: () => first.id.slice("save-".length),
  });
  const collision = newGame({ seed: 7 });
  const unsavedId = collision.id;
  await assert.rejects(createSave(collision), { name: "ConstraintError" });
  assert.equal(collision.id, unsavedId);
  assert.equal((await loadGame(first.id))?.week, 7, "even an ID collision cannot overwrite progress");
  assert.equal((await listSaves()).length, 4);
  console.log("ok    save identity — same seeds, concurrent imports, autosaves, and collision protection");
}

void main().finally(() => {
  Date.now = originalClock;
  Object.defineProperty(crypto, "randomUUID", { configurable: true, value: originalUuid });
  if (originalDb) Object.defineProperty(globalThis, "indexedDB", originalDb);
  else Reflect.deleteProperty(globalThis, "indexedDB");
}).catch((error) => { console.error(error); process.exitCode = 1; });
