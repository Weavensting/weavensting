-- The server-side operations that exist because two devices can race.
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'a@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'b@example.com');

grant usage on schema public, auth to authenticated;
grant execute on function upsert_pantry_item(text, boolean) to authenticated;
grant execute on function ensure_default_cookbook(text) to authenticated;

set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';

\echo '1. two devices adding the same pantry item make one row:'
select (upsert_pantry_item('eggs')).id is not null as device_one;
select (upsert_pantry_item('Eggs')).id is not null as device_two;
select count(*) = 1 as pass from pantry_items where user_id = auth.uid() and deleted_at is null;

\echo '2. the original spelling is kept:'
select name = 'eggs' as pass from pantry_items where user_id = auth.uid() and deleted_at is null;

\echo '3. different items still make different rows:'
select (upsert_pantry_item('milk')).id is not null as added;
select count(*) = 2 as pass from pantry_items where user_id = auth.uid() and deleted_at is null;

\echo '4. a blank name is refused:'
do $$
begin
  perform upsert_pantry_item('   ');
  raise exception 'FAIL: blank name accepted';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'pass (%)', sqlerrm;
end $$;

\echo '5. re-adding after a soft delete works:'
update pantry_items set deleted_at = now() where name = 'eggs' and user_id = auth.uid();
select (upsert_pantry_item('eggs')).id is not null as re_added;
select count(*) = 1 as pass from pantry_items
where user_id = auth.uid() and deleted_at is null and lower(name) = 'eggs';

\echo '6. another person''s pantry is untouched:'
reset role; set role authenticated;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select (upsert_pantry_item('eggs')).id is not null as added;
select count(*) = 1 as pass from pantry_items where user_id = auth.uid() and deleted_at is null;

\echo '7. ensure_default_cookbook creates exactly one, however often it is called:'
reset role; set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select (ensure_default_cookbook('Family Cookbook')).id is not null as first_call;
select (ensure_default_cookbook('Family Cookbook')).id is not null as second_call;
select (ensure_default_cookbook('Different Name')).id is not null as third_call;
select count(*) = 1 as pass from cookbooks c
join cookbook_members m on m.cookbook_id = c.id
where m.user_id = auth.uid() and c.deleted_at is null;

\echo '8. and the caller owns it:'
select owner_id = auth.uid() as pass from cookbooks
where id = (select cookbook_id from cookbook_members where user_id = auth.uid() limit 1);

\echo '9. two people get their own cookbooks:'
reset role; set role authenticated;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select (ensure_default_cookbook('Family Cookbook')).id is not null as created;
select count(*) = 1 as pass from cookbooks c
join cookbook_members m on m.cookbook_id = c.id
where m.user_id = auth.uid() and c.deleted_at is null;

\echo '10. signed out, neither RPC does anything:'
reset role; set role anon;
set request.jwt.claim.sub = '';
do $$
begin
  perform ensure_default_cookbook('Sneaky');
  raise exception 'FAIL: anon created a cookbook';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'pass (%)', sqlerrm;
end $$;

reset role;
