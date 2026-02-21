# Apply Draft Prospects Migration

## The Problem

The new season advancement is stuck because the database migration hasn't been applied yet. The draft prospect generation code is trying to insert 71 detailed attributes, but the `draft_prospects` table only has columns for the old system.

## Quick Fix: Apply the Migration

### Option 1: Via Supabase Dashboard (Easiest)

1. Open your **Supabase Dashboard**: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy the entire contents of `supabase/migrations/add_detailed_attributes_to_draft_prospects.sql`
6. Paste into the editor
7. Click **Run** (or press Cmd/Ctrl + Enter)
8. You should see "Success. No rows returned"

### Option 2: Via Supabase CLI

```bash
# Install Supabase CLI (if not already installed)
brew install supabase/tap/supabase

# Link to your project (one-time setup)
supabase link --project-ref YOUR_PROJECT_REF

# Apply all pending migrations
supabase db push
```

### Option 3: Run SQL Manually

If you can't access the dashboard, connect to your database directly and run the migration SQL file.

## Verify Migration Applied

After applying, you can verify by running this query in SQL Editor:

```sql
-- Check if new columns exist
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'draft_prospects' 
  AND column_name IN ('spd', 'acc', 'thp', 'sac', 'football_iq', 'athletic_ceiling')
ORDER BY column_name;
```

You should see all 6 columns listed.

## After Migration is Applied

1. Refresh your browser
2. Try advancing to the new season again
3. It should complete in 15-45 seconds
4. Check the browser console for timing logs

## If Still Slow

The operation involves:
- Creating 350 draft prospects with 71 attributes each (~5-10 seconds)
- Replenishing rosters for 32 teams (~5-15 seconds)
- Generating schedule for 256 games (~1-5 seconds)
- Other initialization (~2-5 seconds)

**Expected total time: 15-45 seconds**

If it's still taking longer than 60 seconds, there may be other database performance issues (indexes, connection pool, etc.).



