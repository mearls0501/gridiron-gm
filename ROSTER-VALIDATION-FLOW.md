# Roster Validation Flow - Two-Step Process

## Overview
When simulating games, the system now uses a **two-step roster validation process** with user confirmation before auto-fixing.

## How It Works

### Step 1: Validation Check ✋
When you click "Simulate Week" or "Simulate Next Week", the system:

1. **Checks all team rosters** before starting simulation
2. **Stops simulation** if any team has invalid rosters (≠ 53 players)
3. **Shows a detailed error modal** with:
   - Which teams have invalid rosters
   - How many players each team needs (add or cut)
   - Whether your team is affected (highlighted in red)
   - Two action buttons: **Auto-Fix** or **Fix Manually**

### Step 2: User Choice 🤔

You have two options:

#### Option A: Auto-Fix All Rosters 🤖
Click the **"🤖 Auto-Fix All Rosters"** button to:
- Automatically add minimum contract players to teams that need more
- Automatically cut the lowest-rated players from teams that are over 53
- Fix **all teams** (both CPU and user team) in one click
- Receive confirmation of how many players were added/cut
- Then you can click "Simulate" again to start

#### Option B: Fix Manually ✋
Click the **"✋ Fix Manually"** button to:
- Close the error modal
- Navigate to roster management yourself
- Manually adjust your roster (and optionally other teams)
- Return and click "Simulate" again when ready

## Example Flow

### Scenario: Your Team Has 49 Players, 2 CPU Teams Have 51 & 52

1. You click "Simulate Week"
2. ⚠️ Error modal appears:

```
⚠️ Roster Validation Failed

Your team (Dallas Cowboys) has 49 players (requires exactly 53). Need to add 4 more players.

2 CPU team(s) also have invalid rosters:
- 👤 Dallas Cowboys: 49 players (need 4 more)
- Green Bay Packers: 51 players (need 2 more)  
- New England Patriots: 52 players (need 1 more)

[🤖 Auto-Fix All Rosters]  [✋ Fix Manually]

💡 Auto-fix will add minimum contract players to teams that need more, 
or cut the lowest-rated players from teams that are over 53.
```

3. **If you click "Auto-Fix":**
   - System adds 7 total players (4 + 2 + 1)
   - Shows: "✅ Auto-fixed! Added 7 players to 3 teams. You can now simulate."
   - You click "Simulate Week" again → ✅ Simulation proceeds

4. **If you click "Fix Manually":**
   - Modal closes
   - You navigate to `/teams/my-team/roster`
   - You manually sign 4 free agents
   - You return and click "Simulate Week" again → ✅ Simulation proceeds

## Technical Details

### API Endpoints

#### `/api/simulate-week-progress` (POST)
- **Validates** all rosters before simulation
- **Returns error** if any rosters are invalid
- Error includes `invalidTeams` array with details
- Does **NOT** auto-fix automatically

#### `/api/roster-validate-and-fix` (POST)
Parameters:
- `saveGameId` (required)
- `season` (optional, defaults to active season)
- `week` (optional, defaults to 0)
- `autoFix` (boolean, default: false)

**When `autoFix=false` (validation only):**
- Returns validation results
- Lists which teams are invalid
- Does NOT make any changes

**When `autoFix=true`:**
- Calls `replenishAllRosters()` to fix all teams
- Returns number of players added
- Returns details for each team

### Frontend State Management

```typescript
const [rosterError, setRosterError] = useState<{
  message: string;
  invalidTeams: Array<{
    teamId: string;
    teamName: string;
    currentSize: number;
    needsPlayers: number; // Positive = need more, Negative = need to cut
    isUserTeam: boolean;
  }>;
} | null>(null);
```

### Error Handling Flow

```typescript
// In simulate-week-progress SSE handler
if (data.type === "error" && data.error === "ROSTER_INVALID") {
  setRosterError({
    message: data.message,
    invalidTeams: data.invalidTeams || [],
  });
  setError(null); // Clear generic error
}
```

## Visual Indicators

### User Team (Your Team)
- **Bold text** and **red color**
- **👤 icon** prefix
- Example: `👤 Dallas Cowboys: 49 players (need 4 more)`

### CPU Teams
- Regular text, gray color
- No icon prefix
- Example: `Green Bay Packers: 51 players (need 2 more)`

## Benefits of This Approach

✅ **User Control**: You choose when/how to fix rosters  
✅ **Transparency**: See exactly which teams have issues  
✅ **Flexibility**: Option for manual or automatic fixing  
✅ **Safety**: Simulation never starts with invalid rosters  
✅ **Convenience**: One-click auto-fix for quick resolution  
✅ **Education**: Learn what's happening instead of silent fixes  

## What Auto-Fix Does

### For Teams Needing More Players
1. Calls `replenishTeamRosterOnly()` for each team
2. Checks position distribution
3. Finds existing free agents or generates new ones
4. Signs players to minimum 1-year contracts ($500k)
5. Adds to `player_team_assignments` and `player_contracts_per_save_game`

### For Teams Over 53 Players
**Note:** Current implementation focuses on adding players. Cutting players would need to be implemented in `roster-validator.ts`. For now, if a team has > 53 players, the system will still block but won't auto-cut.

## Future Enhancements

Potential improvements:
1. **Auto-cut functionality**: Automatically release lowest-rated players when over 53
2. **Position-aware cuts**: Prioritize cutting backups over starters
3. **Dry-run preview**: Show what auto-fix will do before applying
4. **Manual roster management link**: Direct link to affected team's roster page
5. **Batch operations**: Fix all CPU teams but leave user team for manual fixing

## Testing

### Test Case 1: User Team Under 53
```javascript
// Set up: Give user team 50 players
// Expected: Error modal shows, auto-fix adds 3 players
```

### Test Case 2: CPU Teams Under 53
```javascript
// Set up: Give 5 CPU teams 48-52 players each
// Expected: Error modal shows all 5 teams, auto-fix replenishes all
```

### Test Case 3: Mixed Scenario
```javascript
// Set up: User team 49, 3 CPU teams 50-52
// Expected: Error modal highlights user team, auto-fix handles all 4
```

### Test Case 4: All Valid
```javascript
// Set up: All teams have exactly 53 players
// Expected: No error, simulation proceeds immediately
```

## Related Files

- `/app/api/simulate-week-progress/route.ts` - Validation check before simulation
- `/app/api/roster-validate-and-fix/route.ts` - Validation + auto-fix endpoint
- `/app/admin/sim/page.tsx` - Frontend UI with error modal
- `/lib/utils/roster-replenisher.ts` - Auto-replenishment logic
- `/lib/utils/roster-validator.ts` - Roster validation logic

## Migration Notes

**Before this change:**
- Roster validation would silently fail or block with cryptic errors
- No clear way to know which teams had issues
- No one-click fix option

**After this change:**
- Clear, detailed error messages
- User choice between manual and automatic fixing
- Transparent process with progress feedback



