# Voice and video calling setup

This feature is being prepared on the `feature/voice-video-calling` branch and is not live in production yet.

## Architecture
- Existing Supabase Auth and community membership remain the identity/authorization source.
- `call_sessions` stores personal and community call invitations.
- Private Supabase Realtime topics exchange call signaling only between authorized participants.
- LiveKit carries audio/video. The LiveKit API secret is server-only and must never be added to Vite/Vercel client variables.

## Required server secrets
Set these secrets in the existing production Supabase project after reviewing/merging the migration and function:
- `LIVEKIT_URL`: the LiveKit server URL (usually `wss://...`).
- `LIVEKIT_API_KEY`: API key from the LiveKit project.
- `LIVEKIT_API_SECRET`: API secret from the LiveKit project.

The Supabase Edge Function `livekit-token` uses the caller's Supabase session and RLS-protected `call_sessions` row to mint short-lived room tokens. Do not expose the API secret to the browser.

## Rollout order
1. Merge the feature branch only after the frontend and build checks are complete.
2. Apply the additive SQL migration to the existing Supabase project.
3. Set the three server secrets and deploy `livekit-token`.
4. Configure the frontend's LiveKit client and deploy to Vercel.
5. Test personal voice/video calls and community calls using two or more signed-in accounts, including reject, hang-up, mute, camera toggle, and reconnect.

Until all steps are completed, calling must show a clear setup error rather than pretending a call has connected.
