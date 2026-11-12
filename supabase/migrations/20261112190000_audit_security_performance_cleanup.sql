-- Audit remediation: tighten public RPC exposure and remove redundant RLS work.
-- Safe additive/index-only changes; does not modify user data.

-- This overload contains its own auth.uid() guard, but PUBLIC inherited EXECUTE
-- unnecessarily exposes it to anonymous callers. Signed-in app users retain access.
revoke execute on function public.request_community_group_join(uuid) from public, anon;

-- Cover foreign keys identified by the live Supabase Performance Advisor.
create index if not exists call_sessions_caller_id_idx
  on public.call_sessions (caller_id);
create index if not exists post_shares_shared_by_idx
  on public.post_shares (shared_by);
create index if not exists story_views_viewer_id_idx
  on public.story_views (viewer_id);

-- Remove duplicate UPDATE policy; keep the equivalent policy that already
-- wraps auth.uid() in a scalar SELECT for one-time evaluation.
drop policy if exists "Users can update own notifications" on public.notifications;

-- Avoid per-row auth.uid() evaluation in push subscription policies.
alter policy "Users can read own push subscriptions"
  on public.push_subscriptions
  using (user_id = (select auth.uid()));

alter policy "Users can insert own push subscriptions"
  on public.push_subscriptions
  with check (user_id = (select auth.uid()));

alter policy "Users can update own push subscriptions"
  on public.push_subscriptions
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "Users can delete own push subscriptions"
  on public.push_subscriptions
  using (user_id = (select auth.uid()));

-- Wrap the caller check while preserving the existing visible-post condition.
alter policy post_shares_insert_visible
  on public.post_shares
  with check (
    shared_by = (select auth.uid())
    and exists (
      select 1 from public.posts
      where posts.id = post_shares.post_id
    )
  );
