# Gridiron GM: Relationship System Design

> "Football is the ultimate team sport, but so is running a franchise. Your success depends not just on the players you pick, but on the people you work with."

---

## Overview

The GM operates within a web of relationships that affect every aspect of team building:

```
                    ┌─────────────┐
                    │    OWNER    │
                    │ (The Boss)  │
                    └──────┬──────┘
                           │
              Sets expectations, budget, timeline
                           │
                    ┌──────▼──────┐
                    │     GM      │
                    │   (You)     │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐      ┌─────▼─────┐     ┌─────▼─────┐
    │ SCOUTS  │      │   COACH   │     │  PLAYERS  │
    │(Intel)  │      │ (Scheme)  │     │ (Talent)  │
    └─────────┘      └───────────┘     └───────────┘
```

---

## Part 1: Core Relationship Types

### 1.1 Owner Relationship

The owner is your boss. They set the franchise's direction and your job security depends on meeting their expectations.

```typescript
interface OwnerProfile {
  id: string;
  name: string;
  teamId: string;

  // Personality
  type: OwnerType;
  patience: number;           // 0-100, how long they'll wait for results
  involvement: number;        // 0-100, how much they meddle
  spendingWillingness: number; // 0-100, willingness to spend on FA/facilities

  // Priorities (should sum to 100)
  priorities: {
    winning: number;          // Championships, playoff appearances
    profit: number;           // Revenue, attendance, cap efficiency
    prestige: number;         // Star players, media coverage
    development: number;      // Building through draft, young players
  };

  // Current mood
  satisfaction: number;       // 0-100
  trust: number;              // 0-100, affects autonomy
  publicStatements: OwnerStatement[];
}

type OwnerType =
  | "win_now"           // Wants championships immediately
  | "patient_builder"   // Understands rebuilds take time
  | "meddler"          // Wants input on every decision
  | "hands_off"        // Lets you do your job
  | "penny_pincher"    // Prioritizes profit over winning
  | "big_spender"      // Money is no object
  | "legacy_obsessed"  // Wants to build a dynasty
  | "new_money";       // Unpredictable, learning the business

interface OwnerStatement {
  date: Date;
  type: "praise" | "warning" | "neutral" | "ultimatum";
  message: string;
  publicOrPrivate: "public" | "private";
}
```

### 1.2 Head Coach Relationship

The coach implements your vision on the field. Alignment on philosophy and personnel is crucial.

```typescript
interface CoachProfile {
  id: string;
  name: string;
  teamId: string;

  // Background
  age: number;
  experience: number;
  reputation: number;         // 0-100, league-wide respect
  playcallingStyle: "aggressive" | "conservative" | "balanced";

  // Scheme preferences
  offenseScheme: OffenseScheme;
  defenseScheme: DefenseScheme;
  schemeFlexibility: number;  // 0-100, willing to adapt to personnel

  // Player development
  developmentSkill: number;   // 0-100, how well they develop young players
  veteranManagement: number;  // 0-100, handling egos and vets

  // Personality
  personality: CoachPersonality;
  mediaPresence: "media_savvy" | "reserved" | "controversial";

  // Priorities for roster building
  positionPriorities: Record<string, number>; // Position importance 1-10
  traitPriorities: {
    athleticism: number;
    experience: number;
    character: number;
    versatility: number;
    schemeFit: number;
  };

  // Relationship with GM
  relationshipWithGM: number; // 0-100
  alignmentScore: number;     // How aligned on philosophy
  publicDisagreements: number;
  privateDisagreements: number;
}

type OffenseScheme =
  | "west_coast"
  | "air_raid"
  | "spread"
  | "pro_style"
  | "run_heavy"
  | "rpo_based"
  | "power_run";

type DefenseScheme =
  | "4-3_base"
  | "3-4_base"
  | "multiple"
  | "cover_3"
  | "cover_2"
  | "man_heavy"
  | "aggressive_blitz";

type CoachPersonality =
  | "players_coach"     // Loved by players, may lack discipline
  | "disciplinarian"    // Strict, some players chafe
  | "innovator"         // Cutting edge, may be too clever
  | "old_school"        // Proven methods, may be outdated
  | "motivator"         // Great speeches, substance varies
  | "tactician"         // X's and O's genius
  | "developer";        // Great at improving young players
```

### 1.3 Scout Staff Relationship

Scouts provide intelligence. Their relationship with you affects information quality and honesty.

```typescript
interface ScoutStaffRelationship {
  scoutId: string;
  scoutName: string;

  // Relationship metrics
  trust: number;              // 0-100, do they trust your judgment?
  respect: number;            // 0-100, do they respect your decisions?
  loyalty: number;            // 0-100, will they stick with you?

  // Communication
  willShareHonestOpinion: boolean;
  willPushBack: boolean;      // Will they argue when they disagree?
  isYesMan: boolean;          // Just tells you what you want to hear

  // Track record with you
  timesAgreed: number;
  timesDisagreed: number;
  timesYouListened: number;
  timesYouIgnored: number;
  timesTheyWereRight: number;
  timesYouWereRight: number;

  // Morale
  morale: number;             // 0-100
  burnoutRisk: number;        // 0-100
  flightRisk: number;         // 0-100, might leave for another team
}
```

---

## Part 2: Recommendations & Disagreements

### 2.1 Recommendation Types

Different stakeholders make different types of recommendations:

```typescript
interface Recommendation {
  id: string;
  source: RecommendationSource;
  sourceName: string;
  type: RecommendationType;

  // What they recommend
  action: RecommendedAction;

  // Their reasoning
  reasoning: string;
  confidence: number;         // 0-100
  urgency: "low" | "medium" | "high" | "critical";

  // Your response
  status: "pending" | "followed" | "ignored" | "discussed";
  yourResponse?: string;

  // Outcome tracking
  outcome?: RecommendationOutcome;

  timestamp: Date;
}

type RecommendationSource =
  | "owner"
  | "coach"
  | "scout"
  | "analytics"
  | "agent"
  | "media";

type RecommendationType =
  | "draft_pick"              // Who to draft
  | "free_agent_signing"      // Sign this FA
  | "contract_extension"      // Extend this player
  | "trade_proposal"          // Make this trade
  | "cut_player"              // Release this player
  | "scheme_change"           // Change offensive/defensive approach
  | "staff_hiring"            // Hire this coordinator
  | "rebuild_vs_compete"      // Strategic direction
  | "playing_time"            // Start this player
  | "draft_strategy";         // Trade up/down, position focus

interface RecommendedAction {
  // For personnel decisions
  playerId?: string;
  playerName?: string;
  position?: string;

  // For draft
  prospectId?: string;
  prospectName?: string;
  draftPick?: number;

  // For trades
  tradeDetails?: {
    acquiring: string[];
    giving: string[];
  };

  // For contracts
  contractTerms?: {
    years: number;
    value: number;
  };

  // General
  description: string;
}

interface RecommendationOutcome {
  followedAdvice: boolean;
  resultedInSuccess: boolean;
  impactDescription: string;
  relationshipImpact: number;  // -20 to +20
}
```

### 2.2 Disagreement Scenarios

Common areas where stakeholders disagree:

```typescript
interface DisagreementScenario {
  id: string;
  type: DisagreementType;

  // Who's involved
  parties: {
    source: RecommendationSource;
    position: string;         // What they want
    reasoning: string;
  }[];

  // Stakes
  importance: "minor" | "moderate" | "major" | "critical";
  deadline?: Date;

  // Your decision
  decision?: string;
  decidedWith?: RecommendationSource;

  // Aftermath
  reactions: StakeholderReaction[];
}

type DisagreementType =
  | "draft_pick_preference"
  | "free_agent_priority"
  | "contract_value"
  | "trade_evaluation"
  | "scheme_fit_vs_talent"
  | "veteran_vs_youth"
  | "win_now_vs_rebuild"
  | "budget_allocation"
  | "playing_time_decision"
  | "cut_decision";

interface StakeholderReaction {
  source: RecommendationSource;
  sourceName: string;
  reaction: "supportive" | "accepting" | "disappointed" | "angry" | "furious";
  publicOrPrivate: "public" | "private";
  message: string;
  relationshipChange: number; // -20 to +10
  trustChange: number;
}
```

---

## Part 3: Relationship Impacts

### 3.1 Owner Relationship Effects

| Trust Level | Effect |
|-------------|--------|
| 90-100 | Full autonomy, increased budget, contract extension |
| 70-89 | Normal operations, occasional check-ins |
| 50-69 | Increased oversight, must justify decisions |
| 30-49 | Hot seat, media speculation, limited FA budget |
| 0-29 | Imminent firing, owner making personnel decisions |

```typescript
interface OwnerRelationshipEffects {
  // Autonomy
  canMakeTradesFreely: boolean;
  freeAgentBudgetMultiplier: number;  // 0.5x to 1.5x
  mustGetApprovalFor: string[];       // Trade, big FA, etc.

  // Job security
  jobSecurityRating: "safe" | "stable" | "warm" | "hot" | "fired";
  seasonsRemaining?: number;          // If on hot seat

  // Resources
  scoutingBudget: number;
  facilityInvestment: number;

  // Owner behavior
  publicSupport: boolean;
  meddlingLevel: "none" | "suggestions" | "demands" | "overrules";

  // Special scenarios
  mandatedTargets?: string[];         // Owner wants specific players
  forbiddenMoves?: string[];          // Owner won't allow certain moves
}
```

### 3.2 Coach Relationship Effects

| Alignment | Effect |
|-----------|--------|
| 90-100 | Perfect sync, players develop faster, scheme maximized |
| 70-89 | Good working relationship, occasional disagreements |
| 50-69 | Tension, players notice, some development issues |
| 30-49 | Open conflict, players take sides, scheme struggles |
| 0-29 | One of you will be fired, team in chaos |

```typescript
interface CoachRelationshipEffects {
  // Player development
  developmentModifier: number;        // -20% to +20%
  rookieIntegrationSpeed: number;     // How fast rookies contribute

  // Scheme execution
  schemeEffectivenessModifier: number; // -15% to +15%
  playersPlayingOutOfPosition: number;

  // Locker room
  lockerRoomMorale: number;
  playerConfusion: boolean;           // Mixed messages from GM/coach

  // Draft/FA coordination
  willAcceptNonFits: boolean;         // Coach plays players that don't fit
  willDevelopNonFits: boolean;        // Coach tries to make it work

  // Communication
  honestFeedback: boolean;
  playsCallsMatch: boolean;           // Coach calls plays that fit personnel

  // Public
  unitedFront: boolean;
  mediaLeaks: boolean;                // Disagreements leak to press
}
```

### 3.3 Scout Relationship Effects

| Trust Level | Effect |
|-------------|--------|
| 90-100 | Scouts go above and beyond, share gut feelings, find hidden gems |
| 70-89 | Professional relationship, good intel |
| 50-69 | By-the-book reports, may withhold opinions |
| 30-49 | Demoralized, mistakes increase, may sandbag |
| 0-29 | Looking for other jobs, minimal effort |

```typescript
interface ScoutRelationshipEffects {
  // Report quality
  reportDetailLevel: "minimal" | "standard" | "detailed" | "exceptional";
  willShareGutFeelings: boolean;
  willAdmitUncertainty: boolean;
  willFlagCharacterIssues: boolean;

  // Effort
  effortLevel: number;                // 0-100
  extraWorkWillingness: boolean;      // Late nights, extra trips
  creativeScouting: boolean;          // Finding under-the-radar guys

  // Accuracy
  accuracyModifier: number;           // -10% to +10%
  biasLevel: number;                  // How much they tell you what you want

  // Retention
  likelyToLeave: boolean;
  recruitingOtherScouts: boolean;     // Poisoning the well
}
```

---

## Part 4: Decision Points & Consequences

### 4.1 Draft Day Decisions

```typescript
interface DraftDecisionPoint {
  pickNumber: number;

  // Recommendations
  ownerPreference?: {
    prospectId: string;
    prospectName: string;
    reason: string;            // "He's a local kid" or "Big name, sells jerseys"
  };

  coachPreference?: {
    prospectId: string;
    prospectName: string;
    reason: string;            // "Perfect scheme fit"
  };

  scoutConsensus?: {
    prospectId: string;
    prospectName: string;
    reason: string;            // "Best player available"
  };

  scoutDissenters?: {
    scoutId: string;
    scoutName: string;
    prospectId: string;
    prospectName: string;
    reason: string;
  }[];

  // If they all disagree
  isControversialPick: boolean;
  stakesLevel: "low" | "medium" | "high" | "franchise_defining";
}

// Example outcome tracking
interface DraftDecisionOutcome {
  pickNumber: number;
  playerSelected: string;

  // Who you agreed with
  alignedWith: RecommendationSource[];
  disagreedWith: RecommendationSource[];

  // Immediate reactions
  ownerReaction: StakeholderReaction;
  coachReaction: StakeholderReaction;
  scoutReactions: StakeholderReaction[];

  // Long-term tracking (updated over time)
  playerPerformance: "bust" | "below_expectations" | "met_expectations" | "exceeded" | "star";
  whoWasRight?: RecommendationSource;

  // Relationship impacts (applied immediately)
  immediateRelationshipChanges: Record<string, number>;

  // Delayed impacts (applied when performance is known)
  delayedRelationshipChanges?: Record<string, number>;
}
```

### 4.2 Free Agency Decisions

```typescript
interface FreeAgencyDecisionPoint {
  playerId: string;
  playerName: string;
  position: string;
  marketValue: number;

  // Recommendations
  ownerPosition: {
    recommendation: "sign" | "pass" | "no_opinion";
    maxBudget?: number;
    reason?: string;
  };

  coachPosition: {
    recommendation: "must_have" | "want" | "okay" | "dont_want";
    schemeFit: number;
    reason: string;
  };

  scoutPosition: {
    recommendation: "sign" | "pass";
    projectedDecline: string;
    reason: string;
  };

  // Budget implications
  ownerBudgetConcerns: boolean;
  wouldExceedBudget: boolean;
}
```

### 4.3 Trade Decisions

```typescript
interface TradeDecisionPoint {
  tradeId: string;

  // The trade
  acquiring: string[];
  giving: string[];

  // Recommendations
  ownerPosition: {
    recommendation: "approve" | "reject" | "no_opinion";
    concerns?: string[];
  };

  coachPosition: {
    recommendation: "love_it" | "like_it" | "neutral" | "dont_like" | "hate_it";
    schemeFitAssessment: string;
  };

  scoutPosition: {
    recommendation: "great_value" | "fair" | "overpay" | "terrible";
    talentAssessment: string;
  };

  // Special flags
  ownerFavoriteInvolved: boolean;    // Trading owner's favorite player
  coachGuyInvolved: boolean;         // Trading coach's preferred player
  scoutDiscoveryInvolved: boolean;   // Trading a scout's find
}
```

---

## Part 5: Relationship Events

### 5.1 Positive Events

```typescript
const POSITIVE_EVENTS: RelationshipEvent[] = [
  {
    type: "draft_pick_success",
    description: "Your draft pick made the Pro Bowl",
    triggers: { playerAchievement: "pro_bowl" },
    effects: {
      owner: { trust: +5, satisfaction: +10 },
      coach: { trust: +5, respect: +5 },
      scout: { trust: +8, morale: +10 },  // If they recommended
    }
  },
  {
    type: "playoff_appearance",
    description: "Team made the playoffs",
    effects: {
      owner: { trust: +10, satisfaction: +15 },
      coach: { trust: +5 },
    }
  },
  {
    type: "listened_and_right",
    description: "You followed advice and it worked out",
    effects: {
      // Whoever gave the advice
      sourceOfAdvice: { trust: +10, loyalty: +5 },
    }
  },
  {
    type: "admitted_mistake",
    description: "You acknowledged a bad decision",
    effects: {
      allStaff: { respect: +5 },
    }
  },
];
```

### 5.2 Negative Events

```typescript
const NEGATIVE_EVENTS: RelationshipEvent[] = [
  {
    type: "draft_bust",
    description: "High draft pick is a bust",
    triggers: { playerPerformance: "bust", draftPosition: "top_10" },
    effects: {
      owner: { trust: -10, satisfaction: -15 },
      coach: { trust: -5 },
      scout: { trust: -15, morale: -10 },  // If they recommended against
    }
  },
  {
    type: "ignored_and_wrong",
    description: "You ignored advice and it was a mistake",
    effects: {
      sourceOfAdvice: { trust: -15, respect: -10 },
    }
  },
  {
    type: "losing_season",
    description: "Team had losing record",
    effects: {
      owner: { satisfaction: -15, patience: -10 },
    }
  },
  {
    type: "public_disagreement",
    description: "Disagreement leaked to media",
    effects: {
      involvedParty: { trust: -10 },
      owner: { satisfaction: -5 },
    }
  },
  {
    type: "scout_recommendation_ignored_repeatedly",
    description: "Scout's recommendations ignored 3+ times",
    effects: {
      scout: { morale: -15, loyalty: -10, willShareHonestOpinion: false },
    }
  },
];
```

---

## Part 6: Job Security System

### 6.1 Performance Expectations

```typescript
interface SeasonExpectations {
  season: number;
  setBy: "owner";

  // Win expectations
  minimumWins: number;
  targetWins: number;
  playoffExpectation: "must" | "expected" | "nice_to_have" | "not_expected";

  // Development expectations
  rookieContributors: number;      // How many rookies should contribute
  developmentTargets: string[];    // Specific players to improve

  // Financial expectations
  stayUnderCap: boolean;
  maxDeadMoney: number;
  attendanceTarget?: number;

  // Specific mandates
  mandates: OwnerMandate[];
}

interface OwnerMandate {
  type: "sign_player" | "dont_sign" | "trade_for" | "dont_trade" | "draft_position" | "scheme";
  description: string;
  deadline?: Date;
  consequence: string;           // What happens if ignored
}
```

### 6.2 Hot Seat Mechanics

```typescript
interface JobSecurityStatus {
  status: "safe" | "stable" | "warm_seat" | "hot_seat" | "final_warning";

  // Factors
  ownerTrust: number;
  ownerSatisfaction: number;
  recentRecord: string;          // Last 2-3 seasons
  playoffAppearances: number;

  // Warnings
  warnings: JobWarning[];

  // What would help
  pathToSafety: string[];

  // What would hurt
  firingTriggers: string[];
}

interface JobWarning {
  date: Date;
  from: "owner" | "media_speculation";
  severity: "mild" | "serious" | "final";
  message: string;
  publicOrPrivate: "public" | "private";
}

// Firing scenarios
interface FiringScenario {
  trigger: string;
  probability: number;

  examples: [
    { trigger: "3 consecutive losing seasons", probability: 0.9 },
    { trigger: "Ignored owner mandate", probability: 0.7 },
    { trigger: "Public feud with coach", probability: 0.5 },
    { trigger: "Missed playoffs when expected", probability: 0.4 },
    { trigger: "Major scandal", probability: 0.95 },
  ]
}
```

---

## Part 7: Communication System

### 7.1 Meeting Types

```typescript
type MeetingType =
  | "weekly_staff"           // Regular staff meeting
  | "draft_prep"             // Pre-draft alignment
  | "free_agency_planning"   // FA strategy
  | "midseason_review"       // How's it going
  | "end_of_season"          // Full review
  | "owner_check_in"         // Owner wants to talk
  | "clear_the_air"          // Address tensions
  | "one_on_one";            // Private meeting

interface Meeting {
  type: MeetingType;
  participants: string[];

  // Agenda
  topics: MeetingTopic[];

  // Outcomes
  decisions: string[];
  agreements: string[];
  unresolved: string[];

  // Relationship changes
  relationshipChanges: Record<string, number>;
}

interface MeetingTopic {
  subject: string;
  raisedBy: string;

  // Positions
  positions: Record<string, string>;

  // Resolution
  resolved: boolean;
  resolution?: string;

  // If not resolved
  tension: boolean;
}
```

### 7.2 Communication Options

When disagreements arise, you have options:

```typescript
type CommunicationOption =
  | "defer"                  // Go with their recommendation
  | "override"               // Do it your way, explain later
  | "discuss"                // Have a conversation
  | "compromise"             // Find middle ground
  | "delay"                  // Buy time
  | "delegate";              // Let them handle it

interface CommunicationOutcome {
  option: CommunicationOption;

  // Typical effects
  relationshipImpact: {
    defer: { respect: -2, trust: +3 },
    override: { respect: +2, trust: -5 },
    discuss: { respect: +1, trust: +1, timeConsuming: true },
    compromise: { respect: +2, trust: +2, partialSolution: true },
    delay: { trust: -1, buysTime: true },
    delegate: { trust: +3, controlLost: true },
  }
}
```

---

## Part 8: UI Components Needed

### 8.1 Relationship Dashboard
- Overview of all key relationships
- Trust/satisfaction meters
- Recent interactions
- Pending recommendations
- Warning flags

### 8.2 Owner Office
- Owner profile and preferences
- Current expectations
- Job security status
- Meeting request option
- Historical interactions

### 8.3 Coach's Corner
- Coach profile and scheme
- Scheme fit visualization for roster
- Disagreement tracker
- Alignment score
- Meeting request option

### 8.4 Scout Room
- Scout staff overview
- Individual scout relationships
- Morale indicators
- Recommendation history
- Performance vs. your decisions

### 8.5 Decision Center
- Pending decisions with all recommendations
- Side-by-side comparison of positions
- Impact preview (relationship consequences)
- Decision history

### 8.6 Inbox/Notifications
- Recommendations from all sources
- Meeting requests
- Warnings and praise
- Media reports on relationships

---

## Part 9: Implementation Phases

### Phase 6A: Core Relationship System (1-2 weeks) ✅ COMPLETE
- [x] Relationship data models (`lib/relationships/relationship-types.ts`)
- [x] Owner, Coach, Scout profiles
- [x] Basic trust/satisfaction mechanics
- [x] Relationship effect calculations (`lib/relationships/relationship-effects.ts`)

### Phase 6B: Recommendation System (2 weeks) ✅ COMPLETE
- [x] Recommendation generation for draft (`lib/relationships/recommendations.ts`)
- [x] Recommendation generation for FA
- [x] Recommendation generation for trades
- [x] Disagreement detection
- [x] Decision tracking

### Phase 6C: Consequence System (2 weeks) ✅ COMPLETE
- [x] Relationship change calculations
- [x] Event triggers and effects
- [x] Job security mechanics
- [x] Long-term outcome tracking

### Phase 6D: UI Components (2-3 weeks) ✅ COMPLETE
- [x] Relationship Dashboard (`app/components/RelationshipDashboard.tsx`)
- [x] Owner Office (`app/components/OwnerOffice.tsx`)
- [x] Coach's Corner (`app/components/CoachCorner.tsx`)
- [x] Scout Room (`app/components/ScoutRoom.tsx`)
- [x] Decision Center (`app/components/DecisionCenter.tsx`)
- [x] Relationship Hub integration (`app/components/RelationshipHub.tsx`)

---

## Part 10: Example Scenarios

### Scenario 1: Draft Day Conflict

```
Pick #7 Overall

OWNER wants: Marcus Williams, QB from Texas
  Reason: "He's a star. Sells tickets. The fans want him."

COACH wants: Derek Johnson, OT from Ohio State
  Reason: "We need to protect whoever plays QB. Perfect fit for our zone scheme."

SCOUT CONSENSUS: Jaylen Carter, EDGE from Georgia
  Reason: "Best player in the draft. Elite pass rusher."

LEAD SCOUT DISSENT: "Carter has character red flags. I'd go Williams or Johnson."

YOUR CHOICE:
1. Draft Williams (Owner happy, Coach/Scouts disappointed)
2. Draft Johnson (Coach happy, Owner/Scouts disappointed)
3. Draft Carter (Scouts happy, Owner/Coach questioning)
4. Trade down (Buy time, but might miss all three)

STAKES: First round picks are closely watched. This decision will be remembered.
```

### Scenario 2: Free Agency Dilemma

```
Star WR hitting free agency - Darius Mitchell, 29 years old

OWNER: "Sign him. He's a fan favorite and moves merchandise."
  Budget approval: $22M/year

COACH: "I want him back, but we could draft a WR and save money for defense."
  Fit assessment: 85/100

SCOUT: "He's showing early decline. 2 good years left max. $22M is an overpay."
  Recommendation: Let him walk, draft replacement

YOUR OPTIONS:
1. Sign Mitchell at $22M (Owner thrilled, Scout frustrated)
2. Negotiate hard at $18M (Might lose him, Owner nervous)
3. Let him walk (Scout validated, Owner/Coach upset)
4. Sign-and-trade (Complex, could satisfy multiple parties)
```

### Scenario 3: Midseason Crisis

```
SITUATION: 3-6 record, coach calling for trades

COACH: "We need help at linebacker NOW. Trade future picks."

OWNER: "I'm not throwing away draft capital on a lost season."

SCOUTS: "We have a promising LB in year 2. Give him more snaps."

ADDITIONAL CONTEXT:
- Coach is on thin ice (not your decision)
- Owner is watching closely
- Scouts feel unheard lately

This isn't just about the LB decision. It's about alignment.
```

---

## Success Metrics

### Engagement
- [ ] Players read recommendation reasoning
- [ ] Decisions feel meaningful
- [ ] Relationships feel dynamic

### Realism
- [ ] Owner/Coach/Scout perspectives feel authentic
- [ ] Consequences match real NFL dynamics
- [ ] Job security creates appropriate tension

### Strategy
- [ ] Managing relationships becomes a skill
- [ ] Can't please everyone all the time
- [ ] Long-term relationship investment pays off

---

*Created: January 2025*
*Status: Implementation Complete*
*Updated: January 2025*
