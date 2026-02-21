# Stats Not Saving in 2026+ - Root Cause and Fix

## Problem Summary

- **2025**: Stats work when simulating entire season (uses `/api/simulate-advance`)
- **2026+**: NO stats when simulating week-by-week (uses `/api/simulate-week-progress`)
- Rosters are full (53 players per team)
- Games simulate and save scores correctly
- But `player_game_stats` table shows 0 records for 2026 games

## Root Cause

The simulation IS generating stats internally, but `PlayerStatsTracker.getActivePlayerStats()` is filtering them ALL out because:

1. Players need `snaps_played > 0` OR any stat > 0 to be included
2. Something is preventing players from getting snaps or stats recorded

## Diagnostic Steps

### 1. Check Server Console Logs

When you simulate a 2026 week, check your terminal for:

```
[SimulateWeekProgress] WARNING: Game XXX simulated but generated 0 player stats.
```

If you see this, it confirms the simulation ran but generated no stats.

### 2. Run Debug Simulation

Use the debug endpoint to see exactly what's happening:

```javascript
// In browser console on any page
const saveGameId = localStorage.getItem('saveGameId');

// Get a 2026 game ID from your schedule
const gameId = 'PASTE_2026_GAME_ID_HERE';

fetch('/api/debug-simulation', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({ gameId, saveGameId })
}).then(r => r.json()).then(data => {
  console.log('DEBUG:', data);
  
  // Check these values:
  console.log('Players loaded:', data.rosters.home_size, data.rosters.away_size);
  console.log('Stats generated:', data.simulation_result.total_stats_generated);
  console.log('Sample player:', data.rosters.home_sample[0]);
});
```

### 3. Check Player Data Quality

The issue might be that players in 2026 have corrupted/missing data. Check:

```sql
-- Get a sample of players from a 2026 roster
SELECT p.id, p.full_name, p.position, p.overall, p.traits
FROM player_team_assignments pta
JOIN players p ON p.id = pta.player_id
WHERE pta.save_game_id = 'YOUR_SAVE_GAME_ID'
LIMIT 10;
```

**OR** check if players are actually draft prospects:

```sql
-- Check if "players" are actually in draft_prospects table
SELECT dp.id, dp.full_name, dp.position, dp.overall
FROM player_team_assignments pta
JOIN draft_prospects dp ON dp.id = pta.prospect_id
WHERE pta.save_game_id = 'YOUR_SAVE_GAME_ID'
AND pta.prospect_id IS NOT NULL
LIMIT 10;
```

## Likely Issues

### Issue 1: Players Are Prospects (Not in `players` Table)

**Symptom:** Players in 2026 are draft prospects who were drafted but not moved to the `players` table.

**Fix:** The `loadTeamWithRoster` function should handle both players and prospects:

```typescript
// In lib/simulation/engine.ts, line 89-111
const players = assignments
  .map((assignment: Record<string, unknown>) => {
    // If it's a player (seed player), use players data
    if (assignment.player_id && assignment.players) {
      return {
        ...(assignment.players as Record<string, unknown>),
        team_id: assignment.team_id,
        is_prospect: false,
      };
    }
    // If it's a prospect (drafted), use draft_prospects data
    if (assignment.prospect_id && assignment.draft_prospects) {
      return {
        ...(assignment.draft_prospects as Record<string, unknown>),
        team_id: assignment.team_id,
        is_prospect: true,
        is_rookie: true,
      };
    }
    return null;
  })
  .filter(Boolean) as Array<Record<string, unknown>>;
```

**Check:** Are prospects being loaded? Add logging:

```typescript
console.log(`[loadTeamWithRoster] Loaded ${assignments.length} assignments for team ${teamId}`);
console.log(`[loadTeamWithRoster] Players: ${players.length}, from players table: ${players.filter(p => !p.is_prospect).length}, from prospects: ${players.filter(p => p.is_prospect).length}`);
```

### Issue 2: Player Traits Missing or Invalid

**Symptom:** Players load but have no `traits` object, breaking team strength calculation.

**Fix:** Already handled in line 120-131 of `engine.ts`:

```typescript
const parsedPlayers: Player[] = (players || []).map(
  (p: Record<string, unknown>) => ({
    ...p,
    traits:
      typeof p.traits === "string"
        ? JSON.parse(p.traits)
        : (p.traits as { speed: number; strength: number; awareness: number }) || 
          { speed: 0, strength: 0, awareness: 0 },
  })
) as Player[];
```

**But** check if prospects have traits! Prospects might not have the `traits` column.

### Issue 3: Stats Tracker Not Recording Plays

**Symptom:** Simulation runs but `recordPlay` isn't called or isn't working.

**Debug:** Add logging to `PlayerStatsTracker`:

```typescript
// In lib/simulation/player-performance.ts
recordPlay(play: Play, offense: TeamWithRoster, defense: TeamWithRoster, isHomeTeam: boolean): void {
  console.log(`[StatsTracker] Recording play: ${play.playType}, yards: ${play.yards}`);
  
  // ... rest of method
}

getActivePlayerStats(): PlayerGameStat[] {
  const all = this.getAllStats();
  const filtered = all.filter(stats => {
    const hasSnaps = (stats.snaps_played || 0) > 0;
    const hasStats = /* ... */;
    return hasSnaps || hasStats;
  });
  
  console.log(`[StatsTracker] Total players: ${all.length}, Active: ${filtered.length}`);
  return filtered;
}
```

## Quick Fix: Disable Filtering Temporarily

To test if filtering is the issue, temporarily change `getActivePlayerStats`:

```typescript
// In lib/simulation/player-performance.ts line 360
getActivePlayerStats(): PlayerGameStat[] {
  // TEMPORARY: Return ALL stats to test
  return this.getAllStats();
  
  // Original filtering code commented out:
  // return this.getAllStats().filter(stats => {
  //   const hasSnaps = (stats.snaps_played || 0) > 0;
  //   ...
  // });
}
```

If stats suddenly appear, the issue is with snap counting or stat recording.

## Action Items

1. ✅ Check server console for warnings during 2026 week simulation
2. ⬜ Run `/api/debug-simulation` on a 2026 game
3. ⬜ Check if players are prospects vs regular players
4. ⬜ Verify player data quality (traits, etc.)
5. ⬜ Add logging to `PlayerStatsTracker` to see what's happening
6. ⬜ Test with filtering disabled

## Report Back

After checking the above, report:

1. What server console shows during 2026 simulation
2. Output from `/api/debug-simulation`
3. Are 2026 rosters mostly prospects or regular players?
4. Do the prospects have valid traits/data?

Then I can provide the exact fix!



