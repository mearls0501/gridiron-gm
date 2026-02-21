// Type definitions for the simulation engine

import { CoachingStaff } from './coaching-influence';

export interface Player {
  id: string;
  full_name: string;
  position: string;
  age: number;
  overall: number;
  potential: number;
  team_id: string | null;
  
  // Physical attributes
  spd?: number;
  acc?: number;
  agi?: number;
  str?: number;
  
  // QB/Passing attributes
  thp?: number;
  sac?: number;
  mac?: number;
  dac?: number;
  tup?: number;
  pac?: number;
  dec?: number;
  awr?: number;
  
  // Ball carrier/Blocking
  btk?: number;
  car?: number;
  vsn?: number;
  rtr?: number;
  pblk?: number;
  rblk?: number;
  iblk?: number;
  agg?: number;
  
  // Receiving
  rls?: number;
  rte?: number;
  cth?: number;
  cit?: number;
  yac?: number;
  
  // Defensive line
  pmv?: number;
  fmv?: number;
  bsh?: number;
  pur?: number;
  
  // Linebacker/Defense
  tak?: number;
  cov?: number;
  
  // Coverage
  mcv?: number;
  zcv?: number;
  prs?: number;
  
  // Kicking
  kpw?: number;
  kac?: number;
  
  // Technical skills
  footwork?: number;
  hand_placement?: number;
  release_tech?: number;
  hand_tech?: number;
  mechanics?: number;
  decision_time?: number;
  leverage?: number;
  move_set?: number;
  backpedal?: number;
  ball_skills?: number;
  play_recognition?: number;
  
  // Mental/Character
  football_iq?: number;
  motor?: number;
  work_ethic?: number;
  coachability?: number;
  leadership?: number;
  durability?: number;
  consistency?: number;
  injury_risk?: number;
  
  // Projection/Scouting
  athletic_ceiling?: number;
  technique_ceiling?: number;
  mental_ceiling?: number;
  breakout_probability?: number;
  bust_probability?: number;
  
  // Legacy (deprecated but may exist)
  traits?: {
    speed?: number;
    strength?: number;
    awareness?: number;
  };
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
  coaches?: CoachingStaff;
}

export interface SimulationConfig {
  homeTeamId: string;
  awayTeamId: string;
  gameId: string;
  season: number;
  week: number;
  includePlayByPlay?: boolean; // Optional: defaults to true for backward compatibility
  useEnhancedAttributes?: boolean; // Optional: use detailed attribute system (defaults to false)
  loadCoaches?: boolean; // Optional: load and apply coaching influence (defaults to true)
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

