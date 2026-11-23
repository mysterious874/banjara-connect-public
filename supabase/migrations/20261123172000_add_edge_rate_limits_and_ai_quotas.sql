-- Server-side abuse controls for username auth and Banjara AI.
create table if not exists public.edge_rate_limit_events (
  id bigint generated always as identity primary key,
  rate_key text not null,
  created_at timestamptz not null default now()
);
create index if not exists edge_rate_limit_events_key_time_idx on public.edge_rate_limit_events(rate_key,created_at desc);
alter table public.edge_rate_limit_events enable row level security;
revoke all on public.edge_rate_limit_events from anon, authenticated;
grant all on public.edge_rate_limit_events to service_role;

create or replace function public.check_edge_rate_limit(p_key text, p_minute_limit integer default 8, p_hour_limit integer default 30)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_minute_count integer; v_hour_count integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' or p_key is null or length(p_key)>160 then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key,0));
  delete from public.edge_rate_limit_events where created_at < now()-interval '24 hours';
  select count(*) into v_minute_count from public.edge_rate_limit_events where rate_key=p_key and created_at>now()-interval '1 minute';
  select count(*) into v_hour_count from public.edge_rate_limit_events where rate_key=p_key and created_at>now()-interval '1 hour';
  if v_minute_count>=greatest(1,p_minute_limit) or v_hour_count>=greatest(1,p_hour_limit) then return false; end if;
  insert into public.edge_rate_limit_events(rate_key) values(p_key);
  return true;
end;
$$;
revoke all on function public.check_edge_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.check_edge_rate_limit(text,integer,integer) to service_role;

create table if not exists public.ai_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_events_user_time_idx on public.ai_usage_events(user_id,created_at desc);
alter table public.ai_usage_events enable row level security;
revoke all on public.ai_usage_events from anon,authenticated;
grant all on public.ai_usage_events to service_role;

create or replace function public.consume_ai_quota(p_user_id uuid,p_daily_limit integer default 25,p_minute_limit integer default 3)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_day_count integer; v_minute_count integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' or p_user_id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  delete from public.ai_usage_events where created_at<now()-interval '8 days';
  select count(*) into v_day_count from public.ai_usage_events where user_id=p_user_id and created_at>now()-interval '24 hours';
  select count(*) into v_minute_count from public.ai_usage_events where user_id=p_user_id and created_at>now()-interval '1 minute';
  if v_day_count>=greatest(1,p_daily_limit) or v_minute_count>=greatest(1,p_minute_limit) then return false; end if;
  insert into public.ai_usage_events(user_id) values(p_user_id);
  return true;
end;
$$;
revoke all on function public.consume_ai_quota(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_ai_quota(uuid,integer,integer) to service_role;
