# Quick Start: Free Agents Fix

## The Problem
Free agent players weren't loading when creating a new game.

## The Solution
✅ **FIXED!** Free agents now automatically generate during game creation.

## Setup Required (One Time)

### 1. Add Environment Variable

Add this to your `.env.local` file in the project root:

```env
SUPABASE_SERVICE_ROLE_KEY=your_actual_service_role_key_here
```

**How to get your service role key:**
1. Open Supabase Dashboard
2. Go to **Settings** → **API**
3. Copy the **service_role** key (NOT the anon key)
4. Paste it in `.env.local`

### 2. Restart Your Dev Server

```bash
npm run dev
```

## Testing the Fix

### Automatic (Recommended)
1. Create a new game using the Game Setup Wizard
2. You'll see "Generating free agents..." in the progress indicator
3. Game will create ~200 free agents automatically
4. Navigate to Free Agents page to verify

### Manual (If Needed)
Visit: `http://localhost:3000/admin/seed-free-agents`
- Set count to 200
- Click "Seed Free Agents"
- Check for success message

## Verify It's Working

1. **Create a new game** (home page → Start New Game)
2. **Watch for**: "Generating free agents..." message during setup
3. **After setup**: Go to Free Agents page
4. **You should see**: ~200 available free agents

## Files Changed

### New Files:
- `/app/api/free-agents/seed/route.ts` - API endpoint for seeding
- `/app/admin/seed-free-agents/page.tsx` - Admin UI for manual seeding
- `/FREE-AGENTS-SETUP.md` - Detailed documentation
- `/FREE-AGENTS-FIX-SUMMARY.md` - Technical summary
- `/QUICK-START-FREE-AGENTS.md` - This file

### Modified Files:
- `/app/components/GameSetupWizard.tsx` - Now calls seed API when no free agents exist

## Troubleshooting

### "Failed to seed free agents: Supabase configuration missing"
**Fix**: Make sure `SUPABASE_SERVICE_ROLE_KEY` is in your `.env.local` file

### Free agents still not showing
1. Check browser console for errors
2. Verify environment variable is set
3. Try manual seeding via admin page
4. Check database: `SELECT COUNT(*) FROM players WHERE is_free_agent = true;`

### "No free agents found" on Free Agents page
- Free agents exist but availability records might be missing
- The page has a fallback to show all free agents anyway
- Create a new game to regenerate availability records

## How It Works

1. **During game creation**, wizard checks for existing free agents
2. **If none found**, calls `/api/free-agents/seed` endpoint
3. **Endpoint uses service role** to bypass RLS and insert players
4. **Creates availability records** linking free agents to your save game
5. **Free Agents page** shows all available players

## What Changed

**Before:**
- Game setup checked for free agents but didn't create them
- Just logged a warning and continued
- Players had to manually seed via database

**After:**
- Game setup automatically generates 200 free agents if none exist
- Uses secure API endpoint with service role access
- Provides clear progress feedback
- Includes admin UI for manual control

## Support

If you encounter any issues:
1. Check the console logs for error messages
2. Verify the environment variable is correct
3. Try the manual seeding admin page
4. Check the detailed docs in `FREE-AGENTS-SETUP.md`



