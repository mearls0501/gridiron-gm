export interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  status: "pending" | "completed" | "optional" | "locked";
  actionUrl?: string;
  actionLabel?: string;
  isRequired: boolean;
  isBlocking: boolean; // Prevents advancing
}

export interface StageProgress {
  stage: "preseason" | "regular_season" | "playoffs" | "offseason";
  week?: number;
  completionPercentage: number;
  items: ChecklistItem[];
  canAdvance: boolean;
  blockingReason?: string;
}

