create table if not exists public.user_privacy_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hide_activity_status boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_privacy_settings enable row level security;

revoke all on table public.user_privacy_settings from public, anon, authenticated;
grant select, insert, update on table public.user_privacy_settings to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_privacy_settings'
      and policyname not in (
        'user_privacy_settings_select_own',
        'user_privacy_settings_insert_own',
        'user_privacy_settings_update_own'
      )
  ) then
    raise exception 'Unexpected policy on public.user_privacy_settings; review it before applying this migration';
  end if;
end
$$;

drop policy if exists user_privacy_settings_select_own on public.user_privacy_settings;
create policy user_privacy_settings_select_own
  on public.user_privacy_settings for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_privacy_settings_insert_own on public.user_privacy_settings;
create policy user_privacy_settings_insert_own
  on public.user_privacy_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists user_privacy_settings_update_own on public.user_privacy_settings;
create policy user_privacy_settings_update_own
  on public.user_privacy_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_privacy_settings'
  ) then
    execute 'alter publication supabase_realtime add table public.user_privacy_settings';
  end if;

  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'The supabase_realtime publication is required for activity privacy synchronization';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'hide_activity_status'
  ) then
    execute $migration$
      insert into public.user_privacy_settings (user_id, hide_activity_status)
      select p.id, coalesce(p.hide_activity_status, false)
      from public.profiles p
      join auth.users u on u.id = p.id
      on conflict (user_id) do nothing
    $migration$;

    alter table public.profiles drop column hide_activity_status;
  end if;
end
$$;
