# Supabase Performance Advisor — 2026-11-02

Project: `banjara-connect` (`wcviqgxrpsgywpxrymxi`)  
Inspection: read-only Supabase Performance Advisor. No changes applied.

## Findings

### Foreign keys without covering indexes — 2 INFO
- `public.call_sessions.call_sessions_caller_id_fkey`
- `public.story_views.story_views_viewer_id_fkey`

Review actual query patterns and existing composite indexes before adding indexes. Do not add duplicates.

### Auth RLS initialization plan — 5 WARN
Supabase reports repeated per-row auth function evaluation in:
- `push_subscriptions`: SELECT, INSERT, UPDATE, DELETE policies (four policies)
- `notifications`: UPDATE policy

Advisor recommends wrapping auth function calls as scalar subqueries, e.g. `(select auth.uid())`, where semantically equivalent. Validate the exact policy definitions and compare query plans on staging before migration.

### Multiple permissive policies — 1 WARN
- `public.notifications` has multiple permissive UPDATE policies for `authenticated`, including `Users can update own notifications` and `notifications_update_own`.

Inspect whether these policies are redundant and consolidate only if the resulting authorization behavior is exactly preserved.

### Unused indexes — 12 INFO
Advisor currently reports no observed usage for:
- `call_sessions_group_status_created_idx`
- `ai_moderation_reviews_risk_created_idx`
- `comments_parent_id_idx`
- `comments_user_id_idx`
- `community_group_message_reads_last_read_message_id_idx`
- `conversations_created_by_idx`
- `message_deletions_user_id_idx`
- `notifications_actor_id_idx`
- `notifications_message_id_idx`
- `notifications_group_id_idx`
- `notifications_group_message_id_idx`
- `notifications_group_join_request_idx`

Unused does not automatically mean safe to drop. Low traffic, new features, rare admin/report queries, and index statistics resets can explain zero usage. Do not drop these without workload evidence.

## Recommended staging-only remediation

1. Confirm the staging environment and restore point.
2. Export current policy definitions and index definitions.
3. Prepare a reversible migration for auth-initplan policy expressions and the duplicate notifications UPDATE policies.
4. Add missing FK indexes only after checking for equivalent existing indexes and expected query patterns.
5. Re-run advisors and relevant query plans after staging migration.
6. Leave unused indexes in place until workload/retention analysis supports removal.

## Status

- Performance advisor executed: YES
- Findings recorded: YES
- Database changes: NONE
- Staging remediation: NOT STARTED (no verified staging project)
- Production remediation: NOT STARTED
