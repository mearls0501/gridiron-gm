# Game Progression System

This document describes the comprehensive game progression system implemented in Gridiron GM, including task management, automation settings, and phase-by-phase requirements.

## Overview

The game progression system guides players through different phases of a football season:
1. **Preseason** - Prepare for the upcoming season
2. **Regular Season** - Play games and manage your team weekly
3. **Playoffs** - Compete for the championship
4. **Offseason** - Draft, sign players, and prepare for next season

Each phase has specific tasks that must be completed (or automated) before advancing to the next phase.

## Database Schema

### Tables

#### `game_settings`
Stores automation preferences for each save game.

- `save_game_id` (FK) - Links to the save game
- `injury_management` - 'auto' or 'manual'
- `depth_chart_management` - 'auto' or 'manual'
- `scouting_management` - 'auto' or 'manual'
- `contract_management` - 'auto' or 'manual'
- `roster_management` - 'auto' or 'manual'

#### `phase_progress`
Tracks task completion for each phase.

- `save_game_id` (FK) - Links to the save game
- `season` - The season year
- `phase` - 'preseason', 'regular_season', 'playoffs', or 'offseason'
- `offseason_week` - 0, 1, or 2 (only for offseason phase)
- `tasks` (JSONB) - Array of task objects
- `required_tasks_completed` - Boolean flag
- `can_advance` - Boolean flag

#### `roster_validation`
Tracks teams that need to cut players to meet roster limits.

- `save_game_id` (FK) - Links to the save game
- `team_id` (FK) - Links to the team
- `season` - The season year
- `current_roster_size` - Current number of players
- `max_roster_size` - Maximum allowed (53)
- `is_valid` - Boolean flag
- `must_cut_count` - Number of players to cut

## Phase-by-Phase Guide

### Preseason (Week 0)

**Objective:** Prepare your team and the league for the upcoming season.

**Required Tasks:**
1. **Hire Scouting Staff** - Hire 4 scouts (one of each archetype)
2. **Staff CPU Teams** - Automatically hire scouts for all CPU teams
3. **Assign Scout Priorities** - Assign your scouts to priority levels (Primary → Quaternary)
4. **Generate Draft Class** - Create the draft class for the current season
5. **Validate Roster** - Ensure your team has 53 or fewer players
6. **Validate All Rosters** - Ensure all teams have valid rosters

**User Actions:**
- `/preseason` - Main preseason page with checklist
- `/scouts` - Hire scouts for your team
- Use "Staff CPU Teams" button to auto-hire for CPU teams
- Use "Generate Draft Class" button to create prospects
- Use "Manage Roster" to cut players if over 53

**Advancement:**
- Once all required tasks are complete, advance to Regular Season Week 1

---

### Regular Season (Weeks 1-18)

**Objective:** Play games, manage your team, and compete for a playoff spot.

**Weekly Tasks (based on settings):**

**Manual Mode Tasks:**
1. **Manage Injuries** - Review injured players and make roster adjustments
2. **Update Depth Chart** - Adjust lineup based on performance and injuries
3. **Assign Scouting** - Scout draft prospects for the upcoming draft

**Auto Mode:**
- If tasks are set to AUTO, the CPU handles them automatically
- No user action required

**User Actions:**
- `/regular-season` - View weekly tasks and settings
- `/teams/roster` - Manage injuries and roster
- `/teams/depth-chart` - Update depth chart
- `/draft` - Scout draft prospects
- Simulate games via home page or league schedule

**Advancement:**
- After Week 18, advance to Playoffs or Offseason (depending on playoff qualification)

---

### Playoffs (Weeks 19-22)

**Objective:** Compete for the championship.

**Required Tasks:**
- None - playoffs are fully simulated

**Weeks:**
- Week 19: Wild Card Round
- Week 20: Divisional Round
- Week 21: Conference Championships
- Week 22: Super Bowl

**User Actions:**
- `/league/playoffs` - View playoff bracket
- Simulate games to advance through rounds

**Advancement:**
- After Super Bowl, automatically advance to Offseason

---

### Offseason (3 Weeks)

**Objective:** Build your team for the next season through contracts, free agency, and the draft.

**The offseason is divided into 3 weeks:**

#### Week 0: Contracts & Staff
**Required Tasks:**
1. **Process Expiring Contracts** - Re-sign or release players with expiring contracts

**Optional Tasks:**
- Hire/Resign Coaches
- Hire/Resign Scouts

#### Week 1: Free Agency & Scouting
**Optional Tasks:**
- Complete Scouting (scout remaining draft prospects)
- Sign Free Agents (fill roster needs)

#### Week 2: Draft
**Required Tasks:**
1. **Complete NFL Draft** - Draft new players for your team

**User Actions:**
- `/offseason` - Main offseason page with week-by-week progression
- `/teams/contracts` - Manage expiring contracts
- `/teams/staff` - Hire coaches
- `/scouts` - Hire scouts
- `/free-agents` - Sign free agents
- `/draft` - Scout prospects and conduct draft

**Advancement:**
- After completing the draft, advance to next season's Preseason

---

## Automation Settings

### Purpose
Automation settings allow players to choose which tasks they want to manage personally and which tasks the CPU should handle automatically.

### Settings

**Injury Management**
- **Manual:** User must review injured players and make roster decisions
- **Auto:** CPU automatically manages injured players (IR, activations, etc.)

**Depth Chart Management**
- **Manual:** User must reorder depth chart based on performance/injuries
- **Auto:** CPU automatically adjusts depth chart based on ratings and health

**Scouting Management**
- **Manual:** User must manually assign scouts to prospects
- **Auto:** CPU automatically scouts prospects based on team needs

**Contract Management**
- **Manual:** User must decide on all contract extensions and re-signings
- **Auto:** CPU automatically handles contract decisions

**Roster Management**
- **Manual:** User must cut players when roster exceeds 53
- **Auto:** CPU automatically cuts lowest-rated players to meet limits

### Accessing Settings
- `/regular-season` - Click "Show Settings" button
- Settings are save game specific
- Changes take effect immediately

---

## Component Architecture

### UI Components

#### `PhaseProgressTracker`
The main task checklist component with OOTP-style design.

**Props:**
- `phase` - Current phase ('preseason', 'regular_season', 'playoffs', 'offseason')
- `season` - Current season year
- `tasks` - Array of task objects
- `offseasonWeek` - (Optional) 0-2 for offseason weeks
- `canAdvance` - Boolean indicating if all required tasks are complete
- `onAdvance` - Callback function when advance button is clicked
- `advancingTo` - Label for advance button
- `showAdvanceButton` - Whether to show the advance button

**Features:**
- Color-coded progress bar
- Required vs optional task distinction
- Links to relevant pages for each task
- Expandable/collapsible interface

#### `GameSettings`
Settings management component for automation preferences.

**Features:**
- Toggle between AUTO and MANUAL for each setting
- Save settings to database
- Visual feedback for saved state
- Explanatory descriptions for each setting

#### `RosterManagement`
Component for cutting players to meet roster limits.

**Features:**
- Shows current roster size vs max (53)
- Lists all players sorted by rating (lowest first)
- Cut player button with confirmation
- Real-time roster size updates

#### `PhaseNavigator`
Navigation component showing current phase and providing quick link.

**Features:**
- Color-coded by phase
- Shows current week and season
- Click to navigate to phase-specific page

---

## API Endpoints

### Game Settings

**GET `/api/game-settings`**
- Query params: `saveGameId`
- Returns: Game settings object or defaults

**POST `/api/game-settings`**
- Body: `{ saveGameId, settings }`
- Returns: Updated settings object

### Phase Progress

**GET `/api/phase-progress`**
- Query params: `saveGameId`, `season`, `phase`
- Returns: Phase progress object

**POST `/api/phase-progress`**
- Body: `{ saveGameId, season, phase, offseasonWeek, tasks }`
- Returns: Updated phase progress object

### Roster Validation

**GET `/api/roster-validation`**
- Query params: `saveGameId`, `season`, `teamId` (optional)
- Returns: Roster validation object or array of validations

**POST `/api/roster-validation`**
- Body: `{ saveGameId, season, teamId }`
- Returns: Roster validation object

**POST `/api/roster-cut`**
- Body: `{ playerId, teamId, saveGameId }`
- Returns: Success message

---

## Implementation Details

### Task Validation Logic

Tasks are validated based on:
1. **Database queries** - Check if actions have been completed (e.g., contracts processed, draft complete)
2. **Automation settings** - AUTO mode tasks are automatically marked as complete
3. **Required vs Optional** - Only required tasks block advancement

### Advancement Logic

Advancement is allowed when:
1. All required tasks are marked as complete
2. `can_advance` flag is true in phase_progress table
3. User clicks the advance button (or advancement is triggered programmatically)

### Auto-Task Completion

For AUTO mode:
1. Tasks are marked as complete when settings are loaded
2. No user action required
3. CPU logic runs in background (to be implemented)

---

## Future Enhancements

1. **CPU Task Execution** - Implement actual CPU logic for AUTO mode tasks
2. **Task History** - Track task completion history for analytics
3. **Custom Task Configuration** - Allow users to add custom tasks
4. **Task Reminders** - Notifications when tasks are due
5. **Phase Templates** - Pre-configured task sets for different play styles
6. **Undo/Redo** - Ability to undo task completions

---

## Development Notes

### Files Changed/Added

**New Components:**
- `app/components/PhaseProgressTracker.tsx`
- `app/components/GameSettings.tsx`
- `app/components/RosterManagement.tsx`
- `app/components/PhaseNavigator.tsx`

**Updated Pages:**
- `app/preseason/page.tsx` - Enhanced with PhaseProgressTracker
- `app/offseason/page.tsx` - Rewritten with week-by-week system
- `app/regular-season/page.tsx` - New page for weekly tasks

**New API Routes:**
- `app/api/game-settings/route.ts`
- `app/api/phase-progress/route.ts`
- `app/api/roster-validation/route.ts`
- `app/api/roster-cut/route.ts`

**New Migrations:**
- `supabase/migrations/create_game_settings.sql`

### Testing Checklist

- [ ] Preseason task completion flow
- [ ] Offseason week-by-week advancement
- [ ] Regular season AUTO vs MANUAL modes
- [ ] Roster cutting functionality
- [ ] Game settings persistence
- [ ] Phase navigation
- [ ] Draft class generation
- [ ] Contract processing validation

---

## User Guide

### Starting a New Game

1. Start the game and complete the setup wizard
2. Navigate to Preseason page (`/preseason`)
3. Complete all required tasks:
   - Hire 4 scouts (one of each archetype)
   - Click "Staff CPU Teams"
   - Assign scout priorities
   - Click "Generate Draft Class"
   - Cut players if roster > 53
4. When all tasks are complete, advance to Regular Season

### During Regular Season

1. Navigate to Regular Season page (`/regular-season`)
2. Click "Show Settings" to configure automation
3. For MANUAL mode:
   - Complete weekly tasks before advancing
   - Manage injuries, depth charts, and scouting
4. For AUTO mode:
   - Tasks are handled automatically
   - Focus on strategy and game simulation

### During Offseason

1. Navigate to Offseason page (`/offseason`)
2. Complete Week 0 tasks (contracts and staff)
3. Click "Advance to Week 2"
4. Complete Week 1 tasks (free agency and scouting)
5. Click "Advance to Week 3"
6. Complete Week 2 tasks (draft)
7. Click "Advance to [Year] Preseason"

---

## Troubleshooting

### Can't Advance from Preseason
- Check that all 6 required tasks are marked as complete
- Ensure draft class has been generated
- Verify all teams have valid rosters (53 or fewer)

### Tasks Not Showing as Complete
- Refresh the page to reload task status
- Check database for task completion flags
- Verify save game ID is correctly set

### Roster Cuts Not Working
- Ensure player is actually on the team
- Check player_team_assignments table for save game isolation
- Verify free_agent_availability table is accessible

---

## Support

For issues or questions, please refer to:
- This documentation
- Code comments in implementation files
- Database schema documentation
- API route implementations

