-- Import calls cost money. The Edge Functions record each one and refuse past a
-- daily ceiling, so a leaked anon key cannot run up the Claude bill unbounded.

create table extraction_log (
  id         bigserial primary key,
  user_id    uuid references auth.users (id) on delete cascade,
  kind       text not null,
  created_at timestamptz not null default now()
);

create index extraction_log_user_day on extraction_log (user_id, created_at desc);

alter table extraction_log enable row level security;

-- Only the service role (the Edge Functions) touches this table. No policies
-- means no access for anon or authenticated roles, which is the intent.

create or replace function record_extraction(target_user uuid, extraction_kind text, daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
begin
  select count(*) into used
  from extraction_log
  where user_id = target_user
    and created_at > now() - interval '1 day';

  if used >= daily_limit then
    return false;
  end if;

  insert into extraction_log (user_id, kind) values (target_user, extraction_kind);
  return true;
end;
$$;

-- Only the Edge Functions (service role) may record an extraction; a client
-- with the anon key must not be able to reset its own quota.
revoke all on function record_extraction(uuid, text, integer) from public;
revoke all on function record_extraction(uuid, text, integer) from anon, authenticated;
grant execute on function record_extraction(uuid, text, integer) to service_role;
