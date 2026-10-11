-- Banjara Connect voice/video call sessions and private realtime signaling.
-- Safe additive migration: does not modify existing chat, group, or auth tables.

create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete cascade,
  group_id uuid references public.community_groups(id) on delete cascade,
  call_type text not null check (call_type in ('voice', 'video')),
  status text not null default 'ringing'
    check (status in ('ringing', 'active', 'rejected', 'ended', 'missed')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  constraint call_sessions_exactly_one_target check (
    (recipient_id is not null and group_id is null and recipient_id <> caller_id)
    or
    (recipient_id is null and group_id is not null)
  )
);

create index if not exists call_sessions_recipient_status_created_idx
  on public.call_sessions (recipient_id, status, created_at desc)
  where recipient_id is not null;

create index if not exists call_sessions_group_status_created_idx
  on public.call_sessions (group_id, status, created_at desc)
  where group_id is not null;

alter table public.call_sessions enable row level security;

drop policy if exists "call sessions readable by participants" on public.call_sessions;
create policy "call sessions readable by participants"
on public.call_sessions for select to authenticated
using (
  caller_id = (select auth.uid())
  or recipient_id = (select auth.uid())
  or (
    group_id is not null and exists (
      select 1 from public.community_group_members m
      where m.group_id = call_sessions.group_id and m.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "members can start calls" on public.call_sessions;
create policy "members can start calls"
on public.call_sessions for insert to authenticated
with check (
  caller_id = (select auth.uid())
  and status = 'ringing'
  and answered_at is null
  and ended_at is null
  and (
    (recipient_id is not null and group_id is null)
    or
    (recipient_id is null and group_id is not null and exists (
      select 1 from public.community_group_members m
      where m.group_id = call_sessions.group_id and m.user_id = (select auth.uid())
    ))
  )
);

drop policy if exists "participants can update calls" on public.call_sessions;
create policy "participants can update calls"
on public.call_sessions for update to authenticated
using (
  caller_id = (select auth.uid())
  or recipient_id = (select auth.uid())
  or (
    group_id is not null and exists (
      select 1 from public.community_group_members m
      where m.group_id = call_sessions.group_id and m.user_id = (select auth.uid())
    )
  )
)
with check (
  caller_id = (select auth.uid())
  or recipient_id = (select auth.uid())
  or (
    group_id is not null and exists (
      select 1 from public.community_group_members m
      where m.group_id = call_sessions.group_id and m.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "call creators can delete ringing calls" on public.call_sessions;
create policy "call creators can delete ringing calls"
on public.call_sessions for delete to authenticated
using (caller_id = (select auth.uid()) and status = 'ringing');

-- Private Supabase Realtime topics are named call:<call-session-uuid>.
-- Only users allowed to see the corresponding call session may exchange SDP/ICE.
drop policy if exists "call participants can receive signaling" on realtime.messages;
create policy "call participants can receive signaling"
on realtime.messages for select to authenticated
using (
  realtime.topic() like 'call:%'
  and exists (
    select 1 from public.call_sessions cs
    where cs.id::text = split_part(realtime.topic(), ':', 2)
      and (
        cs.caller_id = (select auth.uid())
        or cs.recipient_id = (select auth.uid())
        or (
          cs.group_id is not null and exists (
            select 1 from public.community_group_members m
            where m.group_id = cs.group_id and m.user_id = (select auth.uid())
          )
        )
      )
  )
);

drop policy if exists "call participants can send signaling" on realtime.messages;
create policy "call participants can send signaling"
on realtime.messages for insert to authenticated
with check (
  realtime.topic() like 'call:%'
  and exists (
    select 1 from public.call_sessions cs
    where cs.id::text = split_part(realtime.topic(), ':', 2)
      and (
        cs.caller_id = (select auth.uid())
        or cs.recipient_id = (select auth.uid())
        or (
          cs.group_id is not null and exists (
            select 1 from public.community_group_members m
            where m.group_id = cs.group_id and m.user_id = (select auth.uid())
          )
        )
      )
  )
);
