-- 20260727120200_harden_functions_and_storage.sql
--
-- Two smaller hardening items surfaced by the Supabase security advisor.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Pin search_path on the three trigger functions.
--
-- Without an explicit search_path, a caller who can create objects in a schema
-- earlier on the resolution path can shadow the functions/operators these use.
-- Bodies are unchanged from production.
-- ---------------------------------------------------------------------------

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.update_schedules_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_relationship_canonical_keys()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  key_a text;
  key_b text;
begin
  key_a := new.entity_a_type::text || ':' || new.entity_a_id::text;
  key_b := new.entity_b_type::text || ':' || new.entity_b_id::text;

  if key_a <= key_b then
    new.entity_low_key  := key_a;
    new.entity_high_key := key_b;
  else
    new.entity_low_key  := key_b;
    new.entity_high_key := key_a;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. draft-classes storage bucket.
--
-- Production state before this migration:
--   bucket:   public = true, file_size_limit = NULL, allowed_mime_types = NULL
--   policies: "allow uploads 1y3x8fu_0..3" grant SELECT / INSERT / UPDATE / DELETE
--             to BOTH anon and authenticated for bucket_id = 'draft-classes'
--
-- So an unauthenticated caller could list every uploaded draft class, download
-- them, overwrite them, delete them, and upload files of unlimited size.
--
-- After: signed-in users only, CSV only, 10 MB cap. The bucket stays public so
-- existing getPublicUrl() links in app/api/generate-draft-class keep resolving;
-- what changes is that you can no longer *enumerate* or *mutate* the contents
-- without a session.
-- ---------------------------------------------------------------------------

update storage.buckets
   set file_size_limit    = 10485760,               -- 10 MB
       allowed_mime_types = array['text/csv', 'application/vnd.ms-excel']
 where id = 'draft-classes';

drop policy if exists "allow uploads 1y3x8fu_0" on storage.objects;
drop policy if exists "allow uploads 1y3x8fu_1" on storage.objects;
drop policy if exists "allow uploads 1y3x8fu_2" on storage.objects;
drop policy if exists "allow uploads 1y3x8fu_3" on storage.objects;

create policy "draft_classes_read_authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'draft-classes');

create policy "draft_classes_insert_authenticated"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'draft-classes');

create policy "draft_classes_update_authenticated"
  on storage.objects for update to authenticated
  using (bucket_id = 'draft-classes')
  with check (bucket_id = 'draft-classes');

create policy "draft_classes_delete_authenticated"
  on storage.objects for delete to authenticated
  using (bucket_id = 'draft-classes');

-- If you later want draft-class URLs to be unguessable rather than public,
-- flip the bucket private and switch generate-draft-class to createSignedUrl():
--   update storage.buckets set public = false where id = 'draft-classes';
