"use client";

import { useRouter } from "next/navigation";
import { NewGameScreen } from "@/components/NewGameScreen";

/**
 * Explicit route to the new-franchise screen for when a save is already
 * loaded (the Shell shows it automatically only when no franchise exists).
 * Starting, loading, or importing a franchise from here lands on the hub.
 */
export default function NewFranchisePage() {
  const router = useRouter();
  return <NewGameScreen onDone={() => router.replace("/")} />;
}
