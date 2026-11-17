import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** True when the user holds an unexpired admin role. */
export async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("expires_at")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) {
    console.error("[admin] role lookup failed", error);
    return false;
  }
  if (!data) return false;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
  return true;
}
