# Gridiron GM Supabase setup

The local project is linked to Supabase project ref:

```text
arsjxqwyzccvrilpdhad
https://arsjxqwyzccvrilpdhad.supabase.co
```

Create `/Users/mearls/Projects/gridiron-gm/.env.local` with:

```env
NEXT_PUBLIC_SUPABASE_URL=https://arsjxqwyzccvrilpdhad.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-or-anon-key-from-supabase-settings-api>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-required-for-admin/seed-endpoints>
```

Then verify without printing secrets:

```bash
npm run db:verify
```

Expected result:

- URL points at `arsjxqwyzccvrilpdhad`
- anon key can count `players`
- service role key can count `players` and enables admin endpoints like `/api/free-agents/seed`

Current blocker found 2026-07-26:

- The Supabase CLI profile on this Mac can list only the `My Life` project.
- `supabase projects api-keys --project-ref arsjxqwyzccvrilpdhad` returns `403`.
- The configured Supabase MCP admin tool points at MV Client Intelligence (`gokbqtwluxbwcxfibvtt`), not this game project.

So the code can be built locally, but the app cannot see game data until Matt's Supabase account/token has access to the `arsjxqwyzccvrilpdhad` project or the project keys are placed in `.env.local`.
