create or replace function private.is_messaging_allowed(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members own_member
    where own_member.conversation_id = p_conversation_id
      and own_member.user_id = p_user_id
  )
  and not exists (
    select 1
    from public.conversation_members peer_member
    join public.blocks b
      on (
        (b.blocker_id = p_user_id and b.blocked_id = peer_member.user_id)
        or
        (b.blocker_id = peer_member.user_id and b.blocked_id = p_user_id)
      )
    where peer_member.conversation_id = p_conversation_id
      and peer_member.user_id <> p_user_id
  );
$$;

revoke execute on function private.is_messaging_allowed(uuid, uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_messaging_allowed(uuid, uuid) to authenticated;

drop policy if exists conversations_select_member on public.conversations;
create policy conversations_select_member on public.conversations
  as permissive for select to authenticated
  using ((select private.is_messaging_allowed(id, (select auth.uid()))));

drop policy if exists conversation_members_select_own on public.conversation_members;
create policy conversation_members_select_own on public.conversation_members
  as permissive for select to authenticated
  using (
    ((user_id = (select auth.uid())) or (conversation_id in (select private.user_conversation_ids())))
    and (select private.is_messaging_allowed(conversation_id, (select auth.uid())))
  );

drop policy if exists messages_select_member on public.messages;
create policy messages_select_member on public.messages
  as permissive for select to authenticated
  using ((select private.is_messaging_allowed(conversation_id, (select auth.uid()))));

drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages
  as permissive for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select private.is_messaging_allowed(conversation_id, (select auth.uid())))
  );

drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages
  as permissive for update to authenticated
  using (
    sender_id = (select auth.uid())
    and (select private.is_messaging_allowed(conversation_id, (select auth.uid())))
  )
  with check (
    sender_id = (select auth.uid())
    and (select private.is_messaging_allowed(conversation_id, (select auth.uid())))
  );

drop policy if exists messages_delete_own on public.messages;
create policy messages_delete_own on public.messages
  as permissive for delete to authenticated
  using (
    sender_id = (select auth.uid())
    and (select private.is_messaging_allowed(conversation_id, (select auth.uid())))
  );

drop policy if exists message_reads_insert_own on public.message_reads;
create policy message_reads_insert_own on public.message_reads
  as permissive for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_messaging_allowed(
      (select m.conversation_id from public.messages m where m.id = message_reads.message_id),
      (select auth.uid())
    ))
  );

drop policy if exists message_reads_select_own on public.message_reads;
create policy message_reads_select_own on public.message_reads
  as permissive for select to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_messaging_allowed(
      (select m.conversation_id from public.messages m where m.id = message_reads.message_id),
      (select auth.uid())
    ))
  );

drop policy if exists message_reads_update_own on public.message_reads;
create policy message_reads_update_own on public.message_reads
  as permissive for update to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_messaging_allowed(
      (select m.conversation_id from public.messages m where m.id = message_reads.message_id),
      (select auth.uid())
    ))
  )
  with check (
    user_id = (select auth.uid())
    and (select private.is_messaging_allowed(
      (select m.conversation_id from public.messages m where m.id = message_reads.message_id),
      (select auth.uid())
    ))
  );