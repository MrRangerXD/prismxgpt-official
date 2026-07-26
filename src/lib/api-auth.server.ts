// Dual-auth: accepts Supabase user JWTs OR PrismXGPT API keys (pk_prism_*).
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ApiAuthOk = { ok: true; userId: string; apiKeyId?: string };
export type ApiAuthErr = { ok: false; response: Response };
export type ApiAuthResult = ApiAuthOk | ApiAuthErr;

function unauthorized(msg = "Unauthorized"): ApiAuthErr {
  return { ok: false, response: new Response(msg, { status: 401 }) };
}

export async function requireApiAuth(request: Request): Promise<ApiAuthResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return unauthorized();
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return unauthorized();

  // API key path
  if (token.startsWith("pk_prism_")) {
    return await verifyApiKey(token, request);
  }

  // Supabase JWT path (existing behavior)
  if (token.split(".").length !== 3) return unauthorized();
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, response: new Response("Server misconfigured", { status: 500 }) };
  const supabase = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return unauthorized();
  return { ok: true, userId: data.claims.sub };
}

async function verifyApiKey(plaintext: string, request: Request): Promise<ApiAuthResult> {
  const { isApiKeyString, sha256 } = await import("@/lib/api-keys.server");
  if (!isApiKeyString(plaintext)) return unauthorized("Invalid API key format");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabaseAdmin as unknown as any;
  const hash = sha256(plaintext);
  const { data: row, error } = await admin
    .from("api_keys")
    .select("id,user_id,status,expires_at")
    .eq("key_hash", hash)
    .maybeSingle();
  if (error || !row) return unauthorized("Invalid API key");
  if (row.status !== "active") return unauthorized(`Key is ${row.status}`);
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return unauthorized("Key expired");

  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;
  // fire-and-forget last-used update
  void admin.from("api_keys").update({ last_used_at: new Date().toISOString(), last_used_ip: ip }).eq("id", row.id);
  return { ok: true, userId: row.user_id, apiKeyId: row.id };
}

// Log an API request (call after handling)
export async function logApiUsage(params: {
  apiKeyId?: string;
  userId: string;
  endpoint: string;
  model?: string;
  statusCode: number;
  inputTokens?: number;
  outputTokens?: number;
  images?: number;
  latencyMs?: number;
  error?: string;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as unknown as any;
    await admin.from("api_key_usage").insert({
      api_key_id: params.apiKeyId ?? null,
      user_id: params.userId,
      endpoint: params.endpoint,
      model: params.model ?? null,
      status_code: params.statusCode,
      input_tokens: params.inputTokens ?? 0,
      output_tokens: params.outputTokens ?? 0,
      images: params.images ?? 0,
      latency_ms: params.latencyMs ?? 0,
      error: params.error ?? null,
    });
  } catch {
    /* swallow; usage log is best-effort */
  }
}
