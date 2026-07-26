import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type CatalogModel = {
  id: string;
  provider_id: string;
  name: string;
  family: string | null;
  context_window: number;
  capabilities: Record<string, boolean>;
  pricing: Record<string, number>;
  status: "stable" | "preview" | "beta" | "deprecated" | "maintenance";
  enabled: boolean;
  hidden: boolean;
  default_model: boolean;
  fallback_model_id: string | null;
  priority: number;
};

export type CatalogProvider = {
  id: string;
  name: string;
  website: string | null;
  logo_url: string | null;
  status: string;
  sort_order: number;
};

export const listProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as Any;
    const { data, error } = await sb
      .from("model_providers")
      .select("id,name,website,logo_url,status,sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return { providers: (data ?? []) as CatalogProvider[] };
  });

export const listModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { includeHidden?: boolean } | undefined) => ({
    includeHidden: !!d?.includeHidden,
  }))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    // Determine admin
    const { data: isAdmin } = await sb.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    // Allowed set (all IDs the user can dispatch to)
    const { data: allowedRows } = await sb.rpc("user_model_access", { _user_id: context.userId });
    const allowed = new Set<string>((allowedRows ?? []).map((r: { model_id: string }) => r.model_id));

    let q = sb
      .from("model_catalog")
      .select("id,provider_id,name,family,context_window,capabilities,pricing,status,enabled,hidden,default_model,fallback_model_id,priority")
      .order("provider_id", { ascending: true })
      .order("priority", { ascending: true });
    if (!isAdmin && !data.includeHidden) q = q.eq("hidden", false);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const models = (rows ?? []).map((m: CatalogModel) => ({
      ...m,
      capabilities: m.capabilities ?? {},
      pricing: m.pricing ?? {},
      allowed: !!isAdmin || allowed.has(m.id),
    }));
    return { models, isAdmin: !!isAdmin };
  });

export const adminUpsertProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<CatalogProvider> & { id: string; name: string }) => {
    if (!d?.id || !d?.name) throw new Error("id and name required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Any;
    const { error } = await admin.from("model_providers").upsert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpsertModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<CatalogModel> & { id: string; provider_id: string; name: string }) => {
    if (!d?.id || !d?.provider_id || !d?.name) throw new Error("id, provider_id, name required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Any;
    const { error } = await admin.from("model_catalog").upsert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Any;
    const { error } = await admin.from("model_catalog").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetPlanAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { model_id: string; plan_id: string; allowed: boolean }) => {
    if (!d?.model_id || !d?.plan_id) throw new Error("model_id + plan_id required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Any;
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Any;
    const { error } = await admin.from("model_plan_access").upsert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPlanAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as Any;
    const { data, error } = await sb.from("model_plan_access").select("model_id,plan_id,allowed");
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });
