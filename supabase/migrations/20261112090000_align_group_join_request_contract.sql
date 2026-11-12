drop policy if exists "join requests visible to participants" on public.community_group_join_requests;
create policy "join requests visible to participants" on public.community_group_join_requests
  for select to authenticated
  using (
    (select auth.uid()) = requester_id
    or (select auth.uid()) = recipient_id
    or exists (
      select 1
      from public.community_group_members admin_member
      where admin_member.group_id = community_group_join_requests.group_id
        and admin_member.user_id = (select auth.uid())
        and admin_member.role = 'admin'
    )
  );

create or replace function public.request_community_group_join(p_group_id uuid, p_recipient_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  caller uuid := auth.uid();
  request_id uuid;
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;
  if p_recipient_id is null or p_recipient_id = caller then
    raise exception 'This group does not have a valid admin.';
  end if;
  if not exists (select 1 from public.community_groups where id = p_group_id) then
    raise exception 'Community group not found.';
  end if;
  if exists (
    select 1 from public.community_group_members
    where group_id = p_group_id and user_id = caller
  ) then
    raise exception 'You are already a member of this community.';
  end if;
  if not exists (
    select 1 from public.community_group_members
    where group_id = p_group_id and user_id = p_recipient_id and role = 'admin'
  ) then
    raise exception 'Community admin not found.';
  end if;

  insert into public.community_group_join_requests(group_id, requester_id, recipient_id, status)
  values (p_group_id, caller, p_recipient_id, 'pending')
  on conflict (group_id, requester_id, recipient_id) where status = 'pending'
  do nothing
  returning id into request_id;

  if request_id is null then
    select id into request_id
    from public.community_group_join_requests
    where group_id = p_group_id
      and requester_id = caller
      and recipient_id = p_recipient_id
      and status = 'pending';
    if request_id is null then
      raise exception 'Could not load the pending community request.';
    end if;
  else
    insert into public.notifications(user_id, actor_id, type, group_id, group_join_request_id)
    values (p_recipient_id, caller, 'group_join_request', p_group_id, request_id);
  end if;

  return request_id;
end;
$function$;

create or replace function public.request_community_group_join(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  caller uuid := auth.uid();
  admin_id uuid;
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;

  select member.user_id into admin_id
  from public.community_group_members member
  where member.group_id = p_group_id and member.role = 'admin'
  order by member.joined_at asc, member.user_id asc
  limit 1;

  if admin_id is null then
    raise exception 'Community admin not found.';
  end if;

  return public.request_community_group_join(p_group_id, admin_id);
end;
$function$;

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
  approval_request_id text := current_setting('banjara.group_join_request_id', true);
begin
  if actor_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if approval_request_id is not null and exists (
      select 1
      from public.community_group_join_requests request_row
      where request_row.id::text = approval_request_id
        and request_row.group_id = new.group_id
        and request_row.requester_id = new.user_id
    ) then
      return new;
    end if;
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

create or replace function public.respond_community_group_join_request(p_request_id uuid, p_approve boolean)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  caller uuid := auth.uid();
  request_row public.community_group_join_requests%rowtype;
  result_status text;
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;

  select * into request_row
  from public.community_group_join_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'Join request not found.';
  end if;
  if not exists (
    select 1 from public.community_group_members
    where group_id = request_row.group_id and user_id = caller and role = 'admin'
  ) then
    raise exception 'Only a community admin can respond to join requests.';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'This request has already been handled.';
  end if;

  if p_approve then
    perform set_config('banjara.group_join_request_id', request_row.id::text, true);
    insert into public.community_group_members(group_id, user_id, role)
    values (request_row.group_id, request_row.requester_id, 'member')
    on conflict (group_id, user_id) do nothing;
    perform set_config('banjara.group_join_request_id', '', true);
    result_status := 'approved';
  else
    result_status := 'declined';
  end if;

  update public.community_group_join_requests
  set status = result_status, responded_at = now()
  where id = request_row.id;
  insert into public.notifications(user_id, actor_id, type, group_id, group_join_request_id)
  values (request_row.requester_id, caller, 'group_join_request_result', request_row.group_id, request_row.id);

  return result_status;
end;
$function$;

revoke execute on function public.request_community_group_join(uuid) from public, anon;
revoke execute on function public.request_community_group_join(uuid, uuid) from public, anon;
revoke execute on function public.respond_community_group_join_request(uuid, boolean) from public, anon;
grant execute on function public.request_community_group_join(uuid) to authenticated;
grant execute on function public.request_community_group_join(uuid, uuid) to authenticated;
grant execute on function public.respond_community_group_join_request(uuid, boolean) to authenticated;
