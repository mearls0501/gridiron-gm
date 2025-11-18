# Schedule Generation Fix

## Problem
The schedule generator was only producing 269 games instead of the required 272 games for a full NFL season.

## Solution
Created a new, robust schedule generator that ensures exactly 272 games are generated following NFL scheduling rules.

### Key Features

1. **Exact Game Count**: Guarantees 272 total games (32 teams × 17 games ÷ 2)
2. **Division Games**: Each team plays division opponents twice (home & away) = 6 games
3. **17-Game Schedule**: Each team plays exactly 17 games
4. **Bye Weeks**: Each team gets 1 bye week (typically weeks 6-14)
5. **18-Week Season**: Games spread across 18 weeks to accommodate bye weeks

### Files Created/Modified

#### New Files:
- `lib/schedule-generator.ts` - Core schedule generation logic
- `app/api/generate-schedule/route.ts` - API endpoint to generate schedules
- `app/admin/generate-schedule/page.tsx` - UI for generating schedules
- `lib/test-schedule.ts` - Test script to verify schedule correctness

#### Modified Files:
- `app/components/Navigation.tsx` - Added "Generate Schedule" menu item

### How It Works

The schedule generator follows these steps:

1. **Validation**: Ensures exactly 32 teams are provided
2. **Division Organization**: Groups teams by conference and division
3. **Bye Week Assignment**: Assigns each team a bye week (weeks 6-14)
4. **Division Games**: Schedules all division games first (6 games per team)
5. **Non-Division Games**: Fills remaining games to reach 17 per team
6. **Verification**: Ensures all teams have exactly 17 games

### Algorithm Improvements

The new implementation uses:
- **Game Count Tracking**: Tracks exact number of games per team
- **Week Availability**: Uses Sets to efficiently check week availability
- **Smart Filling**: Prioritizes teams with fewer games when filling remaining slots
- **Bye Week Respect**: Respects bye weeks during initial scheduling
- **Flexible Fallback**: Can override bye weeks if needed to complete schedule

### Usage

#### Via API:
```bash
curl -X POST http://localhost:3000/api/generate-schedule \
  -H "Content-Type: application/json" \
  -d '{"season": 2025}'
```

#### Via UI:
1. Navigate to Admin → Generate Schedule
2. Enter the season year
3. Click "Generate Schedule"
4. Verify you see "272 games generated"

### Testing

Run the test script to verify schedule generation:
```bash
npx tsx lib/test-schedule.ts
```

The test will:
- Create 32 mock NFL teams
- Generate a complete schedule
- Verify:
  - Total games = 272 ✓
  - Each team has 17 games ✓
  - Division matchups are correct ✓
  - Display games per week distribution

### Database Schema Required

The schedule generator expects the following database structure:

**teams table:**
```sql
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT,
  division TEXT,  -- East, North, South, West
  conference TEXT  -- AFC, NFC
);
```

**games table:**
```sql
CREATE TABLE games (
  id SERIAL PRIMARY KEY,
  season INTEGER,
  week INTEGER,
  home_team_id TEXT REFERENCES teams(id),
  away_team_id TEXT REFERENCES teams(id),
  home_score INTEGER,
  away_score INTEGER,
  played BOOLEAN DEFAULT FALSE
);
```

### Why It Fixes the 269 Game Issue

The previous implementation likely had issues with:
1. Not tracking game counts accurately
2. Early termination when some teams still needed games
3. Conflicts in week scheduling causing games to be skipped
4. Not properly handling bye weeks

The new implementation:
1. Tracks games per team explicitly
2. Uses a filling algorithm that ensures all teams reach 17 games
3. Has multiple passes for scheduling with fallback strategies
4. Better handles bye week conflicts

### Verification

After running the schedule generator, verify:
```sql
-- Total games should be 272
SELECT COUNT(*) FROM games WHERE season = 2025;

-- Each team should have 17 games
SELECT 
  team_id,
  COUNT(*) as game_count
FROM (
  SELECT home_team_id as team_id FROM games WHERE season = 2025
  UNION ALL
  SELECT away_team_id as team_id FROM games WHERE season = 2025
) team_games
GROUP BY team_id
ORDER BY game_count;
```

All teams should show exactly 17 games.

