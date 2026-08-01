"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/lib/store/game";
import { Button, Card, TeamMark } from "@/components/ui";
import { PHASE_LABEL } from "@/components/Shell";
import { exportSave } from "@/lib/store/save";
import { encodeSave } from "@/lib/store/codec";
import { defaultSettings } from "@/lib/core/types";

/**
 * Franchise settings. Everything here operates on the loaded save — the
 * franchise name, the save file itself, and the numbers that identify this
 * league (seed, season, size). There are deliberately no gameplay toggles:
 * difficulty in this game is the league itself.
 */
export default function SettingsPage() {
  const router = useRouter();
  const { state, apply, remove } = useGame();
  const [name, setName] = useState(state?.name ?? "");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Measured from the encoded (on-disk) form, which is what IndexedDB stores.
  const sizeMb = useMemo(() => {
    if (!state) return null;
    try {
      return JSON.stringify(encodeSave(state)).length / (1024 * 1024);
    } catch {
      return null;
    }
  }, [state]);

  if (!state) return null;
  const team = state.teams[state.userTeamId];
  const dirty = name.trim() !== state.name && name.trim().length > 0;
  const settings = state.settings ?? defaultSettings();

  return (
    <div className="space-y-4 max-w-3xl">
      <Card title="Franchise" subtitle="How this save appears on the saves screen.">
        <div className="flex items-center gap-3 mb-4">
          <TeamMark team={team} size={40} />
          <div>
            <div className="text-sm font-semibold">
              {team.city} {team.name}
            </div>
            <div className="text-xs text-[var(--color-muted)]">
              {state.season} {PHASE_LABEL[state.phase]}
            </div>
          </div>
        </div>
        <label className="block">
          <span className="text-xs text-[var(--color-muted)]">Franchise name</span>
          <div className="mt-1 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className="flex-1 bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            />
            <Button
              variant="primary"
              disabled={!dirty}
              onClick={() =>
                apply((s) => {
                  s.name = name.trim();
                  return "Franchise renamed";
                })
              }
            >
              Rename
            </Button>
          </div>
        </label>
      </Card>

      <Card
        title="This League"
        subtitle="Identifying numbers for this save. The seed reproduces the entire league — include it when reporting a bug."
        padded={false}
      >
        <div className="divide-y divide-[var(--color-line-soft)] text-sm">
          {(
            [
              ["League seed", String(state.seed)],
              ["Season", `${state.season} · ${PHASE_LABEL[state.phase]}`],
              ["Created", new Date(state.createdAt).toLocaleDateString()],
              ["Last saved", new Date(state.updatedAt).toLocaleString()],
              ["Save size", sizeMb == null ? "—" : `${sizeMb.toFixed(1)} MB on disk`],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-[var(--color-muted)]">{label}</span>
              <span className="tnum text-xs">{value}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Gameplay"
        subtitle="Settings gate what the game does about events — never whether they happen. The sim is identical either way."
      >
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.firingEnabled}
              onChange={(e) => {
                const on = e.target.checked;
                apply((s) => {
                  s.settings = { ...(s.settings ?? defaultSettings()), firingEnabled: on };
                  return on ? "The seat is hot" : "Job security: guaranteed";
                });
              }}
              className="accent-[var(--color-accent)]"
            />
            <span className="text-sm">The owner can fire you</span>
          </label>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-1.5">
              Pause Sim-ahead when…
            </div>
            <div className="space-y-1.5">
              {(
                [
                  ["tradeOffer", "A club calls with a trade offer"],
                  ["injuredStarter", "One of your starters goes down"],
                  ["milestone", "A league milestone falls"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.pauseOn[key]}
                    onChange={(e) => {
                      const on = e.target.checked;
                      apply((s) => {
                        const cur = s.settings ?? defaultSettings();
                        s.settings = { ...cur, pauseOn: { ...cur.pauseOn, [key]: on } };
                      });
                    }}
                    className="accent-[var(--color-accent)]"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Save Data"
        subtitle="Saves live in this browser and write automatically after every action. Export a file to keep a backup or move devices."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => exportSave(state)}>
            Export Save File
          </Button>
          <Button variant="ghost" onClick={() => router.push("/saves")}>
            Manage Saves
          </Button>
        </div>
      </Card>

      <Card
        title="Danger Zone"
        subtitle="Deleting this franchise removes it from this browser. An exported file is the only way back."
      >
        {confirming ? (
          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              disabled={deleting}
              onClick={() => {
                setDeleting(true);
                void remove(state.id).then(() => router.replace("/"));
              }}
            >
              {deleting ? "Deleting…" : `Delete “${state.name}” Forever`}
            </Button>
            <Button variant="ghost" disabled={deleting} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Delete This Franchise
          </Button>
        )}
      </Card>
    </div>
  );
}
