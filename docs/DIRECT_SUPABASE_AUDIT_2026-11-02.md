# Direct Supabase Verification — Connect

Audit date: 2026-11-02  
Repository baseline: `main` at `8c239061342d1117e25b07ae627063e9e32ba1be`  
Verified Supabase project: `banjara-connect` / `wcviqgxrpsgywpxrymxi`

## Executive result

This was a read-only inspection through the connected Supabase management/database tools. No SQL DDL, data writes, migration, deployment, billing change, project creation, or production modification was performed.

The `wcviqgxrpsgywpxrymxi` project is ACTIVE_HEALTHY and is the project named `banjara-connect`. Its environment role (production vs staging) is still not explicitly labelled in project metadata, so treat it as production until the owner confirms otherwise.

The other accessible project, `yymzfjfkmsrymqhpnfqz`, is also ACTIVE_HEALTHY but has a materially different schema (e.g. `communities`, `chats`, `events`, `admin_users`) and many unrelated functions. It is NOT safe to assume this is a staging copy of Banjara Connect. No staging environment has been verified.

## Live project inventory

- Public tables returned by Supabase: 25.
- Applied migration history entries: 37.
- Deployed Edge Functions: `banjara-ai`, `username-auth`, `send-chat-push`, `livekit-token`, `ai-moderator`.
- Five Storage buckets:
  - `banjara-media`: private, 50 MiB limit
  - `banjara-chat-media`: private, 50 MiB limit
  - `banjara-profile-avatars`: public, 5 MiB limit
  - `banjara-group-media`: private, 50 MiB limit
  - `banjara-stories`: private, 50 MiB limit
- Current `supabase_realtime` publication includes nine public tables:
  `posts`, `comments`, `post_likes`, `messages`, `message_reads`, `notifications`, `community_group_members`, `community_group_messages`, `call_sessions`.

## Confirmed mismatch and release risks

1. `public.user_privacy_settings` is absent from the live public table inventory. It is referenced by the unmerged PR #38 migration and application changes. It is also absent from the current Realtime publication. Therefore PR #38 must not be merged/deployed against this project without a staged migration and runtime validation.
2. The live migration history has 37 entries, while repository `main` has 13 migration files. Do not replay the repository migration directory on this project. A migration reconciliation is required based on SQL contents and the live schema, not filename matching alone.
3. The five Storage buckets exist. Their privacy flags and size limits were read, but object-level policies and owner/non-owner upload/download/delete behavior have not yet been tested. A public avatar bucket may be intentional; validate whether object paths contain only public avatar assets before changing it.
4. The Realtime publication does not include `user_privacy_settings`. Other subscriptions (including privacy preferences) therefore cannot be assumed to receive database-change events.
5. The live project contains many `SECURITY DEFINER` RPCs. Supabase security advisors flagged one anonymously executable SECURITY DEFINER RPC (`request_community_group_join(uuid)`) and 19 authenticated-executable SECURITY DEFINER function signatures. This is a review warning, not proof that each function is exploitable: inspect function bodies, explicit authorization checks, and intended client call sites before changing grants. Do not blanket-revoke permissions because application RPCs may depend on them.
6. Supabase Auth leaked-password protection is disabled according to the security advisor.
7. The live Edge Function inventory does not contain a `delete-account` function. The other project has one, but that project is not established as staging and its implementation must not be copied blindly.
8. The app's `username-auth` Edge Function is deployed in the live project. Its deployed source and secret dependencies must be reviewed before any authentication change.
9. The app's live public table inventory has 25 tables; `user_privacy_settings` is the specifically verified missing table. Do not infer that all other schema is complete solely from table presence.

## Security advisor findings

### Confirmed warning: anonymous SECURITY DEFINER RPC
- `public.request_community_group_join(p_group_id uuid)` is executable by `anon` according to the security advisor.
- The same function name also has an overload with `p_group_id, p_recipient_id`; inspect both overloads and the intended unauthenticated behavior before any grant change.

### Confirmed warning: authenticated SECURITY DEFINER RPCs
The advisor reports 19 callable signatures, including group administration, group join requests, group message deletion, direct conversation creation, group reporting, and group read-state functions. Review each function's authorization logic and grants individually.

### Confirmed warning: compromised-password protection
- Supabase Auth leaked-password protection is disabled. Enable only after checking Auth configuration impact and documenting the resulting signup/password behavior.

## What this inspection did NOT verify

- Exact per-table grants beyond the returned policy inventory.
- Full SQL bodies for all functions, triggers, or Edge Functions.
- Storage object policies and cross-user access behavior.
- Private Realtime Broadcast policies for calls.
- Actual login/signup, recovery, account deletion, media, messaging, group, or call behavior on two separate user accounts/devices.
- A restorable backup or a known staging project.
- Android project, signing setup, or an AAB.

## Safe next steps

1. Confirm which project is production. Until then, treat `wcviqgxrpsgywpxrymxi` as production and make no writes.
2. Establish a real isolated staging project only after reviewing cost and owner approval. The existing `yymzfjfkmsrymqhpnfqz` project is not a verified staging copy.
3. Obtain and verify a restorable backup of production before any approved schema work.
4. Export the live schema, policies, grants, functions, triggers, Storage policies, Realtime configuration, and migration history.
5. Reconcile live migrations against repository migrations; produce a clean bootstrap that can be applied to an empty disposable staging database.
6. Apply the activity privacy table migration only to verified staging; test two-account RLS and Realtime behavior.
7. Review SECURITY DEFINER RPCs individually and resolve the anonymous RPC warning only after confirming intended behavior.
8. Add/test account deletion, password recovery, privacy policy, UGC reporting/moderation, and Android packaging.
9. Run actual staging integration/security tests and produce a signed AAB for Play internal testing.

## Status

- Live Supabase access: VERIFIED (read-only inspection completed)
- Verified staging project: NO
- Backup/restore point: NOT VERIFIED
- Live database changes: NONE
- Privacy table repaired: NO
- Account deletion implemented in the live project: NO
- Security warnings reviewed individually: NO
- READY FOR STAGING TEST: NO
- READY FOR PRODUCTION REVIEW: NO
- READY FOR GOOGLE PLAY INTERNAL TESTING: NO
- READY FOR GOOGLE PLAY PRODUCTION RELEASE: NO


## Additional frontend verification (repository `main`)

A direct source inspection of `src/pages/Pages.tsx` and `src/pages/AuthPages.tsx` confirmed the following release blockers:

- `DeleteAccountPage` is explicitly a visual preview. It states that no verified account-deletion backend is available and confirms that nothing will be deleted.
- `PrivacyPage` uses local React state only; its private-profile and activity-status switches do not save or enforce account privacy.
- The password-change UI explicitly says password recovery is unavailable for mobile-only accounts. The inspected login UI has no recovery action.
- The profile-report page explicitly says profile reports are unsupported because no user-target reporting schema is verified.
- The login/signup flows invoke the deployed `username-auth` Edge Function. Its implementation and secret dependencies must be inspected before modifying authentication.

These are source-confirmed UI limitations, not inferred from missing database objects. They must be implemented and tested before a public Play release.
