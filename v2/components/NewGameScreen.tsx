"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/lib/store/game";
import { FRANCHISES, DIVISIONS } from "@/lib/core/names";
import { GameState } from "@/lib/core/types";
import { Button, Card, cx } from "./ui";
import { importSave } from "@/lib/store/save";

/**
 * First-run screen. A new franchise is created entirely in the browser — there
 * is no database to seed and no account to create, so "New Game" always works.
 */
export function NewGameScreen({ onDone }: { onDone?: () => void } = {}) {
  const { startNew, load, saves, busy, error } = useGame();
  const [teamId, setTeamId] = useState(0);
  const [name, setName] = useState("My Franchise");
  const [existing, setExisting] = useState<GameState[]>([]);
  const [importing, setImporting] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [seedText, setSeedText] = useState("");

  // Blank means "surprise me". Anything numeric is used verbatim, so a friend
  // entering the same seed gets the identical league, draft classes and all.
  const parsedSeed = /^\d{1,10}$/.test(seedText.trim())
    ? Math.min(Number(seedText.trim()), 2147483646)
    : undefined;
  const seedInvalid = seedText.trim().length > 0 && parsedSeed === undefined;

  useEffect(() => {
    void saves().then(setExisting);
  }, [saves]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-4xl space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Gridiron GM</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1.5">
            Take over a franchise. Draft, sign, scheme, and win.
          </p>
        </div>

        {existing.length > 0 && (
          <Card title="Continue">
            <div className="space-y-2">
              {existing.slice(0, 4).map((s) => (
                <button
                  key={s.id}
                  onClick={() => void load(s.id).then(onDone)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] transition-colors text-left cursor-pointer"
                >
                  <span
                    className="w-8 h-8 rounded flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: s.teams[s.userTeamId].primary, color: s.teams[s.userTeamId].secondary }}
                  >
                    {s.teams[s.userTeamId].abbr}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">{s.name}</span>
                    <span className="block text-xs text-[var(--color-muted)] tnum">
                      {s.teams[s.userTeamId].city} {s.teams[s.userTeamId].name} · {s.season}
                    </span>
                  </span>
                  <span className="text-xs text-[var(--color-faint)] shrink-0">
                    {new Date(s.updatedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}

        <Card title="New Franchise" subtitle="Pick the team you want to run.">
          <label className="block mb-4">
            <span className="text-xs text-[var(--color-muted)]">Franchise name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            />
          </label>

          <div className="space-y-3 max-h-[42vh] overflow-y-auto pr-1">
            {DIVISIONS.map((div) => (
              <div key={div}>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-1.5">{div}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {FRANCHISES.map((f, i) => ({ f, i }))
                    .filter(({ f }) => f.division === div)
                    .map(({ f, i }) => (
                      <button
                        key={f.abbr}
                        onClick={() => setTeamId(i)}
                        className={cx(
                          "flex items-center gap-2 px-2 py-2 rounded-lg border text-left transition-colors cursor-pointer",
                          teamId === i
                            ? "border-[var(--color-accent)] bg-[var(--color-accent-dim)]"
                            : "border-[var(--color-line)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]"
                        )}
                      >
                        <span
                          className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
                          style={{ background: f.primary, color: f.secondary }}
                        >
                          {f.abbr}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11px] text-[var(--color-muted)] truncate">{f.city}</span>
                          <span className="block text-xs font-medium truncate">{f.name}</span>
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <button
              onClick={() => setAdvanced(!advanced)}
              className="text-xs text-[var(--color-faint)] hover:text-[var(--color-muted)] cursor-pointer"
            >
              {advanced ? "▾" : "▸"} Advanced
            </button>
            {advanced && (
              <label className="block mt-2">
                <span className="block text-xs text-[var(--color-muted)]">
                  League seed (optional) — the same seed always builds the identical league
                </span>
                <input
                  value={seedText}
                  onChange={(e) => setSeedText(e.target.value)}
                  placeholder="Leave blank for a random league"
                  inputMode="numeric"
                  className={cx(
                    "mt-1 w-full sm:w-72 bg-[var(--color-surface-2)] border rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]",
                    seedInvalid ? "border-[var(--color-bad)]" : "border-[var(--color-line)]"
                  )}
                />
                {seedInvalid && (
                  <span className="block text-[11px] text-[var(--color-bad)] mt-1">
                    Seeds are plain numbers, up to 10 digits.
                  </span>
                )}
              </label>
            )}
          </div>

          <div className="flex items-center gap-2 mt-5">
            <Button
              variant="primary"
              size="lg"
              disabled={busy || seedInvalid}
              onClick={() => void startNew({ userTeamId: teamId, name, seed: parsedSeed }).then(onDone)}
            >
              {busy ? "Building the league…" : "Start Franchise"}
            </Button>

            <label className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] cursor-pointer px-3 py-2">
              {importing ? "Importing…" : "Import save"}
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setImporting(true);
                  try {
                    const s = await importSave(f);
                    await load(s.id);
                    onDone?.();
                  } catch (err) {
                    useGame.getState().setError(
                      err instanceof Error ? err.message : "That file could not be imported."
                    );
                  } finally {
                    setImporting(false);
                  }
                }}
              />
            </label>
          </div>

          {error && <p className="text-xs text-[var(--color-bad)] mt-3">{error}</p>}
        </Card>
      </div>
    </div>
  );
}
