-- Prevent abandoned ringing calls from permanently occupying the one-live-call indexes.
-- A new invite expires an older ringing invite for the same direct recipient or group.
-- This runs in a SECURITY DEFINER trigger so a new caller can clean up stale rows
-- without being granted access to update another user's call history directly.

create or replace function public.expire_stale_call_invites_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recipient_id is not null then
    update public.call_sessions
       set status = 'missed',
           ended_at = coalesce(ended_at, now())
     where recipient_id = new.recipient_id
       and group_id is null
       and status = 'ringing'
       and created_at < now() - interval '45 seconds';
  elsif new.group_id is not null then
    update public.call_sessions
       set status = 'missed',
           ended_at = coalesce(ended_at, now())
     where group_id = new.group_id
       and status = 'ringing'
       and created_at < now() - interval '45 seconds';
  end if;

  return new;
end;
$$;

drop trigger if exists expire_stale_call_invites_before_insert on public.call_sessions;
create trigger expire_stale_call_invites_before_insert
before insert on public.call_sessions
for each row
execute function public.expire_stale_call_invites_before_insert();

