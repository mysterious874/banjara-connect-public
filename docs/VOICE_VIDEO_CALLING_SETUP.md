# Voice and video calling setup

This feature is being prepared on the `feature/voice-video-calling` branch and is not live in production yet.

## Current implementation
- Existing Supabase Auth and community membership remain the identity/authorization source.
- `call_sessions` stores personal and community call invitations.
- Private Supabase Realtime topics exchange WebRTC offer/answer/ICE signaling for authorized participants.
- The frontend uses browser-native WebRTC with a public STUN server. It does not currently use the LiveKit token function.
- An app-wide incoming-call overlay subscribes to call changes and can route accepted personal calls to the caller's chat or group calls to the community page.
- Group calls use a peer-to-peer mesh, so bandwidth and device load increase with each participant. STUN-only connections may fail on restrictive networks; a production rollout needs a tested TURN relay or a managed media server.

## Database and security
The additive migration has not been applied to production. Review its references and RLS policies against the active Supabase schema before applying it. Do not deploy the feature or claim calls are available until the migration, Realtime policies, media connectivity, and two-account tests are confirmed.

The `livekit-token` Edge Function is an optional backend scaffold from the initial architecture proposal; it is not wired to the current native-WebRTC frontend. Do not set LiveKit secrets just for this current implementation. If switching to LiveKit, integrate its browser SDK and token endpoint together before deploying.

## Rollout checklist
1. Verify the current Supabase project and review the migration against its real schema.
2. Apply the migration only after review, then verify private Realtime broadcast authorization.
3. Add and test TURN relay credentials or switch the frontend to a managed media server.
4. Test personal voice/video calls and community calls with two or more signed-in accounts: permissions, reject, hang-up, mute, camera toggle, reconnect, network restrictions, and mobile browsers.
5. Verify incoming calls while the recipient is on Home, Profile, Settings, and another chat; verify group-call join/leave behavior.
6. Run a clean production build and only then merge/deploy.
