# Scouting System Documentation

## Overview

The scouting system adds depth and strategy to the draft process by requiring teams to invest resources in evaluating prospects. Unlike simple rating displays, this system hides true ratings and reveals them gradually through scouting activities.

## Key Features

### 1. **Hidden Information**
- True overall and potential ratings are hidden until scouted
- Traits (speed, strength, awareness, etc.) are only revealed through scouting
- Character concerns and injury risks are hidden until specific scouting methods are used

### 2. **Scouting Staff**
Each team has a scouting department with:
- **Director of Player Personnel** (1): Highest accuracy, manages operations
- **National Scouts** (1-2): Good accuracy across all regions
- **Regional Scouts** (3-5): High accuracy in their assigned region, lower outside
- **Position Scouts** (0-3): Specialized accuracy for specific positions

### 3. **Scouting Methods**

| Method | Cost | Time | Reveals |
|--------|------|------|---------|
| Initial Scouting | 1 pt | 1 day | Basic overall range, position fit |
| Game Tape | 3 pts | 7 days | Detailed traits, consistency, position skills |
| Combine | 5 pts | 1 day | Physical measurables, athleticism |
| Pro Day | 6 pts | 1 day | Position-specific drills, scheme fit |
| Private Workout | 12 pts | 3 days | Highest accuracy, all traits, character |
| Medical | 4 pts | 5 days | Injury history, durability concerns |
| Character Check | 3 pts | 3 days | Work ethic, leadership, coachability |

### 4. **Accuracy System**

Scouting accuracy is calculated based on:
- Base staff accuracy (60-90)
- Regional bonus (+15 if scout matches prospect region)
- Position specialty bonus (+12 if position scout matches)
- Experience bonus (up to +10)
- Method bonus (varies by method)
- Random variance (±15 points)

**Accuracy Levels:**
- **90-100%**: Exact rating visible
- **80-89%**: Rating ±2 range
- **70-79%**: Rating ±5 range
- **60-69%**: Rating ±8 range
- **<60%**: Rating ±12+ range (very inaccurate)

### 5. **Scouting Resources**

- **Scouting Points**: Start with 200, regenerate 15 per week
- **Scouting Budget**: $5M default, used for staff salaries and travel
- Points are spent on scouting activities
- Budget can be increased for more points

## Database Schema

### Tables Created

1. **scouting_staff**: Staff members with roles, accuracy, experience
2. **scouting_reports**: Individual reports on prospects with ratings, traits, notes
3. **team_scouting_resources**: Points and budget tracking per team/season
4. **scouting_events**: Combine, pro days, and other events
5. **scouting_priorities**: Team-specific prospect watchlists

## API Endpoints

### Initialize Scouting
```
POST /api/scouting/initialize
Body: { teamId, season }
```
Creates scouting staff and resources for a team.

### Scout a Prospect
```
POST /api/scout-prospect
Body: { teamId, prospectId, method }
```
Performs scouting on a prospect using the specified method.

### Get Scouting Reports
```
GET /api/scouting/reports?teamId={id}&prospectId={id}&season={year}
```
Retrieves scouting reports for a team.

### Get Scouting Staff
```
GET /api/scouting/staff?teamId={id}
```
Retrieves all scouting staff for a team.

### Get Scouting Resources
```
GET /api/scouting/resources?teamId={id}&season={year}
```
Gets current scouting points and budget.

### Set Scouting Priority
```
POST /api/scouting/priorities
Body: { teamId, prospectId, priorityLevel }
```
Sets a prospect's priority level (high, medium, low, ignore).

## Usage

### 1. Initialize Scouting

When first accessing the scouting dashboard, the system will prompt you to initialize scouting for your team. This creates:
- Scouting staff (director, national scouts, regional scouts, position scouts)
- Initial scouting resources (200 points, $5M budget)

### 2. Scout Prospects

1. Navigate to Draft → Scouting Dashboard
2. Browse prospects (filter by scouted/unscouted)
3. Click "Scout" on a prospect
4. Select a scouting method
5. Confirm to spend points and generate report

### 3. View Reports

- Reports show estimated ratings with confidence levels
- Traits are revealed based on scouting method
- Character assessments and injury risks appear when relevant methods are used
- Scout notes provide narrative context

### 4. Strategic Decisions

**Early Scouting (Lower Accuracy)**
- Scout many prospects shallowly
- Identify sleepers early
- Plan draft strategy

**Late Scouting (Higher Accuracy)**
- Focus on top targets
- Confirm ratings before draft
- Reduce risk of busts

**Regional Focus**
- Use regional scouts efficiently
- Scout prospects from scout's region for bonus accuracy

**Position Focus**
- Use position scouts for critical positions
- Get better trait evaluation for specific roles

## Gameplay Impact

### Risk/Reward
- Spending more points = better accuracy
- Private workouts are expensive but most accurate
- Early scouting is cheaper but less accurate

### Discovery Moments
- Finding sleepers (low initial rating, high potential)
- Identifying busts (high initial rating, low potential)
- Character concerns revealed through character checks
- Injury risks discovered through medical evaluations

### Strategic Depth
- Budget management (scouting vs. other expenses)
- Staff hiring (better scouts = better picks)
- Scouting philosophy (quantity vs. quality)
- Regional strategy (focus on certain regions)

## Future Enhancements

### Phase 2 (Planned)
- Scouting events (combine, pro days) with automatic attendance
- Scouting timeline integration with season calendar
- Advanced analytics and scouting history
- Staff development and hiring system

### Phase 3 (Future)
- Scouting accuracy tracking over time
- Scout personality affecting report tone
- Regional rivalries and narrative elements
- Advanced comparison tools

## Technical Details

### Scouting Engine
Located in `lib/scouting/engine.ts`:
- `calculateScoutingAccuracy()`: Computes accuracy based on staff, method, and factors
- `generateScoutingReport()`: Creates report with estimated ratings
- `selectBestScout()`: Chooses optimal scout for a prospect
- `getProspectRegion()`: Determines region from college

### Staff Generator
Located in `lib/scouting/staff-generator.ts`:
- `generateScoutingStaff()`: Creates staff for a team
- `getDefaultScoutingResources()`: Returns default resource values

### Components
- `ScoutingDashboard`: Main scouting interface
- `ScoutingReportView`: Detailed report viewer

## Migration

Run the migration to create all scouting tables:
```sql
-- Located in: supabase/migrations/create_scouting_system.sql
```

This creates all necessary tables with proper indexes, constraints, and RLS policies.

## Notes

- Scouting is team-specific (each team has their own reports)
- Reports can be updated by scouting the same prospect again with a different method
- Scouting points regenerate weekly automatically
- Staff accuracy affects all scouting operations
- Regional scouts are most efficient in their assigned region

