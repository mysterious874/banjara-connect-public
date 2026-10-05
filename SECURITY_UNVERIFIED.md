# Banjara Connect security verification status

**Checked:** 2026-10-05
**Scope:** Current local Banjara Connect checkout and read-only requests made with its public Supabase client configuration. No authenticated account, Supabase administrator credential, second test identity, or deployment URL was available. No production records were created or modified.

## Summary

This repository is **not verified release-ready**. The signup screen is paused, but the configured Supabase project still reports public signup enabled. Database authorization, grants, functions, Realtime permissions, and Storage policies are not represented by tracked schema/migration files and cannot be inspected with the available public client access. Client-side identity checks and row filters are not substitutes for server-side RLS.

The app’s existing public Supabase configuration consists of `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The tracked `.env` contains only those two variables; the key uses the Supabase `sb_publishable_` format. No service-role key, private key, or other secret/admin variable was found. These are public browser-client settings, not authorization credentials. The key must never be used as proof of user identity or server-side permission.

## Findings and confidence

| Severity | Affected area | Finding | Fixed? | Confidence | Required verification |
|---|---|---|---|---|---|
| High | Supabase Auth signup | The public Auth settings endpoint reports `disable_signup=false` and `mailer_autoconfirm=true`. The app’s signup page is paused and does not call `signUp`, but a caller can bypass that UI while backend signup remains enabled. | No; requires Supabase administrator access. | High for the observed settings; direct account creation was intentionally not attempted. | Disable public signup in the Dashboard, then verify the public settings report `disable_signup=true`. Confirm existing-user password login still works and phone auth remains disabled. |
| High (release blocker; exposure not established) | RLS, grants, views, RPCs | The repository has no tracked schema, migration, policy, grant, view, or function definitions. Anonymous zero-row REST requests returned HTTP 200 for the app’s table endpoints, but no table rows were fetched and this does not reveal or prove the effective policies. Cross-user reads and writes remain unverified. | No; cannot safely change database policy without inspecting the real schema and intended product rules. | High that local policy evidence is absent; deployed authorization is unknown. | Inspect deployed schema, RLS enablement and policies, grants, views, functions, and perform authenticated cross-user API tests for every table below. |
| High | Conversation creation | `getOrCreateConversation` only coalesces concurrent calls within one JavaScript runtime. It inserts a conversation and then its two memberships in separate requests; cleanup is a best-effort later request. Separate clients can race and create duplicates, and failed membership/cleanup can leave an orphan. There is no repository migration/schema to safely implement the needed server-side transaction or uniqueness rule. | No; requires verified schema and a database-side atomic create-or-get operation (or equivalent constraints/RPC). | High from source inspection. | With two clients, race conversation creation and inspect for exactly one conversation with exactly two members. Force membership insertion failure in a safe test project and verify no orphan remains. |
| High (release blocker; exposure not established) | Chat authorization and Realtime | The UI checks membership before loading/sending, and the Realtime subscription filters by conversation ID. These are client-side checks/filters and do not prove server-side membership enforcement or event confidentiality. | No; deployed policies/publication were unavailable for inspection. | High that runtime authorization was not tested; deployed behavior is unknown. | Verify RLS for conversations, members, messages, and reads, plus Realtime publication/access. Run non-member read/send and cross-user mutation attempts with controlled users. |
| Medium | Realtime cleanup | `removeChannel()` is asynchronous; the old cleanup code tested its Promise as a boolean and therefore could not report a failed channel removal. | Yes; cleanup now checks the resolved status and logs rejected removals in `src/utils/realtimeData.ts`. | High from source inspection; no live Realtime session was available. | Build/typecheck passed after the fix. Verify unsubscribe/reconnect and error status in a controlled authenticated session. |
| High (release blocker; exposure not established) | Posts, comments, likes, follows, blocks, notifications, reports | Client mutations generally derive the acting user from Supabase Auth or add owner filters. Those filters do not prove RLS. No policy definitions or authenticated mutation tests are available. | No; deployed policies were unavailable for inspection. | High that runtime authorization was not tested; deployed behavior is unknown. | Verify per-table policies and run owner/non-owner, forged-user-ID, recipient, and unauthenticated mutation tests. |
| Medium | React Router dependency | Installed `react-router` and `react-router-dom` are 6.30.6. `npm audit` reports two moderate advisories, affecting versions below 7.18.0; the available fix is a major upgrade to 7.18.4. This SPA uses declarative `BrowserRouter`/`Routes`/`Route` and no data-router loaders/actions, but the open-redirect advisory still applies and a major migration needs navigation regression tests. | No; no unverified major migration was made. | High for installed versions and audit output. | Migrate and test React Router 7 in a separate change; test login redirect state, nested/optional routes, wildcard/404 handling, protected routes, relative links, and lazy loading. |
| Informational | Tracked `.env` | The tracked file contains only the public Supabase URL and publishable client key. No service-role/admin/private key was found. | Not a secret-removal issue; retained to avoid breaking the existing local setup. | High for current file contents and names. | Ensure deployment environments inject only public client settings into the browser build; never add server secrets to `VITE_*` variables. |

## Authentication and frontend review

- Existing login calls `signInWithPassword` using the current mobile-to-legacy-email mapping. This is email/password auth, not phone/SMS auth. The public settings currently report the phone provider disabled and the email provider enabled.
- Signup is unavailable in the UI, and no `supabase.auth.signUp` call was found. This does **not** disable direct public signup against Supabase.
- Session restoration is configured with Supabase `persistSession`, `autoRefreshToken`, and `getSession`; the auth-state listener unsubscribes on cleanup. No application code manually reads/writes auth credentials in `localStorage` or `sessionStorage`; Supabase manages its own session persistence.
- Protected application routes redirect when there is no session. Route behavior was inspected in source, not exercised in a browser with an authenticated/unauthenticated test session.
- Password change reauthenticates with the current session email and current password before calling `updateUser`. Runtime behavior was not tested.
- Profile queries and updates use selected profile columns and the authenticated user ID, but deployed profile RLS and protection of privileged/private columns are unknown. No frontend `is_admin`/`isAdmin` usage was found.
- Source scans found no `dangerouslySetInnerHTML`, direct `innerHTML` assignment, `eval`, `new Function`, or manual Web Storage usage. This is a source scan, not a dynamic XSS assessment.
- No service-role/private key pattern or hardcoded credential was found. Public client configuration is intentionally browser-visible.

## Database objects and policy review required

The client references these tables: `profiles`, `posts`, `comments`, `post_likes`, `comment_likes`, `notifications`, `conversations`, `conversation_members`, `messages`, `message_reads`, `blocks`, `follows`, and `reports`. Anonymous zero-row REST requests to these names returned HTTP 200; the requests selected zero rows and provide no evidence that row policies are correct. The actual SQL columns, constraints, policies, grants, views, functions, and Realtime publication were not available.

### Client data-operation inventory (static source inspection)

This lists what the frontend requests, **not** what the database authorizes:

| Table | Client reads | Client writes |
|---|---|---|
| `profiles` | Select profile rows/columns for self, authors, search, and chat peers. | Insert own initial profile; update selected own profile fields or repair missing display fields. |
| `posts` | Select feed rows and individual post IDs/details. | Insert a text post; update/delete own post with an owner filter. |
| `comments` | Select comments and target comment IDs. | Insert comment; update/delete own comment with an owner filter. |
| `post_likes` | Select like user IDs/count. | Insert own like; delete own like. |
| `comment_likes` | Select comment/user IDs. | Insert own like; delete own like. |
| `follows` | Select current user's following edges. | Insert/delete an edge for the authenticated follower ID. |
| `blocks` | Select current user's blocks and either-direction block status for chat setup. | Insert/delete an edge for the authenticated blocker ID. |
| `conversations` | No direct read request found. | Insert a conversation, then separately delete a newly inserted conversation during best-effort cleanup. |
| `conversation_members` | Select current user's memberships and the members of those conversations. | Insert two membership rows after conversation insertion. |
| `messages` | Select messages for conversation summaries and opened conversations. | Insert a message. No client update/delete operation found. |
| `message_reads` | Select the current user's read rows. | Insert the current user's read rows. No client update/delete operation found. |
| `notifications` | Select the current user's notifications. | Update `is_read` for a notification filtered to the current user. No client insert was found. |
| `reports` | No direct read request found; report form validates target IDs by selecting from `posts` or `comments`. | Insert a post/comment report. No client update/delete operation found. |

No hidden-chat table references, `.rpc()` calls, or Supabase Storage calls were found. Realtime subscribes to `messages` INSERT filtered by `conversation_id` and all `notifications` events filtered by `user_id`; filters do not enforce authorization. Auth source uses session restoration/listening, `getUser`, email/password sign-in, password update, and sign-out. This inventory does not reveal deployed grants or policies.

Before release, inspect the deployed schema and verify at least:

- **Profiles:** public profile columns are intentional; users can insert/update only their own row (`id = auth.uid()`); private and privileged fields are not exposed or client-writable.
- **Posts:** read access matches intended visibility/block rules; insert identity is `auth.uid()`; only the owner can update/delete; changing `user_id` in a request cannot change ownership.
- **Comments:** insert identity is `auth.uid()` and referenced post/parent is valid and visible; only the owner can update/delete.
- **Post/comment likes:** authenticated insert identity is `auth.uid()`; a user can remove only their own like; uniqueness prevents duplicate likes; target visibility is enforced.
- **Follows and blocks:** actor/owner IDs must equal `auth.uid()`; callers cannot create/delete relationships on behalf of another user.
- **Notifications:** recipients can read/update only their own notifications. Ordinary clients must not be able to create notifications for arbitrary recipients. Use a verified server-side mechanism if notifications are required; do not add a trigger or policy based on guessed schema.
- **Conversations and members:** private conversation rows/membership are restricted to participants; membership cannot be self-added to an arbitrary conversation; participant creation is validated; duplicate pair creation and partial member insertion are prevented atomically.
- **Messages:** reads and inserts require conversation membership; sender identity is `auth.uid()`; updates/deletes follow the intended sender-only rules; non-members cannot read or send even by directly changing IDs.
- **Read receipts:** callers can create/update only their own read state for messages in conversations they belong to; they cannot alter another participant’s read state.
- **Reports:** reporter identity is `auth.uid()`; only valid supported targets can be reported; ordinary users cannot read or mutate others’ reports; moderation access is explicitly restricted.
- **Grants, views and RPCs:** table privileges are no broader than intended; views do not bypass row security; any `SECURITY DEFINER` function has a pinned `search_path`, restricted execution grants, and validates the caller.
- **Realtime:** only intended tables are published; Postgres Changes respects the same participant/row authorization expected by the product; channel filters are treated as selectors, not access control.

The application currently sends post/comment reports only. Its UI explicitly says profile/user reports are unsupported. Do not enable user-target reports until the deployed schema and policies safely support them.

### Schema evidence required before changing conversation creation

No SQL implementation is safe until the project owner supplies verified schema/migration access for the deployed project. Specifically inspect:

- `CREATE TABLE` definitions for `conversations` and `conversation_members`, including every column/type/default, primary key, foreign key and its delete action, check constraint, trigger, and existing unique/index definition.
- The actual cardinality model: whether group conversations exist, how a direct one-to-one pair is represented, and how existing duplicate/partial conversations must be handled.
- Existing policies and table grants for inserting/selecting/deleting conversations and membership rows, including what a normal authenticated client may write.
- All existing functions/RPC overloads touching those tables, their owner, `SECURITY DEFINER` status, fixed `search_path`, execution grants, and current caller/participant validation.
- A read-only inventory of existing duplicate pairs, conversations with missing/unexpected members, and dependent messages before choosing constraints or cleanup.

Then design an idempotent transaction/RPC against those verified facts. It must derive the initiating identity from `auth.uid()`, validate the target and block rules server-side, serialize concurrent calls for the same canonical pair, create both member rows atomically, and return the same conversation ID to either caller. Do not deploy a new unique index or cleanup existing rows until group-conversation semantics, duplicates, and foreign-key dependencies have been reviewed. The frontend-only in-flight request map cannot provide cross-client idempotency.

## Chat, media, and feature boundaries

- The client checks current membership before loading or sending, filters Realtime events to a conversation ID, and marks incoming messages read. None of these behaviors has been tested against a second user or proves server-side policy enforcement.
- Realtime subscriptions are deduplicated per local topic/filter and expose subscription status callbacks. Channel removal now checks the asynchronous result and reports failures to the console. Live subscription delivery, error display, and cleanup behavior remain unverified.
- The repository has no message edit/delete or delete-for-me flow. Do not infer that message mutation or per-user hiding is supported by backend schema.
- No Supabase Storage upload/download call, bucket name, or storage policy is present in the source. The anonymous bucket-list endpoint returned zero visible buckets; that does not prove that no private buckets exist. The post composer correctly keeps photo/video posting unavailable. Verify deployed buckets and object policies before enabling media.
- Stories, Reels, and Community surfaces remain previews; no Stories or Community Events backend was found or verified.

## Controlled test matrix

No authenticated session or two controlled identities were available. No fake accounts or persistent test data were created. **No authenticated backend behavior below is marked PASS.** Use a non-production Supabase project with two disposable controlled identities for the blocked cases.

| Area | Test | Status | Evidence / next step |
|---|---|---|---|
| Auth UI | Login and paused signup pages render | PASS — local production preview | `/login` and `/signup` rendered after the route-splitting change; no credentials were submitted. |
| Auth | Existing-user login | BLOCKED — requires a controlled existing account | Source uses password login; perform a real login with an authorized test account. |
| Auth | Invalid credentials rejected | UNVERIFIED | Error handling is present; runtime rejection was not exercised. Test with a controlled account and wrong password. |
| Auth | Signup disabled | FAIL — backend setting | Public settings currently report `disable_signup=false`; change in Dashboard and verify `true`. No signup request was sent. |
| Auth | Phone/SMS provider disabled | PASS — settings observation only | Public settings currently report `external.phone=false`; recheck after any Dashboard changes. |
| Auth | Logout | BLOCKED — requires an authenticated session | Source calls Supabase `signOut`; verify in a controlled session and confirm protected route redirects. |
| Auth | Session restoration after refresh | BLOCKED — requires an authenticated session | Persistence is configured in source; verify only with a real test session. |
| Auth | Current-password verification before password change | BLOCKED — requires an authenticated test account | Source reauthenticates before update; verify with correct and incorrect current passwords. |
| Routes/profile | Unauthenticated protected-route redirect | PASS — local production preview | Direct navigation to `/home` in a fresh unauthenticated browser context redirected to `/login`; this does not test backend authorization. |
| Routes/profile | Profile load, allowed-field update, ownership | BLOCKED — requires authenticated account; RLS also needs verification | Inspect profile policies and test user A cannot update user B or privileged fields. |
| Posts | Feed loading / create post / authenticated ownership | BLOCKED — requires authenticated account | Verify under a controlled account and inspect server-side `user_id` enforcement. |
| Posts | Owner edit/delete | BLOCKED — requires authenticated account | Client filters by owner ID; verify with owner request and deployed policies. |
| Posts | Non-owner edit/delete and forged owner ID | BLOCKED — requires second account | Directly attempt both mutations as user B against user A’s post; both must be denied. |
| Comments | Load/create and owner edit/delete | BLOCKED — requires authenticated account | Verify valid target checks and owner-only policies. |
| Comments | Non-owner mutation / forged user ID | BLOCKED — requires second account | Attempt direct API update/delete as a different user; both must be denied. |
| Likes | Like/unlike and owner isolation | BLOCKED — requires authenticated account and a second account for cross-user checks | Attempt duplicate, forged-user, and deletion of another user’s like directly. |
| Social | Follow/unfollow and block/unblock ownership | BLOCKED — requires two controlled accounts | Attempt changing another user’s relationship and verify blocked-user access/messaging rules. |
| Chat | Conversation creation, duplicate prevention, partial-failure cleanup | BLOCKED — requires two controlled accounts and safe test project | Also release-blocked by client-side multi-request creation; implement/verify atomic database operation. |
| Chat | A→B and B→A message send and list update | BLOCKED — requires two controlled accounts | Verify persisted sender identity and both lists on the deployed backend. |
| Chat | Realtime delivery and subscription error/cleanup | BLOCKED — requires two controlled accounts | Verify both clients receive only permitted events; force disconnect and check surfaced status and cleanup. |
| Chat | Unread counts and read state | BLOCKED — requires two controlled accounts | Verify only the reader’s own state changes and counts converge across both clients. |
| Chat | Non-member read/send and cross-user message mutation | BLOCKED — requires a third/non-member identity or controlled alternate account | Issue direct REST requests with changed conversation/message IDs; server must deny all access. |
| Notifications | Recipient visibility/read ownership and notification creation | BLOCKED — requires authenticated accounts and schema/policy inspection | Verify client cannot create a notification for another recipient; do not claim creation works. |
| Reporting | Post/comment report UI and persisted report | BLOCKED — requires authenticated account and verified report schema | UI offers only post/comment targets; exercise submit/error paths safely. |
| Reporting | User/profile reports | NOT APPLICABLE — unsupported | UI explicitly says profile reports are unsupported. |
| Storage | Upload, access, and deletion policies | NOT APPLICABLE in current client; backend unverified | No upload flow exists and no buckets were anonymously visible. Inspect Dashboard before enabling media. |
| Security | Unauthenticated direct mutation rejection | UNVERIFIED | Must test direct REST calls against a safe project; frontend route guards are not authorization. |
| Security | Service-role/private key and manual Web Storage auth scans | PASS — source scan only | No such key or manual auth-storage usage found. Supabase’s built-in persisted session remains in use. |
| Security | Fake/mock success for Supabase-backed mutations | UNVERIFIED at runtime | Inspected handlers await Supabase errors before showing success; exercise successful and failed operations in controlled accounts. |

## Required Supabase Dashboard/admin actions

1. Under **Authentication → Settings → User Signups**, disable **Allow new users to sign up** (expected setting: `disable_signup=true`). Do not disable existing-user login.
2. Confirm **Phone provider** remains disabled. The currently observed public settings report `external.phone=false`.
3. Review deployed tables, RLS policies, grants, views, functions/RPCs, and Realtime publication against the checklist above. Export the actual schema/policies into reviewed migrations only after confirming the production schema and intended rules.
4. Resolve conversation creation atomically in the database using the verified schema, including a concurrency-safe unique pair rule and all-or-nothing membership creation.
5. Inspect all Storage buckets and `storage.objects` policies. Keep media posting disabled until upload, read, and delete authorization is verified.
6. Re-query public Auth settings and run authenticated authorization tests in a non-production project after changes.

## Build, dependency, PWA, and deployment status

- `package.json` defines `build`, `dev`, and `preview`; there are no test, lint, or separate typecheck scripts. `build` includes `tsc --noEmit`.
- The React Router audit reports two moderate advisories; only React Router 7.18.4 was offered as an audit fix, requiring a major migration. The app uses declarative routing and no loaders/actions, but no major upgrade was made without navigation regression tests.
- Route-level lazy loading now keeps auth screens separate from the shared feature-page chunk and defers the history/developer pages. The main emitted JS chunk decreased from 606.08 kB (171.93 kB gzip) to 503.85 kB (144.87 kB gzip); Vite still warns because this remains above 500 kB. The production precache contains 23 entries (about 732.61 KiB), so offline precaching still includes the code-split chunks.
- PWA source config defines a standalone manifest (generated by the Vite PWA plugin), icons, prompt-based service-worker registration/update handling, and static-asset precaching. The local production preview served the manifest and a controlling service worker; no API runtime cache is configured. This does not establish deployed HTTPS installability.
- No Netlify, Vercel, GitHub Pages, Docker, or other deployment configuration was found. No deployed HTTPS origin was supplied or tested. Installability, production cache/update behavior, security headers, and any production URL remain unverified.
