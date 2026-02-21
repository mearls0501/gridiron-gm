# Quick Start: Depth Chart Auto-Generation

## 🚀 What You Get

Your depth charts are now **automatically generated** based on player overall ratings!

## 📋 Quick Setup (2 Steps)

### Step 1: Run Database Migration
```sql
-- Run this in Supabase SQL Editor:
-- File: supabase/migrations/add_save_game_id_to_depth_chart.sql
```

### Step 2: Create a New Game
- Depth charts are automatically created for all 32 teams!
- No additional setup needed!

## 🎮 How It Works

### Automatic (Recommended)
1. **Game Creation**: ✅ Auto-generates depth charts for all teams
2. **Weekly Updates**: ✅ Enable "Auto Depth Chart" in Game Settings
3. **Best Players Start**: ✅ Players ranked by overall rating

### Manual Control
- Click **"Auto-Generate"** button on Depth Chart page
- Or use ⬆️⬇️ arrows to manually adjust

## 📊 What Gets Generated

**For Each Team:**
- **51 total slots** across all positions
- QB (3), RB (4), WR (6), TE (3), OL (10), DL (8), LB (6), DB (9), K (1), P (1)
- **Slot 1** = Starter (highest overall)
- **Slot 2+** = Backups (ranked by overall)

**For Entire League:**
- ~1,632 total depth chart slots
- Generated in ~1-2 seconds

## ⚙️ Settings

**Auto Mode:**
- Depth charts update automatically every week
- Best for hands-off management

**Manual Mode:**
- You control when to regenerate
- Best for detailed roster management

## 🎯 Quick Test

1. Create new game
2. Check console: "Depth charts initialized: 32 teams..."
3. Go to Teams → Depth Chart
4. See players ranked by overall rating ✅
5. Click "Auto-Generate" to regenerate anytime ✅

## 📁 New Files

- `lib/utils/depth-chart-manager.ts` - Core logic
- `app/api/depth-chart/update/route.ts` - API endpoint
- `supabase/migrations/add_save_game_id_to_depth_chart.sql` - Database setup

## 🔗 Full Documentation

See `DEPTH-CHART-SYSTEM.md` for complete documentation.

---

**Status:** ✅ Ready to use!



