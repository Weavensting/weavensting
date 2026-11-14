-- Family Cookbook — initial schema.
--
-- Shape mirrors src/domain/types.ts. Recipe bodies (ingredients, steps) are
-- stored as JSONB so the app and the database agree on one representation and
-- adding a field never needs a migration. Everything a query filters on --
-- title, tags, macros, times -- is a real column with an index.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Cookbooks and membership
-- ---------------------------------------------------------------------------

create table cookbooks (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  description text,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create type cookbook_role as enum ('owner', 'editor', 'viewer');

create table cookbook_members (
  cookbook_id uuid not null references cookbooks (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        cookbook_role not null default 'editor',
  created_at  timestamptz not null default now(),
  primary key (cookbook_id, user_id)
);

create index cookbook_members_user on cookbook_members (user_id);

-- Invite by code so a relative can join without an account being provisioned
-- for them first -- the common case for a family cookbook.
create table cookbook_invites (
  code        text primary key default encode(gen_random_bytes(6), 'hex'),
  cookbook_id uuid not null references cookbooks (id) on delete cascade,
  role        cookbook_role not null default 'editor',
  created_by  uuid not null references auth.users (id) on delete cascade,
  expires_at  timestamptz not null default (now() + interval '30 days'),
  claimed_by  uuid references auth.users (id) on delete set null,
  claimed_at  timestamptz
);

create index cookbook_invites_cookbook on cookbook_invites (cookbook_id);

-- ---------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------

create table recipes (
  id            uuid primary key default gen_random_uuid(),
  cookbook_id   uuid not null references cookbooks (id) on delete cascade,
  title         text not null,
  description   text,
  image_uri     text,
  original_image_uris text[] not null default '{}',
  servings      integer not null default 4 check (servings > 0),
  prep_minutes  integer check (prep_minutes >= 0),
  cook_minutes  integer check (cook_minutes >= 0),
  ingredients   jsonb not null default '[]'::jsonb,
  steps         jsonb not null default '[]'::jsonb,
  notes         text,
  tags          text[] not null default '{}',
  nutrition     jsonb,
  source        jsonb,
  rating        smallint check (rating between 1 and 5),
  times_cooked  integer not null default 0 check (times_cooked >= 0),
  last_cooked_at timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Soft delete: a tombstone is how a removal reaches the rest of the family.
  deleted_at    timestamptz
);

create index recipes_cookbook on recipes (cookbook_id) where deleted_at is null;
create index recipes_updated_at on recipes (cookbook_id, updated_at desc);
create index recipes_tags on recipes using gin (tags);
create index recipes_ingredients on recipes using gin (ingredients jsonb_path_ops);

-- A generated column may only call immutable functions. Neither array_to_string
-- nor a jsonpath expression qualifies (both are merely stable, because element
-- output functions need not be immutable), so the search text is assembled by
-- these two helpers instead.
create or replace function text_array_text(items text[])
returns text
language sql
immutable
as $$
  select coalesce((select string_agg(item, ' ') from unnest(items) as item), '');
$$;

create or replace function recipe_ingredient_text(ingredients jsonb)
returns text
language sql
immutable
as $$
  select coalesce(
    (
      select string_agg(coalesce(item->>'item', ''), ' ')
      from jsonb_array_elements(
        case when jsonb_typeof(ingredients) = 'array' then ingredients else '[]'::jsonb end
      ) as item
    ),
    ''
  );
$$;

-- Full-text over the parts people actually search: title, then tags, then
-- ingredients. Weights mirror the client-side ranking in src/domain/search.ts.
alter table recipes add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', text_array_text(tags)), 'B') ||
    setweight(to_tsvector('english', recipe_ingredient_text(ingredients)), 'C') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'D')
  ) stored;

create index recipes_search on recipes using gin (search_vector);

-- ---------------------------------------------------------------------------
-- Pantry (per person, not per cookbook -- your fridge is yours)
-- ---------------------------------------------------------------------------

create table pantry_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  quantity   numeric,
  unit       text,
  staple     boolean not null default false,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index pantry_items_user on pantry_items (user_id) where deleted_at is null;
create unique index pantry_items_user_name on pantry_items (user_id, lower(name)) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cookbooks_touch before update on cookbooks
  for each row execute function touch_updated_at();
create trigger recipes_touch before update on recipes
  for each row execute function touch_updated_at();
create trigger pantry_items_touch before update on pantry_items
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

-- Casting an arbitrary folder name to uuid raises on bad input, which would
-- abort a storage listing instead of just denying that row. This returns null
-- instead, and a null cookbook matches no membership.
create or replace function safe_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

-- Membership check lives in a security-definer function so the recipes policies
-- can ask "is this user in that cookbook?" without recursing through the
-- cookbooks policies, which ask the same question.
create or replace function is_cookbook_member(target_cookbook uuid, min_role cookbook_role default 'viewer')
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from cookbook_members m
    where m.cookbook_id = target_cookbook
      and m.user_id = auth.uid()
      and case min_role
            when 'viewer' then true
            when 'editor' then m.role in ('owner', 'editor')
            when 'owner'  then m.role = 'owner'
          end
  );
$$;

alter table cookbooks        enable row level security;
alter table cookbook_members enable row level security;
alter table cookbook_invites enable row level security;
alter table recipes          enable row level security;
alter table pantry_items     enable row level security;

-- Cookbooks: members read; owners change.
create policy cookbooks_select on cookbooks
  for select using (is_cookbook_member(id));
create policy cookbooks_insert on cookbooks
  for insert with check (owner_id = auth.uid());
create policy cookbooks_update on cookbooks
  for update using (is_cookbook_member(id, 'owner')) with check (is_cookbook_member(id, 'owner'));
create policy cookbooks_delete on cookbooks
  for delete using (owner_id = auth.uid());

-- Members: you can see who else is in a cookbook you belong to; owners manage it.
create policy members_select on cookbook_members
  for select using (user_id = auth.uid() or is_cookbook_member(cookbook_id));
create policy members_insert on cookbook_members
  for insert with check (is_cookbook_member(cookbook_id, 'owner'));
create policy members_delete on cookbook_members
  for delete using (is_cookbook_member(cookbook_id, 'owner') or user_id = auth.uid());

-- Invites: only owners create and read them. Claiming goes through
-- `claim_cookbook_invite`, which runs as definer -- an invitee cannot yet read
-- the row they are about to use.
create policy invites_select on cookbook_invites
  for select using (is_cookbook_member(cookbook_id, 'owner'));
create policy invites_insert on cookbook_invites
  for insert with check (is_cookbook_member(cookbook_id, 'owner') and created_by = auth.uid());
create policy invites_delete on cookbook_invites
  for delete using (is_cookbook_member(cookbook_id, 'owner'));

-- Recipes: any member reads; editors write.
create policy recipes_select on recipes
  for select using (is_cookbook_member(cookbook_id));
create policy recipes_insert on recipes
  for insert with check (is_cookbook_member(cookbook_id, 'editor'));
create policy recipes_update on recipes
  for update using (is_cookbook_member(cookbook_id, 'editor'))
  with check (is_cookbook_member(cookbook_id, 'editor'));
create policy recipes_delete on recipes
  for delete using (is_cookbook_member(cookbook_id, 'editor'));

-- Pantry: strictly your own.
create policy pantry_all on pantry_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Table privileges. Supabase grants these to anon and authenticated by default;
-- nothing here is readable without an account, so anon is revoked explicitly.
grant select, insert, update, delete on
  cookbooks, cookbook_members, cookbook_invites, recipes, pantry_items
  to authenticated;
revoke all on
  cookbooks, cookbook_members, cookbook_invites, recipes, pantry_items
  from anon;

-- ---------------------------------------------------------------------------
-- Creating and joining cookbooks
-- ---------------------------------------------------------------------------

-- A cookbook's creator must become its first member, or the policies above
-- would immediately lock them out of what they just created.
create or replace function add_owner_as_member() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into cookbook_members (cookbook_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger cookbooks_add_owner after insert on cookbooks
  for each row execute function add_owner_as_member();

create or replace function claim_cookbook_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite cookbook_invites;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join a cookbook.';
  end if;

  select * into invite from cookbook_invites where code = invite_code;

  if invite is null then
    raise exception 'That invite code is not valid.';
  end if;
  if invite.expires_at < now() then
    raise exception 'That invite has expired.';
  end if;
  -- Single-use: an invite code that keeps working is a link anyone can forward.
  if invite.claimed_by is not null and invite.claimed_by <> auth.uid() then
    raise exception 'That invite has already been used.';
  end if;

  insert into cookbook_members (cookbook_id, user_id, role)
  values (invite.cookbook_id, auth.uid(), invite.role)
  on conflict (cookbook_id, user_id) do nothing;

  update cookbook_invites
     set claimed_by = auth.uid(), claimed_at = now()
   where code = invite_code;

  return invite.cookbook_id;
end;
$$;

revoke all on function claim_cookbook_invite(text) from public;
grant execute on function claim_cookbook_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Recipe photos
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('recipe-photos', 'recipe-photos', false)
on conflict (id) do nothing;

-- Photos are filed under <cookbook_id>/..., so access follows cookbook membership.
create policy recipe_photos_select on storage.objects
  for select using (
    bucket_id = 'recipe-photos'
    and is_cookbook_member(safe_uuid((storage.foldername(name))[1]))
  );

create policy recipe_photos_insert on storage.objects
  for insert with check (
    bucket_id = 'recipe-photos'
    and is_cookbook_member(safe_uuid((storage.foldername(name))[1]), 'editor')
  );

create policy recipe_photos_delete on storage.objects
  for delete using (
    bucket_id = 'recipe-photos'
    and is_cookbook_member(safe_uuid((storage.foldername(name))[1]), 'editor')
  );
