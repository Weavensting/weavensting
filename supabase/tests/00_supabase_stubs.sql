-- Minimal stand-ins for the Supabase-managed schemas the migration builds on,
-- so the row-level security tests can run against any plain Postgres 16.
create schema if not exists auth;
create schema if not exists storage;

create table auth.users (id uuid primary key default gen_random_uuid(), email text);

-- Supabase sets request.jwt.claim.sub per request; this mirrors that.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table storage.buckets (id text primary key, name text, public boolean default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid
);
alter table storage.objects enable row level security;

-- Supabase grants the storage tables to its roles; row-level security is what
-- actually gates them, and that is what these tests exercise.
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/');
$$;

do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$;
