-- AI moderation reviews are private triage recommendations for human moderators.
-- The worker is deployed separately and remains disabled until AI_MODERATION_ENABLED=true.
create table if not exists public.ai_moderation_reviews (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.reports(id) on delete cascade,
  recommendation text not null check (recommendation in ('no_action', 'review', 'urgent_review')),
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  summary text not null check (char_length(summary) <= 600),
  signals jsonb not null default '[]'::jsonb,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_moderation_reviews_risk_created_idx
  on public.ai_moderation_reviews (risk_level, created_at desc);

alter table public.ai_moderation_reviews enable row level security;
revoke all on table public.ai_moderation_reviews from anon, authenticated;
grant select on table public.ai_moderation_reviews to authenticated;

drop policy if exists "Admins can read AI moderation reviews" on public.ai_moderation_reviews;
create policy "Admins can read AI moderation reviews"
  on public.ai_moderation_reviews
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_admin = true
    )
  );
