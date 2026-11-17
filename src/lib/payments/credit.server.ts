import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ADJUST: must match how your app stores an active plan.
export async function creditPlan(userId: string, planId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("plans")
    .select("duration_days")
    .eq("id", planId)
    .maybeSingle();
  const days = Number((data as { duration_days?: number } | null)?.duration_days ?? 30);
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();

  await supabaseAdmin
    .from("profiles")
    .update({ plan: planId, plan_expires_at: expiresAt })
    .eq("id", userId);
}
