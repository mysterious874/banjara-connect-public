create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create index if not exists story_views_story_id_viewed_at_idx
  on public.story_views (story_id, viewed_at desc);

alter table public.story_views enable row level security;

drop policy if exists "story_views_insert_own" on public.story_views;
drop policy if exists "story_views_select_owner_or_self" on public.story_views;

create policy "story_views_insert_own"
  on public.story_views
  for insert to authenticated
  with check ((select auth.uid()) = viewer_id);

create policy "story_views_select_owner_or_self"
  on public.story_views
  for select to authenticated
  using (
    (select auth.uid()) = viewer_id
    or exists (
      select 1
      from public.stories s
      where s.id = story_views.story_id
        and s.user_id = (select auth.uid())
    )
  );
