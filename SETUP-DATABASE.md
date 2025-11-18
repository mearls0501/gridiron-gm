# Database Setup Instructions

## Error: "Could not find the table 'public.games'"

If you're seeing this error, the `games` table hasn't been created in your Supabase database yet.

## Quick Fix: Run the Migration

### Option 1: Using Supabase Dashboard (Recommended)

1. **Open your Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Navigate to SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New query"

3. **Run the Migration SQL**
   - Copy the contents of `supabase/migrations/create_games_table.sql`
   - Paste it into the SQL Editor
   - Click "Run" (or press Cmd/Ctrl + Enter)

4. **Verify the Table Exists**
   - Go to "Table Editor" in the left sidebar
   - You should see a `games` table listed

### Option 2: Using Supabase CLI

If you have the Supabase CLI installed:

```bash
# Make sure you're in the project root
cd /path/to/gridiron-gm

# Link to your Supabase project (if not already linked)
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

### Option 3: Manual SQL Execution

If you have direct database access, you can run the SQL directly:

```sql
-- Create games table for schedule
CREATE TABLE IF NOT EXISTS public.games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL CHECK (week >= 1 AND week <= 18),
  home_team_id TEXT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  away_team_id TEXT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  home_score INTEGER,
  away_score INTEGER,
  played BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure a team can't play itself
  CONSTRAINT no_self_play CHECK (home_team_id != away_team_id),
  
  -- Ensure unique games per season/week
  CONSTRAINT unique_game UNIQUE (season, week, home_team_id, away_team_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_games_season ON public.games(season);
CREATE INDEX IF NOT EXISTS idx_games_week ON public.games(season, week);
CREATE INDEX IF NOT EXISTS idx_games_home_team ON public.games(home_team_id);
CREATE INDEX IF NOT EXISTS idx_games_away_team ON public.games(away_team_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust based on your auth needs)
CREATE POLICY "Allow all operations on games" ON public.games
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.games IS 'NFL schedule games - 272 games per season (32 teams × 17 games ÷ 2)';
```

## Verify Setup

After running the migration, verify the table exists:

1. In Supabase Dashboard → Table Editor → You should see `games` table
2. Or run this query in SQL Editor:
   ```sql
   SELECT COUNT(*) FROM games;
   ```

## Additional League Tables

To unlock league history tracking (seasons, standings, contracts, transactions, draft picks, etc.), also run the migration in `supabase/migrations/add_league_history_tables.sql` using the same steps above. This creates all supporting tables referenced by the admin tools and upcoming features (team standings, depth charts, injury tracking, play-by-play archives, etc.).

## Next Steps

Once the tables are created, you can:
- Start a new game (the wizard will create the schedule automatically)
- Generate a schedule manually via Admin → Generate Schedule
- Use the API endpoint: `POST /api/ensure-schedule`

## Troubleshooting

### "Permission denied" error
- Make sure you're using the correct database credentials
- Check that your Supabase project has the necessary permissions

### "Table already exists" error
- This is fine! The table already exists, you can proceed

### Still having issues?
- Check the Supabase logs in the Dashboard
- Verify your environment variables are set correctly
- Make sure the `teams` table exists (it's required for the foreign key)

