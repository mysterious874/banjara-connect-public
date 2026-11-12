-- Let an uploader verify and clean up their own chat-media object before
-- the message row is inserted. Chat uploads intentionally happen first so the
-- Realtime stream never receives an empty placeholder message.

drop policy if exists banjara_chat_media_select_member on storage.objects;
create policy banjara_chat_media_select_member
on storage.objects
for select
to authenticated
using (
  bucket_id = 'banjara-chat-media'
  and (
    (storage.foldername(name))[1] = ((select auth.uid())::text)
    or exists (
      select 1
      from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id
      where m.id::text = (storage.foldername(objects.name))[3]
        and m.conversation_id::text = (storage.foldername(objects.name))[2]
        and cm.user_id = (select auth.uid())
    )
  )
);

drop policy if exists banjara_chat_media_delete_own on storage.objects;
create policy banjara_chat_media_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'banjara-chat-media'
  and (storage.foldername(name))[1] = ((select auth.uid())::text)
  and (
    not exists (
      select 1
      from public.messages m
      where m.id::text = (storage.foldername(objects.name))[3]
    )
    or exists (
      select 1
      from public.messages m
      where m.id::text = (storage.foldername(objects.name))[3]
        and m.sender_id = (select auth.uid())
    )
  )
);
