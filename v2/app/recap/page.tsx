"use client";

import Link from "next/link";
import { useGame } from "@/lib/store/game";
import { SeasonReviewPanels } from "@/components/SeasonReview";
import { hasSeasonReview, presentSeasonReview } from "@/lib/view/seasonReview";
import { Button, Card, Empty } from "@/components/ui";

/**
 * Dedicated Season Review. Linked from the hub phase card. Reads awards,
 * retirements, and year-over-year production from the save — nothing is
 * invented, and the writer is not called.
 */
export default function RecapPage() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);

  if (!state) return null;
  void rev;

  if (!hasSeasonReview(state)) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Season Review</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Awards, retirements, and year-over-year production.
          </p>
        </div>
        <Card>
          <Empty
            title="No season is in the books yet."
            hint="Finish the playoffs to open the review. Awards are scored from that year's lines."
            action={
              <Link href="/">
                <Button size="sm" variant="ghost">Back to Hub</Button>
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const view = presentSeasonReview(state);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{view.season} Season Review</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {view.userRecord}
            {view.userFinish ? ` · ${view.userFinish}` : ""}
            {view.pendingWrite
              ? " · Awards scored from this year's lines. Retirements and rating changes write when you continue."
              : " · From the season archive."}
          </p>
        </div>
        <Link href="/">
          <Button size="sm" variant="ghost">Hub</Button>
        </Link>
      </div>
      <SeasonReviewPanels state={state} view={view} />
    </div>
  );
}
