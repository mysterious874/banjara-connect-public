alter table public.messages
  add column if not exists reply_to_message_id uuid references public.messages(id) on delete set null,
  add column if not exists edited_at timestamptz;

alter table public.community_group_messages
  add column if not exists reply_to_message_id uuid references public.community_group_messages(id) on delete set null,
  add column if not exists edited_at timestamptz;

create or replace function public.validate_direct_message_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.reply_to_message_id is not null and not exists (
    select 1
    from public.messages parent
    where parent.id = new.reply_to_message_id
      and parent.conversation_id = new.conversation_id
      and parent.id <> new.id
  ) then
    raise exception 'Reply target must belong to this conversation.';
  end if;
  return new;
end;
$function$;

drop trigger if exists messages_validate_reply_target on public.messages;
create trigger messages_validate_reply_target
before insert or update of reply_to_message_id, conversation_id on public.messages
for each row execute function public.validate_direct_message_reply();

create or replace function public.validate_group_message_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.reply_to_message_id is not null and not exists (
    select 1
    from public.community_group_messages parent
    where parent.id = new.reply_to_message_id
      and parent.group_id = new.group_id
      and parent.id <> new.id
  ) then
    raise exception 'Reply target must belong to this community.';
  end if;
  return new;
end;
$function$;

drop trigger if exists community_group_messages_validate_reply_target on public.community_group_messages;
create trigger community_group_messages_validate_reply_target
before insert or update of reply_to_message_id, group_id on public.community_group_messages
for each row execute function public.validate_group_message_reply();

create table if not exists public.connect_direct_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','😂','😮','😢','🙏')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create table if not exists public.connect_group_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.community_group_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','😂','😮','😢','🙏')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists connect_direct_message_reactions_message_idx
  on public.connect_direct_message_reactions(message_id);
create index if not exists connect_group_message_reactions_message_idx
  on public.connect_group_message_reactions(message_id);

alter table public.connect_direct_message_reactions enable row level security;
alter table public.connect_group_message_reactions enable row level security;

drop policy if exists connect_direct_message_reactions_read on public.connect_direct_message_reactions;
create policy connect_direct_message_reactions_read on public.connect_direct_message_reactions
  for select to authenticated using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.is_deleted_for_everyone = false
        and (select private.is_messaging_allowed(m.conversation_id, (select auth.uid())))
    )
  );
drop policy if exists connect_direct_message_reactions_insert on public.connect_direct_message_reactions;
create policy connect_direct_message_reactions_insert on public.connect_direct_message_reactions
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.is_deleted_for_everyone = false
        and (select private.is_messaging_allowed(m.conversation_id, (select auth.uid())))
    )
  );
drop policy if exists connect_direct_message_reactions_delete on public.connect_direct_message_reactions;
create policy connect_direct_message_reactions_delete on public.connect_direct_message_reactions
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists connect_group_message_reactions_read on public.connect_group_message_reactions;
create policy connect_group_message_reactions_read on public.connect_group_message_reactions
  for select to authenticated using (
    exists (
      select 1 from public.community_group_messages m
      join public.community_group_members member on member.group_id = m.group_id
      where m.id = message_id and m.is_deleted_for_everyone = false and member.user_id = (select auth.uid())
    )
  );
drop policy if exists connect_group_message_reactions_insert on public.connect_group_message_reactions;
create policy connect_group_message_reactions_insert on public.connect_group_message_reactions
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.community_group_messages m
      join public.community_group_members member on member.group_id = m.group_id
      where m.id = message_id and m.is_deleted_for_everyone = false and member.user_id = (select auth.uid())
    )
  );
drop policy if exists connect_group_message_reactions_delete on public.connect_group_message_reactions;
create policy connect_group_message_reactions_delete on public.connect_group_message_reactions
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, delete on public.connect_direct_message_reactions to authenticated;
grant select, insert, delete on public.connect_group_message_reactions to authenticated;

drop policy if exists connect_group_message_reads_member_select on public.community_group_message_reads;
create policy connect_group_message_reads_member_select on public.community_group_message_reads
  for select to authenticated using (
    exists (
      select 1 from public.community_group_members member
      where member.group_id = community_group_message_reads.group_id
        and member.user_id = (select auth.uid())
    )
  );

create table if not exists public.connect_direct_message_pins (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create table if not exists public.connect_group_message_pins (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.community_group_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

alter table public.connect_direct_message_pins enable row level security;
alter table public.connect_group_message_pins enable row level security;

drop policy if exists connect_direct_message_pins_manage_own on public.connect_direct_message_pins;
create policy connect_direct_message_pins_manage_own on public.connect_direct_message_pins
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.is_deleted_for_everyone = false
        and (select private.is_messaging_allowed(m.conversation_id, (select auth.uid())))
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.is_deleted_for_everyone = false
        and (select private.is_messaging_allowed(m.conversation_id, (select auth.uid())))
    )
  );

drop policy if exists connect_group_message_pins_manage_own on public.connect_group_message_pins;
create policy connect_group_message_pins_manage_own on public.connect_group_message_pins
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.community_group_messages m
      join public.community_group_members member on member.group_id = m.group_id
      where m.id = message_id and m.is_deleted_for_everyone = false and member.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.community_group_messages m
      join public.community_group_members member on member.group_id = m.group_id
      where m.id = message_id and m.is_deleted_for_everyone = false and member.user_id = (select auth.uid())
    )
  );

grant select, insert, delete on public.connect_direct_message_pins to authenticated;
grant select, insert, delete on public.connect_group_message_pins to authenticated;

create table if not exists public.connect_direct_chat_typing (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.connect_group_chat_typing (
  group_id uuid not null references public.community_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.connect_direct_chat_typing enable row level security;
alter table public.connect_group_chat_typing enable row level security;

drop policy if exists connect_direct_chat_typing_member_access on public.connect_direct_chat_typing;
drop policy if exists connect_direct_chat_typing_read on public.connect_direct_chat_typing;
create policy connect_direct_chat_typing_read on public.connect_direct_chat_typing
  for select to authenticated
  using (
    (select private.is_messaging_allowed(conversation_id, (select auth.uid())))
    and exists (
      select 1 from public.conversation_members member
      where member.conversation_id = connect_direct_chat_typing.conversation_id
        and member.user_id = (select auth.uid())
    )
  );
drop policy if exists connect_direct_chat_typing_insert_own on public.connect_direct_chat_typing;
create policy connect_direct_chat_typing_insert_own on public.connect_direct_chat_typing
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (select private.is_messaging_allowed(conversation_id, (select auth.uid())))
    and exists (
      select 1 from public.conversation_members member
      where member.conversation_id = connect_direct_chat_typing.conversation_id
        and member.user_id = (select auth.uid())
    )
  );
drop policy if exists connect_direct_chat_typing_update_own on public.connect_direct_chat_typing;
create policy connect_direct_chat_typing_update_own on public.connect_direct_chat_typing
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (select private.is_messaging_allowed(conversation_id, (select auth.uid())))
  );
drop policy if exists connect_direct_chat_typing_delete_own on public.connect_direct_chat_typing;
create policy connect_direct_chat_typing_delete_own on public.connect_direct_chat_typing
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists connect_group_chat_typing_member_access on public.connect_group_chat_typing;
drop policy if exists connect_group_chat_typing_read on public.connect_group_chat_typing;
create policy connect_group_chat_typing_read on public.connect_group_chat_typing
  for select to authenticated
  using (
    exists (
      select 1 from public.community_group_members member
      where member.group_id = connect_group_chat_typing.group_id
        and member.user_id = (select auth.uid())
    )
  );
drop policy if exists connect_group_chat_typing_insert_own on public.connect_group_chat_typing;
create policy connect_group_chat_typing_insert_own on public.connect_group_chat_typing
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.community_group_members member
      where member.group_id = connect_group_chat_typing.group_id
        and member.user_id = (select auth.uid())
    )
  );
drop policy if exists connect_group_chat_typing_update_own on public.connect_group_chat_typing;
create policy connect_group_chat_typing_update_own on public.connect_group_chat_typing
  for update to authenticated using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.community_group_members member
      where member.group_id = connect_group_chat_typing.group_id
        and member.user_id = (select auth.uid())
    )
  );
drop policy if exists connect_group_chat_typing_delete_own on public.connect_group_chat_typing;
create policy connect_group_chat_typing_delete_own on public.connect_group_chat_typing
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.connect_direct_chat_typing to authenticated;
grant select, insert, update, delete on public.connect_group_chat_typing to authenticated;

create or replace function public.set_direct_chat_typing(p_conversation_id uuid, p_typing boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller uuid := auth.uid();
begin
  if caller is null or not (select private.is_messaging_allowed(p_conversation_id, caller)) then
    raise exception 'Messaging is unavailable for this conversation.';
  end if;
  delete from public.connect_direct_chat_typing where updated_at < now() - interval '1 day';
  if p_typing then
    insert into public.connect_direct_chat_typing(conversation_id, user_id, updated_at)
    values (p_conversation_id, caller, now())
    on conflict (conversation_id, user_id) do update set updated_at = excluded.updated_at;
  else
    delete from public.connect_direct_chat_typing
    where conversation_id = p_conversation_id and user_id = caller;
  end if;
end;
$function$;
revoke execute on function public.set_direct_chat_typing(uuid, boolean) from public, anon;
grant execute on function public.set_direct_chat_typing(uuid, boolean) to authenticated;

create or replace function public.set_group_chat_typing(p_group_id uuid, p_typing boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller uuid := auth.uid();
begin
  if caller is null or not exists (
    select 1 from public.community_group_members member
    where member.group_id = p_group_id and member.user_id = caller
  ) then
    raise exception 'You are not a member of this community.';
  end if;
  delete from public.connect_group_chat_typing where updated_at < now() - interval '1 day';
  if p_typing then
    insert into public.connect_group_chat_typing(group_id, user_id, updated_at)
    values (p_group_id, caller, now())
    on conflict (group_id, user_id) do update set updated_at = excluded.updated_at;
  else
    delete from public.connect_group_chat_typing
    where group_id = p_group_id and user_id = caller;
  end if;
end;
$function$;
revoke execute on function public.set_group_chat_typing(uuid, boolean) from public, anon;
grant execute on function public.set_group_chat_typing(uuid, boolean) to authenticated;

do $publication$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'connect_direct_chat_typing'
    ) then
      execute 'alter publication supabase_realtime add table public.connect_direct_chat_typing';
    end if;
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'connect_group_chat_typing'
    ) then
      execute 'alter publication supabase_realtime add table public.connect_group_chat_typing';
    end if;
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'connect_direct_message_reactions'
    ) then
      execute 'alter publication supabase_realtime add table public.connect_direct_message_reactions';
    end if;
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'connect_group_message_reactions'
    ) then
      execute 'alter publication supabase_realtime add table public.connect_group_message_reactions';
    end if;
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'community_group_message_reads'
    ) then
      execute 'alter publication supabase_realtime add table public.community_group_message_reads';
    end if;
  end if;
end;
$publication$;

create or replace function public.edit_direct_message(p_message_id uuid, p_content text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller uuid := auth.uid();
  updated_message public.messages%rowtype;
  normalized_content text := trim(coalesce(p_content, ''));
begin
  if caller is null then raise exception 'Authentication required.'; end if;
  if char_length(normalized_content) < 1 or char_length(normalized_content) > 4000 then
    raise exception 'Message text must be between 1 and 4000 characters.';
  end if;
  update public.messages
  set content = normalized_content, edited_at = now(), updated_at = now()
  where id = p_message_id
    and sender_id = caller
    and is_deleted_for_everyone = false
    and (select private.is_messaging_allowed(conversation_id, caller))
  returning * into updated_message;
  if not found then raise exception 'This message can no longer be edited.'; end if;
  return updated_message;
end;
$function$;
revoke execute on function public.edit_direct_message(uuid, text) from public, anon;
grant execute on function public.edit_direct_message(uuid, text) to authenticated;

create or replace function public.edit_community_group_message(p_message_id uuid, p_content text)
returns public.community_group_messages
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller uuid := auth.uid();
  updated_message public.community_group_messages%rowtype;
  normalized_content text := trim(coalesce(p_content, ''));
begin
  if caller is null then raise exception 'Authentication required.'; end if;
  if char_length(normalized_content) < 1 or char_length(normalized_content) > 4000 then
    raise exception 'Message text must be between 1 and 4000 characters.';
  end if;
  update public.community_group_messages message
  set content = normalized_content, edited_at = now(), updated_at = now()
  where message.id = p_message_id
    and message.sender_id = caller
    and message.is_deleted_for_everyone = false
    and exists (
      select 1 from public.community_group_members member
      where member.group_id = message.group_id and member.user_id = caller
    )
  returning message.* into updated_message;
  if not found then raise exception 'This message can no longer be edited.'; end if;
  return updated_message;
end;
$function$;
revoke execute on function public.edit_community_group_message(uuid, text) from public, anon;
grant execute on function public.edit_community_group_message(uuid, text) to authenticated;
