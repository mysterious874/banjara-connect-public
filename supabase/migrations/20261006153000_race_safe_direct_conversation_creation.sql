-- Serialize direct-conversation creation per user pair so concurrent devices
-- cannot create duplicate two-person conversations.
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

  select cm1.conversation_id into v_conversation_id
  from public.conversation_members cm1
  join public.conversation_members cm2 on cm2.conversation_id = cm1.conversation_id
  where cm1.user_id = v_user_id and cm2.user_id = p_target_user_id
    and (select count(*) from public.conversation_members cm3 where cm3.conversation_id = cm1.conversation_id) = 2
  limit 1;

  if v_conversation_id is not null then return v_conversation_id; end if;

  insert into public.conversations(created_by) values (v_user_id) returning id into v_conversation_id;
  insert into public.conversation_members(conversation_id,user_id)
  values (v_conversation_id,v_user_id),(v_conversation_id,p_target_user_id);
  return v_conversation_id;
end;
$function$;

revoke all on function public.get_or_create_direct_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;