# Connect Push Notifications: Staging Setup

This guide is for a **new, isolated staging Supabase project** and a Vercel Preview deployment. Do not use production project `wcviqgxrpsgywpxrymxi`. The previously seen project `yymzfjfkmsrymqhpnfqz` has not been verified as staging and must not be used until its owner confirms its isolation and purpose.

**Current blocker:** the Supabase organization has reached its Free plan limit of two free projects; the dashboard disables project creation. The grace period has ended and Fair Use Policy applies. See [STAGING_ENVIRONMENT_SETUP.md](./STAGING_ENVIRONMENT_SETUP.md) for dashboard evidence, setup steps, migration order, and the frontend/server environment templates. No staging project has been verified.

## 1. Create and identify staging

1. In Supabase, resolve the organization quota warning with the organization owner. Do not upgrade billing without approval.
2. Create a separate project named clearly, such as `banjara-connect-staging`, in the intended organization.
3. Record its project reference. Confirm it is not `wcviqgxrpsgywpxrymxi`, and confirm that it contains no production users, data, or production secrets.
4. Keep production credentials and data out of this project. Create only test accounts and synthetic test content.
5. Do not proceed until a second reviewer confirms the staging project reference and the Preview deployment's configuration.

## 2. Establish the complete database baseline

The push migration is additive and is **not** a fresh-database bootstrap. It assumes these existing objects:

- `public.push_subscriptions` with an `id` key used by the foreign key.
- `public.notifications` with `id`, `user_id`, `actor_id`, `type`, `is_read`, and notification relationship columns used by the function.
- `public.notifications.story_id` may be added by the push migration; `public.stories(id)` must exist for that foreign key.
- `public.follows` with `follower_id` and `following_id`.
- `public.community_group_join_requests`, `public.community_groups`, `public.community_group_members` (including `role`), `public.profiles`, `public.messages`, `public.community_group_messages`, `public.post_likes`, `public.comments`, and `public.stories`, with the columns used by `send-chat-push`.

The repository's tracked migrations are not a complete, verified fresh-database baseline. Prior read-only inspection also found that the connected project's migration history and live schema differ. Therefore:

1. Do not copy production data or use production schema dumps containing user data.
2. Have a database owner verify a complete, data-free schema baseline for a new project, including RLS policies and required RPCs/triggers.
3. Reconcile that baseline with the repository's existing migration history before applying it to staging. Do not blindly replay a subset of migrations or restore historical call migrations.
4. On the isolated staging project only, apply the reviewed baseline and reconcile migration history. Follow the complete order and safety gates in [STAGING_ENVIRONMENT_SETUP.md](./STAGING_ENVIRONMENT_SETUP.md); do not assume the push migration is the only pending migration or that this repository contains a fresh-database baseline.
5. Confirm the new table exists, has RLS enabled, has no client access policies, and is usable by the Edge Function's service role. Confirm the follow trigger does not duplicate another follow-notification trigger and the group-membership triggers do not duplicate any existing notification triggers.
6. Deploy only after the baseline and migration have been reviewed. Do not use `supabase db push` if it would apply unreviewed migrations.

The push migration creates `push_delivery_events` with a composite primary key `(event_id, push_subscription_id)` and a cascading foreign key to `push_subscriptions(id)`. It enables RLS, revokes access from `public`, `anon`, and `authenticated`, and grants table access to `service_role`. It adds `notifications.story_id`, creates follow and group-membership notification triggers, and updates the join-response RPC to retain the exact join-request ID. Trigger functions use a fixed search path and revoke direct execution from client roles. The base-table names and notification columns above still require validation against the chosen staging baseline.

## 3. Configure Web Push keys and Edge Function

Generate a VAPID key pair in a trusted local environment, for example with `npx web-push generate-vapid-keys`. Keep the private key in a password manager or secret manager. Do not commit keys, put the private key in Vercel, or paste either key into chat or tickets.

Set these Supabase Edge Function secrets for the **staging project only**:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` — a required `mailto:` contact.

The function also requires Supabase-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Confirm they are available in the staging Edge Function environment; never put the service-role key in the browser or Vercel frontend variables.

Deploy after linking to the verified staging project:

```powershell
supabase link --project-ref <STAGING_PROJECT_REF>
supabase functions deploy send-chat-push --project-ref <STAGING_PROJECT_REF>
```

Before deploying, inspect the CLI's selected project reference. It must not be `wcviqgxrpsgywpxrymxi`. The function's authenticated readiness check verifies the VAPID public-key match and presence of required tables without returning key values.

The app reads `VITE_VAPID_PUBLIC_KEY` when provided and otherwise retains the existing public-key fallback. It must match the staging function's `VAPID_PUBLIC_KEY`. Configure a staging-specific value only in the local staging env file or Vercel Preview variables; never change the Production deployment's key during staging setup. The public key is not secret; the private key must remain server-side.

## 4. Configure Vercel Preview

In the Vercel project settings, add variables scoped to **Preview** only:

- `VITE_SUPABASE_URL` — the staging Supabase URL.
- Either `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY` — the staging public client key.
- `VITE_VAPID_PUBLIC_KEY` — the staging VAPID public key.

Do not edit Production-scoped variables. The Supabase service-role key and VAPID private key do not belong in Vercel frontend variables. Verify the Preview URL's runtime configuration points to the exact same staging project reference as the Edge Function. Deploy a branch Preview only; do not promote it to Production.

## 5. Android Chrome and installed-PWA tests

Use two staging test accounts and synthetic data. Record each result as Pass, Fail, or Not Tested, with device/browser version and timestamp.

1. On Android Chrome, sign in as account B, open Settings, enable phone notifications, and grant permission.
2. Verify Settings reports the subscription and push service as enabled. Confirm a denied permission reports blocked and an unavailable/mismatched server reports a service error.
3. Repeat from an installed Connect PWA and verify it registers the device subscription.
4. From account A, send account B a direct message. Repeat with a group message.
5. Test a follow, post like, post comment, and story like targeting account B.
6. Test group member addition/role/removal and group join request plus response notifications using authorized group test accounts.
7. For each event, test while Connect is foregrounded, backgrounded, and fully closed where Chrome/PWA supports delivery.
8. Tap each notification and check that direct messages open the correct conversation, group messages open the correct group, and other events open the notifications screen.
9. Trigger the same push request twice and verify a single notification per event/device. Verify a transient delivery failure can be retried and an invalid endpoint is removed without deleting another device's subscription.
10. Disable notifications and sign out. Verify only that browser/PWA endpoint is removed. Sign in again and re-enable.
11. Test offline/network failure while sending a message or other action. The app action must complete independently of push delivery, with no unhandled rejection.
12. Check that the OS lock-screen preview displays only content acceptable for the test account; current message previews can include message text.

No physical Android test has been completed by this local implementation work. Do not report any item as passed until it is executed on a device.

## 6. Remove staging resources

When staging is no longer needed:

1. Remove the staging VAPID secrets from the staging project's Edge Function secrets.
2. Remove Preview-scoped staging variables from Vercel; do not change Production-scoped variables.
3. Delete or archive staging-only test accounts and content according to the test-data policy.
4. If deleting the Supabase project, verify the project name and reference twice and confirm it is not `wcviqgxrpsgywpxrymxi`. Project deletion is destructive and must be approved by the project owner.
5. Keep a note that all generated VAPID keys are discarded and never reused in production.

## Unsupported behavior and known limitations

- Incoming-call push notifications are not implemented.
- Delivery is best-effort. The delivery ledger suppresses ordinary duplicate requests, but a provider accepting a push immediately before a network/database failure can still result in at-least-once delivery after the stale-claim window.
- Push dispatch starts in the sending client after the database action succeeds. Closing or suspending that client before the Edge Function request is accepted can lose the push; robust delivery independent of the sender session requires a server-side event/queue integration.
- Story likes create a `story_like` notification row rather than a dedicated story-like record. The migration links it to the story, and server-side validation checks that exact story ID; still review the staging `notifications` INSERT RLS policy before exposing the function to test users.
- Group-member changes create notification rows through database triggers. The join-response RPC stores `group_join_request_id` on the result notification so concurrent responses cannot be confused.
