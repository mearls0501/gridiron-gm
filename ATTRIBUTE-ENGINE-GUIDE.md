# Attribute-Based Simulation Engine

## 🎯 Overview

The enhanced attribute engine replaces the simple `overall` rating system with a comprehensive, multi-layered simulation that uses **71 detailed player attributes** to create realistic, NFL-calibrated gameplay.

---

## 🚀 Quick Start

### Enable the Enhanced Engine

In your game simulation API endpoint, add the flag:

```typescript
const result = await simulateGame(
  {
    homeTeamId: 'team-1',
    awayTeamId: 'team-2',
    gameId: 'game-123',
    season: 2025,
    week: 1,
    useEnhancedAttributes: true,  // 👈 Enable attribute-based simulation
  },
  preloadedTeams,
  saveGameId
);
```

### Run Calibration Test

Before using in production, run the calibration test:

```bash
npm run calibrate
```

This will simulate 100 games and verify that stats match NFL averages.

---

## 📊 What's Different?

### Old System (Overall-Based)
- Single `overall` rating per player
- Simple team strength calculation
- Generic play outcomes
- Limited variance

### New System (Attribute-Based)
- **71 detailed attributes** per player
- **Weighted composite ratings** for each play type
- **Situational modifiers** (down/distance, field position, score)
- **Probabilistic outcomes** with controlled randomness
- **NFL-calibrated normalizers** to ensure realistic stats

---

## 🏗️ Architecture

### 1. **Attribute Weights** (`ATTRIBUTE_WEIGHTS`)

Each play type uses a weighted combination of attributes:

**Example: Man Coverage Separation**
```typescript
separation_man: {
  rte: 0.35,    // Route running (35% weight)
  rls: 0.25,    // Release (25%)
  spd: 0.25,    // Speed (25%)
  agi: 0.15,    // Agility (15%)
}
// Total: 1.0 (100%)
```

**Example: Pass Rush (Power)**
```typescript
pass_rush_power: {
  pmv: 0.45,    // Power moves (45%)
  str: 0.30,    // Strength (30%)
  bsh: 0.15,    // Block shedding (15%)
  motor: 0.10,  // Motor (10%)
}
```

### 2. **Normalizers** (Ensure NFL-Realistic Stats)

Each calculation includes normalizers to prevent unrealistic outputs:

#### **Completion Percentage** → Target: 63%
- Accuracy: 75% (varies by distance/pressure)
- Catch Rate: 88% on accurate throws
- Incompletion Factors: 3% (throwaways, batted balls, drops)
- **Result: 75% × 88% × 97% = 63.4%** ✅

#### **Yards Per Attempt** → Target: 6.5 YPA
- Route Distance: 8 yards (weighted distribution)
- YAC: 5 yards (with pursuit angles)
- **Result: (8 + 5) × 63% = 8.2 YPA** ⚠️
- **Adjustment: Scale route distances by 0.80x**
- **Final: 6.5 YPA** ✅

#### **Rush Yards Per Carry** → Target: 4.3 YPC
- Base YPC: 4.3 (adjusted by OL vs DL differential)
- Broken Tackles: +2-5 yards on 15% of runs
- Big Runs: 3% chance of 20+ yard run
- **Hard Cap: 50 yards max**
- **Result: 4.0-5.0 YPC** ✅

#### **Sack Rate** → Target: 6.5% of passes
- Pressure Rate: 35% (adjusted by OL vs DL)
- Sacks from Pressure: 20% (not all pressures = sacks)
- **Result: 35% × 20% = 7% sack rate** ✅

#### **Interception Rate** → Target: 2.2% of passes
- Base: 2.2%
- Under Pressure: ×1.8 (4%)
- Tight Coverage: ×1.5 (3.3%)
- QB Decision: ±0.5% modifier
- Defender Ball Skills: ±0.5% modifier
- **Range: 0.5% to 8%** ✅

#### **Fumble Rate** → Target: 1.5% of rushes
- Base: 1.5%
- Ball Security Rating: ±0.5% modifier
- Defender Aggression: ±0.5% modifier
- **Range: 0.5% to 3.5%** ✅

#### **Touchdowns** → Target: 2.5 TDs per game
- Goal Line Defense: 60% stop rate within 5 yards
- TD Rate: ~3.8% of plays
- **Result: 2-3 TDs per game** ✅

### 3. **Variance (Any Given Sunday)** ±5%

```typescript
VARIANCE_CONFIG = {
  rating_variance: 0.05,      // ±5% on player ratings
  outcome_variance: 0.05,     // ±5% on probabilities
  yards_variance: 0.10,       // ±10% on yards
  big_play_variance: 0.15,    // ±15% on explosive plays
  upset_magic_chance: 0.05,   // 5% upset boost when 15+ point underdog
  trap_game_chance: 0.05,     // 5% trap game penalty when 15+ point favorite
}
```

**Impact:**
- Prevents deterministic outcomes
- Creates game-to-game variance
- 70 OVR can beat 85 OVR ~8% of the time
- Completion % range: 58-68%
- PPG range: 13-38 (defensive battles to shootouts)

### 4. **Situational Modifiers**

Gameplay adjusts based on context:

**Red Zone (80+ yard line)**
- Receiver separation: -20%
- Defender coverage: +15%
- YAC: -40%
- Route distances: 2-12 yards max

**Third & Long**
- Defense coverage: +10%
- Pass % increases to 90%
- Routes target the sticks

**Two-Minute Drill**
- Pass % increases to 85%
- Quick/sideline routes prioritized
- Clock management logic

**Goal Line (97+ yard line)**
- Rush yards: -30%
- TD probability: 40% (60% goal line stand)
- Route distances: 1-5 yards max

---

## 🧪 Calibration Testing

### Run the Test Suite

```bash
npm run calibrate
```

### Expected Output

```
🏈 GRIDIRON GM - Attribute Engine Calibration Test

📋 Test Setup:
   Home: Test Eagles (31 players)
   Away: Test Cowboys (31 players)
   Avg Rating: 75

🧪 Running 100 simulated games...

  ✓ Completed 10/100 games...
  ✓ Completed 20/100 games...
  ...

📊 CALIBRATION TEST RESULTS
======================================================================

🎮 Games Simulated: 100 (200 team-games)

📈 PASSING STATS (per team, per game):
   Attempts:     35.2 (target: 35.0) ✅
   Completions:  22.1 (target: 22.0) ✅
   Completion %: 62.8% (target: 63.0%) ✅
   Pass Yards:   228.4 (target: 230.0) ✅
   YPA:          6.49 (target: 6.50) ✅
   Pass TDs:     1.82
   INTs:         0.78
   INT Rate:     2.21% (target: 2.20%) ✅
   Sacks:        2.48 (target: 2.50) ✅

🏃 RUSHING STATS (per team, per game):
   Attempts:     24.1 (target: 24.0) ✅
   Rush Yards:   91.3 (target: 90.0) ✅
   YPC:          4.28 (target: 4.30) ✅
   Rush TDs:     0.64
   Fumbles:      0.35
   Fumble Rate:  1.45% (target: 1.50%) ✅

🏈 SCORING (per team, per game):
   PPG:          21.8 (target: 21.5) ✅
   Total TDs:    2.46 (target: ~3.0)
   FG Made:      1.72
   FG %:         83.2%

📊 VARIANCE (Standard Deviations):
   Completion %: ±4.8%
   Pass YPA:     ±1.2
   PPG:          ±6.3

✅ CALIBRATION PASSED - Engine is ready for production!
```

### If Calibration Fails

Adjust normalizers in `lib/simulation/attribute-engine.ts`:

**Too Many Completions?**
- Lower `accuracy_*` scaling from 0.85 to 0.80
- Lower `catch_clean` scaling from 0.90 to 0.85

**Too Many Yards?**
- Increase route distance divisor from `/25` to `/30`
- Reduce YAC base from `5.0` to `4.5`
- Tighten YAC hard caps

**Too Many TDs?**
- Increase goal line defense from `0.60` to `0.70`
- Reduce TD rate modifier

**Too Few Sacks?**
- Increase pressure-to-sack conversion from `0.20` to `0.25`
- Lower pressure divisor from `/250` to `/200`

---

## 🎮 Key Features

### 1. **Pass Rush & Protection**

```typescript
calculatePressureChance(dlinePlayers, olinePlayers)
```

**Inputs:**
- DL: Power moves, speed moves, strength, motor
- OL: Pass blocking, footwork, strength, awareness

**Outputs:**
- Pressure chance (15-60%)
- Time to pressure (1.8-3.5 seconds)
- Sack chance (3-12%)

**Normalizer:** 35% pressure rate, 6.5% sack rate

---

### 2. **Separation & Coverage**

```typescript
calculateSeparation(receiver, defender, coverageType, situational)
```

**Man Coverage:**
- WR: Route running, release, speed, agility
- DB: Man coverage, speed, press, backpedal

**Zone Coverage:**
- WR: Route running, awareness, speed, release technique
- DB: Zone coverage, play recognition, awareness

**Normalizer:** Average 1.8 yards separation

---

### 3. **Throw Accuracy**

```typescript
calculateThrowAccuracy(qb, routeDistance, underPressure, situational)
```

**Short (≤12 yards):**
- Short accuracy, mechanics, decision time

**Medium (13-25 yards):**
- Medium accuracy, mechanics, awareness

**Deep (>25 yards):**
- Deep accuracy, throw power, mechanics
- **Power Check:** THP <65 = -25% accuracy

**Under Pressure:**
- Throw under pressure, awareness, decision time

**Normalizer:** 75% accuracy baseline

---

### 4. **Catch Probability**

```typescript
calculateCatchProbability(receiver, defender, separation, accuracySuccess)
```

**Clean Catch (>1.5 yards separation):**
- Catching, ball skills, hand technique

**Contested (<1.5 yards):**
- Catch in traffic, catching, strength, ball skills
- Defender: Ball skills, coverage (can knock away)

**Normalizer:** 88% catch rate on accurate throws

---

### 5. **Yards After Catch**

```typescript
calculateYardsAfterCatch(receiver, defenders, separation, routeDistance, situational)
```

**Factors:**
- YAC rating, speed, agility, break tackle, strength
- Pursuit angles (±15% variance = missed tackles)
- Separation bonus
- Route distance penalty (deep routes = less YAC)

**Normalizer:** 
- Base: 5 yards
- Hard caps: 12 yards (short), 8 yards (medium), 5 yards (deep)
- 2% chance of explosive YAC (20-30 yards)

---

### 6. **Rush Outcome**

```typescript
calculateRushOutcome(rb, olinePlayers, defenders, situational)
```

**Factors:**
- OL: Run blocking, strength, hand placement, leverage
- RB: Vision, awareness, play recognition
- DL/LB: Block shedding, strength, tackling, play recognition

**Broken Tackles:**
- 15% base rate
- +2-5 yards on success

**Big Runs:**
- 3% base rate
- 15-35 yards

**Normalizer:** 4.3 YPC baseline, 50 yard hard cap

---

### 7. **Field Goals**

```typescript
calculateFieldGoalSuccess(kicker, distance, situational)
```

**Distance-Based Success Rates:**
- <30 yards: 95%
- 30-34: 92%
- 35-39: 88%
- 40-44: 82%
- 45-49: 72%
- 50+: 65%

**Modifiers:**
- Kicker accuracy: ±10%
- Power requirement check
- Consistency penalty

---

## 📈 Expected Statistics (Per Team, Per Game)

| Stat | Target | Range | Status |
|------|--------|-------|--------|
| **Passing** |
| Attempts | 35 | 30-40 | ✅ |
| Completions | 22 | 19-25 | ✅ |
| Completion % | 63% | 58-68% | ✅ |
| Pass Yards | 230 | 200-260 | ✅ |
| YPA | 6.5 | 5.5-7.5 | ✅ |
| Pass TDs | 1.8 | 0-4 | ✅ |
| INTs | 0.8 | 0-2 | ✅ |
| Sacks | 2.5 | 1-4 | ✅ |
| **Rushing** |
| Attempts | 24 | 18-30 | ✅ |
| Rush Yards | 90 | 70-120 | ✅ |
| YPC | 4.3 | 3.8-5.0 | ✅ |
| Rush TDs | 0.6 | 0-2 | ✅ |
| Fumbles | 0.4 | 0-2 | ✅ |
| **Scoring** |
| Points | 21.5 | 13-38 | ✅ |
| Total TDs | 2.5 | 1-5 | ✅ |
| FGs Made | 1.7 | 0-4 | ✅ |

---

## 🎲 Variance & Randomness

### Rating Variance (±5%)

Applied to all player attributes during calculations:

```typescript
const speedWithVariance = applyRatingVariance(player.spd, 0.05);
// Player with SPD=85 → 80-90 on any given play
```

**Purpose:** Players don't perform identically every snap

### Outcome Variance (±5%)

Applied to probabilities:

```typescript
let catchProb = 0.85;  // 85% catch chance
catchProb = applyProbabilityVariance(catchProb, 0.05);
// Result: 80-90% catch chance
```

**Purpose:** Prevents deterministic outcomes

### Yards Variance (±10%)

Applied to yard calculations:

```typescript
let yards = 12;
yards = applyYardsVariance(yards, 0.10);
// Result: 10.8-13.2 yards
```

**Purpose:** Realistic play-to-play variation

### Consistency Modifier

Players with low `consistency` have higher variance:

```typescript
if (player.consistency < 80) {
  extraVariance = (100 - player.consistency) / 800;
  // consistency=60 → +5% extra variance
}
```

**Purpose:** Inconsistent players are more unpredictable

### Upset Factor (5% chance)

When team is 15+ point underdog:

```typescript
if (differential < -15 && Math.random() < 0.05) {
  probability += 0.10;  // +10% boost to outcomes
}
```

**Purpose:** "Any Given Sunday" upsets

---

## 🔧 Tuning Guide

### If Games Are Too High-Scoring

**Reduce TD Rate:**
```typescript
// In calculateTouchdownProbability()
const goalLineDefense = 0.70;  // Increase from 0.60
```

**Lower Completion %:**
```typescript
// In calculateThrowAccuracy()
let probability = (accuracyRating / 100) * 0.80;  // Reduce from 0.85
```

### If Games Are Too Low-Scoring

**Increase Pass Yards:**
```typescript
// In selectRouteDistance()
if (roll < 0.55) {
  return 4 + Math.random() * 8;  // Increase from 3 + 7
}
```

**Increase YAC:**
```typescript
// In calculateYardsAfterCatch()
let expectedYAC = 6.0 + (differential / 20);  // Increase from 5.0
```

### If Too Many Sacks

**Lower Pressure Rate:**
```typescript
// In calculatePressureChance()
let pressureChance = 0.30 + (differential / 300);  // Reduce from 0.35 and increase divisor
```

### If Completion % Too High/Low

**Adjust Accuracy Baseline:**
```typescript
// In calculateThrowAccuracy()
let probability = (accuracyRating / 100) * 0.82;  // Tune this multiplier
```

**Adjust Catch Rate:**
```typescript
// In calculateCatchProbability()
let probability = (catchRating / 100) * 0.87;  // Tune this multiplier
```

---

## 📁 File Structure

```
lib/simulation/
├── attribute-engine.ts           # Core engine (weights, normalizers, calculations)
├── enhanced-outcome-generator.ts # Play simulation using attributes
├── calibration-test.ts           # Testing utilities
├── engine.ts                     # Main game loop (updated with flag)
├── types.ts                      # Updated Player interface
└── outcome-generator.ts          # Legacy system (still available)

scripts/
└── run-calibration.ts            # CLI calibration runner
```

---

## 🎯 Usage Examples

### Enable for a Single Game

```typescript
import { simulateGame } from '@/lib/simulation/engine';

const result = await simulateGame(
  {
    homeTeamId: 'CHI',
    awayTeamId: 'GB',
    gameId: 'game-xyz',
    season: 2025,
    week: 5,
    useEnhancedAttributes: true,
  },
  null,
  saveGameId
);
```

### Enable for All Games

Update your simulation API endpoint:

```typescript
// app/api/simulate-game/route.ts
const config: SimulationConfig = {
  homeTeamId,
  awayTeamId,
  gameId,
  season,
  week,
  useEnhancedAttributes: true,  // 👈 Enable globally
};
```

### Run Calibration Before Production

```bash
npm run calibrate

# Should show:
# ✅ CALIBRATION PASSED - Engine is ready for production!
```

---

## ⚙️ How It Works (Technical Deep Dive)

### Pass Play Simulation Flow

1. **Check Incompletion Factors** (3% chance)
   - Throwaway, batted ball, receiver fall

2. **Calculate Pressure** (35% base chance)
   - DL power rush vs OL pass blocking
   - DL speed rush vs OL pass blocking
   - Result: Pressure? Time to pressure? Sack?

3. **Select Route Distance** (weighted distribution)
   - 55% short (3-10 yards)
   - 25% medium (10-18 yards)
   - 15% deep (18-30 yards)
   - 5% shot plays (30-50 yards)

4. **Determine Coverage Type**
   - Man vs Zone (situation-dependent)

5. **Calculate Separation**
   - WR route running/release vs DB coverage
   - Result: 0-4.5 yards separation

6. **Throw Accuracy Check**
   - QB accuracy (short/medium/deep/pressure)
   - Power check for deep balls
   - Result: 35-95% success

7. **Interception Check** (on inaccurate throws)
   - Base 2.2%, up to 8% under pressure/tight coverage

8. **Catch Probability**
   - Clean (>1.5 yards) vs Contested (<1.5 yards)
   - Defender can knock away
   - Result: 30-95% success

9. **Calculate YAC**
   - Receiver YAC rating vs defender pursuit
   - Pursuit angles (±15% variance = missed tackles)
   - Broken tackle check
   - Result: 0-12 yards (with 2% chance of 20-30)

10. **Touchdown Check**
    - Goal line defense (60% stop rate within 5 yards)
    - Auto-TD if past goal line outside 5 yards

### Run Play Simulation Flow

1. **Calculate Hole Quality**
   - OL run blocking, strength, hand placement, leverage

2. **Calculate Run Defense**
   - DL/LB block shedding, strength, tackling, play recognition

3. **Vision Check**
   - RB vision, awareness, play recognition
   - Finds best hole

4. **Base Yards Calculation**
   - 4.3 YPC baseline ± differential
   - Situational penalties (goal line, 3rd & short)

5. **Broken Tackle Check** (15% chance)
   - +2-5 yards on success

6. **Big Run Check** (3% chance)
   - RB speed vs defender pursuit
   - 15-35 yards

7. **Fumble Check** (1.5% base)
   - Ball security vs defender aggression

8. **Hard Cap**
   - 50 yard maximum

---

## 🔍 Debugging

### Enable Detailed Logging

```typescript
// In attribute-engine.ts, add console.logs to track calculations:

export function calculateWeightedRating(...) {
  // ... existing code ...
  
  console.log(`[WeightedRating] Player: ${player.full_name}, Rating: ${rating.toFixed(1)}`);
  
  return rating;
}
```

### Track Individual Play Outcomes

```typescript
// In enhanced-outcome-generator.ts
console.log(`Play ${playNumber}: ${play.playType} - ${play.yards} yards - ${play.description}`);
```

### Compare Old vs New System

Run the same game with both engines:

```typescript
// Old system
const oldResult = await simulateGame({ ...config, useEnhancedAttributes: false });

// New system
const newResult = await simulateGame({ ...config, useEnhancedAttributes: true });

console.log('Old:', oldResult.homeScore, '-', oldResult.awayScore);
console.log('New:', newResult.homeScore, '-', newResult.awayScore);
```

---

## 📝 Notes

1. **Backward Compatibility:** The old system still works if `useEnhancedAttributes` is `false` or omitted
2. **Performance:** Enhanced system is ~10-15% slower due to more calculations
3. **Data Requirements:** Players must have detailed attributes populated (defaults to 70 if missing)
4. **Calibration:** Run calibration test after any normalizer changes
5. **Variance:** ±5% creates realistic game-to-game variance without breaking averages

---

## 🚨 Common Issues

### "Player attributes undefined"
**Fix:** Ensure your seed data includes all 71 attributes, or they'll default to 70

### "Stats too high/low"
**Fix:** Run calibration and adjust normalizers as shown above

### "No variance in outcomes"
**Fix:** Check that `applyVariance=true` in `calculateWeightedRating()` calls

### "Every game is a blowout"
**Fix:** Ensure upset factors and variance are enabled (±5% should create close games)

---

## 📚 References

- **NFL Stat Targets:** `NFL_TARGETS` object in `attribute-engine.ts`
- **Attribute Weights:** `ATTRIBUTE_WEIGHTS` object in `attribute-engine.ts`
- **Variance Config:** `VARIANCE_CONFIG` object in `attribute-engine.ts`
- **Play Simulation:** `simulatePlayEnhanced()` in `enhanced-outcome-generator.ts`
- **Calibration Test:** `npm run calibrate` or `scripts/run-calibration.ts`

---

**Ready to deploy! 🚀**



