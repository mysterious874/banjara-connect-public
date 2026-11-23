import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
type ChatMessage = { role: "user" | "assistant"; content: string };
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const publishableKey = publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY");
const secretKey = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(supabaseUrl, secretKey!, { auth: { autoRefreshToken: false, persistSession: false } });
function response(body: unknown, status=200, extra: Record<string,string>={}) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, ...extra, "Content-Type": "application/json" } });
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2,"0")).join("");
}
async function rateAllowed(key: string, minute: number, hour: number) {
  const { data, error } = await admin.rpc("check_edge_rate_limit", { p_key: await hash(key), p_minute_limit: minute, p_hour_limit: hour });
  if (error) { console.error("AI rate-limit RPC unavailable", error.code); return null; }
  return data === true;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return response({ error: "Sign in to use Banjara AI." }, 401);
  const userClient = createClient(supabaseUrl, publishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  const userId = userData.user?.id;
  if (userError || !userId) return response({ error: "Your session is invalid or expired. Sign in again." }, 401);

  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("cf-connecting-ip") ?? "unknown";
  const ipOk = await rateAllowed(`banjara-ai:ip:${forwarded}`, 25, 80);
  if (ipOk === null) return response({ error: "AI is temporarily unavailable. Please try again shortly." }, 503);
  if (!ipOk) return response({ error: "Too many AI requests from this network. Try again in a minute." }, 429, { "Retry-After": "60" });
  const quota = await admin.rpc("consume_ai_quota", { p_user_id: userId, p_daily_limit: 25, p_minute_limit: 3 });
  if (quota.error) { console.error("AI quota RPC unavailable", quota.error.code); return response({ error: "AI is temporarily unavailable. Please try again shortly." }, 503); }
  if (quota.data !== true) return response({ error: "You've reached your AI limit (25 per day, 3 per minute). Try again later." }, 429, { "Retry-After": "60" });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return response({ error: "AI service is not configured yet." }, 503);
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > 60000) return response({ error: "Request too large." }, 413);
  try {
    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const cleanMessages: ChatMessage[] = messages
      .filter((item: ChatMessage) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
      .slice(-12)
      .map((item: ChatMessage) => ({ role: item.role, content: item.content.trim().slice(0, 4000) }))
      .filter((item: ChatMessage) => item.content.length > 0);
    if (!cleanMessages.length || cleanMessages[cleanMessages.length - 1].role !== "user") return response({ error: "A user question is required." }, 400);
    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-6-luna",
        instructions: "You are Banjara Connect AI. Be helpful, accurate, concise, and friendly. Answer in the user's language when practical. Do not claim live/current information unless you actually have it. When discussing Banjara culture or history, distinguish established facts from uncertainty and avoid presenting one community's traditions as universal.",
        input: cleanMessages,
        max_output_tokens: 700,
      }),
    });
    const result = await openAiResponse.json();
    if (!openAiResponse.ok) {
      console.error("OpenAI request failed", openAiResponse.status);
      return response({ error: "AI request failed. Please try again." }, 502);
    }
    const answer = typeof result?.output_text === "string" ? result.output_text.trim() : "";
    if (!answer) return response({ error: "AI returned an empty response." }, 502);
    return response({ answer });
  } catch (error) {
    console.error("banjara-ai error", error instanceof Error ? error.name : "unknown");
    return response({ error: "Could not process your AI request." }, 500);
  }
});
