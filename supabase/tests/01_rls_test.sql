-- Row-level security, exercised as three different users.
--
-- These are the rules that fail silently when wrong: a too-permissive policy
-- looks identical to a correct one until someone reads another family's
-- recipes. Every check prints `pass | t`, or a notice where the expected
-- outcome is a rejection.
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'mum@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'cousin@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'stranger@example.com');

-- Supabase grants these to its own roles; the stub schemas need them here.
grant usage on schema public, auth, storage to authenticated, anon;
grant select on auth.users to authenticated;
grant execute on function claim_cookbook_invite(text) to authenticated;

-- Mum creates a cookbook and adds a recipe.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into cookbooks (id, name, owner_id)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'The Family Book', auth.uid());

\echo '1. owner auto-added as member:'
select count(*) = 1 as pass from cookbook_members
where cookbook_id = 'aaaaaaaa-0000-0000-0000-000000000001' and role = 'owner';

insert into recipes (id, cookbook_id, title, ingredients, tags)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        'Skillet Cornbread', '[{"item":"yellow cornmeal"},{"item":"buttermilk"}]'::jsonb,
        array['bread','southern']);

\echo '2. owner sees own recipe:'
select count(*) = 1 as pass from recipes;

\echo '3. full-text search vector built from title and ingredients:'
select search_vector @@ to_tsquery('english', 'cornbread & buttermilk') as pass from recipes limit 1;

\echo '4. search vector also covers tags:'
select search_vector @@ to_tsquery('english', 'southern') as pass from recipes limit 1;

-- A stranger sees nothing.
reset role; set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

\echo '5. stranger sees no cookbooks:'
select count(*) = 0 as pass from cookbooks;
\echo '6. stranger sees no recipes:'
select count(*) = 0 as pass from recipes;

\echo '7. stranger cannot insert into the cookbook:'
do $$
begin
  insert into recipes (cookbook_id, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Sneaky');
  raise exception 'FAIL: stranger inserted a recipe';
exception when insufficient_privilege then
  raise notice 'pass (blocked by policy)';
end $$;

-- Mum invites the cousin.
reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into cookbook_invites (code, cookbook_id, role, created_by)
values ('invite-code-1', 'aaaaaaaa-0000-0000-0000-000000000001', 'editor', auth.uid());

-- Cousin claims it.
reset role; set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

\echo '8. cousin sees nothing before claiming:'
select count(*) = 0 as pass from recipes;

select claim_cookbook_invite('invite-code-1') is not null as claimed;

\echo '9. cousin sees the recipe after claiming:'
select count(*) = 1 as pass from recipes;

\echo '10. cousin (editor) can add a recipe:'
insert into recipes (cookbook_id, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Cousin Pie');
select count(*) = 2 as pass from recipes;

\echo '11. cousin (editor) cannot delete the cookbook:'
with attempted as (
  delete from cookbooks where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1
)
select count(*) = 0 as pass from attempted;

\echo '12. a used invite cannot be claimed by someone else:'
reset role; set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
begin
  perform claim_cookbook_invite('invite-code-1');
  raise exception 'FAIL: invite was reusable';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'pass (%)', sqlerrm;
end $$;

\echo '13. an unknown invite code is refused:'
do $$
begin
  perform claim_cookbook_invite('not-a-real-code');
  raise exception 'FAIL: unknown invite was accepted';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'pass (%)', sqlerrm;
end $$;

-- Pantries are private.
reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into pantry_items (user_id, name) values (auth.uid(), 'buttermilk');

reset role; set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
\echo '14. pantry is private to its owner:'
select count(*) = 0 as pass from pantry_items;

\echo '15. updated_at is maintained by trigger:'
reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update recipes set title = 'Skillet Cornbread v2' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select updated_at > created_at as pass from recipes where id = 'bbbbbbbb-0000-0000-0000-000000000001';

\echo '16. a photo path that is not a uuid is denied, not an error:'
reset role;
insert into storage.objects (bucket_id, name) values ('recipe-photos', 'not-a-uuid/card.jpg');
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select count(*) = 0 as pass from storage.objects;

\echo '17. anon has no access at all:'
reset role; set role anon;
set request.jwt.claim.sub = '';
do $$
begin
  perform count(*) from recipes;
  raise exception 'FAIL: anon could read recipes';
exception when insufficient_privilege then
  raise notice 'pass (no grant for anon)';
end $$;

reset role;
