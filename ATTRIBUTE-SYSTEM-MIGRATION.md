# 🔄 Migrating to the Attribute-Based Engine

## Overview

This guide walks you through migrating from the simple **overall-based** simulation to the **attribute-based** simulation engine.

---

## ✅ Prerequisites

Before migrating:

1. **Database Migration Complete**
   - Run: `supabase/migrations/ensure_players_table_columns.sql`
   - Verify: All 71 attribute columns exist in `players` table

2. **Seed Data Uploaded**
   - Use: `sample_players_seed.csv` as template
   - Ensure: All players have attribute values (or they'll default to 70)

3. **Calibration Test Passed**
   - Run: `npm run calibrate`
   - Verify: All stats show ✅ (within acceptable range)

---

## 🚀 Migration Steps

### Step 1: Enable for Testing (Single Game)

Test the new engine on a single game first:

```typescript
// app/api/simulate-game/route.ts
const result = await simulateGame(
  {
    homeTeamId,
    awayTeamId,
    gameId,
    season,
    week,
    useEnhancedAttributes: true,  // 👈 Enable for this game only
  },
  null,
  saveGameId
);
```

**Verify:**
- Game completes without errors
- Scores are realistic (10-40 points)
- Stats look reasonable (check box score)

---

### Step 2: Compare Old vs New

Run the same matchup with both engines:

```typescript
// Test game with old engine
const oldResult = await simulateGame({
  ...config,
  useEnhancedAttributes: false,
});

// Test game with new engine
const newResult = await simulateGame({
  ...config,
  useEnhancedAttributes: true,
});

console.log('Old Engine:', oldResult.homeScore, '-', oldResult.awayScore);
console.log('New Engine:', newResult.homeScore, '-', newResult.awayScore);
console.log('Old Stats:', oldResult.playerStats.filter(s => s.passing_yards > 0));
console.log('New Stats:', newResult.playerStats.filter(s => s.passing_yards > 0));
```

**Look For:**
- Similar score ranges (both should be realistic)
- Better player differentiation in new engine (elite WRs perform better)
- More situational realism (e.g., RZ plays, 3rd downs)

---

### Step 3: Run Full Week Simulation

Test a full week of games:

```typescript
// app/api/simulate-week/route.ts

// Add flag to all games in the week
for (const game of weekGames) {
  await simulateGame(
    {
      ...game,
      useEnhancedAttributes: true,  // 👈 Enable for all games
    },
    preloadedTeams,
    saveGameId
  );
}
```

**Verify:**
- All games complete successfully
- No teams with 0 yards or 100+ points
- League-wide stats are balanced

---

### Step 4: Enable Globally

Once testing is successful, enable for all simulations:

```typescript
// app/api/simulate-week/route.ts
// app/api/simulate-game/route.ts

const DEFAULT_USE_ATTRIBUTES = true;  // 👈 Global toggle

const config: SimulationConfig = {
  homeTeamId,
  awayTeamId,
  gameId,
  season,
  week,
  useEnhancedAttributes: DEFAULT_USE_ATTRIBUTES,
};
```

---

### Step 5: Monitor Production

After deploying, monitor for issues:

```sql
-- Check for unrealistic stat outliers
SELECT 
  g.id,
  g.home_team_id,
  g.away_team_id,
  g.home_score,
  g.away_score,
  (g.home_score + g.away_score) as total_points
FROM games g
WHERE g.season = 2025
  AND g.week = 1
  AND (g.home_score > 50 OR g.away_score > 50 OR (g.home_score + g.away_score) < 6)
ORDER BY total_points DESC;
```

```sql
-- Check for unrealistic player stats
SELECT 
  p.full_name,
  p.position,
  s.passing_yards,
  s.rushing_yards,
  s.receiving_yards
FROM player_game_stats s
JOIN players p ON p.id = s.player_id
WHERE s.season = 2025
  AND s.week = 1
  AND (
    s.passing_yards > 500 
    OR s.rushing_yards > 250 
    OR s.receiving_yards > 250
  );
```

**If you find outliers:** Adjust normalizers in `attribute-engine.ts` and re-run calibration

---

## 🔄 Rollback Plan

If issues arise, you can instantly rollback:

```typescript
const DEFAULT_USE_ATTRIBUTES = false;  // 👈 Disable new engine
```

The old system remains fully functional. No data migration needed.

---

## 🎯 Key Differences

### Old Engine
```typescript
// Simple strength differential
const offenseStrength = calculateTeamStrength(offenseTeam).offense;
const defenseStrength = calculateTeamStrength(defenseTeam).defense;
const differential = offenseStrength - defenseStrength;

// Basic probability
const successChance = 0.50 + (differential / 100);
```

### New Engine
```typescript
// Detailed attribute calculations
const qbAccuracy = calculateWeightedRating(qb, ATTRIBUTE_WEIGHTS.accuracy_short, true);
const separation = calculateSeparation(receiver, defender, 'man', situational);
const throwSuccess = Math.random() < calculateThrowAccuracy(qb, routeDistance, underPressure, situational);
const catchSuccess = Math.random() < calculateCatchProbability(receiver, defender, separation, throwSuccess);

// Multi-layered outcome
if (throwSuccess && catchSuccess) {
  const yac = calculateYardsAfterCatch(receiver, defenders, separation, routeDistance, situational);
  totalYards = routeDistance + yac;
}
```

**Result:**
- Old: Generic outcomes, limited variance
- New: Player-specific outcomes, situational awareness, controlled randomness

---

## 📊 Performance Impact

### Simulation Speed

| Engine | Speed | Relative |
|--------|-------|----------|
| **Old (Overall)** | ~150ms per game | Baseline |
| **New (Attributes)** | ~175ms per game | +17% slower |

**Why?** More calculations per play (weighted ratings, variance, etc.)

**Impact:** Minimal for single games, noticeable for full season sims

**Optimization:** If needed, reduce `totalPlays` from 65 to 55 (still realistic)

---

## 🧪 Testing Scenarios

### 1. Elite QB vs Poor Defense

```typescript
// Expected: High passing yards, high completion %, multiple TDs
qb.overall = 95;
qb.sac = 95; qb.mac = 95; qb.dac = 95;
qb.tup = 95; qb.dec = 95; qb.awr = 95;

defenseTeam.players.forEach(p => {
  if (p.position === 'CB' || p.position === 'S') {
    p.overall = 60;
    p.mcv = 60; p.zcv = 60; p.spd = 65;
  }
});

// Run game
const result = await simulateGame({ ...config, useEnhancedAttributes: true });

// Verify: 300+ pass yards, 70%+ completion, 3-4 TDs
```

### 2. Dominant RB vs Weak Run Defense

```typescript
rb.overall = 92;
rb.spd = 92; rb.agi = 90; rb.btk = 95;
rb.vsn = 88; rb.car = 90;

defenseTeam.players.forEach(p => {
  if (p.position === 'DT' || p.position === 'DE' || p.position === 'LB') {
    p.overall = 62;
    p.bsh = 62; p.str = 65; p.tak = 63;
  }
});

// Verify: 120+ rush yards, 5.0+ YPC, 1-2 TDs
```

### 3. Defensive Slugfest

```typescript
// Both teams: Elite defense, poor offense
bothTeams.forEach(team => {
  team.players.forEach(p => {
    if (['DE', 'DT', 'LB', 'CB', 'S'].includes(p.position)) {
      p.overall = 88;
      // Boost all defensive attributes
    } else {
      p.overall = 65;
      // Lower all offensive attributes
    }
  });
});

// Verify: 10-17 points, 200-250 total yards, 3+ sacks per team
```

### 4. Upset Game (70 OVR vs 90 OVR)

```typescript
// Run 50 games
let upsets = 0;
for (let i = 0; i < 50; i++) {
  const result = await simulateGame({
    homeTeamId: weakTeamId,    // 70 OVR
    awayTeamId: strongTeamId,  // 90 OVR
    useEnhancedAttributes: true,
  });
  
  if (result.homeScore > result.awayScore) {
    upsets++;
  }
}

console.log(`Upset rate: ${(upsets / 50 * 100).toFixed(1)}%`);
// Verify: 5-12% upset rate (with ±5% variance + upset factor)
```

---

## 🐛 Common Issues

### Issue: Completion % Too High (>70%)

**Diagnosis:**
```typescript
// In calculateThrowAccuracy()
console.log('Accuracy prob:', probability);

// In calculateCatchProbability()
console.log('Catch prob:', probability);
```

**Fix:**
```typescript
// Reduce accuracy scaling
let probability = (accuracyRating / 100) * 0.80;  // Was 0.85

// OR reduce catch scaling
let probability = (catchRating / 100) * 0.85;  // Was 0.90
```

---

### Issue: Too Many Sacks

**Diagnosis:**
```typescript
// In calculatePressureChance()
console.log('Pressure chance:', pressureChance);
console.log('Sack chance:', sackChance);
```

**Fix:**
```typescript
// Reduce pressure rate
let pressureChance = 0.30 + (differential / 300);  // Was 0.35 and /250

// OR reduce sack conversion
let sackChance = pressureChance * 0.15;  // Was 0.20
```

---

### Issue: Scores Too High

**Diagnosis:**
```typescript
// Log TD rate
console.log('TDs per game:', totalTDs / gamesPlayed);
```

**Fix:**
```typescript
// In calculateTouchdownProbability()
const goalLineDefense = 0.70;  // Increase from 0.60

// OR reduce big play chances
const bigRunChance = 0.02;  // Reduce from 0.03
```

---

### Issue: No Variance (Same Results Every Time)

**Diagnosis:**
```typescript
// Check variance is being applied
console.log('Rating with variance:', applyRatingVariance(85, 0.05));
// Should be different each call: 80.7, 88.2, 84.3, etc.
```

**Fix:**
```typescript
// Ensure applyVariance=true in all calculateWeightedRating() calls
const rating = calculateWeightedRating(player, weights, true);  // 👈 Must be true
```

---

## 📚 Additional Resources

- **Full Documentation:** `ATTRIBUTE-ENGINE-GUIDE.md`
- **Normalizer Reference:** `NORMALIZERS-REFERENCE.md`
- **Attribute Weights:** `lib/simulation/attribute-engine.ts`
- **Play Simulation:** `lib/simulation/enhanced-outcome-generator.ts`
- **Calibration Test:** `scripts/run-calibration.ts`

---

## ✅ Migration Checklist

- [ ] Database migration applied
- [ ] Seed data uploaded with all 71 attributes
- [ ] Calibration test run and passed
- [ ] Single game test successful
- [ ] Full week test successful
- [ ] Outliers checked in production
- [ ] Variance verified (different results each game)
- [ ] Upset scenarios tested
- [ ] Documentation reviewed
- [ ] Rollback plan ready

---

**Once all boxes are checked, you're ready to deploy! 🎉**



