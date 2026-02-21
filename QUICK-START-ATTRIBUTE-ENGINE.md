# 🚀 Quick Start: Attribute Engine

## TL;DR - Get Started in 5 Minutes

### 1️⃣ Verify Database (30 seconds)

Check that all attribute columns exist:

```sql
-- Run in Supabase SQL Editor
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'players' 
  AND column_name IN ('spd', 'acc', 'thp', 'sac', 'rte', 'cth')
ORDER BY column_name;

-- Should return 6 rows
```

✅ If you see the columns, you're good!

### 2️⃣ Test the Engine (1 minute)

Add the flag to your game simulation:

```typescript
// app/api/simulate-game/route.ts
const result = await simulateGame(
  {
    homeTeamId,
    awayTeamId,
    gameId,
    season,
    week,
    useEnhancedAttributes: true,  // 👈 Add this line
  },
  null,
  saveGameId
);
```

**Test:** Simulate a single game through your UI

**Expected:** Game completes, score is 10-40 points

### 3️⃣ Run Calibration (3 minutes)

```bash
npm install tsx --save-dev  # If not already installed
npm run calibrate
```

**Expected Output:**
```
✅ CALIBRATION PASSED - Engine is ready for production!
```

---

## ✅ You're Done!

If calibration passed, you can deploy immediately:

```typescript
// Set as default in your simulation API
const config: SimulationConfig = {
  ...gameConfig,
  useEnhancedAttributes: true,
};
```

---

## ⚠️ If Calibration Fails

### Completion % Too High (>68%)

**Fix:** Lower accuracy scaling

```typescript
// lib/simulation/attribute-engine.ts
// Line ~275 in calculateThrowAccuracy()

let probability = (accuracyRating / 100) * 0.80;  // Change from 0.85
```

### Completion % Too Low (<58%)

**Fix:** Raise accuracy scaling

```typescript
let probability = (accuracyRating / 100) * 0.90;  // Change from 0.85
```

### Pass YPA Too High (>7.5)

**Fix:** Reduce route distances or YAC

```typescript
// Line ~120 in selectRouteDistance()
// Reduce all route distance ranges by 20%

// OR

// Line ~320 in calculateYardsAfterCatch()
let expectedYAC = 4.5 + (differential / 20);  // Change from 5.0
```

### Rush YPC Too High (>5.5)

**Fix:** Increase differential divisor

```typescript
// Line ~430 in calculateRushOutcome()
let baseYards = 4.3 + (adjustedDiff / 25);  // Change from /20
```

### Too Many Sacks (>3.5 per game)

**Fix:** Reduce pressure or sack conversion

```typescript
// Line ~180 in calculatePressureChance()
let pressureChance = 0.30 + (differential / 300);  // Was 0.35 and /250

// OR
let sackChance = pressureChance * 0.15;  // Was 0.20
```

### Scores Too High (>28 PPG)

**Fix:** Increase goal line defense

```typescript
// Line ~530 in calculateTouchdownProbability()
const goalLineDefense = 0.70;  // Change from 0.60
```

---

## 📊 Quick Validation

After each change, re-run calibration:

```bash
npm run calibrate
```

**Target Metrics:**
- ✅ Completion %: 60-66%
- ✅ Pass YPA: 5.5-7.5
- ✅ Rush YPC: 3.8-5.0
- ✅ PPG: 18-28
- ✅ INT Rate: 1.5-3.0%
- ✅ Sack Rate: 5-8%

---

## 🎯 One-Minute Test

Fastest way to verify everything works:

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Open your app
open http://localhost:3000

# In UI:
# 1. Navigate to a game
# 2. Click "Simulate Game"
# 3. Check box score

# Verify:
# - Score is 10-40 points
# - QB has 150-300 yards
# - Completion % is 55-70%
# - No errors in console
```

✅ If this works, you're ready for production!

---

## 🔄 Enable/Disable Toggle

Create a setting to toggle between engines:

```typescript
// lib/simulation/config.ts
export const SIMULATION_CONFIG = {
  USE_ENHANCED_ATTRIBUTES: true,  // 👈 Master toggle
};

// Then in your API:
import { SIMULATION_CONFIG } from '@/lib/simulation/config';

const result = await simulateGame({
  ...config,
  useEnhancedAttributes: SIMULATION_CONFIG.USE_ENHANCED_ATTRIBUTES,
});
```

**To disable:** Set to `false`

---

## 📚 Full Documentation

- **Complete Guide:** `ATTRIBUTE-ENGINE-GUIDE.md`
- **Normalizers:** `NORMALIZERS-REFERENCE.md`
- **Migration:** `ATTRIBUTE-SYSTEM-MIGRATION.md`
- **Implementation:** `ATTRIBUTE-ENGINE-IMPLEMENTATION.md`

---

**That's it! 🎉 Your attribute engine is ready to go.**



