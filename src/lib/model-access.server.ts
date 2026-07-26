// Server-side helper to verify a user can dispatch to a given model.
// Admins bypass. Uses public.user_can_use_model(uuid,text).
export async function userCanUseModel(userId: string, modelId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabaseAdmin as unknown as any;
  try {
    const { data, error } = await admin.rpc("user_can_use_model", {
      _user_id: userId,
      _model_id: modelId,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
