# 🎯 Normalizers Quick Reference

## Why Normalizers?

Without normalizers, attribute-based calculations would produce **unrealistic stats**:
- 90% completion rates (NFL: 63%)
- 15 yards per carry (NFL: 4.3)
- 60+ points per game (NFL: 21.5)

**Normalizers ensure NFL realism while preserving attribute differentiation.**

---

## 📊 Critical Normalizers

### 1. **Completion Percentage** → 63%

| Component | Formula | Target |
|-----------|---------|--------|
| **Accuracy** | `(rating / 100) × 0.85` | 75% |
| **Catch Rate** | `(rating / 100) × 0.90` | 88% |
| **Incompletion Factors** | 3% chance (throwaway/batted/drop) | 97% |
| **RESULT** | `0.75 × 0.88 × 0.97` | **63.4%** ✅ |

**Location:** `calculateThrowAccuracy()`, `calculateCatchProbability()`

---

### 2. **Yards Per Attempt** → 6.5 YPA

| Component | Formula | Target |
|-----------|---------|--------|
| **Route Distance** | Weighted distribution | 8.0 yards |
| **YAC** | `5.0 + (differential / 20)` | 5.0 yards |
| **Completion %** | See above | 63% |
| **RESULT** | `(8 + 5) × 0.63` | **8.2 YPA** |
| **ADJUSTMENT** | Scale routes by 0.80x | **6.5 YPA** ✅ |

**Location:** `selectRouteDistance()`, `calculateYardsAfterCatch()`

---

### 3. **Rush Yards Per Carry** → 4.3 YPC

| Component | Formula | Target |
|-----------|---------|--------|
| **Base YPC** | `4.3 + (differential / 20)` | 4.3 yards |
| **Broken Tackles** | +2-5 yards on 15% of runs | +0.45 avg |
| **Big Runs** | 15-35 yards on 3% of runs | +0.45 avg |
| **Hard Cap** | 50 yards max | Prevents outliers |
| **RESULT** | `4.3 + 0.45 + 0.45` | **5.2 YPC** |

**Location:** `calculateRushOutcome()`

**Note:** Slightly above target but within acceptable range (accounts for broken tackles)

---

### 4. **Sack Rate** → 6.5% of passes

| Component | Formula | Target |
|-----------|---------|--------|
| **Pressure Rate** | `0.35 + (differential / 250)` | 35% |
| **Pressure → Sack** | `pressureChance × 0.20` | 20% |
| **RESULT** | `0.35 × 0.20` | **7%** ✅ |

**Location:** `calculatePressureChance()`

**Range:** 3-12% (prevents too many/few sacks)

---

### 5. **Interception Rate** → 2.2% of passes

| Component | Modifier | Impact |
|-----------|----------|--------|
| **Base Rate** | 2.2% | Starting point |
| **Under Pressure** | ×1.8 | → 4.0% |
| **Tight Coverage** | ×1.5 | → 3.3% |
| **Poor QB Decision** | +0.5% | DEC <70 |
| **Good DB Ball Skills** | +0.5% | Ball Skills >70 |
| **Hard Cap** | 0.5-8.0% | Prevents extremes |

**Location:** `calculateInterceptionChance()`

---

### 6. **Fumble Rate** → 1.5% of rushes

| Component | Modifier | Impact |
|-----------|----------|--------|
| **Base Rate** | 1.5% | Starting point |
| **Poor Ball Security** | +0.5% | CAR <70 |
| **High Defender Aggression** | +0.5% | AGG >70 |
| **Hard Cap** | 0.5-3.5% | Prevents extremes |

**Location:** `calculateRushOutcome()`

---

### 7. **Touchdown Rate** → 3.8% of plays

| Component | Formula | Target |
|-----------|---------|--------|
| **Goal Line Defense** | 60% stop rate | Within 5 yards |
| **Auto-TD** | If yards ≥ distance to goal | Outside 5 yards |
| **RESULT** | ~2.5 TDs per game | NFL average |

**Location:** `calculateTouchdownProbability()`

---

### 8. **Separation** → 1.8 yards average

| Component | Formula | Target |
|-----------|---------|--------|
| **Base Separation** | `1.8 + (differential / 25)` | 1.8 yards |
| **Red Zone Penalty** | WR ×0.80, DB ×1.15 | Harder in RZ |
| **Hard Cap** | 0.0-4.5 yards | Prevents unrealistic gaps |

**Location:** `calculateSeparation()`

---

### 9. **YAC Hard Caps** (Prevent Outliers)

| Route Type | Max YAC | Reasoning |
|------------|---------|-----------|
| **Short (≤10 yards)** | 12 yards | Defenders closer |
| **Medium (11-20)** | 8 yards | Medium pursuit |
| **Deep (>20)** | 5 yards | Deep safety help |
| **Explosive (2% chance)** | 30 yards | Rare breakaway |

**Location:** `calculateYardsAfterCatch()`

---

### 10. **Pressure Time** → 2.5 seconds average

| Matchup | Time Range | Reasoning |
|---------|------------|-----------|
| **OL >> DL** | 2.9-3.2s | Clean pocket |
| **Balanced** | 2.4-2.8s | Average |
| **DL >> OL** | 2.0-2.3s | Quick pressure |
| **Hard Cap** | 1.8-3.5s | Prevents extremes |

**Location:** `calculatePressureChance()`

---

## 🎲 Variance Impact

### Without Variance (Deterministic)
- 85 OVR QB vs 70 OVR defense = **same result every time**
- Completion %: Exactly 68.4% every game
- No upsets, no variance

### With ±5% Variance
- 85 OVR QB vs 70 OVR defense = **different every game**
- Completion %: 63-73% range
- 70 OVR beats 85 OVR ~8% of time
- "Any Given Sunday" effect

---

## 🔧 Tuning Checklist

Before deploying to production:

- [ ] Run `npm run calibrate`
- [ ] Verify completion % is 60-66%
- [ ] Verify pass YPA is 5.5-7.5
- [ ] Verify rush YPC is 3.8-5.0
- [ ] Verify PPG is 18-28
- [ ] Verify INT rate is 1.5-3.0%
- [ ] Verify fumble rate is 1.0-2.0%
- [ ] Verify sack rate is 5-8%
- [ ] Check variance (standard deviations)
- [ ] Test upset scenarios (70 OVR vs 90 OVR)

---

## 🎯 Normalizer Formulas At-A-Glance

```typescript
// Completion %
accuracy × catch × (1 - incompletion) = 0.75 × 0.88 × 0.97 = 63%

// Pass YPA
(routeDistance × 0.80) + YAC × completion% = (8 × 0.80) + 5 × 0.63 = 6.5

// Rush YPC
base + brokenTackles + bigRuns = 4.3 + 0.45 + 0.45 = 5.2

// Sack Rate
pressure × sackConversion = 0.35 × 0.20 = 7%

// INT Rate
base × pressureMod × coverageMod = 2.2% × mods = 0.5-8%

// Fumble Rate
base + securityPenalty + aggBonus = 1.5% ± mods = 0.5-3.5%

// TD Rate
plays × tdRate - goalLineDefense = ~3.8% of plays = 2.5 TDs/game

// Separation
base + (differential / divisor) = 1.8 + (diff / 25) = 0-4.5 yards
```

---

## 💡 Pro Tips

1. **Start with defaults** - Normalizers are pre-tuned for NFL realism
2. **Test in batches** - Run 100 games minimum for accurate calibration
3. **Watch the extremes** - If you see 80-yard rushes or 12 TDs in a game, tighten caps
4. **Balance variance** - ±5% creates variety without chaos
5. **Trust the math** - Normalizers are calculated from real NFL data

---

**This system produces NFL-realistic gameplay while letting player attributes matter. 🏈**



