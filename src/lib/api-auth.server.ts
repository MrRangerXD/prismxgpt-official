// Authenticates requests to internal /api/* routes using the caller's Supabase JWT.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ApiAuthOk = { ok: true; userId: string };
export type ApiAuthErr = { ok: false; response: Response };
export type ApiAuthResult = ApiAuthOk | ApiAuthErr;

function unauthorized(msg = "Unauthorized"): ApiAuthErr {
  return { ok: false, response: new Response(msg, { status: 401 }) };
}

export async function requireApiAuth(request: Request): Promise<ApiAuthResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return unauthorized();
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token || token.split(".").length !== 3) return unauthorized();

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
