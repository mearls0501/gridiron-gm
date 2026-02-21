# NFL Player Acquisition System Design

> Beyond the draft, GMs build rosters through trades and free agency. This document outlines the systems needed to scout, evaluate, and acquire current NFL players.

---

## Overview

There are three ways to acquire NFL talent:
1. **The Draft** - Already implemented (Phases 1-4)
2. **Trades** - Acquiring players from other teams for picks/players
3. **Free Agency** - Signing players whose contracts have expired

Each requires different scouting approaches and evaluation criteria.

---

## Part 1: NFL Player Scouting

### 1.1 Key Differences from Draft Scouting

| Aspect | Draft Prospects | NFL Players |
|--------|----------------|-------------|
| Data Available | Limited college tape | Full NFL stats & tape |
| Uncertainty | High (projection) | Lower (proven production) |
| Age Factor | All ~21-23 | Varies (22-38) |
| Contract | Rookie scale | Market value |
| Fit Assessment | Scheme projection | Scheme fit evidence |
| Character Intel | Limited | Team/league reputation |
| Injury History | College only | Full NFL medical |

### 1.2 NFL Player Attributes to Track

```typescript
interface NFLPlayer {
  id: string;
  name: string;
  position: string;
  age: number;
  experience: number; // Years in league

  // Current situation
  teamId: string;
  contractYearsRemaining: number;
  capHit: number;
  deadCap: number; // Cost to cut

  // Ratings (known, not scouted)
  overall: number;
  potential: number; // Remaining upside

  // Trajectory
  peakAge: number;
  declineRate: number;

  // Status flags
  isProbowl: boolean;
  isAllPro: boolean;
  isFranchiseTagged: boolean;
  isUFA: boolean; // Unrestricted free agent
  isRFA: boolean; // Restricted free agent

  // Trade/FA specific
  tradeValue: number;
  marketValue: number; // Expected FA contract
  willingnessToSign: Record<string, number>; // By team
}
```

### 1.3 What Needs Scouting for NFL Players?

Even with known stats, scouts provide value:

1. **Scheme Fit Analysis**
   - How well does player fit YOUR system?
   - Transition risk from their current scheme
   - Position flexibility

2. **Locker Room Intel**
   - Leadership qualities
   - Chemistry with your players
   - Attitude/work ethic concerns
   - Agent relationship (easy to negotiate?)

3. **Medical Deep Dive**
   - Injury history analysis
   - Long-term durability projection
   - Hidden injuries teams don't disclose

4. **Decline Projection**
   - Is this player past their peak?
   - How many good years left?
   - Position-specific aging curves

5. **Contract Value Assessment**
   - Is the player worth their cap hit?
   - What's fair market value?
   - Restructure potential

---

## Part 2: Trade System

### 2.1 Trade Types

1. **Player for Picks**
   - Send player, receive draft capital
   - Most common for aging stars

2. **Player for Player**
   - Swap players directly
   - Often includes pick sweeteners

3. **Salary Dumps**
   - Team pays to offload bad contract
   - Rebuilding teams absorb salary for picks

4. **Blockbuster Trades**
   - Star player moves
   - Multiple picks + players involved

### 2.2 Trade Evaluation Factors

```typescript
interface TradeEvaluation {
  // Player value
  playerValue: number;        // Based on OVR, age, contract
  remainingValue: number;     // Value over contract duration

  // Pick value
  pickValue: number;          // Jimmy Johnson chart
  projectedPickValue: number; // Adjust for team strength

  // Cap implications
  capSavings: number;
  deadCapHit: number;
  futureCaopSpace: number;

  // Team fit
  needFilled: number;         // 0-100 how much this helps
  depthChart: string;         // Where they'd play

  // Intangibles
  lockerRoomImpact: number;
  marketingValue: number;     // Star power

  // Risk assessment
  injuryRisk: number;
  ageRisk: number;
  bustRisk: number;
}
```

### 2.3 CPU Trade AI Behavior

CPU teams should:
- Protect young stars (rarely trade)
- Shop aging veterans at deadline
- Sell at high value before decline
- Target needs at reasonable prices
- Counter lowball offers
- Occasionally make surprising moves

```typescript
interface CPUTradeLogic {
  // When CPU initiates trades
  willShopPlayer(player: NFLPlayer): boolean {
    // Shop if: aging, overpaid, depth piece, rebuilding
  }

  // When CPU receives offers
  evaluateOffer(offer: TradePackage): "accept" | "counter" | "reject" {
    // Accept if: good value, fills need, cap relief
    // Counter if: close but want more
    // Reject if: insulting, core player, not interested
  }

  // What CPU wants
  getTargetPlayers(): NFLPlayer[] {
    // Based on: team needs, budget, window (competing vs rebuilding)
  }
}
```

### 2.4 Trade Block Feature

Teams can publicly signal players available:
- Puts player "on the block"
- CPU teams more likely to inquire
- Can set asking price (high, medium, low)
- Generates more trade offers

### 2.5 Trade Deadline Frenzy

Special event during season:
- Contenders buy, rebuilders sell
- Increased trade activity
- Rental players (expiring contracts)
- Breaking news feed of rumors
- "X team is interested in your player"

---

## Part 3: Free Agency System

### 3.1 Free Agency Calendar

```
March 1-3:     Franchise Tag Window
March 4-6:     Legal Tampering Period (can negotiate, not sign)
March 7+:      Free Agency Opens
July:          Training Camp Cuts
August:        Final Roster Cuts
During Season: Street Free Agents
```

### 3.2 Free Agent Types

1. **Unrestricted Free Agents (UFA)**
   - 4+ years experience
   - Can sign with any team
   - No compensation to old team

2. **Restricted Free Agents (RFA)**
   - 3 years experience
   - Original team can match offers
   - Tender levels determine compensation

3. **Exclusive Rights Free Agents (ERFA)**
   - 1-2 years experience
   - Must sign with current team if offered minimum

4. **Street Free Agents**
   - Cut players during season
   - Available immediately
   - Often depth/injury replacements

### 3.3 Contract Negotiation

```typescript
interface ContractOffer {
  totalValue: number;         // Full contract value
  guaranteed: number;         // Guaranteed money
  years: number;              // Contract length
  yearlyBreakdown: {
    year: number;
    baseSalary: number;
    signingBonus: number;
    rosterBonus: number;
    incentives: number;
  }[];
  noTradeClause: boolean;
  performanceIncentives: Incentive[];
}

interface PlayerDemands {
  minimumTotal: number;
  minimumGuaranteed: number;
  preferredYears: number;
  willingToTakeDiscount: boolean; // For contenders
  preferredDestinations: string[]; // Team IDs
  avoidTeams: string[];           // Won't sign with
}
```

### 3.4 Factors Affecting Signing

1. **Money** (Primary)
   - Total value
   - Guaranteed money
   - Signing bonus

2. **Winning**
   - Team's record/trajectory
   - Playoff chances
   - Championship window

3. **Role**
   - Guaranteed starting spot
   - Usage/targets/touches
   - System fit

4. **Location**
   - Weather preference
   - Family/hometown
   - Market size
   - Tax situation

5. **Relationships**
   - Head coach connection
   - Former teammates
   - Agent relationships

### 3.5 Recruiting Actions

Players can take actions to improve FA signing chances:

1. **Facility Tour** (Pre-FA)
   - Show player the facilities
   - Small boost to interest
   - Costs: Time

2. **Coach Meeting**
   - HC explains role and vision
   - Medium boost
   - Better if coach has reputation

3. **Player Endorsement**
   - Current player recruits FA
   - Works better with connections
   - "Come play with me!"

4. **Godfather Offer**
   - Overpay significantly
   - Almost always works
   - Expensive

5. **Hometown Discount Ask**
   - Only works if player has ties
   - Can backfire if relationship is weak

### 3.6 Free Agency Bidding War

When multiple teams want same player:
- Real-time bidding updates
- "Team X has offered Y!"
- 24-hour decision windows
- Player visits teams
- Final decision announcement

---

## Part 4: Scout Roles in Player Acquisition

### 4.1 Pro Scout vs College Scout

| Pro Scout | College Scout |
|-----------|---------------|
| Evaluates NFL players | Evaluates draft prospects |
| Trade targets | Draft targets |
| FA evaluations | N/A |
| Opponent prep | N/A |
| Lower uncertainty | Higher uncertainty |

### 4.2 Pro Scout Actions

```typescript
type ProScoutAction =
  | "evaluate_player"      // Full scouting report
  | "scheme_fit_analysis"  // How they fit your system
  | "medical_investigation"// Deep dive on injuries
  | "character_check"      // Locker room intel
  | "contract_analysis"    // Value assessment
  | "agent_intel"          // How negotiations might go
  | "opponent_prep"        // Game-specific scouting
```

### 4.3 Pro Scouting Reports

```typescript
interface ProScoutingReport {
  playerId: string;
  scoutId: string;

  // Core evaluation
  currentGrade: string;      // A+ to F
  projectedDecline: string;  // "Minimal", "Moderate", "Significant"
  yearsRemaining: number;    // Good years left

  // Fit assessment
  schemeFit: number;         // 0-100
  schemeNotes: string;       // "His zone coverage skills translate perfectly"

  // Value assessment
  isOverpaid: boolean;
  fairValue: number;         // What contract should be
  tradeValue: string;        // "1st rounder", "Day 2 pick", etc.

  // Risk factors
  injuryConcerns: string[];
  characterFlags: string[];
  declineIndicators: string[];

  // Recommendation
  recommendation: "pursue" | "monitor" | "avoid";
  summary: string;
}
```

---

## Part 5: Salary Cap Integration

### 5.1 Cap Management Basics

```typescript
interface TeamCapSituation {
  salaryCap: number;          // League cap (~$225M)
  currentCommitments: number; // Signed contracts
  capSpace: number;           // Available space
  deadMoney: number;          // Cut player penalties

  // Projections
  nextYearCap: number;
  rolloverSpace: number;

  // Key dates
  topFreeAgents: string[];    // Your players hitting FA
  expiringDeals: Contract[];
}
```

### 5.2 Contract Manipulation

1. **Restructure**
   - Convert salary to bonus
   - Spreads cap hit over years
   - Creates short-term space

2. **Extension**
   - Add years to deal
   - Can lower current cap hit
   - Locks in player longer

3. **Cut (Pre-June 1)**
   - Release player
   - Dead cap hit immediate
   - Clears future years

4. **Cut (Post-June 1)**
   - Dead cap spread over 2 years
   - Less immediate impact
   - Planning required

5. **Trade**
   - Transfer contract to other team
   - Dead cap only on bonus money
   - Often best for bad contracts

---

## Part 6: UI Components Needed

### 6.1 Player Market Browser
- Filter by: Position, Age, Contract Status, Rating
- Sort by: Rating, Salary, Age, Trade Value
- Quick compare tool
- Add to watchlist

### 6.2 Trade Center
- ✅ Already built (TradeNegotiation.tsx)
- Need to extend for NFL players
- Add contract details to trade UI

### 6.3 Free Agency Hub
- Current FA class
- Your cap situation
- Bidding interface
- Visit scheduling
- Offer comparison

### 6.4 Contract Negotiation Screen
- Slider-based offer builder
- Real-time player reaction
- Comparable contracts shown
- Cap impact preview

### 6.5 Pro Scout Management
- Assign scouts to players/teams
- View active investigations
- Report queue
- Scout specializations (cap expert, medical, etc.)

### 6.6 Roster & Cap Management
- Full roster view
- Contract details per player
- Cap projections by year
- Restructure/cut simulator

---

## Part 7: Implementation Phases

### Phase 5A: Foundation (2 weeks)
- [ ] NFL Player data model
- [ ] Pro scout system
- [ ] Basic trade logic for players
- [ ] Contract data structures

### Phase 5B: Trading (2-3 weeks)
- [ ] Player trade evaluation
- [ ] CPU trade AI for players
- [ ] Trade block feature
- [ ] Trade deadline event

### Phase 5C: Free Agency (3-4 weeks)
- [ ] Free agent classification
- [ ] Contract offer builder
- [ ] Player interest/demands system
- [ ] FA bidding system
- [ ] CPU team FA behavior

### Phase 5D: Cap Management (2 weeks)
- [ ] Salary cap tracking
- [ ] Contract manipulation (restructure, extend, cut)
- [ ] Cap projection tools
- [ ] Dead money calculations

### Phase 5E: Polish (1-2 weeks)
- [ ] UI components for all systems
- [ ] Tutorial/help system
- [ ] Balance testing
- [ ] CPU behavior tuning

---

## Part 8: Database Tables Needed

```sql
-- NFL Player extensions
ALTER TABLE players ADD COLUMN contract_years_remaining INTEGER;
ALTER TABLE players ADD COLUMN base_salary DECIMAL;
ALTER TABLE players ADD COLUMN cap_hit DECIMAL;
ALTER TABLE players ADD COLUMN dead_cap DECIMAL;
ALTER TABLE players ADD COLUMN is_franchise_tagged BOOLEAN;
ALTER TABLE players ADD COLUMN free_agent_year INTEGER;

-- Pro scouting reports
CREATE TABLE pro_scouting_reports (
  id UUID PRIMARY KEY,
  player_id UUID REFERENCES players(id),
  scout_id UUID REFERENCES scouts(id),
  team_id UUID REFERENCES teams(id),

  current_grade VARCHAR(2),
  scheme_fit INTEGER,
  years_remaining INTEGER,
  injury_risk INTEGER,

  is_overpaid BOOLEAN,
  fair_value DECIMAL,
  trade_value VARCHAR(50),

  recommendation VARCHAR(20),
  summary TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Free agent tracking
CREATE TABLE free_agent_interest (
  id UUID PRIMARY KEY,
  player_id UUID REFERENCES players(id),
  team_id UUID REFERENCES teams(id),

  interest_level INTEGER, -- 0-100
  offer_made JSONB,
  player_response VARCHAR(20),
  visit_scheduled BOOLEAN,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Contract offers
CREATE TABLE contract_offers (
  id UUID PRIMARY KEY,
  player_id UUID REFERENCES players(id),
  team_id UUID REFERENCES teams(id),

  total_value DECIMAL,
  guaranteed DECIMAL,
  years INTEGER,
  yearly_breakdown JSONB,

  status VARCHAR(20), -- pending, accepted, rejected, countered
  expires_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Trade history (extended)
CREATE TABLE trade_history (
  id UUID PRIMARY KEY,

  team1_id UUID REFERENCES teams(id),
  team2_id UUID REFERENCES teams(id),

  team1_sends JSONB, -- { players: [], picks: [] }
  team2_sends JSONB,

  executed_at TIMESTAMP DEFAULT NOW()
);
```

---

## Part 9: Success Metrics

### Engagement
- [ ] Average time in FA hub (target: 20+ min during FA)
- [ ] Trades made per season (target: 2-3 per user)
- [ ] FA signings per offseason (target: 5+ per user)

### Realism
- [ ] Trade values feel fair
- [ ] FA prices match real NFL
- [ ] CPU makes reasonable moves
- [ ] Contract structures are realistic

### Strategy Depth
- [ ] Cap management matters
- [ ] Scouting provides edge in trades/FA
- [ ] Multiple paths to build roster
- [ ] Trade deadline is exciting

---

## Notes & Ideas

- "Tampering" mechanic - contact players early but risk penalty
- Player visit mini-game (tour facility, pitch team)
- Agent personalities that affect negotiations
- "Prove it" deals for risky players
- Hometown discount probability
- Player-requested trades (forcing your hand)
- "NBA-style" trade machine for fans to propose
- Twitter/social media reactions to moves
- "Sources say" rumors before moves happen
- Compensatory pick formula
- LTIR (injured reserve stashing)

---

## Implementation Status

### Phase 5A: Foundation ✅ COMPLETE

**Files Created:**

1. **`lib/players/player-contracts.ts`** - Core contract and player types
   - Contract data structures (years, guarantees, bonuses, incentives)
   - NFL Player extended type with personality, injuries, contract status
   - Team cap situation types
   - Cap operation types (restructure, extension, cut)
   - Position age curves and value multipliers
   - Helper functions for cap calculations

2. **`lib/scouting/pro-scouting.ts`** - Pro scout evaluation system
   - Pro scout types with specialties (scheme_analyst, medical_expert, cap_specialist, etc.)
   - Pro scouting report generation
   - Scheme fit analysis
   - Injury risk evaluation
   - Character evaluation
   - Contract value assessment
   - Recommendation engine (must_acquire, pursue, monitor, avoid)

3. **`lib/trades/player-trades.ts`** - Player trade system
   - Trade package types with players and picks
   - Player trade value calculation
   - Trade fairness evaluation
   - CPU trade AI logic
   - Trade block system with inquiries
   - Trade deadline events and rumors
   - Trade history and grading

4. **`lib/free-agency/free-agency.ts`** - Free agency system
   - Free agent classification (UFA, RFA, ERFA)
   - Contract offer types with yearly breakdowns
   - Player signing preferences (money, winning, role, location)
   - Contract evaluation from player perspective
   - CPU team free agency behavior
   - Recruiting actions (facility tour, coach meeting, player endorsement, etc.)
   - Free agency market simulation

5. **`lib/cap/cap-management.ts`** - Cap management utilities
   - Team cap situation calculation
   - Cut candidate evaluation
   - Contract restructure calculations
   - Contract extension building
   - Multi-year cap projections (3+ years)
   - Cap space creation strategies
   - Dead money tracking

### Remaining Phases

**Phase 5B: Trading UI** (Pending)
- [ ] Player Market Browser component
- [ ] Extended Trade Center for NFL players
- [ ] Trade Block UI
- [ ] Trade deadline experience

**Phase 5C: Free Agency UI** (Pending)
- [ ] Free Agency Hub component
- [ ] Contract Negotiation screen
- [ ] Bidding War UI
- [ ] Visit scheduling interface

**Phase 5D: Cap Management UI** (Pending)
- [ ] Roster & Cap Management screen
- [ ] Restructure/Cut simulator
- [ ] Cap projections visualization
- [ ] Contract builder

---

*Created: January 2025*
*Status: Phase 5A Foundation Complete*
*Last Updated: January 2025*
