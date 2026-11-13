import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const livekitUrl = Deno.env.get("LIVEKIT_URL");
  const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY");
  const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");

  if (!authorization || !supabaseUrl || !anonKey) return json({ error: "Authentication is required." }, 401);
  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return json({ error: "Calling is not configured yet. Please try again later." }, 503);
  }

  try {
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Your session has expired. Please sign in again." }, 401);

    const body = await req.json().catch(() => ({}));
    const callId = typeof body.callId === "string" ? body.callId : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(callId)) {
      return json({ error: "A valid call session is required." }, 400);
    }

    const { data: call, error: callError } = await supabase
      .from("call_sessions")
      .select("id, caller_id, recipient_id, group_id, call_type, status")
      .eq("id", callId)
      .maybeSingle();
    if (callError || !call) return json({ error: "You are not allowed to join this call." }, 403);
    if (!["ringing", "active"].includes(call.status)) return json({ error: "This call has already ended." }, 409);
    if (call.group_id === null) {
      if (call.caller_id !== user.id && call.recipient_id !== user.id) {
        return json({ error: "You are not a participant in this call." }, 403);
      }
    } else {
      // Group-call tokens are only issued to current members of that community.
      const { data: membership, error: membershipError } = await supabase
        .from("community_group_members")
        .select("group_id")
        .eq("group_id", call.group_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (membershipError || !membership) {
        return json({ error: "You are not a member of this community call." }, 403);
      }
    }

    const { data: profile } = await supabase.from("profiles").select("username,display_name").eq("id", user.id).maybeSingle();
    const identity = user.id;
    const displayName = profile?.display_name || profile?.username || "Banjara Connect member";
    const token = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity,
      name: displayName,
      ttl: "10m",
    });
    token.addGrant({
      roomJoin: true,
      room: call.id,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return json({ serverUrl: livekitUrl, token: await token.toJwt(), callType: call.call_type });
  } catch (error) {
    console.error("livekit-token error", error);
    return json({ error: "Could not prepare the call. Please try again." }, 500);
  }
});
