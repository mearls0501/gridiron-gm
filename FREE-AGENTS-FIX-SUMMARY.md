# Free Agent Seeding Fix - Summary

## Problem

When creating a new game, free agent players were not being loaded/seeded. The game setup wizard would check for free agents but wouldn't create them if none existed.

## Root Cause

1. The `createFreeAgents()` function existed in `GameSetupWizard.tsx` but was **never called**
2. The function tried to insert directly into the `players` table, which is blocked by RLS policies
3. Free agents were expected to be manually seeded, but there was no mechanism to do so
4. The game setup wizard would log a warning but continue without free agents

## Solution

### 1. Created API Endpoint for Seeding Free Agents

**File**: `/app/api/free-agents/seed/route.ts`

- New POST endpoint that generates and seeds free agents
- Uses **Supabase Service Role client** to bypass RLS restrictions
- Generates ~200 free agents with random attributes
- Marks all players with `is_free_agent = true` and `team_id = null`
- Validates input (count between 1-1000)
- Returns success/error with count of players created

### 2. Updated Game Setup Wizard

**File**: `/app/components/GameSetupWizard.tsx` (lines 230-256)

**Before**:
```typescript
if ((freeAgentCount || 0) === 0) {
  // Just log a warning and continue
  console.warn("No free agents found...");
}
```

**After**:
```typescript
if ((freeAgentCount || 0) === 0) {
  setProgress("Generating free agents...");
  try {
    const seedResponse = await fetch("/api/free-agents/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: 200 }),
    });
    // Handle response and errors...
  } catch (seedErr) {
    console.warn("Error seeding free agents:", seedErr);
    // Don't fail - free agents can be added later
  }
}
```

### 3. Added Documentation

**Files**:
- `/FREE-AGENTS-SETUP.md` - Complete guide for free agent seeding
- `/FREE-AGENTS-FIX-SUMMARY.md` - This file

## Environment Variable Required

Add to your `.env.local` file:

```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**Where to find it**:
1. Supabase Dashboard → Settings → API
2. Copy the **service_role** key (not anon/public)

## How It Works Now

### During Game Creation:

1. **Check for free agents** - Query `players` table where `is_free_agent = true`
2. **If count = 0**: Call `/api/free-agents/seed` to generate 200 free agents
3. **Create availability records** - Link all free agents to the new save game via `free_agent_availability` table
4. **Continue setup** - Even if seeding fails, game creation continues (free agents can be added later)

### Free Agents Page:

1. Queries `free_agent_availability` for current save game
2. Falls back to `players` table if no availability records exist
3. Shows all available free agents with ability to sign or bid

## Files Changed

1. `/app/api/free-agents/seed/route.ts` - **NEW** - Seed API endpoint
2. `/app/components/GameSetupWizard.tsx` - Modified free agent check logic
3. `/FREE-AGENTS-SETUP.md` - **NEW** - Documentation
4. `/FREE-AGENTS-FIX-SUMMARY.md` - **NEW** - This summary

## Testing

### Test the Fix:

1. Set `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`
2. Create a new game via the Game Setup Wizard
3. Watch the progress indicator show "Generating free agents..."
4. After setup, navigate to Free Agents page
5. Verify ~200 free agents are visible

### Manual Seeding:

```bash
curl -X POST http://localhost:3000/api/free-agents/seed \
  -H "Content-Type: application/json" \
  -d '{"count": 200}'
```

## Error Handling

The fix includes robust error handling:

- **Missing service key**: Returns 500 error with clear message
- **Player generation fails**: Logs warning, continues with generated players
- **Database insert fails**: Returns error, game setup continues
- **No players generated**: Returns 500 error

## Notes

- Free agents are **seed data** shared across all save games
- Each save game tracks availability via `free_agent_availability` table  
- RLS policies prevent direct inserts to protect seed data integrity
- Game setup doesn't fail if free agent seeding fails (can be done manually later)
- The existing `createFreeAgents()` function was left in place but not used (could be removed in future cleanup)

## Future Improvements

1. Add admin UI for manual free agent seeding
2. Allow custom free agent count during game creation
3. Add progress feedback during seeding (currently just a message)
4. Consider adding free agent archetypes/quality distribution settings
5. Add validation to prevent duplicate free agent seeding



