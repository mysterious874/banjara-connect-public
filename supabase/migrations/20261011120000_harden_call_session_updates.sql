-- Enforce immutable call participants and valid status transitions at the database layer.
-- This complements RLS because row policies alone do not limit which columns a participant may update.

create or replace function public.guard_call_session_updates()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.caller_id is distinct from old.caller_id
     or new.recipient_id is distinct from old.recipient_id
     or new.group_id is distinct from old.group_id
     or new.call_type is distinct from old.call_type
     or new.created_at is distinct from old.created_at then
    raise exception 'Call participants and call type cannot be changed';
  end if;

  if old.status in ('rejected', 'ended', 'missed') then
    raise exception 'This call has already finished';
  end if;

  if old.status = 'ringing' and new.status not in ('active', 'rejected', 'ended', 'missed') then
    raise exception 'Invalid call status transition';
  end if;

  if old.status = 'active' and new.status <> 'ended' then
    raise exception 'An active call can only be ended';
  end if;

  if new.status = 'active' then
    new.answered_at := coalesce(old.answered_at, now());
    new.ended_at := null;
  elsif new.status in ('rejected', 'ended', 'missed') then
    new.ended_at := coalesce(old.ended_at, now());
  else
    new.answered_at := old.answered_at;
    new.ended_at := old.ended_at;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_call_session_updates on public.call_sessions;
create trigger guard_call_session_updates
before update on public.call_sessions
for each row execute function public.guard_call_session_updates();

-- Avoid two simultaneous ringing/active calls targeting the same direct recipient
-- or community group. Completed calls remain in history.
create unique index if not exists call_sessions_one_live_direct_call_idx
  on public.call_sessions (recipient_id)
  where recipient_id is not null and status in ('ringing', 'active');

create unique index if not exists call_sessions_one_live_group_call_idx
  on public.call_sessions (group_id)
  where group_id is not null and status in ('ringing', 'active');
