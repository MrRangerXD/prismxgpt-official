/**
 * Database-driven plan entitlements.
 *
 * Every quota and feature flag in the app resolves through this module: the
 * user's tier lives on `profiles.plan`, and the numbers behind that tier live
 * in `public.plan_settings` (editable from the Admin > Plans panel). Nothing
 * here hardcodes a limit — the constants below are only last-resort fallbacks
 * used when the database is unreachable, so a transient outage degrades to a
 * usable Free tier instead of locking everyone out.
 *
 * A `null` limit means "unlimited (fair use)".
 */

export type PlanEntitlements = {
  planId: string;
  planName: string;
  /** null = unlimited */
  chatLimit: number | null;
  imageLimit: number | null;
  storageLimitGb: number | null;
  projectLimit: number | null;
  /** max attachment size in MB */
  fileUploadLimit: number | null;
  webSearch: boolean;
  reasoning: boolean;
  memory: boolean;
  voice: boolean;
  priorityQueue: boolean;
  availableModels: string[];
  isAdmin: boolean;
  chatsToday: number;
  imagesToday: number;
};

/** Only used when plan_settings cannot be read (DB outage). */
const SAFE_FALLBACK: PlanEntitlements = {
  planId: "free",
  planName: "Free",
  chatLimit: 50,
  imageLimit: 3,
  storageLimitGb: 2,
  projectLimit: 3,
  fileUploadLimit: 10,
  webSearch: false,
  reasoning: false,
  memory: false,
  voice: true,
  priorityQueue: false,
  availableModels: [],
  isAdmin: false,
  chatsToday: 0,
  imagesToday: 0,
};

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: PlanEntitlements }>();

type EntitlementRow = {
  plan_id?: string | null;
  plan_name?: string | null;
  chat_limit?: number | null;
  image_limit?: number | null;
  storage_limit_gb?: number | null;
  project_limit?: number | null;
  file_upload_limit?: number | null;
  web_search_enabled?: boolean | null;
  reasoning_enabled?: boolean | null;
  memory_enabled?: boolean | null;
  voice_enabled?: boolean | null;
  priority_queue?: boolean | null;
  available_models?: unknown;
  is_admin?: boolean | null;
  chats_today?: number | null;
  images_today?: number | null;
};

function toEntitlements(row: EntitlementRow): PlanEntitlements {
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return {
    planId: row.plan_id ?? "free",
    planName: row.plan_name ?? "Free",
    chatLimit: num(row.chat_limit),
    imageLimit: num(row.image_limit),
    storageLimitGb: num(row.storage_limit_gb),
    projectLimit: num(row.project_limit),
    fileUploadLimit: num(row.file_upload_limit),
    webSearch: !!row.web_search_enabled,
    reasoning: !!row.reasoning_enabled,
    memory: !!row.memory_enabled,
    voice: row.voice_enabled !== false,
    priorityQueue: !!row.priority_queue,
    availableModels: Array.isArray(row.available_models) ? (row.available_models as string[]) : [],
    isAdmin: !!row.is_admin,
    chatsToday: row.chats_today ?? 0,
    imagesToday: row.images_today ?? 0,
  };
}

/**
 * Resolves the caller's entitlements. Cached for 60s per user so a burst of
 * chat turns doesn't re-query plan_settings on every keystroke-driven send.
 * Never throws — falls back to the Free tier shape on any failure.
 */
export async function getPlanEntitlements(userId: string): Promise<PlanEntitlements> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (
      supabaseAdmin as unknown as {
        rpc(
          name: string,
          args: Record<string, unknown>,
        ): Promise<{ data: EntitlementRow[] | null; error: unknown }>;
      }
    ).rpc("user_plan_entitlements", { _user_id: userId });
    if (error || !Array.isArray(data) || data.length === 0) {
      if (error) console.error("[plan-limits] entitlement lookup failed", error);
      return SAFE_FALLBACK;
    }
    const value = toEntitlements(data[0]);
    cache.set(userId, { at: Date.now(), value });
    return value;
  } catch (e) {
    console.error("[plan-limits] entitlement lookup threw", e);
    return SAFE_FALLBACK;
  }
}

/** Drops the cached entitlements for a user (call after a plan change). */
export function invalidatePlanCache(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

export type QuotaResult =
  | { allowed: true; remaining: number | null }
  | { allowed: false; message: string };

async function consume(
  rpc: "consume_chat_quota" | "consume_image_quota",
  userId: string,
  limit: number | null,
): Promise<number | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (
    supabaseAdmin as unknown as {
      rpc(
        name: string,
        args: Record<string, unknown>,
      ): Promise<{ data: unknown; error: { message?: string } | null }>;
    }
  ).rpc(rpc, { _limit: limit, _user_id: userId });
  if (error) {
    // Fail open: a metering outage must never block a paying user.
    console.error(`[plan-limits] ${rpc} failed (fail-open)`, error);
    return null;
  }
  return typeof data === "number" ? data : null;
}

/**
 * Consumes one chat turn against the caller's plan. Admins bypass metering.
 */
export async function consumeChatQuota(
  userId: string,
  plan: PlanEntitlements,
): Promise<QuotaResult> {
  if (plan.isAdmin) return { allowed: true, remaining: null };
  const remaining = await consume("consume_chat_quota", userId, plan.chatLimit);
  if (remaining !== null && remaining < 0) {
    return {
      allowed: false,
      message: `You've used all ${plan.chatLimit} chats included in the ${plan.planName} plan today. Your quota resets at midnight UTC — upgrade for a higher daily allowance.`,
    };
  }
  return { allowed: true, remaining };
}

/**
 * Consumes one image generation against the caller's plan. Admins bypass
 * metering; a `null` image limit means unlimited (fair use).
 */
export async function consumeImageQuota(
  userId: string,
  plan: PlanEntitlements,
): Promise<QuotaResult> {
  if (plan.isAdmin || plan.imageLimit === null) return { allowed: true, remaining: null };
  const remaining = await consume("consume_image_quota", userId, plan.imageLimit);
  if (remaining !== null && remaining < 0) {
    return {
      allowed: false,
      message: `You've used all ${plan.imageLimit} images included in the ${plan.planName} plan today. Your quota resets at midnight UTC — upgrade for more image generations.`,
    };
  }
  return { allowed: true, remaining };
}
