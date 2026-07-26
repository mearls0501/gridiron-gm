// @ts-nocheck
/**
 * Relationship System - Core Types
 * Models relationships between GM and Owner, Coach, and Scouts
 */

// =============================================================================
// OWNER TYPES
// =============================================================================

export interface Owner {
  id: string;
  name: string;
  teamId: string;

  // Background
  wealthSource: string;           // "Tech", "Real Estate", "Inheritance", etc.
  yearsAsOwner: number;
  previousTeams?: string[];

  // Personality
  type: OwnerType;
  patience: number;               // 0-100, tolerance for losing
  involvement: number;            // 0-100, how hands-on
  spendingWillingness: number;    // 0-100, payroll flexibility

  // Priorities (should sum roughly to 100)
  priorities: OwnerPriorities;

  // Current state
  satisfaction: number;           // 0-100
  trust: number;                  // 0-100, affects GM autonomy
  publicConfidence: number;       // 0-100, public statements

  // Communication style
  communicationStyle: "direct" | "passive_aggressive" | "supportive" | "demanding";
  meetingFrequency: "weekly" | "monthly" | "quarterly" | "as_needed";
}

export type OwnerType =
  | "win_now"             // Championships or bust
  | "patient_builder"     // Understands process
  | "meddler"             // Wants input on everything
  | "hands_off"           // Trusts the staff
  | "penny_pincher"       // Profit over wins
  | "big_spender"         // Will pay for talent
  | "legacy_obsessed"     // Wants dynasty
  | "new_money"           // Learning, unpredictable
  | "family_tradition";   // Inherited team, mixed priorities

export interface OwnerPriorities {
  winning: number;                // Championships, playoffs
  profit: number;                 // Revenue, cap efficiency
  prestige: number;               // Star players, media
  development: number;            // Building through draft
  community: number;              // Local ties, charity
}

export interface OwnerExpectations {
  season: number;
  minimumWins: number;
  targetWins: number;
  playoffExpectation: "must" | "expected" | "hope" | "not_expected";

  // Specific mandates
  mandates: OwnerMandate[];

  // Budget
  maxPayroll: number;
  scoutingBudget: number;
  freeAgencyBudget: number;
}

export interface OwnerMandate {
  id: string;
  type: MandateType;
  description: string;
  targetPlayerId?: string;
  targetPlayerName?: string;
  deadline?: Date;
  consequence: "warning" | "trust_loss" | "budget_cut" | "firing_risk";
  completed: boolean;
  ignored: boolean;
}

export type MandateType =
  | "sign_player"
  | "dont_sign_player"
  | "trade_for_player"
  | "dont_trade_player"
  | "draft_position"
  | "draft_local"
  | "cut_player"
  | "extend_player"
  | "reduce_payroll"
  | "win_division"
  | "make_playoffs";

// =============================================================================
// COACH TYPES
// =============================================================================

export interface Coach {
  id: string;
  name: string;
  teamId: string;

  // Background
  age: number;
  yearsExperience: number;
  yearsWithTeam: number;
  previousTeams: string[];
  playingCareer?: string;         // "Former QB", "Never played", etc.

  // Record
  careerWins: number;
  careerLosses: number;
  playoffAppearances: number;
  championships: number;

  // Reputation
  leagueReputation: number;       // 0-100
  playerReputation: number;       // 0-100, how players view them
  mediaReputation: number;        // 0-100

  // Scheme
  offenseScheme: OffenseScheme;
  defenseScheme: DefenseScheme;
  schemeFlexibility: number;      // 0-100, willing to adapt
  schemeComplexity: number;       // 0-100, how hard to learn

  // Skills
  gameManagement: number;         // 0-100, clock, challenges
  playerDevelopment: number;      // 0-100, improving players
  veteranManagement: number;      // 0-100, handling egos
  rookieIntegration: number;      // 0-100, getting rookies ready
  halftimeAdjustments: number;    // 0-100

  // Personality
  personality: CoachPersonality;
  motivationStyle: "tough_love" | "positive" | "analytical" | "emotional";
  mediaPresence: "savvy" | "reserved" | "controversial" | "boring";

  // Roster preferences
  positionPriorities: Record<string, number>;  // 1-10 importance
  traitPreferences: CoachTraitPreferences;

  // Relationship with GM
  trustInGM: number;              // 0-100
  respectForGM: number;           // 0-100
  alignmentWithGM: number;        // 0-100, philosophy match
  publicDisagreements: number;
  privateDisagreements: number;
  collaborativeDecisions: number;
}

export type OffenseScheme =
  | "west_coast"
  | "air_raid"
  | "spread"
  | "pro_style"
  | "run_heavy"
  | "rpo_based"
  | "power_run"
  | "shanahan_system"
  | "erhardt_perkins";

export type DefenseScheme =
  | "4-3_base"
  | "3-4_base"
  | "multiple"
  | "tampa_2"
  | "cover_3_seattle"
  | "man_heavy"
  | "aggressive_blitz"
  | "bend_dont_break";

export type CoachPersonality =
  | "players_coach"       // Loved by players
  | "disciplinarian"      // Strict, demanding
  | "innovator"           // Cutting edge
  | "old_school"          // Traditional
  | "motivator"           // Inspirational
  | "tactician"           // X's and O's genius
  | "developer"           // Great teacher
  | "ceo_type";           // Delegator, big picture

export interface CoachTraitPreferences {
  athleticism: number;            // 0-100 importance
  experience: number;
  character: number;
  versatility: number;
  schemeFit: number;
  intelligence: number;
  coachability: number;
}

export interface CoachRecommendation {
  type: "want" | "need" | "nice_to_have" | "dont_want";
  playerId?: string;
  playerName?: string;
  position?: string;
  reason: string;
  schemeFitScore?: number;
}

// =============================================================================
// SCOUT RELATIONSHIP TYPES
// =============================================================================

export interface ScoutRelationship {
  scoutId: string;
  scoutName: string;
  archetype: string;

  // Core relationship
  trust: number;                  // 0-100, do they trust your judgment
  respect: number;                // 0-100, do they respect you
  loyalty: number;                // 0-100, committed to the org
  morale: number;                 // 0-100, happiness

  // Communication
  willingToShareOpinion: boolean;
  willingToPushBack: boolean;
  isYesMan: boolean;
  honesty: number;                // 0-100

  // Track record
  agreementHistory: AgreementRecord[];
  totalAgreements: number;
  totalDisagreements: number;
  timesListenedTo: number;
  timesIgnored: number;
  timesTheyWereRight: number;
  timesYouWereRight: number;

  // Risk factors
  burnoutRisk: number;            // 0-100
  flightRisk: number;             // 0-100, might leave
}

export interface AgreementRecord {
  date: Date;
  decision: string;
  scoutRecommendation: string;
  yourDecision: string;
  agreed: boolean;
  outcome?: "pending" | "scout_right" | "gm_right" | "both_wrong" | "inconclusive";
}

// =============================================================================
// RECOMMENDATION TYPES
// =============================================================================

export interface Recommendation {
  id: string;
  timestamp: Date;

  // Source
  source: RecommendationSource;
  sourceId: string;
  sourceName: string;

  // Type
  type: RecommendationType;
  category: "personnel" | "strategy" | "financial" | "other";

  // Content
  action: RecommendedAction;
  reasoning: string;
  confidence: number;             // 0-100
  urgency: "low" | "medium" | "high" | "critical";

  // Context
  alternatives?: RecommendedAction[];
  risks?: string[];
  upside?: string[];

  // Status
  status: "pending" | "followed" | "ignored" | "discussed" | "compromised";
  yourResponse?: string;
  responseDate?: Date;

  // Outcome
  outcome?: RecommendationOutcome;
}

export type RecommendationSource =
  | "owner"
  | "coach"
  | "scout"
  | "analytics"
  | "agent"
  | "media"
  | "player";

export type RecommendationType =
  | "draft_target"
  | "draft_strategy"
  | "free_agent_sign"
  | "free_agent_avoid"
  | "contract_extension"
  | "contract_restructure"
  | "trade_proposal"
  | "trade_block"
  | "cut_player"
  | "promote_player"
  | "scheme_adjustment"
  | "staff_change"
  | "rebuild_compete"
  | "budget_request";

export interface RecommendedAction {
  description: string;

  // For personnel
  playerId?: string;
  playerName?: string;
  position?: string;

  // For draft
  prospectId?: string;
  prospectName?: string;

  // For contracts
  contractYears?: number;
  contractValue?: number;

  // For trades
  tradeAcquiring?: string[];
  tradeGiving?: string[];

  // For strategy
  schemeChange?: string;
  philosophyChange?: string;
}

export interface RecommendationOutcome {
  resolved: boolean;
  followedAdvice: boolean;
  success: boolean;
  description: string;
  relationshipImpact: number;     // -20 to +20
  evaluationDate: Date;
}

// =============================================================================
// DISAGREEMENT TYPES
// =============================================================================

export interface Disagreement {
  id: string;
  timestamp: Date;
  type: DisagreementType;

  // Parties and positions
  parties: DisagreementParty[];

  // Stakes
  importance: "minor" | "moderate" | "major" | "critical";
  visibility: "private" | "staff" | "public";

  // Decision
  decisionDeadline?: Date;
  decisionMade?: string;
  decidedWith?: RecommendationSource;

  // Aftermath
  resolved: boolean;
  reactions: StakeholderReaction[];
}

export interface DisagreementParty {
  source: RecommendationSource;
  sourceId: string;
  sourceName: string;
  position: string;
  reasoning: string;
  flexibility: number;            // 0-100, willing to compromise
}

export type DisagreementType =
  | "draft_pick"
  | "free_agent_priority"
  | "contract_value"
  | "trade_evaluation"
  | "scheme_vs_talent"
  | "veteran_vs_youth"
  | "win_now_vs_rebuild"
  | "budget_allocation"
  | "playing_time"
  | "cut_decision"
  | "coaching_hire"
  | "draft_strategy";

export interface StakeholderReaction {
  source: RecommendationSource;
  sourceId: string;
  sourceName: string;
  reaction: ReactionType;
  isPublic: boolean;
  message: string;
  trustChange: number;            // -20 to +10
  respectChange: number;
  satisfactionChange: number;
}

export type ReactionType =
  | "enthusiastic"
  | "supportive"
  | "accepting"
  | "neutral"
  | "disappointed"
  | "frustrated"
  | "angry"
  | "furious"
  | "resigned";

// =============================================================================
// JOB SECURITY TYPES
// =============================================================================

export interface JobSecurityStatus {
  status: SeatTemperature;
  lastUpdated: Date;

  // Contributing factors
  ownerTrust: number;
  ownerSatisfaction: number;
  recentRecord: SeasonRecord[];
  playoffDrought: number;         // Years since playoffs
  majorMistakes: string[];
  majorSuccesses: string[];

  // Warnings
  warnings: JobWarning[];
  finalWarningIssued: boolean;

  // Projections
  firingProbability: number;      // 0-100
  contractYearsRemaining: number;
  extensionLikelihood: number;    // 0-100

  // Guidance
  pathToSafety: string[];
  firingTriggers: string[];
}

export type SeatTemperature =
  | "safe"              // Contract extension likely
  | "stable"            // Normal operations
  | "lukewarm"          // Owner watching closely
  | "warm"              // Concerns raised
  | "hot"               // Job in jeopardy
  | "ejection_seat";    // One mistake from fired

export interface SeasonRecord {
  season: number;
  wins: number;
  losses: number;
  ties: number;
  madePlayoffs: boolean;
  playoffResult?: string;
}

export interface JobWarning {
  date: Date;
  from: "owner" | "media" | "insider";
  severity: "concern" | "warning" | "final_warning";
  message: string;
  isPublic: boolean;
  triggerEvent?: string;
}

// =============================================================================
// EVENT TYPES
// =============================================================================

export interface RelationshipEvent {
  id: string;
  timestamp: Date;
  type: RelationshipEventType;
  category: "positive" | "negative" | "neutral";

  // What happened
  description: string;
  triggerAction?: string;

  // Who's affected
  affectedRelationships: AffectedRelationship[];

  // Context
  season: number;
  week?: number;
  visibility: "private" | "staff" | "public" | "media_circus";
}

export type RelationshipEventType =
  // Positive
  | "draft_success"
  | "signing_success"
  | "trade_win"
  | "playoff_appearance"
  | "championship"
  | "listened_and_right"
  | "scout_discovery"
  | "coach_scheme_works"
  | "under_budget"
  // Negative
  | "draft_bust"
  | "signing_bust"
  | "trade_loss"
  | "missed_playoffs"
  | "losing_streak"
  | "ignored_and_wrong"
  | "over_budget"
  | "public_conflict"
  | "media_criticism"
  // Neutral
  | "end_of_season_review"
  | "contract_negotiation"
  | "staff_change";

export interface AffectedRelationship {
  entityType: "owner" | "coach" | "scout";
  entityId: string;
  entityName: string;
  changes: {
    trust?: number;
    respect?: number;
    satisfaction?: number;
    morale?: number;
    loyalty?: number;
  };
}

// =============================================================================
// COMMUNICATION TYPES
// =============================================================================

export interface Meeting {
  id: string;
  date: Date;
  type: MeetingType;
  initiatedBy: "gm" | RecommendationSource;

  // Participants
  participants: MeetingParticipant[];

  // Agenda
  topics: MeetingTopic[];

  // Outcomes
  decisions: string[];
  agreements: string[];
  unresolved: string[];
  actionItems: ActionItem[];

  // Relationship effects
  relationshipChanges: Record<string, number>;
  overallTone: "productive" | "tense" | "positive" | "negative" | "neutral";
}

export type MeetingType =
  | "weekly_sync"
  | "draft_prep"
  | "free_agency_planning"
  | "trade_discussion"
  | "midseason_review"
  | "end_of_season"
  | "owner_check_in"
  | "clear_the_air"
  | "one_on_one"
  | "emergency"
  | "contract_negotiation";

export interface MeetingParticipant {
  type: RecommendationSource | "gm";
  id: string;
  name: string;
  mood: "positive" | "neutral" | "negative";
  participation: "active" | "passive" | "resistant";
}

export interface MeetingTopic {
  subject: string;
  raisedBy: string;
  positions: Record<string, string>;
  resolved: boolean;
  resolution?: string;
  createdTension: boolean;
}

export interface ActionItem {
  description: string;
  assignedTo: string;
  deadline?: Date;
  completed: boolean;
}

// Export all types
export type {
  Owner,
  OwnerExpectations,
  Coach,
  ScoutRelationship,
  Recommendation,
  Disagreement,
  JobSecurityStatus,
  RelationshipEvent,
  Meeting,
};
