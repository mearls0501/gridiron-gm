# Simulation System Documentation

## Overview

The simulation system provides realistic NFL game simulation with:
- **Realistic outcomes** based on team and player ratings
- **Complete game data** saved to the database
- **Performance-based ratings** calculated from game stats
- **Dynamic player development** where strong performance leads to rating improvements

## Architecture

### Core Components

1. **Simulation Engine** (`lib/simulation/engine.ts`)
   - Main orchestrator for game simulation
   - Loads teams and rosters
   - Simulates 120-140 plays per game
   - Generates final scores and player stats

2. **Team Strength Calculator** (`lib/simulation/team-strength.ts`)
   - Calculates overall team strength from player ratings
   - Weighted by position importance (QB 25%, O-line 15%, etc.)
   - Provides offensive/defensive/special teams ratings

3. **Outcome Generator** (`lib/simulation/outcome-generator.ts`)
   - Simulates individual plays (pass/run/punt/FG)
   - Uses NFL statistical averages as baselines
   - Calculates success probability based on team strength matchups
   - Generates realistic yardage, turnovers, and scores

4. **Player Performance Tracker** (`lib/simulation/player-performance.ts`)
   - Tracks detailed stats during game simulation
   - Records offensive, defensive, and special teams stats
   - Tracks snap counts and participation

5. **Rating Calculator** (`lib/simulation/rating-calculator.ts`)
   - Calculates performance ratings (0-100) from game stats
   - Position-specific formulas (QB, RB, WR, DL, LB, DB, K, P)
   - Based on real NFL statistical benchmarks

6. **Player Development** (`lib/simulation/player-development.ts`)
   - Updates player ratings based on season performance
   - Compares performance vs expected (based on current rating)
   - Respects potential rating caps
   - Aggregates season statistics

## Database Schema

### Tables

1. **games** (existing)
   - Stores game results (scores, played status)
   - Links to teams via home_team_id and away_team_id

2. **player_game_stats** (new)
   - Individual game statistics for each player
   - Offensive, defensive, and special teams stats
   - Performance rating calculated per game
   - Links to players, games, and teams

3. **player_season_stats** (new)
   - Aggregated season statistics
   - Sums of all game stats for a season
   - Games played/started tracking
   - Average performance rating

4. **team_game_stats** (new)
   - Team-level box score data (points, yards, turnovers, TOP)
   - Drives standings logic and advanced reporting

5. **team_season_stats** (new)
   - Win/loss/tie records, streaks, points for/against, playoff seeds per season

6. **seasons / season_weeks** (new)
   - Track league phase, current week, and processing status for each week

7. **transactions / player_contracts / salary_cap_ledger** (new)
   - Audit trail for roster moves, normalized contract snapshots, and cap adjustments

8. **draft_picks / draft_results** (new)
   - Persistent draft order, ownership, and selection history

9. **game_events** (new)
   - Play-by-play archive for generated simulations

## API Endpoints

### Simulate Single Game
```
POST /api/simulate-game
Body: { gameId: string, season?: number, week?: number }
```

Simulates a single game and:
- Updates game record with scores
- Saves player game stats
- Updates player ratings (asynchronously)

### Simulate Week
```
POST /api/simulate-week
Body: { season: number, week: number }
```

Simulates all unplayed games for a given week.

### Update Season Ratings
```
POST /api/update-season-ratings
Body: { season: number }
```

Aggregates season stats and updates player ratings based on performance.
Call this at the end of a season.

## Usage Examples

### Simulate a Game
```typescript
const response = await fetch('/api/simulate-game', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ gameId: 'game-uuid' })
});

const { success, result } = await response.json();
// result: { homeScore, awayScore, playerStatsCount }
```

### Simulate a Week
```typescript
const response = await fetch('/api/simulate-week', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ season: 2025, week: 1 })
});

const { success, simulated, total, results } = await response.json();
```

### End of Season Processing
```typescript
const response = await fetch('/api/update-season-ratings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ season: 2025 })
});

const { success, aggregation, ratings } = await response.json();
```

## How It Works

### Game Simulation Flow

1. **Load Teams**: Fetch teams with full rosters from database
2. **Calculate Strength**: Determine team strength from player ratings
3. **Simulate Plays**: Run 120-140 plays with realistic outcomes
4. **Track Stats**: Record player performance during each play
5. **Calculate Ratings**: Generate performance ratings from stats
6. **Save Results**: Store game scores and player stats
7. **Update Ratings**: Update player overall ratings based on performance

### Rating Progression

Player ratings improve/decline based on:
- **Performance vs Expected**: How well they played vs their current rating
- **Games Played**: More games = more reliable progression
- **Potential Cap**: Ratings can't exceed player's potential rating
- **Position-Specific**: Different formulas for QB, RB, WR, etc.

**Rating Change Examples:**
- Excellent performance (10+ above expected): +1.5 to +3 overall
- Good performance (5-10 above): +0.5 to +1.5 overall
- Average performance (-5 to +5): -0.5 to +0.5 overall
- Poor performance (-10 to -5): -1 to -1.5 overall
- Very poor (< -10): -1.5 to -3 overall

### Statistical Realism

The system uses NFL averages as baselines:
- 130 plays per game average
- 58% pass, 42% run
- 6.5 yards per pass attempt
- 4.3 yards per rush
- 21.5 points per game
- 1.5 turnovers per game
- 3 point home field advantage

## Setup

### 1. Run Database Migrations

Execute the migration SQL in Supabase:
```sql
-- Run: supabase/migrations/create_player_stats_tables.sql
```

### 2. Verify Tables

Check that these tables exist:
- `player_game_stats`
- `player_season_stats`

### 3. Test Simulation

```bash
# Simulate a single game
curl -X POST http://localhost:3000/api/simulate-game \
  -H "Content-Type: application/json" \
  -d '{"gameId": "your-game-id"}'
```

## Future Enhancements (Phase 5)

- **Injury System**: Random injuries affecting player availability
- **Weather Effects**: Impact of weather on game outcomes
- **Advanced Play Calling**: More sophisticated play selection
- **Team Chemistry**: Bonus for players who've played together
- **Momentum**: Hot/cold streaks affecting performance
- **Depth Chart Integration**: Use actual depth chart for snap distribution
- **Advanced Stats**: PFF-style grades, advanced metrics

## Notes

- Player ratings update asynchronously after games to avoid blocking
- Season stats should be aggregated periodically (weekly or end of season)
- Ratings are capped by potential - players can't exceed their potential rating
- Young players can improve faster, older players decline faster (future enhancement)

