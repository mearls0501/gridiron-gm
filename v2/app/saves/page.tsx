"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/lib/store/game";
import { Button, Card, Empty, Pill, TeamMark } from "@/components/ui";
import { PHASE_LABEL } from "@/components/Shell";
import { GameState } from "@/lib/core/types";
import { computeRecords, recordString } from "@/lib/core/select";
import { exportSave, importSave } from "@/lib/store/save";

/**
 * Save management. Export/import exists so a franchise is never trapped in one
 * browser profile — clearing site data shouldn't cost someone ten seasons.
 */
export default function SavesPage() {
  const { state, saves, load, remove, startNew, setError } = useGame();
  const [list, setList] = useState<GameState[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => void saves().then(setList);
  useEffect(refresh, [saves, state]);

  return (
    <div className="space-y-4 max-w-3xl">
      <Card
        title="Saved Franchises"
        subtitle="Stored in this browser. Export a file to keep a backup or move devices."
        actions={
          <label className="cursor-pointer">
            <Button size="sm" variant="ghost">{busy ? "Importing…" : "Import"}</Button>
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                try {
                  const s = await importSave(f);
                  await load(s.id);
                  refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "That file could not be imported.");
                } finally {
                  setBusy(false);
                  e.target.value = "";
                }
              }}
            />
          </label>
        }
        padded={false}
      >
        {list.length === 0 ? (
          <Empty title="No saves yet" />
        ) : (
          <div className="divide-y divide-[var(--color-line-soft)]">
            {list.map((s) => {
              const team = s.teams[s.userTeamId];
              const rec = computeRecords(s).get(team.id)!;
              const active = state?.id === s.id;
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <TeamMark team={team} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{s.name}</span>
                      {active && <Pill tone="accent">Current</Pill>}
                    </div>
                    <div className="text-xs text-[var(--color-muted)] tnum truncate">
                      {team.city} {team.name} · {s.season} {PHASE_LABEL[s.phase] ?? s.phase} · {recordString(rec)}
                      {" · saved "}
                      {new Date(s.updatedAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!active && (
                      <Button size="sm" onClick={() => void load(s.id)}>Load</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => exportSave(s)}>Export</Button>
                    {confirmId === s.id ? (
                      <>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={async () => {
                            await remove(s.id);
                            setConfirmId(null);
                            refresh();
                          }}
                        >
                          Delete for good
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>Cancel</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => setConfirmId(s.id)}>Delete</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Start Over" subtitle="Create a second franchise. Your existing saves are kept.">
        <Button onClick={() => void startNew({ name: `Franchise ${list.length + 1}` })}>
          New Franchise
        </Button>
      </Card>
    </div>
  );
}
