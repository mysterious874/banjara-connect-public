-- Harden group SECURITY DEFINER RPCs and close concurrency gaps in group administration.
-- Also remove anonymous access to the admin-only group reports RPC.

revoke execute on function public.load_community_group_reports(uuid, integer, integer) from public, anon;
grant execute on function public.load_community_group_reports(uuid, integer, integer) to authenticated;

create or replace function public.add_community_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  perform 1 from public.community_groups where id = p_group_id for update;
  if not found then raise exception 'Community not found.'; end if;
  if not exists (
    select 1 from public.community_group_members
    where group_id = p_group_id and user_id = auth.uid()
  ) then
    raise exception 'Only group members can add members.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User not found.';
  end if;
  insert into public.community_group_members(group_id, user_id, role)
  values (p_group_id, p_user_id, 'member')
  on conflict (group_id, user_id) do nothing;
end;
$function$;

create or replace function public.create_community_group(p_name text, p_description text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  group_id uuid;
  normalized_name text := trim(coalesce(p_name,''));
  normalized_description text := trim(coalesce(p_description,''));
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if length(normalized_name) < 2 or length(normalized_name) > 80 then
    raise exception 'Community name must be between 2 and 80 characters.';
  end if;
  if length(normalized_description) > 500 then
    raise exception 'Community description is too long.';
  end if;
  insert into public.community_groups(name, description, created_by)
  values (normalized_name, normalized_description, auth.uid())
  returning id into group_id;
  insert into public.community_group_members(group_id,user_id,role)
  values (group_id, auth.uid(), 'admin');
  return group_id;
end;
$function$;

create or replace function public.delete_community_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  perform 1 from public.community_groups where id = p_group_id for update;
  if not found then raise exception 'Community not found'; end if;
  if not exists (
    select 1 from public.community_groups
    where id = p_group_id and created_by = v_user
  ) and not public.is_community_group_admin(p_group_id, v_user) then
    raise exception 'Only a group admin can delete this community';
  end if;
  delete from public.community_groups where id = p_group_id;
end;
$function$;

create or replace function public.get_or_create_direct_conversation(p_target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
  v_pair_key text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_target_user_id is null or v_user_id = p_target_user_id then raise exception 'You cannot start a conversation with yourself.'; end if;

  if exists (
    select 1 from public.blocks
    where (blocker_id = v_user_id and blocked_id = p_target_user_id)
       or (blocker_id = p_target_user_id and blocked_id = v_user_id)
  ) then
    raise exception 'Messaging is unavailable for this profile.';
  end if;

  v_pair_key := least(v_user_id::text, p_target_user_id::text) || ':' || greatest(v_user_id::text, p_target_user_id::text);
  perform pg_advisory_xact_lock(hashtextextended(v_pair_key, 0));

  -- Re-check after the lock so a block created while waiting cannot be bypassed.
  if exists (
    select 1 from public.blocks
    where (blocker_id = v_user_id and blocked_id = p_target_user_id)
       or (blocker_id = p_target_user_id and blocked_id = v_user_id)
  ) then
    raise exception 'Messaging is unavailable for this profile.';
  end if;

  select cm1.conversation_id into v_conversation_id
  from public.conversation_members cm1
  join public.conversation_members cm2 on cm2.conversation_id = cm1.conversation_id
  where cm1.user_id = v_user_id
    and cm2.user_id = p_target_user_id
    and (select count(*) from public.conversation_members cm3 where cm3.conversation_id = cm1.conversation_id) = 2
  limit 1;

  if v_conversation_id is not null then return v_conversation_id; end if;

  insert into public.conversations(created_by) values (v_user_id)
  returning id into v_conversation_id;
  insert into public.conversation_members(conversation_id,user_id)
  values (v_conversation_id,v_user_id),(v_conversation_id,p_target_user_id);
  return v_conversation_id;
end;
$function$;

create or replace function public.leave_community_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  current_role text;
  admin_count integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  perform 1 from public.community_groups where id = p_group_id for update;
  if not found then raise exception 'Community not found'; end if;

  select role into current_role
  from public.community_group_members
  where group_id = p_group_id and user_id = auth.uid();

  if current_role is null then
    raise exception 'You are not a member of this community.';
  end if;

  if current_role = 'admin' then
    select count(*) into admin_count
    from public.community_group_members
    where group_id = p_group_id and role = 'admin';
    if admin_count <= 1 then
      raise exception 'Make another member an admin before leaving this community.';
    end if;
  end if;

  delete from public.community_group_members
  where group_id = p_group_id and user_id = auth.uid();
end;
$function$;

create or replace function public.remove_community_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  caller uuid := auth.uid();
  target_role text;
  admin_count integer;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  perform 1 from public.community_groups where id = p_group_id for update;
  if not found then raise exception 'Community not found'; end if;
  if not public.is_community_group_admin(p_group_id, caller) then raise exception 'Only group admins can remove members'; end if;
  if p_user_id = caller then raise exception 'Admins must use leave community to leave'; end if;

  select role into target_role
  from public.community_group_members
  where group_id = p_group_id and user_id = p_user_id;

  if target_role is null then raise exception 'Member not found'; end if;

  if target_role = 'admin' then
    select count(*) into admin_count
    from public.community_group_members
    where group_id = p_group_id and role = 'admin';
    if admin_count <= 1 then raise exception 'The last admin cannot be removed'; end if;
  end if;

  delete from public.community_group_members
  where group_id = p_group_id and user_id = p_user_id;
end;
$function$;

create or replace function public.set_community_group_member_role(p_group_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_role text;
  admin_count integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  perform 1 from public.community_groups where id = p_group_id for update;
  if not found then raise exception 'Community not found'; end if;

  if p_role not in ('admin', 'member') then
    raise exception 'Invalid group role';
  end if;
  if not public.is_community_group_admin(p_group_id, auth.uid()) then
    raise exception 'Only group admins can change member roles';
  end if;
  if not exists (
    select 1 from public.community_group_members
    where group_id = p_group_id and user_id = p_user_id
  ) then
    raise exception 'User is not a member of this group';
  end if;

  select role into target_role
  from public.community_group_members
  where group_id = p_group_id and user_id = p_user_id;

  if target_role = p_role then return; end if;

  if target_role = 'admin' and p_role = 'member' then
    select count(*) into admin_count
    from public.community_group_members
    where group_id = p_group_id and role = 'admin';
    if admin_count <= 1 then raise exception 'Group must have at least one admin'; end if;
  end if;

  update public.community_group_members
  set role = p_role
  where group_id = p_group_id and user_id = p_user_id;
end;
$function$;

revoke execute on function public.add_community_group_member(uuid, uuid) from public, anon;
grant execute on function public.add_community_group_member(uuid, uuid) to authenticated;
revoke execute on function public.create_community_group(text, text) from public, anon;
grant execute on function public.create_community_group(text, text) to authenticated;
revoke execute on function public.delete_community_group(uuid) from public, anon;
grant execute on function public.delete_community_group(uuid) to authenticated;
revoke execute on function public.get_or_create_direct_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
revoke execute on function public.leave_community_group(uuid) from public, anon;
grant execute on function public.leave_community_group(uuid) to authenticated;
revoke execute on function public.remove_community_group_member(uuid, uuid) from public, anon;
grant execute on function public.remove_community_group_member(uuid, uuid) to authenticated;
revoke execute on function public.set_community_group_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_community_group_member_role(uuid, uuid, text) to authenticated;
