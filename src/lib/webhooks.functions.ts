import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type WebhookRow = {
  id: string;
  url: string;
  events: string[];
  status: "active" | "disabled";
  description: string | null;
  created_at: string;
};

export type DeliveryRow = {
  id: number;
  webhook_id: string;
  event: string;
  status_code: number | null;
  attempt: number;
  response_ms: number | null;
  error: string | null;
  created_at: string;
};

function randomSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "whsec_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const listWebhooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as Any;
    const { data, error } = await sb
      .from("webhooks")
      .select("id,url,events,status,description,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { hooks: (data ?? []) as WebhookRow[] };
  });

export const createWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string; events?: string[]; description?: string }) => {
    const url = String(d?.url ?? "").trim();
    if (!/^https?:\/\//.test(url)) throw new Error("Valid https URL required");
    return {
      url,
      events: Array.isArray(d?.events) && d.events.length ? d.events.slice(0, 20) : ["*"],
      description: d?.description?.slice(0, 200) ?? null,
    };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const secret = randomSecret();
    const hash = await sha256Hex(secret);
    const { data: row, error } = await sb
      .from("webhooks")
      .insert({
        user_id: context.userId,
        url: data.url,
        events: data.events,
        description: data.description,
        secret_hash: hash,
      })
      .select("id,url,events,status,description,created_at")
      .single();
    if (error) throw new Error(error.message);
    return { hook: row as WebhookRow, secret };
  });

export const rotateWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const secret = randomSecret();
    const hash = await sha256Hex(secret);
    const { error } = await sb
      .from("webhooks")
      .update({ secret_hash: hash })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { secret };
  });

export const setWebhookStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "active" | "disabled" }) => d)
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const { error } = await sb
      .from("webhooks")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const { error } = await sb
      .from("webhooks")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listDeliveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { webhookId: string }) => {
    if (!d?.webhookId) throw new Error("webhookId required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const { data: rows, error } = await sb
      .from("webhook_deliveries")
      .select("id,webhook_id,event,status_code,attempt,response_ms,error,created_at")
      .eq("webhook_id", data.webhookId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    // Ensure user owns webhook
    const { data: own } = await sb
      .from("webhooks")
      .select("id")
      .eq("id", data.webhookId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!own) throw new Error("Not found");
    return { deliveries: (rows ?? []) as DeliveryRow[] };
  });

export const testDeliverWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const { data: hook } = await sb
      .from("webhooks")
      .select("id,url,status")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!hook) throw new Error("Not found");
    if (hook.status !== "active") throw new Error("Webhook is disabled");
    const started = Date.now();
    let status: number | null = null;
    let errText: string | null = null;
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Prismx-Event": "test.ping" },
        body: JSON.stringify({ event: "test.ping", ts: Date.now() }),
      });
      status = res.status;
    } catch (e) {
      errText = (e as Error).message;
    }
    const ms = Date.now() - started;
    await sb.from("webhook_deliveries").insert({
      webhook_id: hook.id,
      event: "test.ping",
      status_code: status,
      response_ms: ms,
      error: errText,
    });
    return { ok: !!status && status < 400, status, ms, error: errText };
  });

// ---- Admin ----
export const adminListWebhooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as Any;
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Any;
    const { data, error } = await admin
      .from("webhooks")
      .select("id,user_id,url,events,status,description,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { hooks: data ?? [] };
  });

export const adminSetWebhookStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "active" | "disabled" }) => d)
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Any;
    const { error } = await admin.from("webhooks").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
