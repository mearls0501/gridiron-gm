# Free Agents Setup Guide

## Overview

Free agents are player seed data stored in the `players` table with `is_free_agent = true`. This guide explains how free agents are created and managed.

## Automatic Free Agent Creation

When creating a new game, the Game Setup Wizard automatically:

1. Checks if free agents exist in the database
2. If none are found, generates ~200 free agents using the seed API endpoint
3. Creates availability records for the new save game

## Environment Variable Required

The free agent seeding system requires the **Supabase Service Role Key** to bypass Row Level Security (RLS) policies:

```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### Where to find your Service Role Key:

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **API**
3. Copy the **service_role** key (NOT the anon/public key)
4. Add it to your `.env.local` file

## Manual Free Agent Seeding

If you need to manually seed free agents, you can use the API endpoint directly:

```bash
curl -X POST http://localhost:3000/api/free-agents/seed \
  -H "Content-Type: application/json" \
  -d '{"count": 200}'
```

## How Free Agents Work

### Database Structure

- **players table**: Contains all player seed data (teams + free agents)
  - `is_free_agent = true` for free agents
  - `team_id = null` for free agents
  - Protected by RLS - only SELECT allowed

- **free_agent_availability table**: Tracks which free agents are available in each save game
  - Links `player_id` to `save_game_id`
  - `archived = false` for available free agents
  - When a player is signed, their availability record is archived

### Why RLS Blocks Inserts

The `players` table has Row Level Security enabled with a policy that blocks all INSERT operations. This is because:

1. The `players` table is seed data shared across all save games
2. Preventing inserts avoids data pollution between different games
3. Only authorized endpoints (using service role) can create players

## Troubleshooting

### "No free agents found" during game creation

**Solution**: Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in your environment variables.

### Free agents don't appear on the Free Agents page

**Check**:
1. Are there players with `is_free_agent = true` in the database?
2. Are there availability records for your save game?
3. Check the browser console for API errors

### Manual Database Query

To check if free agents exist:

```sql
SELECT COUNT(*) 
FROM players 
WHERE is_free_agent = true;
```

To create availability records manually (if needed):

```sql
INSERT INTO free_agent_availability (player_id, save_game_id, entered_free_agency_season, reason, archived)
SELECT 
  id,
  'your-save-game-id',
  2025,
  'initial',
  false
FROM players
WHERE is_free_agent = true
ON CONFLICT (player_id, save_game_id) DO NOTHING;
```

## Related Files

- `/app/api/free-agents/seed/route.ts` - API endpoint for seeding free agents
- `/app/components/GameSetupWizard.tsx` - Calls seed API during game creation
- `/app/free-agents/page.tsx` - Free agents UI page
- `/supabase/migrations/enable_rls_on_players_table.sql` - RLS policies

## Notes

- Free agents are seeded once and shared across all save games
- Each save game has its own `free_agent_availability` records
- When a player is signed, only their availability record is updated (not the base player record)
- The Game Setup Wizard will create ~200 free agents automatically if none exist



