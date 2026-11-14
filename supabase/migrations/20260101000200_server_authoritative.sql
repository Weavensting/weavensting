-- Operations that only the server can get right.
--
-- The app treats Supabase as the single source of truth, so anything involving
-- uniqueness or "create it once" belongs here rather than in client code where
-- two devices can race each other.

-- ---------------------------------------------------------------------------
-- Pantry items are unique by name per person
-- ---------------------------------------------------------------------------

-- Two phones each adding "eggs" generate two different ids, so an upsert keyed
-- on id inserts twice and trips pantry_items_user_name. Name uniqueness is a
-- property of the data, not of whichever device happened to type it, so the
-- insert-or-return decision is made here, once, under the unique index.
create or replace function upsert_pantry_item(p_name text, p_staple boolean default false)
returns pantry_items
language plpgsql
as $$
declare
  result pantry_items;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'A pantry item needs a name.';
  end if;

  insert into pantry_items (user_id, name, staple)
  values (auth.uid(), trim(p_name), coalesce(p_staple, false))
  on conflict (user_id, lower(name)) where deleted_at is null
  do update set staple = excluded.staple or pantry_items.staple,
                updated_at = now()
  returning * into result;

  return result;
end;
$$;

grant execute on function upsert_pantry_item(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Everyone gets exactly one cookbook on first sign-in
-- ---------------------------------------------------------------------------

-- Signing in on two devices at once would otherwise create two cookbooks, so
-- the check and the insert happen together under a per-user advisory lock.
create or replace function ensure_default_cookbook(p_name text default 'Family Cookbook')
returns cookbooks
language plpgsql
as $$
declare
  result cookbooks;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  perform pg_advisory_xact_lock(hashtext('ensure_default_cookbook:' || auth.uid()::text));

  select c.* into result
  from cookbooks c
  join cookbook_members m on m.cookbook_id = c.id
  where m.user_id = auth.uid() and c.deleted_at is null
  order by c.created_at
  limit 1;

  if found then
    return result;
  end if;

  insert into cookbooks (name, owner_id)
  values (coalesce(nullif(trim(p_name), ''), 'Family Cookbook'), auth.uid())
  returning * into result;

  return result;
end;
$$;

grant execute on function ensure_default_cookbook(text) to authenticated;
