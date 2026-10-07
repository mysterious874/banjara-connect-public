-- WhatsApp-style per-user hiding and sender/admin delete-for-everyone for community messages.
alter table public.community_group_messages add column if not exists is_deleted_for_everyone boolean not null default false;
alter table public.community_group_messages drop constraint if exists community_group_messages_content_check;
alter table public.community_group_messages add constraint community_group_messages_content_check check ((char_length(trim(content)) between 1 and 4000) or (media_url is not null);
create table if not exists public.community_group_message_deletions (
  message_id uuid not null references public.community_group_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  primary key(message_id,user_id)
);
alter table public.community_group_message_deletions enable row level security;
create index if not exists community_group_message_deletions_user_idx on public.community_group_message_deletions(user_id);
grant select,insert on public.community_group_message_deletions to authenticated;
create policy "users manage their group message deletions" on public.community_group_message_deletions for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create or replace function public.delete_community_group_message_for_me(p_message_id uuid)
returns void language plpgsql security definer set search_path=public as $function$
declare caller uuid:=auth.uid(); v_group_id uuid;
begin
 if caller is null then raise exception 'Authentication required'; end if;
 select group_id into v_group_id from public.community_group_messages where id=p_message_id;
 if v_group_id is null then raise exception 'Message not found.'; end if;
 if not exists(select 1 from public.community_group_members where group_id=v_group_id and user_id=caller) then raise exception 'You are not a member of this community.'; end if;
 insert into public.community_group_message_deletions(message_id,user_id) values(p_message_id,caller) on conflict do nothing;
end;$function$;
create or replace function public.delete_community_group_message_for_everyone(p_message_id uuid)
returns text language plpgsql security definer set search_path=public as $function$
declare caller uuid:=auth.uid(); row_data record; old_media text;
begin
 if caller is null then raise exception 'Authentication required'; end if;
 select m.group_id,m.sender_id,m.media_url into row_data from public.community_group_messages m where m.id=p_message_id for update;
 if not found then raise exception 'Message not found.'; end if;
 if row_data.sender_id<>caller and not public.is_community_group_admin(row_data.group_id,caller) then raise exception 'Only the sender or a group admin can delete this message for everyone.'; end if;
 old_media:=row_data.media_url;
 update public.community_group_messages set is_deleted_for_everyone=true,content='Message deleted',media_url=null,media_type=null,updated_at=now() where id=p_message_id;
 return old_media;
end;$function$;
revoke execute on function public.delete_community_group_message_for_me(uuid) from public,anon;
grant execute on function public.delete_community_group_message_for_me(uuid) to authenticated;
revoke execute on function public.delete_community_group_message_for_everyone(uuid) from public,anon;
grant execute on function public.delete_community_group_message_for_everyone(uuid) to authenticated;
