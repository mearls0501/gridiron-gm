# Depth Chart Troubleshooting Guide

## Error: "No players found for team"

This error means the depth chart generator can't find any players assigned to the team in your save game.

### Common Causes

1. **Existing Save Game** - Created before the full isolation system was implemented
2. **NULL save_game_id** - Player assignments exist but have NULL save_game_id
3. **Empty Roster** - Team genuinely has no players (rare)

### Quick Fix (Automated)

**Via Depth Chart Page:**
1. Go to Teams → Depth Chart
2. Select the problematic team
3. Click "Auto-Generate"
4. When prompted, click "Yes" to run diagnostics
5. If the issue is NULL save_game_id, click "Yes" to auto-fix
6. The system will migrate your players and regenerate the depth chart

### Manual Fix (API)

**Step 1: Diagnose the Issue**
```javascript
// In browser console:
const response = await fetch('/api/depth-chart/diagnose', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    teamId: 'your-team-id',
    saveGameId: 'your-save-game-id',
  }),
});
const result = await response.json();
console.log(result);
```

**Step 2: Check the Diagnosis**

Look for:
- `summary.hasAssignments` - Should be `true`
- `summary.assignmentCount` - Should be > 0 (ideally 53 for full roster)
- `summary.hasNullAssignments` - If `true`, you need to migrate

**Step 3: Fix NULL Assignments**
```javascript
// Only needed if hasNullAssignments is true
const fixResponse = await fetch('/api/depth-chart/fix-assignments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    saveGameId: 'your-save-game-id',
    // teamId: 'optional-team-id', // Omit to fix all teams
  }),
});
const fixResult = await fixResponse.json();
console.log(`Fixed ${fixResult.updated} assignments`);
```

**Step 4: Try Generating Again**
```javascript
const genResponse = await fetch('/api/depth-chart/update', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    season: 2025,
    saveGameId: 'your-save-game-id',
    teamId: 'your-team-id',
  }),
});
const genResult = await genResponse.json();
console.log(genResult);
```

### SQL Fix (Advanced)

If you have direct database access:

**Check for NULL save_game_id:**
```sql
SELECT COUNT(*) 
FROM player_team_assignments 
WHERE save_game_id IS NULL;
```

**Fix for specific save game:**
```sql
-- Replace 'your-save-game-id' with your actual save game ID
UPDATE player_team_assignments 
SET save_game_id = 'your-save-game-id'
WHERE save_game_id IS NULL;
```

### Prevention for New Games

✅ **Always create games through the Game Setup Wizard**
- This ensures all data is created with proper save_game_id
- Depth charts are auto-generated during setup

✅ **Run the migration**
- Make sure `add_save_game_id_to_depth_chart.sql` has been run
- This adds proper isolation to the depth_chart_slots table

✅ **Use the latest code**
- All recent roster operations include save_game_id
- Older saves may need migration

### Understanding the Diagnostics Output

```json
{
  "summary": {
    "hasTeam": true,                    // ✅ Team exists
    "hasSaveGame": true,                // ✅ Save game exists
    "hasAssignments": false,            // ❌ No assignments with correct save_game_id
    "assignmentCount": 0,               // Should be ~53 for full roster
    "hasNullAssignments": true,         // ✅ Found NULL assignments - can be fixed!
    "nullAssignmentCount": 53           // Number to migrate
  },
  "recommendation": "Found player assignments with NULL save_game_id. You need to migrate them..."
}
```

**What each field means:**
- `hasTeam`: Team exists in database ✅
- `hasSaveGame`: Save game exists ✅
- `hasAssignments`: Players found for this save game (what we need!)
- `assignmentCount`: How many players found
- `hasNullAssignments`: Players exist but with NULL save_game_id
- `nullAssignmentCount`: How many need migration

**Interpretation:**
- If `hasAssignments = true`: ✅ Everything is fine, depth chart should work
- If `hasNullAssignments = true` and `hasAssignments = false`: 🔧 Need to run fix
- If both are `false`: ❌ Team has no players - need roster replenishment

### Other Issues

**"Season not found"**
- Make sure season exists in `seasons` table
- Check that season has correct `save_game_id`
- Try using `currentSeason` from game store

**"Depth chart generated but empty"**
- Team might not have enough players at each position
- Check roster size (should be 53)
- Run roster replenishment if needed

**"Duplicate key error"**
- Depth chart already exists for this team/season
- This is normal - the system replaces it
- If persistent, check unique constraint in database

### Need More Help?

1. **Check Console Logs** - Look for detailed error messages
2. **Run Diagnostics** - Use the diagnose endpoint to see what's wrong
3. **Check Database** - Verify data in `player_team_assignments` table
4. **Create New Game** - Test with fresh game to isolate the issue

### API Endpoints

- **Diagnose**: `POST /api/depth-chart/diagnose`
- **Fix Assignments**: `POST /api/depth-chart/fix-assignments`
- **Update Depth Chart**: `POST /api/depth-chart/update`

---

**Pro Tip:** For existing save games created before the isolation system, run the fix-assignments endpoint once to migrate all teams at once (omit `teamId` parameter).



