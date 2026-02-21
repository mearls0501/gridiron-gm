# Stats Not Saving Properly After Year 1 - Troubleshooting Guide

## Problem Description

Player statistics are not being generated or saved properly once you exit year 1 and move into year 2.

## How Stats Work in the System

The system uses a three-tier stats model:

1. **player_game_stats** - Individual game performance (e.g., Week 1 vs Team X)
2. **player_season_stats** - Aggregated season totals (e.g., All of Season 2024)
3. **player_lifetime_stats** - Career totals across all seasons

### Stats Flow During a Season

```
Game Simulated → player_game_stats created
                 ↓
After Each Game → aggregateSeasonStats() called (async)
                 ↓
               player_season_stats updated/created
```

### Stats Flow During Season Transition

```
End of Season (Offseason) → aggregateSeasonStats() (final)
                          → aggregateLifetimeStats()
                          → archiveGameStats() (deletes old game stats)
                          ↓
New Season Created       → New games with season = newYear
                          → Stats start fresh
```

## Common Issues and Fixes

### Issue 1: Games Created with Wrong Season Number

**Symptoms:**
- Year 2 games show up but have `season` field set to 1 instead of 2
- Game stats are created but with wrong season number

**Diagnosis:**
```bash
# Check the season field on games
SELECT season, COUNT(*) FROM games 
WHERE save_game_id = 'YOUR_SAVE_GAME_ID' 
GROUP BY season ORDER BY season;
```

**Fix:**
Use the API endpoint:
```javascript
POST /api/diagnose-stats-by-season
Body: { "saveGameId": "YOUR_SAVE_GAME_ID" }
```

This will show you the season distribution of games and stats.

### Issue 2: Stats Not Being Aggregated

**Symptoms:**
- player_game_stats exist for year 2
- player_season_stats are empty for year 2

**Diagnosis:**
```javascript
// Check if aggregation is being triggered
// Look in browser console or server logs for:
// "[AggregateStats] Starting aggregation for season X"
```

**Fix:**
Manually trigger aggregation:
```javascript
POST /api/aggregate-season-stats
Body: { "season": 2, "saveGameId": "YOUR_SAVE_GAME_ID" }
```

Or use the comprehensive fix endpoint:
```javascript
POST /api/fix-season-stats
Body: { 
  "season": 2, 
  "saveGameId": "YOUR_SAVE_GAME_ID",
  "force": true  // Set to true to regenerate even if stats exist
}
```

### Issue 3: Unique Constraint Violations

**Symptoms:**
- Error messages about "duplicate key value violates unique constraint"
- Stats appear to save but then disappear

**Root Cause:**
The `player_season_stats` table has a unique constraint:
```sql
COALESCE(save_game_id, '00000000-0000-0000-0000-000000000000'),
player_id,
season
```

This ensures each player can only have ONE set of stats per season per save game.

**Fix:**
This is usually not an issue unless there's stale data. Clean up:
```javascript
// Delete and regenerate
POST /api/fix-season-stats
Body: { 
  "season": 2, 
  "saveGameId": "YOUR_SAVE_GAME_ID",
  "force": true
}
```

### Issue 4: Stats Getting Deleted During Transition

**Symptoms:**
- Year 1 stats disappear when moving to year 2
- All stats are missing after offseason

**Root Cause:**
The `archiveGameStats()` function deletes game-level stats after aggregation, but it should NOT delete season stats.

**Diagnosis:**
Check if season stats exist for year 1:
```javascript
POST /api/diagnose-stats-by-season
Body: { "saveGameId": "YOUR_SAVE_GAME_ID" }
```

**Fix:**
Season stats should persist. If they're missing, re-aggregate from game stats (if game stats still exist), or the game stats have been archived and you'll need to restore from a backup.

## Diagnostic Workflow

### Step 1: Run the Diagnostic Tool

```javascript
POST /api/diagnose-stats-by-season
Body: { "saveGameId": "YOUR_SAVE_GAME_ID" }
```

This will show you:
- How many seasons exist
- How many games per season (total and played)
- How many game stats per season
- How many season stats per season
- Week distribution of game stats

### Step 2: Identify the Issue

Look at the response:

**Normal Year 2:**
```json
{
  "season": 2,
  "games": { "total": 272, "played": 5 },
  "playerGameStats": { "count": 2650 },
  "playerSeasonStats": { "count": 1696 }
}
```

**Issue - No Game Stats:**
```json
{
  "season": 2,
  "games": { "total": 272, "played": 5 },
  "playerGameStats": { "count": 0 },
  "playerSeasonStats": { "count": 0 }
}
```
→ Games are not generating stats. Check roster sizes (need 53 players per team).

**Issue - Game Stats but No Season Stats:**
```json
{
  "season": 2,
  "games": { "total": 272, "played": 5 },
  "playerGameStats": { "count": 2650 },
  "playerSeasonStats": { "count": 0 }
}
```
→ Aggregation not running. Use `/api/aggregate-season-stats`.

### Step 3: Apply the Fix

Based on the issue identified, use the appropriate API endpoint:

1. **Re-aggregate season stats:**
   ```javascript
   POST /api/aggregate-season-stats
   Body: { "season": 2, "saveGameId": "YOUR_SAVE_GAME_ID" }
   ```

2. **Comprehensive fix (deletes and regenerates):**
   ```javascript
   POST /api/fix-season-stats
   Body: { 
     "season": 2, 
     "saveGameId": "YOUR_SAVE_GAME_ID",
     "force": true
   }
   ```

3. **Fix lifetime stats:**
   ```javascript
   POST /api/archive-season-stats
   Body: { "season": 2, "saveGameId": "YOUR_SAVE_GAME_ID" }
   ```

## Prevention

To prevent stats issues in future seasons:

1. **Ensure `saveGameId` is always provided** when simulating games
2. **Check logs after game simulation** for aggregation errors
3. **Run diagnostics at the end of each season** to verify stats
4. **Don't manually delete from stats tables** - use the provided endpoints

## Database Schema Reference

### player_game_stats
- Primary Key: `id`
- Unique: `(player_id, game_id)`
- Links: `player_id`, `game_id`, `team_id`, `save_game_id`
- Season: `season` INTEGER, `week` INTEGER

### player_season_stats
- Primary Key: `id`
- Unique: `COALESCE(save_game_id, sentinel), player_id, season`
- Links: `player_id`, `team_id`, `season_id`, `save_game_id`
- Season: `season` INTEGER

### player_lifetime_stats
- Primary Key: `id`
- Unique: `(player_id, save_game_id)`
- Links: `player_id`, `save_game_id`
- Contains: Career totals across all seasons

## Code References

- Game simulation: `/app/api/simulate-game/route.ts`
- Stats aggregation: `/lib/simulation/player-development.ts`
- Season transition: `/app/api/offseason/advance-to-season/route.ts`
- Diagnostics: `/app/api/diagnose-stats-by-season/route.ts`
- Fix tool: `/app/api/fix-season-stats/route.ts`



