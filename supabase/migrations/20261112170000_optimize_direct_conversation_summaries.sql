create index if not exists messages_unread_conversation_sender_idx
  on public.messages (conversation_id, sender_id, created_at desc)
  where is_deleted_for_everyone = false;

create or replace function public.get_direct_conversation_summaries()
returns table (
  conversation_id uuid,
  peer_id uuid,
  last_message jsonb,
  unread_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select
    mine.conversation_id,
    peer.user_id as peer_id,
    latest.payload as last_message,
    coalesce(unread.total, 0)::bigint as unread_count
  from public.conversation_members mine
  join public.conversation_members peer
    on peer.conversation_id = mine.conversation_id
   and peer.user_id <> (select auth.uid())
  left join lateral (
    select jsonb_build_object(
      'id', m.id,
      'conversation_id', m.conversation_id,
      'sender_id', m.sender_id,
      'content', m.content,
      'media_url', m.media_url,
      'media_type', m.media_type,
      'is_deleted_for_everyone', m.is_deleted_for_everyone,
      'created_at', m.created_at,
      'updated_at', m.updated_at
    ) as payload
    from public.messages m
    where m.conversation_id = mine.conversation_id
      and m.is_deleted_for_everyone = false
    order by m.created_at desc, m.id desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*)::bigint as total
    from public.messages m
    where m.conversation_id = mine.conversation_id
      and m.sender_id <> (select auth.uid())
      and m.is_deleted_for_everyone = false
      and not exists (
        select 1
        from public.message_reads mr
        where mr.message_id = m.id
          and mr.user_id = (select auth.uid())
      )
  ) unread on true
  where mine.user_id = (select auth.uid())
  order by (latest.payload ->> 'created_at') desc nulls last;
$function$;

revoke all on function public.get_direct_conversation_summaries() from public;
revoke all on function public.get_direct_conversation_summaries() from anon;
grant execute on function public.get_direct_conversation_summaries() to authenticated;
