# Free Agency Bidding System - Implementation Summary

## Overview

The free agency system has been completely overhauled to implement a Madden-style competitive bidding system where CPU teams actively compete with user teams for free agents across 4 distinct bidding stages.

## Key Features

### Player Contract Preferences

Each free agent has their own contract preferences based on:
- **Overall Rating**: Higher-rated players demand more money
- **Age**: Younger players want longer deals for security, veterans prefer shorter deals
- **Position**: QBs, DEs, CBs, and OTs command higher salaries
- **Market Value**: Preferences include preferred salary, contract length, signing bonus, and minimum acceptable salary

Players display their asking price prominently:
- **Preferred Annual Salary**: What they want per year
- **Preferred Contract Years**: 1-4 years based on age and rating
- **Total Contract Value**: Complete package including bonus
- **Minimum Acceptable**: Teams can bid below asking price, but risk being rejected

### 4-Stage Bidding Process

1. **Stage 1: Initial Bidding**
   - All teams submit their initial bids on free agents
   - CPU teams bid based on positional needs and player ratings
   - User can see all active bids and place their own

2. **Stage 2: Counter-Bidding**
   - Teams can increase their bids to stay competitive
   - CPU teams become more aggressive if they've been outbid
   - Visual feedback shows who's winning each bidding war

3. **Stage 3: Final Bidding**
   - Last chance for teams to make competitive offers
   - CPU teams evaluate their cap space and priorities
   - Bar graphs show the top 3-4 bidders for each player

4. **Stage 4: Resolution**
   - All bids are finalized
   - Highest bidders win and players are automatically signed
   - Contracts are created and cap space is updated
   - Players are removed from free agency

### Visual Bidding Interface

- **Bar Graph Visualization**: Shows top 3-4 teams bidding on each player with relative bid values
- **Real-time Updates**: See which teams are winning, your bid status, and total bidders
- **Bid Status Indicators**:
  - 🏆 Green bar = Winning bid
  - 🔵 Blue bar = Your bid (if not winning)
  - ⚪ Gray bar = Other team's bid
  - ⚠️ Red alert = You've been outbid

### CPU Bidding Logic

CPU teams make intelligent bidding decisions based on:

- **Positional Needs**: Teams prioritize positions where they're understaffed or have low-quality players
- **Salary Cap Space**: Teams won't bid beyond their available cap space
- **Player Overall Rating**: Higher-rated players attract more bids and higher offers
- **Player Preferences**: CPU teams consider the player's asking price
  - Stage 1: Bid 85-95% of asking price (testing the waters)
  - Stage 2: Bid 90-100% of asking price (getting serious)
  - Stage 3: Bid 95-105% of asking price (competitive)
  - Stage 4: Bid 100-115% of asking price (aggressive)
- **Bidding Stage**: Teams become more aggressive in later stages
- **Current Bid Status**: Teams counter-bid if they're outbid on high-priority targets
- **High Priority Needs**: Teams add 5% bonus for critical position needs

### Contract Generation

Contracts are automatically generated based on:

- **Player Overall Rating**:
  - 90+ OVR: $20M+ per year, 4-year contracts
  - 85-89 OVR: $15M per year, 4-year contracts
  - 80-84 OVR: $10M per year, 3-year contracts
  - 75-79 OVR: $6M per year, 3-year contracts
  - 70-74 OVR: $3M per year, 2-year contracts
  - 65-69 OVR: $1.5M per year, 1-year contracts
  - <65 OVR: Near league minimum, 1-year contracts

- **Escalating Years**: Later contract years increase by 5-15%
- **Signing Bonuses**: Top players (75+ OVR) receive 10-20% signing bonuses

## Database Schema

### `free_agency_player_preferences`
Stores each player's contract preferences:
- `save_game_id`, `season`: Context
- `player_id` or `prospect_id`: Player
- `preferred_annual_salary`: What player wants per year
- `preferred_contract_years`: Desired contract length (1-4)
- `preferred_signing_bonus`: Desired signing bonus
- `min_acceptable_salary`: Minimum they'll accept (80-90% of preferred)

### `free_agency_stage`
Tracks the current bidding stage for each save game:
- `save_game_id`: Which save game
- `season`: Current season
- `current_stage`: 1-4
- `stage_status`: 'active', 'processing', or 'completed'
- `started_at`, `completed_at`: Timestamps

### `free_agency_bids`
Stores all bids from all teams:
- `save_game_id`, `season`, `stage`: Context
- `player_id` or `prospect_id`: Player being bid on
- `team_id`: Team making the bid
- `contract_year_1-4`: Contract terms
- `signing_bonus`: Bonus amount
- `total_value`: Sum of all years + bonus
- `is_cpu_bid`: Whether CPU or user bid
- `bid_priority`: CPU priority level (1-10)
- `is_active`: Whether bid is current
- `is_winning`: Whether this is the highest bid
- `was_outbid`: Whether team was outbid

### `free_agency_notifications`
Tracks bidding notifications for users:
- Notification types: 'outbid', 'winning', 'signed', 'lost'
- Can be used to show alerts when user gets outbid

## API Endpoints

### `/api/free-agency/get-stage`
- **Method**: POST
- **Purpose**: Get current free agency stage
- **Returns**: Current stage number, status, and timestamps

### `/api/free-agency/get-bids`
- **Method**: POST
- **Purpose**: Get all active bids for the current stage
- **Returns**: Bids grouped by player with top bidders

### `/api/free-agency/submit-bid`
- **Method**: POST
- **Purpose**: Submit a user's bid on a player
- **Validates**: Cap space, minimum salary, stage is active
- **Updates**: Bid statuses to determine winners

### `/api/free-agency/advance-stage`
- **Method**: POST
- **Purpose**: Advance to the next bidding stage
- **Actions**:
  - Stage 1-3: Generate CPU bids for next stage
  - Stage 4: Resolve all bids and sign players

## Integration with Game Flow

### Offseason Week 24
Free agency bidding is integrated into the offseason progression:

1. User navigates to Free Agents page (week 24)
2. Clicks "Start Free Agency Bidding" to initialize Stage 1
3. CPU teams automatically generate bids
4. User places bids on desired players
5. User clicks "Advance to Stage 2" when ready
6. Process repeats through stages 2, 3, and 4
7. After Stage 4, all winning bids are finalized and players are signed
8. User can advance to Week 25 (Draft)

### Progression Checklist
The offseason checklist now shows:
- Free agency status (not started, stage X/4, or completed)
- Number of stages completed
- Option to view free agents page

## Files Created/Modified

### New Files
- `supabase/migrations/create_free_agency_bidding_system.sql` - Database schema (includes player preferences)
- `lib/free-agency/cpu-bidding.ts` - CPU bidding logic (considers player preferences)
- `lib/free-agency/player-preferences.ts` - Generate player contract preferences
- `app/api/free-agency/submit-bid/route.ts` - Submit bid endpoint
- `app/api/free-agency/get-bids/route.ts` - Get bids endpoint
- `app/api/free-agency/advance-stage/route.ts` - Advance stage endpoint
- `app/api/free-agency/get-stage/route.ts` - Get stage endpoint
- `FREE-AGENCY-BIDDING-SYSTEM.md` - This documentation

### Modified Files
- `app/free-agents/page.tsx` - Completely redesigned UI with bidding interface
- `lib/progression/checklist.ts` - Updated to track free agency stages
- `app/offseason/page.tsx` - Updated description for week 24

## Usage Instructions

### For Users

1. **Navigate to Free Agents** during offseason week 24
2. **Start Bidding** by clicking the "Start Free Agency Bidding" button
3. **Review Available Players** and their contract preferences:
   - Blue box shows each player's asking price
   - Displays preferred salary, contract length, and total value
   - You can bid under, at, or above their preference
4. **Place Your Bids**:
   - Click "Place Bid" on a player
   - Bid form auto-fills with player's preferred terms
   - Adjust salary and years as desired (go under to save cap, over to win)
   - Submit bid
5. **Monitor Competition**:
   - Green bar = You're winning
   - Red alert = You've been outbid
   - Yellow trophy = Highest bid
6. **Advance Through Stages** when ready (or stay in current stage to refine bids)
7. **Finalize** after Stage 4 to sign all players to winning teams

### For Developers

#### Adding Custom Bidding Logic

Modify `lib/free-agency/cpu-bidding.ts`:

```typescript
// Adjust CPU aggression levels
if (stage === 1) {
  shouldBid = priority >= 5 || target.overall >= 80;
} else if (stage === 2) {
  shouldBid = priority >= 4 || target.overall >= 75;
}
```

#### Adjusting Contract Values

In `generateContractOffer()` function:

```typescript
// Modify base salaries by overall rating
if (overall >= 90) baseSalary = 20000000;
else if (overall >= 85) baseSalary = 15000000;
// ... etc
```

#### Customizing Bid Increments

When counter-bidding, CPU teams increase by 5-15%:

```typescript
const increasePercent = 0.05 + (teamNeedPriority / 100) + (stage * 0.02);
```

## Testing Checklist

- [ ] Start free agency bidding from scratch
- [ ] Place bids on multiple players
- [ ] Get outbid by CPU teams
- [ ] Counter-bid to regain lead
- [ ] Advance through all 4 stages
- [ ] Verify players are signed to winning teams
- [ ] Check cap space is updated correctly
- [ ] Verify contracts are created properly
- [ ] Test with insufficient cap space
- [ ] Test advancing without any bids
- [ ] Verify progression checklist updates

## Future Enhancements

Potential improvements:

1. **Player Preferences**: Some players might favor certain teams or cities
2. **Bidding History**: Show bid history timeline for each player
3. **Auto-Bid Feature**: Set max bid and let CPU auto-counter up to limit
4. **Trade Bait**: Offer draft picks or players as part of signing package
5. **Injury Clauses**: Add contract incentives and protections
6. **Team Prestige**: Recently successful teams might attract better players at lower cost
7. **Position Flexibility**: Players who can play multiple positions are more valuable
8. **Analytics View**: Show value-over-replacement metrics for bid decisions
9. **Notifications**: Email/push notifications when user is outbid
10. **Negotiations**: Allow user to talk to player's agent before bidding

## Notes

- All CPU bids include 70% randomness to prevent predictability
- Teams evaluate needs based on roster composition vs. ideal position counts
- Bids are deactivated (not deleted) when outbid for historical tracking
- The system supports both regular players and draft prospects as free agents
- Contract year values escalate (Year 2 = 1.05x Year 1, etc.)
- Signing bonuses don't count against initial cap hit in this implementation

