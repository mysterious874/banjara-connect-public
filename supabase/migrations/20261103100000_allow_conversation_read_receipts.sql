drop policy if exists message_reads_select_conversation_participant on public.message_reads;
create policy message_reads_select_conversation_participant on public.message_reads
  as permissive for select to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_reads.message_id
        and (select private.is_messaging_allowed(m.conversation_id, (select auth.uid())))
    )
  );
