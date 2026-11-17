import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { invalidatePlanCache } from "@/lib/plan-limits.server";

/** Tier length. `profiles.plan` only knows free | premium. */
const ACCESS_DAYS = 30;

/**
 * Grants paid access exactly once per order. The caller must already have
 * claimed the order row (status -> paid) before calling this.
 */
export async function creditPlan(userId: string, _planId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + ACCESS_DAYS * 86_400_000).toISOString();

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ plan: "premium" })
    .eq("id", userId);
  if (profileError) console.error("[payments/credit] profile update failed", profileError);

  const { error: roleError } = await supabaseAdmin
    .from("user_roles")
    .upsert(
      { user_id: userId, role: "premium", expires_at: expiresAt },
      { onConflict: "user_id,role" },
    );
  if (roleError) console.error("[payments/credit] role upsert failed", roleError);

  // Otherwise entitlements stay cached for 60s and the user sees no change.
  invalidatePlanCache(userId);
}
