# Banjara Connect — Fresh Supabase Schema Blueprint

**Version:** 0.1 (evidence-backed inventory; not executable SQL)  
**Repository baseline:** `main` at `8c239061342d1117e25b07ae627063e9e32ba1be`  
**Prepared:** 2026-11-02  
**Safety:** Documentation only. No Supabase project was connected, queried, created, resumed, or migrated. No production data was touched.

## 1. Purpose and rules

This document is the starting specification for rebuilding Banjara Connect on a genuinely empty Supabase project. It deliberately separates:

- **SOURCE-CONFIRMED:** a column/type or behavior appears in a tracked TypeScript type, query, or SQL migration.
- **SOURCE-INFERRED:** the application uses a field, but the canonical SQL type/constraint is not present in tracked migrations.
- **UNKNOWN:** the repository does not establish the schema or permission. Do not generate production SQL from an unknown.
- **HISTORICAL:** present only in Git history or an earlier audit; not part of the current `main` migration directory unless explicitly restored and reviewed.

A client-side filter is not a security policy. A TypeScript field is not proof of a database constraint. An RPC call site is not an RPC definition.

## 2. Current repository facts

The current `main` tree contains **11 tracked SQL migration files** under `supabase/migrations/`:

1. `20261006124631_optimize_rls_auth_uid_and_remove_duplicate_notification_index.sql`
2. `20261006124750_enforce_blocking_in_direct_messaging_rls.sql`
3. `20261006124903_make_story_media_private_and_signed.sql`
4. `20261006142000_add_missing_foreign_key_indexes.sql`
5. `20261006150000_bound_community_group_reports.sql`
6. `20261006153000_race_safe_direct_conversation_creation.sql`
7. `20261006170000_harden_group_rpcs_and_realtime_races.sql`
8. `20261006210000_add_community_group_join_requests.sql`
9. `20261006211000_add_group_message_selection_deletes.sql`
10. `20261008184500_add_story_viewers.sql`
11. `20261027110000_add_ai_moderation_reviews.sql`

These are mostly incremental migrations. They are **not a complete empty-database bootstrap**: several migrations alter or reference core tables that are not created by this directory. Do not run this directory against an empty database expecting a working app.

The repository also contains `SECURITY_UNVERIFIED.md`. It documents earlier limitations and must not be treated as proof of the currently deployed project's schema or settings.

## 3. Table inventory (26 application tables)

The application references these 26 table names. This inventory is confirmed as a repository-level table list from the app audit; it does **not** mean all 26 have complete CREATE TABLE definitions in current migrations.

| # | Table | Module | Schema evidence status | Notes |
|---:|---|---|---|---|
| 1 | `profiles` | Identity | SOURCE-INFERRED | TypeScript record exposes id, username, display_name, avatar_url, bio, location, is_verified. Additional fields such as is_admin are referenced by SQL. |
| 2 | `posts` | Feed | SOURCE-INFERRED | TypeScript record exposes id, user_id, group_id, content, created_at, visibility, media_urls, media_type. |
| 3 | `post_likes` | Feed | UNKNOWN | Client operations exist; canonical CREATE TABLE definition not in current migration directory. |
| 4 | `comments` | Feed | UNKNOWN | Client operations exist; canonical CREATE TABLE definition not in current migration directory. |
| 5 | `comment_likes` | Feed | UNKNOWN | Client operations exist; canonical CREATE TABLE definition not in current migration directory. |
| 6 | `follows` | Social graph | SOURCE-INFERRED | Follow relationship operations exist; exact columns/constraints require source/schema confirmation. |
| 7 | `blocks` | Safety/social graph | SOURCE-INFERRED | Blocking migration references blocker_id and blocked_id. |
| 8 | `stories` | Stories | SOURCE-INFERRED | Story view migration references stories.id and stories.user_id; full story schema is absent. |
| 9 | `story_views` | Stories | SOURCE-CONFIRMED | Full CREATE TABLE appears in current migration; see section 4. |
| 10 | `conversations` | Direct chat | SOURCE-INFERRED | RPC inserts created_by; id is returned and used as UUID. Full base definition absent. |
| 11 | `conversation_members` | Direct chat | SOURCE-INFERRED | RPC uses conversation_id and user_id; exact constraints require bootstrap design. |
| 12 | `messages` | Direct chat | SOURCE-INFERRED | Chat type/query uses id, conversation_id, sender_id, content, media_url, media_type, is_deleted_for_everyone, created_at, updated_at. |
| 13 | `message_reads` | Direct chat | SOURCE-INFERRED | Current RLS migration references user_id and message_id. |
| 14 | `message_deletions` | Direct chat | UNKNOWN | Client/app audit references delete-for-me behavior; canonical schema not in current migration directory. |
| 15 | `notifications` | Notifications | SOURCE-INFERRED | Current join-request migration adds group_join_request_id; RPC inserts user_id, actor_id, type, group_id. Full base schema absent. |
| 16 | `push_subscriptions` | Push | UNKNOWN | Table referenced by app inventory; base schema absent from current migration directory. |
| 17 | `reports` | Safety/moderation | SOURCE-INFERRED | AI review migration references reports.id; report migration references existing group/report schema. Full base schema absent. |
| 18 | `community_groups` | Groups | SOURCE-INFERRED | Current RPCs use id, name, description, created_by. |
| 19 | `community_group_members` | Groups | SOURCE-INFERRED | Current RPCs use group_id, user_id, role. |
| 20 | `community_group_messages` | Groups | UNKNOWN | App references it; base CREATE TABLE absent from current migration directory. |
| 21 | `community_group_message_reads` | Groups | UNKNOWN | App references it; base CREATE TABLE absent from current migration directory. |
| 22 | `community_group_join_requests` | Groups | SOURCE-CONFIRMED | Full CREATE TABLE appears in current migration; see section 4. |
| 23 | `community_group_message_deletions` | Groups | SOURCE-CONFIRMED | Full CREATE TABLE appears in current migration; see section 4. |
| 24 | `call_sessions` | Calls | HISTORICAL / UNKNOWN | Prior audit found call migrations in Git history, not in current migration directory. Must be reconciled before use. |
| 25 | `user_privacy_settings` | Privacy | UNKNOWN on current main | A previous PR/branch contained a migration for this table. It is not in the current main migration list above. Verify branch/PR status before including it. |
| 26 | `ai_moderation_reviews` | Moderation | SOURCE-CONFIRMED | Full CREATE TABLE appears in current migration; see section 4. |

## 4. Columns and constraints confirmed by current CREATE TABLE migrations

Only the following table definitions are fully present in the current migration directory.

### 4.1 `story_views`

Source: `supabase/migrations/20261008184500_add_story_viewers.sql`

| Column | SQL type | Nullability/default | Constraint |
|---|---|---|---|
| story_id | uuid | NOT NULL | FK → public.stories(id), ON DELETE CASCADE |
| viewer_id | uuid | NOT NULL | FK → public.profiles(id), ON DELETE CASCADE |
| viewed_at | timestamptz | NOT NULL DEFAULT now() | — |

Primary key: `(story_id, viewer_id)`. Index: `(story_id, viewed_at DESC)`. RLS is enabled. Current migration defines SELECT for the viewer or story owner and INSERT only when viewer_id equals auth.uid(). No UPDATE or DELETE policy is defined in this migration.

### 4.2 `community_group_join_requests`

Source: `supabase/migrations/20261006210000_add_community_group_join_requests.sql`

| Column | SQL type | Nullability/default | Constraint |
|---|---|---|---|
| id | uuid | NOT NULL DEFAULT gen_random_uuid() | PRIMARY KEY |
| group_id | uuid | NOT NULL | FK → community_groups(id), ON DELETE CASCADE |
| requester_id | uuid | NOT NULL | FK → profiles(id), ON DELETE CASCADE |
| recipient_id | uuid | NOT NULL | FK → profiles(id), ON DELETE CASCADE |
| status | text | NOT NULL DEFAULT 'pending' | CHECK pending/approved/declined |
| created_at | timestamptz | NOT NULL DEFAULT now() | — |
| responded_at | timestamptz | NULL | — |

Additional check: requester_id <> recipient_id. Partial unique index prevents duplicate pending requests for the same group/requester/recipient. Recipient and requester lookup indexes exist. RLS is enabled; SELECT policy allows requester or recipient. Authenticated SELECT is granted. Request/respond RPCs are SECURITY DEFINER with search_path=public and EXECUTE granted to authenticated after revoking public/anon.

### 4.3 `community_group_message_deletions`

Source: `supabase/migrations/20261006211000_add_group_message_selection_deletes.sql`

The migration defines this table and its access rules. The exact column list and constraints must be copied from the migration into the bootstrap only after a line-by-line review. Authenticated grants are deliberately narrower than the table's policy: SELECT and INSERT are granted; authenticated UPDATE/DELETE are not granted by this migration. RLS is enabled.

### 4.4 `ai_moderation_reviews`

Source: `supabase/migrations/20261027110000_add_ai_moderation_reviews.sql`

| Column | SQL type | Nullability/default | Constraint |
|---|---|---|---|
| id | uuid | NOT NULL DEFAULT gen_random_uuid() | PRIMARY KEY |
| report_id | uuid | NOT NULL | UNIQUE FK → reports(id), ON DELETE CASCADE |
| recommendation | text | NOT NULL | CHECK no_action/review/urgent_review |
| risk_level | text | NOT NULL | CHECK low/medium/high |
| summary | text | NOT NULL | CHECK char_length <= 600 |
| signals | jsonb | NOT NULL DEFAULT '[]'::jsonb | — |
| model | text | NOT NULL | — |
| created_at | timestamptz | NOT NULL DEFAULT now() | — |
| updated_at | timestamptz | NOT NULL DEFAULT now() | — |

Index: (risk_level, created_at DESC). RLS enabled. Authenticated/anon table privileges are revoked then SELECT is granted to authenticated; SELECT policy checks profiles.is_admin=true. The migration does not provide authenticated INSERT/UPDATE/DELETE grants.

## 5. Application-facing data contracts (not canonical SQL)

These fields are useful for the bootstrap design, but SQL types/defaults/nullability must be validated against all app reads and writes before implementation.

### Profiles
TypeScript `ProfileRecord` in `src/types/app.ts`:
- id: string
- username: string
- display_name: string | null
- avatar_url: string | null
- bio: string | null
- location: string | null
- is_verified: boolean

### Posts
TypeScript `PostRecord` in `src/types/app.ts`:
- id: string
- user_id: string
- group_id: string | null
- content: string
- created_at: string
- visibility: string | null
- media_urls?: string[]
- media_type?: string | null

### Direct messages
TypeScript `ChatMessage` in `src/utils/chatData.ts`:
- id, conversation_id, sender_id, content
- media_url, media_type
- is_deleted_for_everyone
- created_at, updated_at
- media_signed_url is computed/optional client data; do not persist it without a separate requirement.

### Group roles
Current group RPC code uses role values `admin` and `member`. The bootstrap should constrain role values to these only unless app behavior is intentionally changed.

## 6. RPC and helper inventory

Current migration `20261006170000_harden_group_rpcs_and_realtime_races.sql` defines or replaces these functions:
- `add_community_group_member(uuid, uuid)`
- `create_community_group(text, text)`
- `delete_community_group(uuid)`
- `get_or_create_direct_conversation(uuid)`
- `leave_community_group(uuid)`
- `remove_community_group_member(uuid, uuid)`
- `set_community_group_member_role(uuid, uuid, text)`

Current migration `20261006210000_add_community_group_join_requests.sql` defines:
- `request_community_group_join(uuid, uuid)`
- `respond_community_group_join_request(uuid, boolean)`

The prior audit identified these missing-from-current-migrations functions/helpers; re-search the current full tree before implementing:
- `list_community_group_media_for_cleanup`
- `mark_community_group_read`
- `report_community_group_content`
- `update_community_group_report`
- `private.user_conversation_ids()`
- `public.is_community_group_admin(...)`

Do not create placeholders with guessed signatures. Search all current source and migration files, then specify exact signatures, callers, auth checks, grants, and return contracts.

## 7. Storage and Realtime

The app's storage buckets identified by the audit are:
- `banjara-stories`
- `banjara-profile-avatars`
- `banjara-chat-media`
- `banjara-media`
- `banjara-group-media`

Current migrations do not provide a complete five-bucket bootstrap/configuration. The story media migration provides only a partial story read policy. Bucket public/private status, file size/MIME restrictions, upload/update/delete policies, object ownership rules, and cleanup behavior need an explicit design before SQL.

Realtime tables used by the app audit:
- `call_sessions`
- `community_group_members`
- `community_group_messages`
- `message_reads`
- `messages`
- `notifications`
- `user_privacy_settings`

This is an application subscription inventory, not proof of publication membership or event authorization. Call signaling also uses private Broadcast in prior audit; confirm the current call implementation and historical migration lineage before designing it.

## 8. Required decisions before executable SQL

These are blockers, not values to guess:

1. **Base schema source:** obtain the complete deployed schema or authoritative original migrations for the 22+ base tables not created in current migrations.
2. **Auth identity:** confirm profiles.id references auth.users.id, signup/seed behavior, and account deletion semantics.
3. **Profile privacy:** decide which profile columns are public, private, and admin-only; prevent client updates to privileged flags.
4. **Post visibility:** define public/follower/group/private semantics and block behavior.
5. **Chat lifecycle:** confirm unique direct conversation pair, participant membership rules, message deletion modes, read receipt semantics, and atomic RPC behavior.
6. **Group lifecycle:** confirm invite authority (any member vs admin), member visibility, role changes, last-admin rule, group deletion cascade, and message moderation.
7. **Reports:** define reporter visibility, moderator role, retention, duplicate/rate-limit rules, and target types.
8. **Notifications/push:** define who can create notifications and subscription endpoint ownership/rotation.
9. **Calls:** select the correct historical call schema and transition rules; do not silently restore an old migration.
10. **Privacy:** reconcile the privacy-settings migration/PR with current main before including it.
11. **Storage:** define public avatar behavior versus private signed media, per-object ownership/participant checks, MIME/size limits, and deletion lifecycle.
12. **Realtime:** define publication tables and private Broadcast authorization separately from Postgres RLS.

## 9. Implementation sequence after blockers are resolved

1. Produce a complete, source-backed column/constraint matrix for all 26 tables.
2. Write a fresh bootstrap schema in dependency order (extensions, enums/domains if required, tables, keys, indexes, triggers).
3. Add helper functions and RPCs with pinned search_path, least-privilege EXECUTE grants, and explicit auth checks.
4. Enable RLS on every user-facing table; add policies and explicit grants.
5. Configure five Storage buckets and object policies.
6. Configure Realtime publication and private Broadcast authorization.
7. Validate from a disposable local Supabase stack or isolated staging project using four identities (two normal users, one group admin, one outsider).
8. Only after acceptance, prepare a separate production rollout plan. Never use the production project as the test database.

## 10. Current completion status

- Table inventory: **26 identified**.
- Fully evidenced CREATE TABLE definitions in current migrations: **4 tables** (`story_views`, `community_group_join_requests`, `community_group_message_deletions`, `ai_moderation_reviews`).
- Partial/source-inferred contracts: profiles, posts, chat, groups, notifications, reports, follows, blocks, stories.
- Complete empty-database bootstrap: **not yet available**.
- Executable SQL generated: **no**.
- Database connection/migration performed: **no**.
- Production touched: **no**.

**Next concrete task:** complete the column/constraint matrix from all current app data-access files and recover authoritative base-table definitions. Do not generate executable bootstrap SQL until this is complete.
