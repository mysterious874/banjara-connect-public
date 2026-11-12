-- Restore missing notification/push schema and make story likes idempotent.
-- This migration adds schema and functions only; existing user rows are preserved.
create table if not exists public.push_delivery_events (
  event_id uuid not null,
  push_subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  updated_at timestamptz not null default now(),
  primary key (event_id, push_subscription_id)
);

alter table public.push_delivery_events enable row level security;
revoke all on table public.push_delivery_events from public, anon, authenticated;
grant all on table public.push_delivery_events to service_role;

alter table public.notifications
  add column if not exists story_id uuid references public.stories(id) on delete cascade;

create index if not exists notifications_story_id_idx
  on public.notifications(story_id);

create unique index if not exists notifications_story_like_unique_idx
  on public.notifications(user_id, actor_id, story_id)
  where type = 'story_like' and story_id is not null;

create or replace function public.like_story(p_story_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_owner_id uuid;
  v_notification_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  select s.user_id
    into v_owner_id
  from public.stories s
  where s.id = p_story_id
    and s.expires_at > now()
    and not exists (
      select 1
      from public.blocks b
      where (b.blocker_id = v_actor_id and b.blocked_id = s.user_id)
         or (b.blocker_id = s.user_id and b.blocked_id = v_actor_id)
    );

  if v_owner_id is null then
    raise exception 'Story not found or unavailable';
  end if;
  if v_owner_id = v_actor_id then
    raise exception 'You cannot like your own story';
  end if;

  insert into public.notifications(user_id, actor_id, type, story_id, is_read)
  values (v_owner_id, v_actor_id, 'story_like', p_story_id, false)
  on conflict (user_id, actor_id, story_id)
    where type = 'story_like' and story_id is not null
    do nothing
  returning id into v_notification_id;

  -- NULL means this user had already liked this story; do not send duplicate push.
  return v_notification_id;
end;
$function$;

revoke all on function public.like_story(uuid) from public, anon;
grant execute on function public.like_story(uuid) to authenticated;

create or replace function public.notify_new_follower()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if new.follower_id is distinct from new.following_id
     and not exists (
       select 1
       from public.blocks b
       where (b.blocker_id = new.follower_id and b.blocked_id = new.following_id)
          or (b.blocker_id = new.following_id and b.blocked_id = new.follower_id)
     ) then
    insert into public.notifications(user_id, actor_id, type, is_read)
    values (new.following_id, new.follower_id, 'follow', false);
  end if;
  return new;
end;
$function$;

revoke all on function public.notify_new_follower() from public, anon, authenticated;
drop trigger if exists follows_notify_new_follower on public.follows;
create trigger follows_notify_new_follower
after insert on public.follows
for each row execute function public.notify_new_follower();
