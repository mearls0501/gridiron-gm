/**
 * Type definitions for the new scouting system
 */

export type ScoutArchetype =
  | "evaluator"
  | "tape_grinder"
  | "character_coach"
  | "athletic_analyst";

export type ScoutingActionType =
  | "initial"
  | "game_tape"
  | "combine"
  | "interview"
  | "medical";

export type PriorityLevel = 1 | 2 | 3 | 4;

export interface Scout {
  id: string;
  save_game_id: string;
  name: string;
  archetype: ScoutArchetype;
  evaluation: number;
  football_iq: number;
  athletic_analysis: number;
  psych_insight: number;
  medical_read: number;
  analytics: number;
  confidence: number;
  experience: number;
  communication: number;
  qb_specialist: number;
  wr_specialist: number;
  ol_specialist: number;
  dl_specialist: number;
  db_specialist: number;
  rb_specialist: number;
  salary: number;
  reputation: number;
  loyalty: number;
  created_at?: string;
}

export interface ScoutContract {
  id: string;
  team_id: string;
  scout_id: string;
  save_game_id: string;
  salary: number;
  contract_years: number;
  loyalty: number;
  reputation: number;
  role: ScoutArchetype;
  created_at?: string;
  updated_at?: string;
}

export interface ScoutPriority {
  id: string;
  team_id: string;
  scout_id: string;
  save_game_id: string;
  season: number;
  priority: PriorityLevel;
  weekly_points: number;
  created_at?: string;
  updated_at?: string;
}

export interface ScoutedProspect {
  id: string;
  team_id: string;
  prospect_id: string;
  save_game_id: string;
  est_overall_low?: number;
  est_overall_high?: number;
  est_potential_low?: number;
  est_potential_high?: number;
  trait_reveals: Record<string, any>;
  athletic_bands: Record<string, any>;
  psych_reveals: Record<string, any>;
  scheme_fit?: string;
  confidence?: number;
  updated_at?: string;
  created_at?: string;
}

export interface ScoutingAction {
  id: string;
  team_id: string;
  prospect_id: string;
  scout_id: string;
  save_game_id: string;
  action_type: ScoutingActionType;
  points_used: number;
  revealed: Record<string, any>;
  created_at?: string;
}

export interface ScoutWithContract extends Scout {
  contract?: ScoutContract;
  priority?: ScoutPriority;
}

// Priority point mappings
export const PRIORITY_POINTS: Record<PriorityLevel, number> = {
  1: 25, // Primary
  2: 15, // Secondary
  3: 10, // Tertiary
  4: 5,  // Quaternary
};

// Priority names
export const PRIORITY_NAMES: Record<PriorityLevel, string> = {
  1: "Primary",
  2: "Secondary",
  3: "Tertiary",
  4: "Quaternary",
};

