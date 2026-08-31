import { redirect } from "next/navigation";

/** Playtest typed /season-review. The real route is /recap (PR #16). */
export default function SeasonReviewAlias() {
  redirect("/recap");
}
