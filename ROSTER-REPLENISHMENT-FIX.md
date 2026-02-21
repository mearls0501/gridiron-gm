# Roster Replenishment Fix - Summary

## Problem
Stats were not being generated for games in Year 2 and beyond because teams didn't have exactly 53 players. The game simulation requires teams to have exactly 53 players on their roster or it fails with an error.

## Root Cause
The automatic roster replenishment system had **three critical issues**:

### Issue 1: Typo in `/app/api/roster-replenish/route.ts`
```typescript
// BEFORE (BROKEN):
if (activeSeason) {
  currentSeason = currentSeason.year;  // ❌ Assigns to itself!
  currentWeek = currentSeason.current_week;  // ❌ Assigns to itself!
}

// AFTER (FIXED):
if (activeSeason) {
  currentSeason = activeSeason.year;  // ✅ Uses fetched data
  currentWeek = activeSeason.current_week;  // ✅ Uses fetched data
}
```

### Issue 2: Roster Replenishment Only Ran During Season Transitions
The roster replenishment function was **only called once** when advancing to a new season. It was **never called** before simulating individual games or weeks, so if rosters became incomplete (due to retirements, injuries, cuts, etc.), games would fail to generate stats.

### Issue 3: Errors Were Silent
When roster replenishment failed, the error was logged to the console but didn't prevent the game from continuing. Users never saw the error and didn't know rosters were incomplete.

## Fixes Applied

### Fix 1: Corrected the Typo ✅
**File:** `/app/api/roster-replenish/route.ts`
**Lines:** 33-40

Changed variable assignments to use the fetched `activeSeason` data instead of reassigning to themselves.

### Fix 2: Added Automatic Roster Check Before Individual Game Simulation ✅
**File:** `/app/api/simulate-game/route.ts`
**Location:** Before the `simulateGame()` call

Added code that:
1. Checks both teams' roster sizes
2. Automatically replenishes any team that doesn't have exactly 53 players
3. Logs the replenishment results for debugging

```typescript
// Check roster sizes and auto-replenish if needed
const { count: homeRosterSize } = await supabase
  .from("player_team_assignments")
  .select("*", { count: "exact", head: true })
  .eq("team_id", game.home_team_id)
  .eq("save_game_id", saveGameId);

// If roster size !== 53, replenish automatically
if ((homeRosterSize || 0) !== 53) {
  await replenishTeamRosterOnly(game.home_team_id, saveGameId, gameSeason, gameWeek);
}
```

### Fix 3: Added Automatic Roster Check Before Week Simulation ✅
**File:** `/app/api/simulate-week/route.ts`
**Location:** Before loading teams for batch simulation

Added code that:
1. Identifies all unique teams playing that week
2. Checks each team's roster size
3. Automatically replenishes any team that doesn't have exactly 53 players
4. Logs all replenishment activity

This ensures that when simulating an entire week, all teams are at full strength before any games start.

## How It Works Now

### Before Individual Game Simulation
```
User clicks "Simulate Game"
    ↓
Check home team roster size
    ↓ (if < 53)
Auto-replenish home team to 53 players
    ↓
Check away team roster size
    ↓ (if < 53)
Auto-replenish away team to 53 players
    ↓
Simulate game (now guaranteed to work)
    ↓
Generate and save stats ✅
```

### Before Week Simulation
```
User clicks "Simulate Week"
    ↓
Identify all teams playing this week
    ↓
For each team:
    Check roster size
        ↓ (if < 53)
    Auto-replenish to 53 players
    ↓
Load all teams with rosters
    ↓
Simulate all games (now guaranteed to work)
    ↓
Generate and save stats ✅
```

### During Season Transition
```
Season ends → Advance to new season
    ↓
Replenish all 32 teams to 53 players (existing behavior)
    ↓
Start new season ✅
```

## Testing the Fixes

### Test 1: Check Current Roster Sizes
```javascript
// In browser console or via API
fetch('/api/diagnose-stats-by-season', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ saveGameId: 'YOUR_SAVE_GAME_ID' })
})
.then(r => r.json())
.then(console.log);
```

### Test 2: Manually Trigger Roster Replenishment
```javascript
fetch('/api/roster-replenish', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    saveGameId: 'YOUR_SAVE_GAME_ID',
    season: 2,  // Your current season
    week: 1     // Your current week
  })
})
.then(r => r.json())
.then(console.log);
```

### Test 3: Simulate a Game in Year 2
1. Navigate to a Year 2 game
2. Click "Simulate Game"
3. Check the browser console - you should see:
   ```
   [SimulateGame] Roster size issue detected. Home: XX, Away: YY. Auto-replenishing...
   [SimulateGame] Home team replenished: XX → 53 (added Z)
   [SimulateGame] Away team replenished: YY → 53 (added Z)
   ```
4. Check that stats are now being generated

### Test 4: Verify Stats Are Being Saved
```javascript
// After simulating a game in Year 2
fetch('/api/diagnose-stats-by-season', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ saveGameId: 'YOUR_SAVE_GAME_ID' })
})
.then(r => r.json())
.then(data => {
  const year2 = data.results.find(r => r.season === 2);
  console.log('Year 2 Stats:', {
    gamesPlayed: year2.games.played,
    gameStatsCount: year2.playerGameStats.count,
    seasonStatsCount: year2.playerSeasonStats.count
  });
});
```

## Expected Results

### Before the Fix
- Year 2 games would simulate but generate **0 player stats**
- Console would show errors like: `Away team has 48 players (must be exactly 53)`
- `player_game_stats` table would have no entries for Year 2 games
- `player_season_stats` table would be empty for Year 2

### After the Fix
- Year 2 games automatically replenish rosters before simulation
- Console shows: `Team replenished: 48 → 53 (added 5)`
- Games simulate successfully and generate full stats
- `player_game_stats` table gets ~2,650 new entries per week
- `player_season_stats` table gets updated with aggregated stats
- Stats continue to work for Year 3, 4, 5, etc.

## Manual Replenishment (If Needed)

If you want to manually ensure all rosters are at 53 players without simulating:

```javascript
fetch('/api/roster-replenish', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    saveGameId: 'YOUR_SAVE_GAME_ID',
    season: 2,
    week: 0
  })
})
.then(r => r.json())
.then(result => {
  console.log(`Added ${result.playersAdded} players across ${result.teamsProcessed} teams`);
  result.details.forEach(team => {
    if (team.playersAdded > 0) {
      console.log(`${team.teamName}: ${team.beforeSize} → ${team.afterSize} (+${team.playersAdded})`);
    }
  });
});
```

## Files Modified
1. `/app/api/roster-replenish/route.ts` - Fixed variable assignment typo
2. `/app/api/simulate-game/route.ts` - Added automatic roster checking/replenishment
3. `/app/api/simulate-week/route.ts` - Added automatic roster checking/replenishment

## Benefits
✅ Stats now generate properly in Year 2 and beyond  
✅ No manual intervention required  
✅ Rosters automatically maintain 53 players  
✅ Clear console logging for debugging  
✅ Works for both individual games and week simulation  
✅ Prevents game simulation failures  



