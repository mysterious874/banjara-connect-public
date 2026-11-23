import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const url = Deno.env.get("SUPABASE_URL")!;
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const publishableKey = publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY");
const secretKey = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(url, secretKey!, { auth: { autoRefreshToken: false, persistSession: false } });

function response(body: unknown, status = 200, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, ...extra, "Content-Type": "application/json" } });
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2,"0")).join("");
}
async function allowed(key: string, perMinute: number, perHour: number) {
  const { data, error } = await admin.rpc("check_edge_rate_limit", {
    p_key: await hash(key), p_minute_limit: perMinute, p_hour_limit: perHour,
  });
  if (error) {
    console.error("Auth rate-limit RPC unavailable", error.code);
    return null; // fail closed: never allow unthrottled admin account creation/login
  }
  return data === true;
}
function normalizeUsername(input: unknown) {
  const value = typeof input === "string" ? input.trim() : "";
  if (!/^[A-Za-z0-9_-]{3,30}$/.test(value)) return null;
  return value;
}
function usernamePattern(username: string) {
  return username.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
async function findUsername(username: string) {
  const pattern = usernamePattern(username);
  const { data, error } = await admin.from("profiles").select("id,username").ilike("username", pattern).maybeSingle();
  return { profile: data, error };
}
async function passwordLogin(email: string, password: string) {
  const result = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey!, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await result.json();
  if (!result.ok) return { error: "Invalid username or password." };
  return { session: data };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed." }, 405);
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > 8192) return response({ error: "Request too large." }, 413);
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("cf-connecting-ip") ?? "unknown";
  const ipAllowed = await allowed(`username-auth:ip:${forwarded}`, 12, 60);
  if (ipAllowed === null) return response({ error: "Sign-in is temporarily unavailable. Please try again shortly." }, 503);
  if (!ipAllowed) return response({ error: "Too many account requests. Wait a little and try again." }, 429, { "Retry-After": "60" });

  try {
    const body = await req.json();
    const mode = body?.mode === "signup" ? "signup" : "login";
    const username = normalizeUsername(body?.username);
    const password = typeof body?.password === "string" && body.password.length >= 6 && body.password.length <= 256 ? body.password : null;
    if (!username) return response({ error: "Username must be 3–30 characters using letters, numbers, underscores, or hyphens." }, 400);
    if (!password) return response({ error: "Password must be 6–256 characters long." }, 400);
    const usernameAllowed = await allowed(`username-auth:user:${username.toLowerCase()}`, 8, 30);
    if (usernameAllowed === null) return response({ error: "Sign-in is temporarily unavailable. Please try again shortly." }, 503);
    if (!usernameAllowed) return response({ error: "Too many attempts for this username. Wait and try again." }, 429, { "Retry-After": "60" });

    if (mode === "login") {
      const { profile, error: profileError } = await findUsername(username);
      if (profileError) return response({ error: "Could not check the username right now." }, 500);
      if (!profile) return response({ error: "Invalid username or password." }, 401);
      const { data: authUser, error: userError } = await admin.auth.admin.getUserById(profile.id);
      if (userError || !authUser.user?.email) return response({ error: "This account could not be found." }, 401);
      return response(await passwordLogin(authUser.user.email, password));
    }

    const { profile: existing, error: existingError } = await findUsername(username);
    if (existingError) return response({ error: "Could not check username availability." }, 500);
    if (existing) return response({ error: "That username is already taken." }, 409);
    const syntheticEmail = `u_${crypto.randomUUID().replaceAll("-", "")}@auth.banjaraconnect.invalid`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: syntheticEmail, password, email_confirm: true, user_metadata: { display_name: username },
    });
    if (createError || !created.user) return response({ error: "Could not create your account. Please try again." }, 400);
    const { error: profileUpdateError } = await admin.from("profiles").update({ username, display_name: username }).eq("id", created.user.id);
    if (profileUpdateError) {
      await admin.auth.admin.deleteUser(created.user.id);
      if (profileUpdateError.code === "23505") return response({ error: "That username is already taken." }, 409);
      return response({ error: "Could not prepare your profile. Please try again." }, 500);
    }
    const session = await passwordLogin(syntheticEmail, password);
    if (!session.session?.access_token || !session.session?.refresh_token) {
      await admin.auth.admin.deleteUser(created.user.id);
      return response({ error: "Account created, but sign-in could not be started. Please try again." }, 500);
    }
    return response(session, 201);
  } catch {
    return response({ error: "Could not process your account request." }, 500);
  }
});
