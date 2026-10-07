-- Community group username-based join requests with notification approval flow.
create table if not exists public.community_group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.community_groups(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> recipient_id)
);
create unique index if not exists community_group_join_requests_pending_key on public.community_group_join_requests(group_id, requester_id, recipient_id) where status='pending';
create index if not exists community_group_join_requests_recipient_idx on public.community_group_join_requests(recipient_id,status,created_at desc);
create index if not exists community_group_join_requests_requester_idx on public.community_group_join_requests(requester_id,created_at desc);
alter table public.community_group_join_requests enable row level security;
alter table public.notifications add column if not exists group_join_request_id uuid references public.community_group_join_requests(id) on delete cascade;
create index if not exists notifications_group_join_request_idx on public.notifications(group_join_request_id);
grant select on public.community_group_join_requests to authenticated;
drop policy if exists "join requests visible to participants" on public.community_group_join_requests;
create policy "join requests visible to participants" on public.community_group_join_requests for select to authenticated using ((select auth.uid())=requester_id or (select auth.uid())=recipient_id);

create or replace function public.request_community_group_join(p_group_id uuid,p_recipient_id uuid)
returns uuid language plpgsql security definer set search_path=public as $function$
declare caller uuid:=auth.uid(); request_id uuid;
begin
 if caller is null then raise exception 'Authentication required'; end if;
 if p_recipient_id is null or p_recipient_id=caller then raise exception 'Choose another user.'; end if;
 if not exists(select 1 from public.community_group_members where group_id=p_group_id and user_id=caller) then raise exception 'Only group members can invite users.'; end if;
 if not exists(select 1 from public.profiles where id=p_recipient_id) then raise exception 'User not found.'; end if;
 if exists(select 1 from public.community_group_members where group_id=p_group_id and user_id=p_recipient_id) then raise exception 'This user is already a member.'; end if;
 insert into public.community_group_join_requests(group_id,requester_id,recipient_id) values(p_group_id,caller,p_recipient_id)
 on conflict(group_id,requester_id,p_recipient_id) where status='pending' do update set created_at=now()
 returning id into request_id;
 insert into public.notifications(user_id,actor_id,type,group_id,group_join_request_id) values(p_recipient_id,caller,'group_join_request',p_group_id,request_id);
 return request_id;
end;$function$;
create or replace function public.respond_community_group_join_request(p_request_id uuid,p_approve boolean)
returns text language plpgsql security definer set search_path=public as $function$
declare caller uuid:=auth.uid(); request_row public.community_group_join_requests%rowtype; result_status text;
begin
 if caller is null then raise exception 'Authentication required'; end if;
 select * into request_row from public.community_group_join_requests where id=p_request_id for update;
 if not found then raise exception 'Join request not found.'; end if;
 if request_row.recipient_id<>caller then raise exception 'You cannot respond to this request.'; end if;
 if request_row.status<>'pending' then raise exception 'This request has already been handled.'; end if;
 if p_approve then insert into public.community_group_members(group_id,user_id,role) values(request_row.group_id,caller,'member') on conflict(group_id,user_id) do nothing; result_status:='approved'; else result_status:='declined'; end if;
 update public.community_group_join_requests set status=result_status,responded_at=now() where id=request_row.id;
 insert into public.notifications(user_id,actor_id,type,group_id) values(request_row.requester_id,caller,'group_join_request_result',request_row.group_id);
 return result_status;
end;$function$;
revoke execute on function public.request_community_group_join(uuid,uuid) from public,anon;
grant execute on function public.request_community_group_join(uuid,uuid) to authenticated;
revoke execute on function public.respond_community_group_join_request(uuid,boolean) from public,anon;
grant execute on function public.respond_community_group_join_request(uuid,boolean) to authenticated;
