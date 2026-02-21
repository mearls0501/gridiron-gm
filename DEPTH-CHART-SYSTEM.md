# Depth Chart Auto-Generation System

## Overview

The depth chart system automatically generates and maintains depth charts for all teams in your league. Players are automatically ranked by their overall rating within each position, ensuring the best players start.

## Features

### ✅ Automatic Generation at Game Creation
- When you create a new game, depth charts are automatically generated for all 32 teams
- Players are ranked by overall rating within their position
- Best players are assigned to starting positions (slot 1)
- Backups are assigned in order of overall rating (slots 2, 3, etc.)

### ✅ Weekly Auto-Updates (Optional)
- When **"Auto Depth Chart"** is enabled in Game Settings, depth charts are automatically updated after each week simulation
- This ensures injured players are replaced and better-performing players move up
- Updates happen automatically - no user action required

### ✅ Manual Regeneration
- Click the **"Auto-Generate"** button on the depth chart page to manually regenerate at any time
- Useful after trades, signings, or if you want to reset to rating-based rankings
- Only affects the selected team

### ✅ Manual Adjustments
- You can still manually adjust player order using the up/down arrows
- Manual adjustments are preserved until the next auto-generation
- Mix of automation and manual control

## Position Slots

Each position has a specific number of depth chart slots:

### Offense
- **QB**: 3 slots (starter + 2 backups)
- **RB**: 4 slots
- **WR**: 6 slots
- **TE**: 3 slots
- **OT**: 4 slots (Offensive Tackle)
- **OG**: 4 slots (Offensive Guard)
- **C**: 2 slots (Center)

### Defense
- **DE**: 4 slots (Defensive End)
- **DT**: 4 slots (Defensive Tackle)
- **LB**: 6 slots (Linebacker)
- **CB**: 5 slots (Cornerback)
- **S**: 4 slots (Safety)

### Special Teams
- **K**: 1 slot (Kicker)
- **P**: 1 slot (Punter)

## How It Works

### Ranking Logic
1. All players on a team's roster are fetched
2. Players are grouped by position
3. Within each position, players are sorted by **overall rating** (highest first)
4. Top N players are assigned to depth chart slots (where N = number of slots for that position)
5. Slot 1 = starter, Slot 2 = first backup, etc.

### Database Structure
Depth charts are stored in the `depth_chart_slots` table with the following key fields:
- `team_id`: Which team this slot belongs to
- `season_id`: Which season (allows historical depth charts)
- `position`: Position code (QB, RB, etc.)
- `slot`: Depth position (1 = starter, 2 = backup, etc.)
- `player_id`: Which player is in this slot
- `save_game_id`: Which save game (ensures isolation between different games)

## API Endpoints

### Update Depth Chart
**POST** `/api/depth-chart/update`

**Body:**
```json
{
  "season": 2025,
  "saveGameId": "uuid-here",
  "teamId": "uuid-here" // Optional - if omitted, updates all teams
}
```

**Response:**
```json
{
  "success": true,
  "teamsUpdated": 32,
  "totalSlots": 1280,
  "errors": []
}
```

## Integration Points

### 1. Game Creation
File: `app/components/GameSetupWizard.tsx`

When a new game is created, depth charts are automatically generated for all teams after the schedule is created.

### 2. Weekly Simulation
File: `app/api/simulate-week/route.ts`

After each week simulation, if auto depth chart is enabled in game settings, depth charts are automatically updated for all teams.

### 3. Manual Regeneration
File: `app/teams/depth-chart/page.tsx`

Users can click the "Auto-Generate" button to manually regenerate the depth chart for the currently selected team.

## Game Settings

The depth chart behavior is controlled by the `depth_chart_management` setting in the `game_settings` table:

- **"auto"**: Depth charts are automatically updated weekly after simulation
- **"manual"**: Depth charts are only updated when the user clicks "Auto-Generate" or manually adjusts

You can change this setting in:
- Game Settings page
- During game creation wizard

## Database Migration

Run the migration to add `save_game_id` support to depth charts:

```bash
# Migration file: supabase/migrations/add_save_game_id_to_depth_chart.sql
```

This ensures depth charts are properly isolated between different save games.

## Usage Examples

### Auto-Generate for Current Team
```typescript
const response = await fetch('/api/depth-chart/update', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    season: 2025,
    saveGameId: 'abc-123',
    teamId: 'team-456',
  }),
});
```

### Update All Teams
```typescript
const response = await fetch('/api/depth-chart/update', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    season: 2025,
    saveGameId: 'abc-123',
    // teamId omitted = all teams
  }),
});
```

### Using the Utility Directly
```typescript
import { updateTeamDepthChart, updateAllDepthCharts } from '@/lib/utils/depth-chart-manager';

// Update single team
const result = await updateTeamDepthChart(teamId, seasonId, saveGameId);

// Update all teams
const result = await updateAllDepthCharts(season, saveGameId);
```

## Troubleshooting

### Depth Chart is Empty
- Make sure the team has players on the roster
- Check that `save_game_id` matches between roster and depth chart
- Try clicking "Auto-Generate" to regenerate

### Players Not Updating
- Check if "Auto Depth Chart" is enabled in game settings
- If manual mode, you need to click "Auto-Generate" to update
- Verify the migration has been run to add `save_game_id` column

### Wrong Players Starting
- Depth chart is based on **overall rating** only
- If you want different players, use manual adjustments with the arrows
- Consider if the player ratings are correct

## Future Enhancements

Potential future improvements:
- [ ] Position-specific rating calculations (not just overall)
- [ ] Injury awareness (auto-bump injured players down)
- [ ] Formation-specific depth charts (nickel, dime packages, etc.)
- [ ] User preferences for depth chart strategies
- [ ] Historical depth chart tracking
- [ ] Depth chart comparison between teams

## Files Modified/Created

### New Files
- `lib/utils/depth-chart-manager.ts` - Core depth chart logic
- `app/api/depth-chart/update/route.ts` - API endpoint
- `supabase/migrations/add_save_game_id_to_depth_chart.sql` - Database migration
- `DEPTH-CHART-SYSTEM.md` - This documentation

### Modified Files
- `app/components/GameSetupWizard.tsx` - Added initialization at game creation
- `app/api/simulate-week/route.ts` - Added weekly auto-update
- `app/teams/depth-chart/page.tsx` - Added auto-generate button and functionality

## Support

If you encounter issues with the depth chart system:
1. Check the browser console for errors
2. Verify the database migration has been run
3. Ensure your save game has a valid `season` record
4. Check that teams have players on their roster
5. Try manually regenerating the depth chart

---

**Last Updated**: November 2025
**Version**: 1.0.0



