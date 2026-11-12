create table if not exists public.post_shares (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  shared_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists post_shares_post_id_idx on public.post_shares(post_id);

alter table public.post_shares enable row level security;
revoke all on table public.post_shares from public, anon, authenticated;
grant select (post_id) on table public.post_shares to authenticated;
grant insert (post_id, shared_by) on table public.post_shares to authenticated;

drop policy if exists post_shares_select_visible on public.post_shares;
create policy post_shares_select_visible
  on public.post_shares
  for select
  to authenticated
  using (exists (
    select 1
    from public.posts
    where public.posts.id = post_shares.post_id
  ));

drop policy if exists post_shares_insert_visible on public.post_shares;
create policy post_shares_insert_visible
  on public.post_shares
  for insert
  to authenticated
  with check (
    shared_by = auth.uid()
    and exists (
      select 1
      from public.posts
      where public.posts.id = post_shares.post_id
    )
  );

create or replace function public.get_post_share_counts(p_post_ids uuid[])
returns table (post_id uuid, share_count bigint)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $function$
  select requested.post_id, count(post_shares.post_id) as share_count
  from (
    select distinct unnest(coalesce(p_post_ids, '{}'::uuid[])) as post_id
  ) as requested
  left join public.post_shares on public.post_shares.post_id = requested.post_id
  group by requested.post_id;
$function$;

revoke all on function public.get_post_share_counts(uuid[]) from public, anon;
grant execute on function public.get_post_share_counts(uuid[]) to authenticated;
