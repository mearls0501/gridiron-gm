"use client";

import { useRouter } from "next/navigation";
import { useGame } from "@/lib/store/game";
import { acceptGmChair, isPendingForcedMove, retireFromLeague } from "@/lib/core/owner";
import { teamOutlook } from "@/lib/core/frontOffice";
import { exportSave } from "@/lib/store/save";
import { Button, Card, Empty, Pill, Stat, TeamMark } from "@/components/ui";

/**
 * User-GM firing is a forced move, not game over. Take an open CPU chair
 * (rebuild posture, new owner's patience) or retire the save.
 */
export default function ForcedMovePage() {
  const state = useGame((s) => s.state);
  const apply = useGame((s) => s.apply);
  const router = useRouter();

  if (!state) return null;
  const move = state.forcedMove;
  if (!move) {
    return (
      <Card title="The chair is yours">
        <Empty title="No forced move" hint="The owner has not ended your time here." />
      </Card>
    );
  }

  const from = state.teams[move.fromTeamId];
  const pending = isPendingForcedMove(state);

  function takeChair(teamId: number) {
    apply((s) => {
      const r = acceptGmChair(s, teamId);
      if (!r.ok) return r.reason;
      const t = s.teams[teamId];
      router.replace("/");
      return `Hired by the ${t.city} ${t.name}. Rebuild starts; patience is the new owner's.`;
    });
  }

  function retire() {
    apply((s) => {
      const r = retireFromLeague(s);
      return r.ok ? "Retired. Export the save from this page." : r.reason;
    });
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card
        title={move.retired ? "You retired" : pending ? "You've been fired" : "New chair"}
        subtitle={
          move.retired
            ? "The save remains. Export a file if you want it off this browser."
            : pending
              ? `${from.owner?.name ?? "The owner"} ended your time with the ${from.city} ${from.name}. Season over — not game over.`
              : `Now GM of the ${state.teams[state.userTeamId].city} ${state.teams[state.userTeamId].name}.`
        }
        actions={move.retired ? <Pill tone="warn">retired</Pill> : pending ? <Pill tone="bad">forced move</Pill> : <Pill tone="good">hired</Pill>}
      >
        <p className="text-sm text-[var(--color-muted)]">
          Open chairs are CPU clubs whose owner also hit the fire line. Arrival is a rebuild;
          patience resets to that club's owner. Void years and cap carryover are not in this packet.
        </p>
      </Card>

      {pending && (
        <Card title="Open GM chairs" subtitle="Take one or retire the save">
          {move.openChairs.length === 0 ? (
            <Empty title="No open chairs" hint="Retire the save." />
          ) : (
            <div className="space-y-3">
              {move.openChairs.map((id) => {
                const t = state.teams[id];
                const outlook = teamOutlook(state, id);
                return (
                  <div key={id} className="flex items-center gap-3 rounded-lg border border-[var(--color-line-soft)] px-3 py-2">
                    <TeamMark team={t} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{t.city} {t.name}</div>
                      <div className="text-xs text-[var(--color-muted)]">
                        {t.owner?.name ?? "Owner"} · patience {t.owner?.patience.toFixed(2)} · {outlook.posture}
                      </div>
                    </div>
                    <Button size="sm" variant="primary" onClick={() => takeChair(id)}>
                      Take chair
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {(pending || move.retired) && (
        <Card title="Retire this save" subtitle="Keeps the file. You can export it.">
          <div className="flex flex-wrap gap-2">
            {pending && (
              <Button variant="danger" onClick={retire}>Retire</Button>
            )}
            <Button variant="ghost" onClick={() => exportSave(state)}>Export save</Button>
            {move.retired && (
              <Button variant="ghost" onClick={() => router.push("/saves")}>Saves</Button>
            )}
          </div>
        </Card>
      )}

      {pending && (
        <div className="grid gap-2 sm:grid-cols-3">
          <Stat label="From" value={from.abbr} sub={`${from.city} ${from.name}`} />
          <Stat label="Season" value={String(move.season)} sub="chair lost after this year" />
          <Stat label="Open chairs" value={String(move.openChairs.length)} sub="CPU clubs on the fire line" />
        </div>
      )}
    </div>
  );
}
