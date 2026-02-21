// Type definitions for the simulation engine

export interface Player {
  id: string;
  full_name: string;
  position: string;
  age: number;
  overall: number;
  potential: number;
  traits: {
    speed: number;
    strength: number;
    awareness: number;
  };
  team_id: string | null;
}

export interface Team {
  id: string;
  name: string;
  abbreviation?: string;
  division: string;
  conference: string;
}

export interface TeamWithRoster extends Team {
  players: Player[];
}

export interface SimulationConfig {
  homeTeamId: string;
  awayTeamId: string;
  gameId: string;
  season: number;
  week: number;
  includePlayByPlay?: boolean; // Optional: defaults to true for backward compatibility
}

export interface GameResult {
  homeScore: number;
  awayScore: number;
  playerStats: PlayerGameStat[];
  playByPlay?: Play[];
}

export interface PlayerGameStat {
  player_id: string;
  game_id: string;
  team_id: string;
  season: number;
  week: number;
  // Offensive stats
  passing_yards?: number;
  passing_tds?: number;
  interceptions?: number;
  completions?: number;
  attempts?: number;
  rushing_yards?: number;
  rushing_tds?: number;
  rushing_attempts?: number;
  receiving_yards?: number;
  receiving_tds?: number;
  receptions?: number;
  targets?: number;
  fumbles?: number;
  // Defensive stats
  tackles?: number;
  solo_tackles?: number;
  sacks?: number;
  defensive_interceptions?: number;
  forced_fumbles?: number;
  fumble_recoveries?: number;
  passes_defended?: number;
  tfl?: number;
  // Special teams
  field_goals_made?: number;
  field_goals_attempted?: number;
  extra_points_made?: number;
  punts?: number;
  punt_yards?: number;
  // Performance
  performance_rating?: number;
  snaps_played?: number;
}

export interface Play {
  playNumber: number;
  down: number;
  distance: number;
  yardLine: number;
  playType: 'pass' | 'run' | 'punt' | 'field_goal' | 'kickoff';
  yards: number;
  success: boolean;
  turnover: boolean;
  points: number;
  possessionChange: boolean;
  description: string;
}

export interface TeamStrength {
  overall: number;
  offense: number;
  defense: number;
  specialTeams: number;
  qbRating: number;
  olineRating: number;
  skillRating: number;
  dlineRating: number;
  secondaryRating: number;
}

