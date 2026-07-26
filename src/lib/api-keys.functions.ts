import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as Any;
    const { data, error } = await sb
      .from("api_keys")
      .select("id,name,prefix,last4,status,scopes,last_used_at,last_used_ip,expires_at,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { keys: data ?? [] };
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; expiresAt?: string | null; scopes?: string[] }) => {
    const name = String(d?.name ?? "").trim().slice(0, 60);
    if (!name) throw new Error("Name is required");
    return {
      name,
      expiresAt: d?.expiresAt ?? null,
      scopes: Array.isArray(d?.scopes) && d.scopes.length ? d.scopes : ["chat", "image", "embeddings"],
    };
  })
  .handler(async ({ data, context }) => {
    const { generateApiKey } = await import("@/lib/api-keys.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const gen = generateApiKey();
    const admin = supabaseAdmin as unknown as Any;
    const { data: row, error } = await admin
      .from("api_keys")
      .insert({
        user_id: context.userId,
        name: data.name,
        prefix: gen.prefix,
        last4: gen.last4,
        key_hash: gen.hash,
        scopes: data.scopes,
        expires_at: data.expiresAt,
      })
      .select("id,name,prefix,last4,status,scopes,expires_at,created_at")
      .single();
    if (error) {
      if (String(error.code) === "23505") throw new Error("A key with that name already exists.");
      throw new Error(error.message);
    }
    return { key: row, plaintext: gen.plaintext };
  });

export const renameApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; name: string }) => {
    const name = String(d?.name ?? "").trim().slice(0, 60);
    if (!name || !d?.id) throw new Error("Invalid input");
    return { id: d.id, name };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const { error } = await sb.from("api_keys").update({ name: data.name }).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setApiKeyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "active" | "disabled" | "revoked" }) => {
    if (!d?.id || !["active", "disabled", "revoked"].includes(d.status)) throw new Error("Invalid input");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const { error } = await sb.from("api_keys").update({ status: data.status }).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("Invalid input");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const { error } = await sb.from("api_keys").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getApiKeyStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("Invalid input");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const { data: stats, error } = await sb.rpc("api_key_stats", { _key_id: data.id });
    if (error) throw new Error(error.message);
    const row = Array.isArray(stats) ? stats[0] : stats;
    return { stats: row ?? null, userId: context.userId };
  });

export const listUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { keyId?: string; limit?: number }) => ({
    keyId: d?.keyId,
    limit: Math.min(Math.max(Number(d?.limit ?? 100), 1), 500),
  }))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    let q = sb
      .from("api_key_usage")
      .select("id,api_key_id,endpoint,model,status_code,input_tokens,output_tokens,images,latency_ms,error,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.keyId) q = q.eq("api_key_id", data.keyId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const usageSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => ({ days: Math.min(Math.max(Number(d?.days ?? 7), 1), 30) }))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const since = new Date(Date.now() - data.days * 24 * 3600 * 1000).toISOString();
    const { data: rows, error } = await sb
      .from("api_key_usage")
      .select("created_at,input_tokens,output_tokens,images,status_code")
      .eq("user_id", context.userId)
      .gte("created_at", since);
    if (error) throw new Error(error.message);
    // bucket by day
    const buckets = new Map<string, { day: string; requests: number; tokens: number; images: number; errors: number }>();
    for (let i = data.days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { day: key, requests: 0, tokens: 0, images: 0, errors: 0 });
    }
    for (const r of rows ?? []) {
      const key = String(r.created_at).slice(0, 10);
      const b = buckets.get(key);
      if (!b) continue;
      b.requests += 1;
      b.tokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
      b.images += r.images ?? 0;
      if ((r.status_code ?? 0) >= 400) b.errors += 1;
    }
    return { series: Array.from(buckets.values()) };
  });

// ---------- Admin ----------
export const adminListAllKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string }) => ({ search: (d?.search ?? "").trim().slice(0, 80) }))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Any;
    let q = admin
      .from("api_keys")
      .select("id,user_id,name,prefix,last4,status,last_used_at,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.search) q = q.or(`name.ilike.%${data.search}%,prefix.ilike.%${data.search}%`);
    const { data: keys, error } = await q;
    if (error) throw new Error(error.message);
    return { keys: keys ?? [] };
  });

export const adminSetKeyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "active" | "disabled" | "revoked" }) => d)
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Any;
    const { error } = await admin.from("api_keys").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Any;
    const { error } = await admin.from("api_keys").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Extended per-key metadata ----
export const updateKeyMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    tags?: string[];
    notes?: string;
    environment?: string;
    expiresAt?: string | null;
  }) => {
    if (!d?.id) throw new Error("id required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const patch: Record<string, unknown> = {};
    if (Array.isArray(data.tags)) patch.tags = data.tags.slice(0, 20);
    if (typeof data.notes === "string") patch.notes = data.notes.slice(0, 500);
    if (typeof data.environment === "string") patch.environment = data.environment.slice(0, 30);
    if (data.expiresAt !== undefined) patch.expires_at = data.expiresAt;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await sb
      .from("api_keys")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rotateApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { generateApiKey } = await import("@/lib/api-keys.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Any;
    const { data: existing, error: e0 } = await admin
      .from("api_keys")
      .select("id,user_id,name,scopes,expires_at,environment,tags,notes")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (e0 || !existing) throw new Error("Key not found");
    const gen = generateApiKey();
    const suffix = " (rotated)";
    const newName = String(existing.name ?? "key").slice(0, 60 - suffix.length) + suffix;
    const { data: created, error: e1 } = await admin
      .from("api_keys")
      .insert({
        user_id: existing.user_id,
        name: newName,
        prefix: gen.prefix,
        last4: gen.last4,
        key_hash: gen.hash,
        scopes: existing.scopes,
        expires_at: existing.expires_at,
        environment: existing.environment ?? "production",
        tags: existing.tags ?? [],
        notes: existing.notes ?? null,
        rotated_from: existing.id,
      })
      .select("id,name,prefix,last4,created_at")
      .single();
    if (e1) throw new Error(e1.message);
    await admin.from("api_keys").update({ status: "revoked" }).eq("id", existing.id);
    return { key: created, plaintext: gen.plaintext };
  });

export const listIpHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const { data: own } = await sb
      .from("api_keys")
      .select("id")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!own) throw new Error("Not found");
    const { data: rows, error } = await sb
      .from("api_key_ip_history")
      .select("ip,first_seen,last_seen,request_count")
      .eq("api_key_id", data.id)
      .order("last_seen", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });
