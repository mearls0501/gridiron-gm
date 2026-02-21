# Offseason Performance Fix

## Problem
When advancing from preseason to week 1, the process would timeout and continue running in the background, causing:
- "Failed to fetch" errors in the UI
- Very slow processing (60+ seconds)
- CPU teams having only 24-28 players on rosters, requiring massive roster replenishment (adding 25-29 players each)

## Root Cause
**CPU teams were not resigning their own players during week 23 (resign phase)**. This meant:
1. All CPU players with expiring contracts would go to free agency
2. CPU rosters would shrink to ~25 players
3. Roster replenishment would need to add ~28 players per team (32 teams × 28 = 896 individual operations!)
4. Each operation required multiple database queries, causing massive slowdown

## Solution

### 1. CPU Player Resignings (`lib/offseason/cpu-resign.ts`)
**NEW FILE** - Implements intelligent CPU contract management:

**Resign Logic:**
- **Must resign**: Overall >= 80 (star players)
- **Should resign**: Overall >= 70 and age < 32 (solid starters)
- **Maybe resign**: Overall >= 65 and age < 30 (depth, 60% chance)
- **Let walk**: Everyone else goes to free agency

**Cap Management:**
- Respects salary cap (stops at 95% unless star player)
- Generates fair contracts based on overall/position/age

**Performance:**
- Batch fetches all expiring contracts
- Processes in-memory
- Updates contracts efficiently

### 2. Contract Processing Flow Fix

**Before:**
```
Week 22 (Super Bowl) -> Week 23
  ❌ All expiring contracts processed immediately → all players to FA
  ❌ CPU teams have no chance to resign
  ❌ CPU rosters shrink to ~25 players
```

**After:**
```
Week 22 (Super Bowl) -> Week 23
  ✅ Contracts NOT processed yet
  
Week 23 -> Week 24
  ✅ CPU teams resign their good players FIRST
  ✅ THEN process remaining expiring contracts → unsigned players to FA
  ✅ CPU rosters stay at ~48-50 players
```

**Changed Files:**
- `app/api/offseason/advance/route.ts` - Removed premature contract processing
- `app/api/simulate-advance/route.ts` - Added CPU resign before contract processing

### 3. Roster Replenishment Optimization (`lib/utils/roster-replenisher.ts`)

**Before:**
- Queried database for each position needed (896 queries for 32 teams × 28 players)
- Queried database for each player's stats
- Individual inserts for assignments and contracts

**After:**
- Fetch ALL free agents once (1 query)
- Fetch ALL assignments once (1 query)
- Process selections in-memory
- Batch insert all assignments (1 query)
- Batch insert all contracts (1 query)
- Batch delete from free agent availability (2 queries max)

**Performance Improvement:** ~900 queries → ~6 queries

### 4. Free Agency Bid Resolution Optimization (`lib/free-agency/cpu-bidding.ts`)

**Before:**
- Individual inserts for each player signing
- Individual contract creations
- Individual transaction logs

**After:**
- Batch insert all assignments
- Batch insert all contracts
- Batch delete from FA availability
- Batch insert all transactions
- Added detailed timing logs

**Performance Improvement:** ~4 queries per player → 4 batch queries total

### 5. Timeout Increases
- `app/api/free-agency/advance-stage/route.ts`: `maxDuration = 60` seconds
- `app/api/offseason/advance-to-season/route.ts`: `maxDuration = 60` seconds

## Expected Results

### CPU Roster Sizes After Each Phase:
- **After Week 23 (Resignings)**: ~40-45 players (resigned their core)
- **After Week 24 (Free Agency)**: ~45-48 players (signed a few FAs)
- **After Week 25 (Draft)**: ~52-53 players (drafted 7 rookies)
- **After Roster Replenishment**: 53 players (added 0-3 to fill gaps)

### Performance:
- **Week 23 -> 24**: ~2-5 seconds (CPU resigns + contract processing)
- **Week 24 Stages**: ~1-2 seconds per stage (reduced bids)
- **Week 24 Finalization**: ~1-3 seconds (batch operations)
- **Week 25 -> Preseason**: ~3-5 seconds (roster replenishment minimal)
- **Preseason -> Week 1**: <1 second (just update phase/week)

**Total offseason advancement**: ~10-20 seconds (down from 60+ seconds)

## Testing Recommendations
1. Start a new season to test the full flow
2. Monitor console logs for timing data
3. Verify CPU team roster sizes after each phase
4. Check that good players are being resigned by CPU teams
5. Verify roster replenishment only adds a few players per team



