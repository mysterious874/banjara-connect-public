# Connect — Play Store Release Readiness

Audit date: 2026-11-02  
Base: `main` at `8c239061342d1117e25b07ae627063e9e32ba1be`

## Current decision

**NOT READY FOR GOOGLE PLAY INTERNAL TESTING OR PRODUCTION RELEASE.**

This document records verified blockers and a safe execution sequence. It does not claim that any database repair, app-code repair, Android packaging, or runtime test has been completed.

## Verified environment findings

- The application is configured for Supabase project `banjara-connect` (`wcviqgxrpsgywpxrymxi`).
- The dashboard reported the project as Healthy, but its environment role (staging vs production) was not established.
- The Supabase organization showed an over-quota warning and the project showed no backups.
- The dashboard exposed 37 applied migration-history entries; the checked-in `main` branch contains 13 migration files. Only one exact version/name matched. Do not replay repository migrations against this project.
- Live schema metadata did not show `public.user_privacy_settings` or `profiles.hide_activity_status`, while PR #38 adds application usage and a migration for the dedicated privacy table.
- Five app Storage buckets exist. Four were private with 50 MiB limits; the avatar bucket was public with a 5 MiB limit. Actual per-user upload/read/delete behavior has not been tested.
- The Realtime publication contained nine public tables; it did not include `user_privacy_settings`.
- Deployed Edge Functions included `username-auth`, `ai-moderator`, `banjara-ai`, `livekit-token`, and `send-chat-push`; their source was not found in the checked-in repository paths inspected during this audit.
- The PWA is configured in `vite.config.ts`, but no Android Gradle project, Android manifest, signing configuration, or AAB was found.
- Signup exists. No verified in-app account-deletion flow, external deletion-request page, or privacy-policy URL was found.
- Post/comment and community reporting exist; profile-report flow and its database safeguards remain unverified.
- Password recovery was not found in the inspected authentication flow.

## Checks actually completed

| Check | Result |
|---|---|
| TypeScript + Vite/PWA production build | PASS in local agent environment |
| `git diff --check` | PASS in local agent environment |
| Unit/integration/security test suite | NOT AVAILABLE / NOT RUN |
| Two-account RLS and privacy tests | NOT RUN |
| Storage upload/read/delete tests | NOT RUN |
| Realtime/call tests on two devices | NOT RUN |
| Fresh database bootstrap test | NOT RUN |
| Android/AAB build | NOT POSSIBLE in audited environment |

## Safe execution order

### Gate 0 — protect the existing project
- Confirm whether `wcviqgxrpsgywpxrymxi` is production or staging.
- Identify an isolated staging project with adequate quota.
- Establish a verified backup/restore point before any schema change.
- Do not run migrations on the existing project until its environment role, backup, and migration history are reconciled.

### Gate 1 — recover the actual backend source of truth
- Export schema-only definitions, RLS policies, grants, functions, triggers, Storage policies, publication membership, and migration history from the verified project.
- Recover the source code and deployment configuration for all five deployed Edge Functions.
- Reconcile the 37 live migration entries with repository migrations; identify equivalent migrations by SQL contents, not filename guesses.
- Produce a reproducible bootstrap for a disposable staging database and prove it can initialize from empty state.

### Gate 2 — repair and verify backend compatibility
- Reconcile the activity privacy table and Realtime publication with the intended PR #38 behavior.
- Verify owner-only RLS and cross-account denial using two independent test users.
- Test every Storage bucket's upload/read/update/delete permissions with owner and non-owner accounts.
- Verify RPC authorization, private call Broadcast authorization, and cleanup behavior.
- Do not weaken RLS or make private buckets public to bypass failures.

### Gate 3 — app release requirements
- Implement a secure, retryable account deletion workflow, including server-side Auth user deletion, owned data/media cleanup, and documented retention exceptions.
- Publish a truthful privacy policy both in-app and at a stable public URL. It must accurately describe data collection, sharing, retention, deletion, and third-party services.
- Add/verify profile reporting and moderation workflows for user-generated content.
- Implement and test a secure password recovery path before exposing a recovery UI.
- Add automated tests for authentication, privacy, reporting, account deletion, chat, stories, groups, and media.

### Gate 4 — Android and Play Console
- Select and implement a suitable Android wrapper (TWA or Capacitor) after verifying app architecture and required native capabilities.
- Configure a stable application ID, app icon, splash screen, deep links, permissions, signing, and target API required at submission time.
- Build and test a signed Android App Bundle (AAB) on physical devices.
- Complete Play Console privacy policy, Data safety, account deletion URL, UGC moderation, content rating, and store listing declarations.

## Non-negotiable safety rules

- No production data deletion, reset, truncate, or destructive migration.
- No production migration until staging validation and a verified backup.
- No service-role or secret keys in browser code or Git.
- No RLS disablement or broad public policies.
- No merge to `main`, production deployment, paid project creation, billing change, or Play Store submission without explicit owner approval.
- Mark a check PASS only after executing it and recording the evidence.

## Status

- READY FOR STAGING TEST: NO
- READY FOR PRODUCTION REVIEW: NO
- READY FOR GOOGLE PLAY INTERNAL TESTING: NO
- READY FOR GOOGLE PLAY PRODUCTION RELEASE: NO
