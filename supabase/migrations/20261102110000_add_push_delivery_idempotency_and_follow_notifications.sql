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
create index if not exists notifications_story_id_idx on public.notifications(story_id);

create or replace function public.notify_new_follower()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
begin
  if new.follower_id is distinct from new.following_id then
    insert into public.notifications (user_id, actor_id, type, is_read)
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

create or replace function public.notify_group_member_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  actor_id uuid := auth.uid();
  target_user_id uuid;
  group_id uuid;
  notification_type text;
begin
  if actor_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    target_user_id := new.user_id;
    group_id := new.group_id;
    notification_type := 'group_member_added';
  elsif tg_op = 'UPDATE' then
    if old.role is not distinct from new.role then
      return new;
    end if;
    target_user_id := new.user_id;
    group_id := new.group_id;
    notification_type := 'group_role_changed';
  else
    target_user_id := old.user_id;
    group_id := old.group_id;
    notification_type := 'group_member_removed';
  end if;

  if target_user_id is distinct from actor_id then
    insert into public.notifications (user_id, actor_id, type, group_id, is_read)
    values (target_user_id, actor_id, notification_type, group_id, false);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.notify_group_member_change() from public, anon, authenticated;

drop trigger if exists community_group_members_notify_added on public.community_group_members;
create trigger community_group_members_notify_added
after insert on public.community_group_members
for each row execute function public.notify_group_member_change();

drop trigger if exists community_group_members_notify_role_changed on public.community_group_members;
create trigger community_group_members_notify_role_changed
after update of role on public.community_group_members
for each row execute function public.notify_group_member_change();

drop trigger if exists community_group_members_notify_removed on public.community_group_members;
create trigger community_group_members_notify_removed
after delete on public.community_group_members
for each row execute function public.notify_group_member_change();

create or replace function public.respond_community_group_join_request(p_request_id uuid,p_approve boolean)
returns text language plpgsql security definer set search_path=public as $function$
declare caller uuid:=auth.uid(); request_row public.community_group_join_requests%rowtype; result_status text;
begin
 if caller is null then raise exception 'Authentication required'; end if;
 select * into request_row from public.community_group_join_requests where id=p_request_id for update;
 if not found then raise exception 'Join request not found.'; end if;
 if request_row.recipient_id<>caller then raise exception 'You cannot respond to this request.'; end if;
 if request_row.status<>'pending' then raise exception 'This request has already been handled.'; end if;
 if p_approve then insert into public.community_group_members(group_id,user_id,role) values(request_row.group_id,request_row.requester_id,'member') on conflict(group_id,user_id) do nothing; result_status:='approved'; else result_status:='declined'; end if;
 update public.community_group_join_requests set status=result_status,responded_at=now() where id=request_row.id;
 insert into public.notifications(user_id,actor_id,type,group_id,group_join_request_id)
 values(request_row.requester_id,caller,'group_join_request_result',request_row.group_id,request_row.id);
 return result_status;
end;$function$;
revoke execute on function public.respond_community_group_join_request(uuid,boolean) from public,anon;
grant execute on function public.respond_community_group_join_request(uuid,boolean) to authenticated;
